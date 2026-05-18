import { describe, it, expect } from "vitest";
import { parse, DsqlexError } from "../src/index.js";
import {
  Select, Num, Str, Bool, Null, Identifier,
  BinaryOp, CaseExpr, WhenClause, FunctionCall,
  InExpr, NotInExpr, LikeExpr, NotLikeExpr,
  BinaryOpNode, CaseExprNode, WhenClauseNode, FunctionCallNode, InExprNode,
} from "../src/index.js";

describe("Literals", () => {
  it("parses number", () => {
    expect(parse("SELECT 42")).toEqual(Select(Num("42")));
    expect(parse("SELECT 3.14")).toEqual(Select(Num("3.14")));
  });

  it("parses string", () => {
    expect(parse("SELECT 'hello'")).toEqual(Select(Str("hello")));
    expect(parse("SELECT ''")).toEqual(Select(Str("")));
  });

  it("parses identifier", () => {
    expect(parse("SELECT my_var")).toEqual(Select(Identifier("my_var")));
    expect(parse("SELECT x")).toEqual(Select(Identifier("x")));
  });

  it("parses boolean", () => {
    expect(parse("SELECT TRUE")).toEqual(Select(Bool(true)));
    expect(parse("SELECT FALSE")).toEqual(Select(Bool(false)));
  });

  it("parses null", () => {
    expect(parse("SELECT NULL")).toEqual(Select(Null()));
  });
});

describe("Arithmetic operators", () => {
  it("parses single addition", () => {
    expect(parse("SELECT 1 + 2")).toEqual(Select(BinaryOp("plus", Num("1"), Num("2"))));
  });

  it("parses single subtraction", () => {
    expect(parse("SELECT 5 - 3")).toEqual(Select(BinaryOp("minus", Num("5"), Num("3"))));
  });

  it("parses single multiplication", () => {
    expect(parse("SELECT 2 * 3")).toEqual(Select(BinaryOp("multiply", Num("2"), Num("3"))));
  });

  it("parses single division", () => {
    expect(parse("SELECT a / b")).toEqual(Select(BinaryOp("divide", Identifier("a"), Identifier("b"))));
  });

  it("allows same-group additive chains (left-associative)", () => {
    const ast = parse("SELECT a - b - c - d");
    expect(ast).toEqual(Select(
      BinaryOp("minus",
        BinaryOp("minus",
          BinaryOp("minus", Identifier("a"), Identifier("b")),
          Identifier("c")),
        Identifier("d"))
    ));

    const ast2 = parse("SELECT 1 + 2 + 3");
    expect(ast2).toEqual(Select(
      BinaryOp("plus",
        BinaryOp("plus", Num("1"), Num("2")),
        Num("3"))
    ));

    const ast3 = parse("SELECT a + b - c + d");
    expect(ast3).toEqual(Select(
      BinaryOp("plus",
        BinaryOp("minus",
          BinaryOp("plus", Identifier("a"), Identifier("b")),
          Identifier("c")),
        Identifier("d"))
    ));
  });

  it("allows same-group multiplicative chains", () => {
    const ast = parse("SELECT a * b * c");
    expect(ast).toEqual(Select(
      BinaryOp("multiply",
        BinaryOp("multiply", Identifier("a"), Identifier("b")),
        Identifier("c"))
    ));

    const ast2 = parse("SELECT a * b / c");
    expect(ast2).toEqual(Select(
      BinaryOp("divide",
        BinaryOp("multiply", Identifier("a"), Identifier("b")),
        Identifier("c"))
    ));
  });

  it("rejects mixing additive and multiplicative", () => {
    expect(() => parse("SELECT 1 + 2 * 3")).toThrow("Ambiguous expression: mixing");
    expect(() => parse("SELECT a / b + c")).toThrow("Ambiguous expression: mixing");
    expect(() => parse("SELECT a - b - c - d / e")).toThrow("Ambiguous expression: mixing");
    expect(() => parse("SELECT a - b - (c - d) / e")).toThrow("Ambiguous expression: mixing");
  });

  it("allows chained arithmetic with parentheses", () => {
    const ast = parse("SELECT (1 + 2) + 3");
    expect((ast as any).expr.op).toBe("plus");
    expect((ast as any).expr.left.op).toBe("plus");

    const ast2 = parse("SELECT (1 + 2) * 3");
    expect((ast2 as any).expr.op).toBe("multiply");
    expect((ast2 as any).expr.left.op).toBe("plus");
  });

  it("allows cross-group with parentheses", () => {
    const ast = parse("SELECT (a - b - c - d) / e");
    expect(ast).toEqual(Select(
      BinaryOp("divide",
        BinaryOp("minus",
          BinaryOp("minus",
            BinaryOp("minus", Identifier("a"), Identifier("b")),
            Identifier("c")),
          Identifier("d")),
        Identifier("e"))
    ));

    const ast2 = parse("SELECT (a / e) - b - c - d");
    expect(ast2).toEqual(Select(
      BinaryOp("minus",
        BinaryOp("minus",
          BinaryOp("minus",
            BinaryOp("divide", Identifier("a"), Identifier("e")),
            Identifier("b")),
          Identifier("c")),
        Identifier("d"))
    ));

    const ast3 = parse("SELECT a - b - ((c - d) / e)");
    expect(ast3).toEqual(Select(
      BinaryOp("minus",
        BinaryOp("minus", Identifier("a"), Identifier("b")),
        BinaryOp("divide",
          BinaryOp("minus", Identifier("c"), Identifier("d")),
          Identifier("e")))
    ));
  });
});

describe("Comparison operators", () => {
  it("parses equality", () => {
    expect(parse("SELECT x = 1")).toEqual(Select(BinaryOp("eq", Identifier("x"), Num("1"))));
  });

  it("parses inequality", () => {
    expect(parse("SELECT x != 'test'")).toEqual(Select(BinaryOp("neq", Identifier("x"), Str("test"))));
  });

  it("parses less than", () => {
    expect(parse("SELECT x < 10")).toEqual(Select(BinaryOp("lt", Identifier("x"), Num("10"))));
  });

  it("parses greater than", () => {
    expect(parse("SELECT x > 0")).toEqual(Select(BinaryOp("gt", Identifier("x"), Num("0"))));
  });

  it("parses less than or equal", () => {
    expect(parse("SELECT x <= 100")).toEqual(Select(BinaryOp("lte", Identifier("x"), Num("100"))));
  });

  it("parses greater than or equal", () => {
    expect(parse("SELECT x >= 0")).toEqual(Select(BinaryOp("gte", Identifier("x"), Num("0"))));
  });

  it("rejects chained comparisons", () => {
    expect(() => parse("SELECT 1 < 2 < 3")).toThrow("Cannot chain comparison");
  });
});

describe("Logical operators", () => {
  it("parses single AND", () => {
    const ast = parse("SELECT a = 1 AND b = 2");
    expect((ast as any).expr.op).toBe("and");
  });

  it("parses single OR", () => {
    const ast = parse("SELECT a = 1 OR b = 2");
    expect((ast as any).expr.op).toBe("or");
  });

  it("allows chaining same logical operator", () => {
    const ast = parse("SELECT a = 1 AND b = 2 AND c = 3");
    expect((ast as any).expr.op).toBe("and");
    expect((ast as any).expr.left.op).toBe("and");

    const ast2 = parse("SELECT a = 1 OR b = 2 OR c = 3");
    expect((ast2 as any).expr.op).toBe("or");
    expect((ast2 as any).expr.left.op).toBe("or");
  });

  it("rejects mixing AND/OR without parentheses", () => {
    expect(() => parse("SELECT a = 1 AND b = 2 OR c = 3")).toThrow("Ambiguous expression: mixing AND/OR");
    expect(() => parse("SELECT a = 1 OR b = 2 AND c = 3")).toThrow("Ambiguous expression: mixing AND/OR");
  });

  it("allows mixing AND/OR with parentheses", () => {
    const ast = parse("SELECT (a = 1 AND b = 2) OR c = 3");
    expect((ast as any).expr.op).toBe("or");
    expect((ast as any).expr.left.op).toBe("and");

    const ast2 = parse("SELECT a = 1 AND (b = 2 OR c = 3)");
    expect((ast2 as any).expr.op).toBe("and");
    expect((ast2 as any).expr.right.op).toBe("or");
  });
});

describe("Parentheses", () => {
  it("parses parenthesized expression", () => {
    expect(parse("SELECT (42)")).toEqual(Select(Num("42")));
  });

  it("parses nested parentheses", () => {
    const ast = parse("SELECT ((1 + 2))");
    expect((ast as any).expr.op).toBe("plus");
  });

  it("rejects unclosed parenthesis", () => {
    expect(() => parse("SELECT (1 + 2")).toThrow("Expected closing parenthesis");
  });
});

describe("CASE/WHEN", () => {
  it("parses simple CASE WHEN", () => {
    const ast = parse("SELECT CASE WHEN x = 1 THEN 'one' END");
    expect((ast as any).expr.kind).toBe("case_expr");
    const expr = (ast as any).expr as CaseExprNode;
    expect(expr.whenClauses).toHaveLength(1);
    expect(expr.elseClause).toBeNull();
    const wc = expr.whenClauses[0] as WhenClauseNode;
    expect(wc.condition).toEqual(BinaryOp("eq", Identifier("x"), Num("1")));
    expect(wc.result).toEqual(Str("one"));
  });

  it("parses CASE WHEN with ELSE", () => {
    const ast = parse("SELECT CASE WHEN x = 1 THEN 'one' ELSE 'other' END");
    const expr = (ast as any).expr as CaseExprNode;
    expect(expr.whenClauses).toHaveLength(1);
    expect(expr.elseClause).toEqual(Str("other"));
  });

  it("parses multiple WHEN clauses", () => {
    const ast = parse(`
      SELECT CASE
        WHEN x = 1 THEN 'one'
        WHEN x = 2 THEN 'two'
        WHEN x = 3 THEN 'three'
      END
    `);
    expect((ast as any).expr.whenClauses).toHaveLength(3);
  });

  it("parses nested CASE", () => {
    const ast = parse(`
      SELECT CASE
        WHEN x = 1 THEN CASE WHEN y = 2 THEN 'nested' ELSE 'inner' END
        ELSE 'outer'
      END
    `);
    const outer = (ast as any).expr as CaseExprNode;
    const wc = outer.whenClauses[0] as WhenClauseNode;
    expect(wc.result.kind).toBe("case_expr");
    expect(outer.elseClause).toEqual(Str("outer"));
  });

  it("rejects CASE without WHEN", () => {
    expect(() => parse("SELECT CASE END")).toThrow();
  });

  it("rejects CASE without END", () => {
    expect(() => parse("SELECT CASE WHEN x = 1 THEN 'one'")).toThrow("Expected END");
  });
});

describe("Function calls", () => {
  it("parses function with single argument", () => {
    expect(parse("SELECT UPPER(x)")).toEqual(Select(FunctionCall("upper", [Identifier("x")])));
  });

  it("parses function with multiple arguments", () => {
    expect(parse("SELECT ROUND(x, 2)")).toEqual(Select(
      FunctionCall("round", [Identifier("x"), Num("2")])
    ));
  });

  it("parses nested function calls", () => {
    const ast = parse("SELECT ROUND(COALESCE(x, 0), 2)");
    const expr = (ast as any).expr as FunctionCallNode;
    expect(expr.kind).toBe("function_call");
    expect(expr.name).toBe("round");
    expect(expr.args).toHaveLength(2);
    expect((expr.args[0] as FunctionCallNode).name).toBe("coalesce");
  });

  it("parses function with expression argument", () => {
    const ast = parse("SELECT ROUND(a / b, 2)");
    const expr = (ast as any).expr as FunctionCallNode;
    expect(expr.name).toBe("round");
    const firstArg = expr.args[0] as BinaryOpNode;
    expect(firstArg.op).toBe("divide");
  });

  it("rejects function without closing paren", () => {
    expect(() => parse("SELECT ROUND(x, 2")).toThrow("Expected closing parenthesis");
  });
});

describe("SELECT is optional", () => {
  it("parses without SELECT", () => {
    expect(parse("42")).toEqual(Select(Num("42")));
  });

  it("parses complex expression without SELECT", () => {
    const ast = parse("x / y");
    expect((ast as any).expr.op).toBe("divide");
  });

  it("parses CASE without SELECT", () => {
    const ast = parse("CASE WHEN x = 1 THEN 'yes' ELSE 'no' END");
    expect((ast as any).expr.kind).toBe("case_expr");
  });
});

describe("IN and NOT IN", () => {
  it("parses simple IN", () => {
    const ast = parse("x IN ('a', 'b')");
    expect(ast).toEqual(Select(InExpr(Identifier("x"), [Str("a"), Str("b")])));
  });

  it("parses IN with numbers", () => {
    const ast = parse("x IN (1, 2, 3)");
    expect(ast).toEqual(Select(InExpr(Identifier("x"), [Num("1"), Num("2"), Num("3")])));
  });

  it("parses NOT IN", () => {
    const ast = parse("x NOT IN ('a', 'b')");
    expect(ast).toEqual(Select(NotInExpr(Identifier("x"), [Str("a"), Str("b")])));
  });

  it("parses IN with single item", () => {
    const ast = parse("x IN ('a')");
    expect(ast).toEqual(Select(InExpr(Identifier("x"), [Str("a")])));
  });

  it("parses IN combined with AND", () => {
    const ast = parse("x IN ('a', 'b') AND y > 10");
    expect((ast as any).expr.op).toBe("and");
    expect((ast as any).expr.left.kind).toBe("in_expr");
    expect((ast as any).expr.right.op).toBe("gt");
  });

  it("rejects IN without closing paren", () => {
    expect(() => parse("x IN ('a', 'b'")).toThrow();
  });
});

describe("IS and IS NOT", () => {
  it("parses IS NULL", () => {
    expect(parse("x IS NULL")).toEqual(Select(BinaryOp("eq", Identifier("x"), Null())));
  });

  it("parses IS NOT NULL", () => {
    expect(parse("x IS NOT NULL")).toEqual(Select(BinaryOp("neq", Identifier("x"), Null())));
  });

  it("parses IS TRUE", () => {
    expect(parse("flag IS TRUE")).toEqual(Select(BinaryOp("eq", Identifier("flag"), Bool(true))));
  });

  it("parses IS NOT TRUE", () => {
    expect(parse("flag IS NOT TRUE")).toEqual(Select(BinaryOp("neq", Identifier("flag"), Bool(true))));
  });

  it("parses IS FALSE", () => {
    expect(parse("flag IS FALSE")).toEqual(Select(BinaryOp("eq", Identifier("flag"), Bool(false))));
  });

  it("parses IS NOT FALSE", () => {
    expect(parse("flag IS NOT FALSE")).toEqual(Select(BinaryOp("neq", Identifier("flag"), Bool(false))));
  });

  it("IS NULL combined with AND", () => {
    const ast = parse("x IS NULL AND y = 1");
    expect((ast as any).expr.op).toBe("and");
    const left = (ast as any).expr.left as BinaryOpNode;
    expect(left.op).toBe("eq");
    expect(left.left).toEqual(Identifier("x"));
    expect(left.right.kind).toBe("null");
  });
});

describe("LIKE and NOT LIKE", () => {
  it("parses simple LIKE", () => {
    expect(parse("name LIKE '%test%'")).toEqual(Select(
      LikeExpr(Identifier("name"), Str("%test%"))
    ));
  });

  it("parses NOT LIKE", () => {
    expect(parse("name NOT LIKE '%test%'")).toEqual(Select(
      NotLikeExpr(Identifier("name"), Str("%test%"))
    ));
  });

  it("parses LIKE combined with AND", () => {
    const ast = parse("name LIKE '%test%' AND status = 'active'");
    expect((ast as any).expr.op).toBe("and");
    expect((ast as any).expr.left.kind).toBe("like_expr");
    expect((ast as any).expr.right.op).toBe("eq");
  });
});

describe("Error handling", () => {
  it("rejects unexpected tokens after expression", () => {
    expect(() => parse("SELECT 1 2")).toThrow("Unexpected tokens");
  });
});
