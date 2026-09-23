import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { evaluateAST, DsqlexError } from "../src/index.js";
import {
  Select, Num, Str, Bool, Null, Identifier,
  BinaryOp, UnaryOp, CaseExpr, WhenClause, FunctionCall,
  InExpr, NotInExpr, LikeExpr, NotLikeExpr,
  ASTNode, WhenClauseNode,
} from "../src/index.js";
import { EvalOptions, Context, Value } from "../src/evaluator.js";

const CTX: Context = {
  x: new Decimal("100.00"),
  y: new Decimal("20.00"),
  category: "B",
  rate: new Decimal("5.00"),
  status: "active",
  group_id: 33,
  nullable_field: null,
  flag: true,
};

function ev(ast: ASTNode, opts: EvalOptions = {}): Value {
  return evaluateAST(ast, CTX, opts);
}

function sel(expr: ASTNode) { return Select(expr); }
function num(n: string) { return Num(n); }
function s(v: string) { return Str(v); }
function ident(name: string) { return Identifier(name); }
function b(v: boolean) { return Bool(v); }
function nul() { return Null(); }
function binop(op: Parameters<typeof BinaryOp>[0], left: ASTNode, right: ASTNode) {
  return BinaryOp(op, left, right);
}
function case_expr(whens: WhenClauseNode[], elseClause: ASTNode | null) {
  return CaseExpr(whens, elseClause);
}
function when_clause(cond: ASTNode, result: ASTNode) { return WhenClause(cond, result); }
function call(name: string, args: ASTNode[]) { return FunctionCall(name, args); }

describe("Literals", () => {
  it("evaluates number as Decimal", () => {
    const result = ev(sel(num("42")));
    expect(result).toBeInstanceOf(Decimal);
    expect(result).toEqual(new Decimal("42"));
  });

  it("evaluates string", () => {
    expect(ev(sel(s("hello")))).toBe("hello");
  });

  it("evaluates boolean", () => {
    expect(ev(sel(b(true)))).toBe(true);
    expect(ev(sel(b(false)))).toBe(false);
  });

  it("evaluates null", () => {
    expect(ev(sel(nul()))).toBeNull();
  });
});

describe("Identifiers", () => {
  it("looks up identifier in context", () => {
    expect(ev(sel(ident("category")))).toBe("B");
  });

  it("returns Decimal for numeric fields", () => {
    const result = ev(sel(ident("x")));
    expect(result).toEqual(new Decimal("100.00"));
  });

  it("returns null for nullable field", () => {
    expect(ev(sel(ident("nullable_field")))).toBeNull();
  });

  it("errors on unknown field", () => {
    expect(() => ev(sel(ident("unknown_field")))).toThrow("Unknown field: unknown_field");
  });
});

describe("Arithmetic", () => {
  it("addition", () => {
    expect(ev(sel(binop("plus", num("10"), num("5"))))).toEqual(new Decimal("15"));
  });

  it("subtraction", () => {
    expect(ev(sel(binop("minus", num("10"), num("3"))))).toEqual(new Decimal("7"));
  });

  it("multiplication", () => {
    expect(ev(sel(binop("multiply", num("4"), num("5"))))).toEqual(new Decimal("20"));
  });

  it("division", () => {
    expect(ev(sel(binop("divide", num("100"), num("5"))))).toEqual(new Decimal("20"));
  });

  it("division with context values", () => {
    const result = ev(sel(binop("divide", ident("x"), ident("rate"))));
    expect(result).toEqual(new Decimal("20"));
  });

  it("nested arithmetic", () => {
    const ast = sel(binop("multiply", binop("plus", num("10"), num("5")), num("2")));
    expect(ev(ast)).toEqual(new Decimal("30"));
  });
});

describe("Comparison", () => {
  it("equality true", () => {
    expect(ev(sel(binop("eq", ident("category"), s("B"))))).toBe(true);
  });

  it("equality false", () => {
    expect(ev(sel(binop("eq", ident("category"), s("A"))))).toBe(false);
  });

  it("inequality", () => {
    expect(ev(sel(binop("neq", ident("category"), s("A"))))).toBe(true);
  });

  it("less than", () => {
    expect(ev(sel(binop("lt", num("5"), num("10"))))).toBe(true);
  });

  it("greater than", () => {
    expect(ev(sel(binop("gt", ident("x"), num("50"))))).toBe(true);
  });

  it("less than or equal", () => {
    expect(ev(sel(binop("lte", num("10"), num("10"))))).toBe(true);
  });

  it("greater than or equal", () => {
    expect(ev(sel(binop("gte", ident("group_id"), num("33"))))).toBe(true);
  });

  it("numeric comparison with Decimals", () => {
    expect(ev(sel(binop("gt", ident("x"), ident("y"))))).toBe(true);
  });
});

describe("Logical operators", () => {
  it("AND both true", () => {
    const ast = sel(binop("and",
      binop("eq", ident("category"), s("B")),
      binop("eq", ident("group_id"), num("33"))));
    expect(ev(ast)).toBe(true);
  });

  it("AND one false", () => {
    const ast = sel(binop("and",
      binop("eq", ident("category"), s("A")),
      binop("eq", ident("group_id"), num("33"))));
    expect(ev(ast)).toBe(false);
  });

  it("OR one true", () => {
    const ast = sel(binop("or",
      binop("eq", ident("category"), s("A")),
      binop("eq", ident("group_id"), num("33"))));
    expect(ev(ast)).toBe(true);
  });

  it("OR both false", () => {
    const ast = sel(binop("or",
      binop("eq", ident("category"), s("A")),
      binop("eq", ident("group_id"), num("99"))));
    expect(ev(ast)).toBe(false);
  });

  it("chained AND", () => {
    const ast = sel(binop("and",
      binop("and",
        binop("eq", ident("category"), s("B")),
        binop("eq", ident("group_id"), num("33"))),
      binop("eq", ident("status"), s("active"))));
    expect(ev(ast)).toBe(true);
  });
});

describe("CASE/WHEN", () => {
  it("returns first matching WHEN result", () => {
    const ast = sel(case_expr([
      when_clause(binop("eq", ident("category"), s("A")), s("first")),
      when_clause(binop("eq", ident("category"), s("B")), s("second")),
    ], null));
    expect(ev(ast)).toBe("second");
  });

  it("returns ELSE when no WHEN matches", () => {
    const ast = sel(case_expr([
      when_clause(binop("eq", ident("category"), s("A")), s("first")),
      when_clause(binop("eq", ident("category"), s("C")), s("third")),
    ], s("other")));
    expect(ev(ast)).toBe("other");
  });

  it("returns null when no match and no ELSE", () => {
    const ast = sel(case_expr([
      when_clause(binop("eq", ident("category"), s("A")), s("first")),
    ], null));
    expect(ev(ast)).toBeNull();
  });

  it("evaluates complex WHEN conditions", () => {
    const ast = sel(case_expr([
      when_clause(
        binop("and",
          binop("eq", ident("category"), s("B")),
          binop("gt", ident("x"), num("50"))),
        s("big B"))
    ], s("other")));
    expect(ev(ast)).toBe("big B");
  });

  it("conditional division use case", () => {
    const ast = sel(case_expr([
      when_clause(binop("eq", ident("category"), s("A")), ident("y")),
      when_clause(binop("neq", ident("category"), s("A")),
        binop("divide", ident("x"), ident("rate"))),
    ], null));
    expect(ev(ast)).toEqual(new Decimal("20"));
  });
});

describe("Functions", () => {
  it("ROUND with precision", () => {
    const ast = sel(call("round", [num("3.14159"), num("2")]));
    expect(ev(ast)).toEqual(new Decimal("3.14"));
  });

  it("ROUND with expression", () => {
    const ast = sel(call("round", [
      binop("divide", ident("x"), ident("rate")),
      num("2"),
    ]));
    expect(ev(ast)).toEqual(new Decimal("20.00"));
  });

  it("COALESCE returns first non-null", () => {
    const ast = sel(call("coalesce", [ident("nullable_field"), num("0")]));
    expect(ev(ast)).toEqual(new Decimal("0"));
  });

  it("COALESCE returns first value if not null", () => {
    const ast = sel(call("coalesce", [ident("y"), num("0")]));
    expect(ev(ast)).toEqual(new Decimal("20.00"));
  });

  it("UPPER", () => {
    expect(ev(sel(call("upper", [ident("category")])))).toBe("B");
    expect(ev(sel(call("upper", [s("hello")])))).toBe("HELLO");
  });

  it("LOWER", () => {
    expect(ev(sel(call("lower", [s("HELLO")])))).toBe("hello");
  });

  it("ABS", () => {
    expect(ev(sel(call("abs", [num("-42")])))).toEqual(new Decimal("42"));
  });

  it("CONCAT with two strings", () => {
    expect(ev(sel(call("concat", [s("hello"), s(" world")])))).toBe("hello world");
  });

  it("CONCAT with multiple arguments", () => {
    expect(ev(sel(call("concat", [ident("status"), s(" - "), ident("category")])))).toBe("active - B");
  });

  it("CONCAT coerces numbers to strings", () => {
    expect(ev(sel(call("concat", [s("Value: "), ident("x")])))).toBe("Value: 100");
  });

  it("nested functions", () => {
    const ast = sel(call("round", [
      call("coalesce", [
        binop("divide", ident("x"), ident("rate")),
        ident("y"),
      ]),
      num("2"),
    ]));
    expect(ev(ast)).toEqual(new Decimal("20.00"));
  });
});

describe("Type handling", () => {
  it("compares Decimal to integer", () => {
    expect(ev(sel(binop("eq", ident("group_id"), num("33"))))).toBe(true);
  });

  it("compares strings", () => {
    expect(ev(sel(binop("lt", s("apple"), s("banana"))))).toBe(true);
  });
});

describe("Error handling", () => {
  it("unknown field returns error", () => {
    expect(() => ev(sel(ident("nonexistent")))).toThrow(DsqlexError);
  });
});

describe("Resolver", () => {
  it("resolves unknown identifier via resolver", () => {
    const resolver = (name: string) => {
      if (name === "event_a") return new Decimal("42");
      throw new DsqlexError(`Unknown: ${name}`);
    };
    const ast = sel(binop("plus", ident("event_a"), num("10")));
    const result = evaluateAST(ast, {}, { resolver });
    expect(result).toEqual(new Decimal("52"));
  });

  it("context takes precedence over resolver", () => {
    const resolver = () => new Decimal("999");
    const ast = sel(ident("x"));
    expect(evaluateAST(ast, CTX, { resolver })).toEqual(new Decimal("100.00"));
  });

  it("resolver error is propagated", () => {
    const resolver = (name: string) => { throw new DsqlexError(`Event not found: ${name}`); };
    const ast = sel(ident("missing_event"));
    expect(() => evaluateAST(ast, {}, { resolver })).toThrow("Event not found: missing_event");
  });

  it("circular reference is detected", () => {
    const resolver = () => new Decimal("1");
    const ast = sel(ident("event_a"));
    expect(() =>
      evaluateAST(ast, {}, { resolver, visited: new Set(["event_a"]) })
    ).toThrow("Circular reference detected: event_a");
  });

  it("resolver works inside arithmetic", () => {
    const resolver = (name: string) =>
      ({ event_a: new Decimal("100"), event_b: new Decimal("30") }[name] as Value);
    const ast = sel(binop("minus", ident("event_a"), ident("event_b")));
    expect(evaluateAST(ast, {}, { resolver })).toEqual(new Decimal("70"));
  });

  it("resolver works inside CASE WHEN", () => {
    const resolver = (name: string) => {
      if (name === "event_a") return new Decimal("50");
      throw new DsqlexError(`Unknown: ${name}`);
    };
    const ast = sel(case_expr([
      when_clause(binop("gt", ident("event_a"), num("10")), ident("event_a")),
    ], num("0")));
    expect(evaluateAST(ast, {}, { resolver })).toEqual(new Decimal("50"));
  });
});

describe("Dot-path nested map access", () => {
  it("simple dot path", () => {
    const ctx: Context = { config: { pricing: new Decimal("1.02") } };
    const ast = Select(Identifier("config.pricing"));
    expect(evaluateAST(ast, ctx)).toEqual(new Decimal("1.02"));
  });

  it("multi-level dot path", () => {
    const ctx: Context = { config: { pricing: { margin_rate: new Decimal("2.9") } } };
    const ast = Select(Identifier("config.pricing.margin_rate"));
    expect(evaluateAST(ast, ctx)).toEqual(new Decimal("2.9"));
  });

  it("dot path in arithmetic expression", () => {
    const ctx: Context = {
      base_amount: new Decimal("100"),
      config: { pricing: { settlement_rate: new Decimal("1.02") } },
    };
    const ast = Select(BinaryOp("multiply",
      Identifier("base_amount"),
      Identifier("config.pricing.settlement_rate")));
    expect(evaluateAST(ast, ctx)).toEqual(new Decimal("102.00"));
  });

  it("dot path with unknown nested key raises error", () => {
    const ctx: Context = { config: { pricing: new Decimal("1.02") } };
    const ast = Select(Identifier("config.nonexistent"));
    expect(() => evaluateAST(ast, ctx)).toThrow("Unknown field: config.nonexistent");
  });

  it("dot path through list sums numeric values", () => {
    const ctx: Context = { adjustments: [
      { adjustment_amount: new Decimal("100.00") },
      { adjustment_amount: new Decimal("50.00") },
      { adjustment_amount: new Decimal("25.00") },
    ]};
    const ast = Select(Identifier("adjustments.adjustment_amount"));
    expect(evaluateAST(ast, ctx)).toEqual(new Decimal("175.00"));
  });

  it("dot path through list with nested map sums", () => {
    const ctx: Context = { adjustments: [
      { config: { pricing: { margin_rate: new Decimal("1.5") } } },
      { config: { pricing: { margin_rate: new Decimal("2.5") } } },
    ]};
    const ast = Select(Identifier("adjustments.config.pricing.margin_rate"));
    expect(evaluateAST(ast, ctx)).toEqual(new Decimal("4.0"));
  });

  it("dot path through list returns list for non-numeric", () => {
    const ctx: Context = { adjustments: [
      { status: "CO" },
      { status: "PE" },
    ]};
    const ast = Select(Identifier("adjustments.status"));
    expect(evaluateAST(ast, ctx)).toEqual(["CO", "PE"]);
  });

  it("dot path through single map", () => {
    const ctx: Context = { order_data: { amount: new Decimal("500.00") } };
    const ast = Select(Identifier("order_data.amount"));
    expect(evaluateAST(ast, ctx)).toEqual(new Decimal("500.00"));
  });
});

// ---------------------------------------------------------------------------
// EVENT() function
// ---------------------------------------------------------------------------

import { eval_ } from "../src/index.js";

function makeEventResolver(formulas: Record<string, string>) {
  return function resolver(
    type: string,
    subtype: string,
    evalContext: Context,
    opts: EvalOptions,
  ): Value {
    const key = `${type}.${subtype}`;
    if (key in formulas) {
      return eval_(formulas[key], evalContext, opts);
    }
    throw new DsqlexError(`No formula found for EVENT(${type}, ${subtype})`);
  };
}

describe("EVENT() function", () => {
  it("2 args evaluates with current context", () => {
    const formulas = { "ORDER_PLACED.SERVICE_FEE": "amount * rate" };
    const event_resolver = makeEventResolver(formulas);
    const ctx: Context = { amount: new Decimal("100"), rate: new Decimal("0.05") };
    const ast = sel(call("event", [ident("ORDER_PLACED"), ident("SERVICE_FEE")]));
    const result = evaluateAST(ast, ctx, { event_resolver });
    expect(result).toEqual(new Decimal("5.000"));
  });

  it("3 args single map context source", () => {
    const formulas = { "ORDER_PLACED.ORDER_TOTAL": "amount" };
    const event_resolver = makeEventResolver(formulas);
    const ctx: Context = {
      amount: new Decimal("999"),
      order_data: { amount: new Decimal("500") },
    };
    const ast = sel(call("event", [ident("ORDER_PLACED"), ident("ORDER_TOTAL"), ident("order_data")]));
    const result = evaluateAST(ast, ctx, { event_resolver });
    expect(result).toEqual(new Decimal("500"));
  });

  it("3 args list context source implicit sum", () => {
    const formulas = { "RETURN_PROCESSED.RETURN_TOTAL": "amount" };
    const event_resolver = makeEventResolver(formulas);
    const ctx: Context = { adjustments: [
      { amount: new Decimal("50") },
      { amount: new Decimal("30") },
      { amount: new Decimal("20") },
    ]};
    const ast = sel(call("event", [ident("RETURN_PROCESSED"), ident("RETURN_TOTAL"), ident("adjustments")]));
    const result = evaluateAST(ast, ctx, { event_resolver });
    expect(result).toEqual(new Decimal("100"));
  });

  it("empty list returns zero", () => {
    const formulas = { "RETURN_PROCESSED.RETURN_TOTAL": "amount" };
    const event_resolver = makeEventResolver(formulas);
    const ctx: Context = { adjustments: [] };
    const ast = sel(call("event", [ident("RETURN_PROCESSED"), ident("RETURN_TOTAL"), ident("adjustments")]));
    const result = evaluateAST(ast, ctx, { event_resolver });
    expect(result).toEqual(new Decimal("0"));
  });

  it("net total pattern", () => {
    const formulas = {
      "ORDER_PLACED.ORDER_TOTAL": "amount",
      "RETURN_PROCESSED.RETURN_TOTAL": "amount",
    };
    const event_resolver = makeEventResolver(formulas);
    const ctx: Context = {
      order_data: { amount: new Decimal("500") },
      adjustments: [
        { amount: new Decimal("50") },
        { amount: new Decimal("30") },
      ],
    };
    const ast = sel(binop("minus",
      call("event", [ident("ORDER_PLACED"), ident("ORDER_TOTAL"), ident("order_data")]),
      call("event", [ident("RETURN_PROCESSED"), ident("RETURN_TOTAL"), ident("adjustments")])));
    expect(evaluateAST(ast, ctx, { event_resolver })).toEqual(new Decimal("420"));
  });

  it("errors when no resolver", () => {
    const ast = sel(call("event", [ident("TYPE"), ident("SUBTYPE")]));
    expect(() => evaluateAST(ast, {})).toThrow("event_resolver");
  });

  it("errors when formula not found", () => {
    const event_resolver = makeEventResolver({});
    const ast = sel(call("event", [ident("UNKNOWN"), ident("EVENT")]));
    expect(() => evaluateAST(ast, {}, { event_resolver })).toThrow("No formula found");
  });

  it("errors when context source not found", () => {
    const event_resolver = makeEventResolver({ "T.S": "x" });
    const ast = sel(call("event", [ident("T"), ident("S"), ident("missing_field")]));
    expect(() => evaluateAST(ast, {}, { event_resolver })).toThrow("not found in context");
  });

  it("errors with wrong number of args", () => {
    const event_resolver = makeEventResolver({});
    const ast = sel(call("event", [ident("ONLY_ONE")]));
    expect(() => evaluateAST(ast, {}, { event_resolver })).toThrow("EVENT requires 2 or 3 arguments");
  });

  it("circular reference detection", () => {
    const formulas = {
      "A.X": "EVENT(B, Y)",
      "B.Y": "EVENT(A, X)",
    };
    const event_resolver = makeEventResolver(formulas);
    const ast = sel(call("event", [ident("A"), ident("X")]));
    expect(() => evaluateAST(ast, {}, { event_resolver })).toThrow("Circular reference detected: A.X");
  });

  it("EVENT in CASE expression", () => {
    const formulas = { "P.FEE": "amount * rate" };
    const event_resolver = makeEventResolver(formulas);
    const ctx: Context = { currency: "USD", amount: new Decimal("100"), rate: new Decimal("0.03") };
    const ast = sel(case_expr([
      when_clause(binop("eq", ident("currency"), s("USD")),
        call("event", [ident("P"), ident("FEE")])),
    ], num("0")));
    expect(evaluateAST(ast, ctx, { event_resolver })).toEqual(new Decimal("3.00"));
  });

  it("EVENT arithmetic with scalar and list context", () => {
    const formulas = { "P.REC": "amount", "R.REC": "amount" };
    const event_resolver = makeEventResolver(formulas);
    const ctx: Context = {
      order_data: { amount: new Decimal("1000") },
      adjustments: [
        { amount: new Decimal("100") },
        { amount: new Decimal("200") },
        { amount: new Decimal("150") },
      ],
    };
    const ast = sel(binop("minus",
      call("event", [ident("P"), ident("REC"), ident("order_data")]),
      call("event", [ident("R"), ident("REC"), ident("adjustments")])));
    expect(evaluateAST(ast, ctx, { event_resolver })).toEqual(new Decimal("550"));
  });
});

describe("IN and NOT IN", () => {
  it("string in list match", () => {
    const ast = sel(InExpr(ident("category"), [s("A"), s("B"), s("C")]));
    expect(ev(ast)).toBe(true);
  });

  it("string in list no match", () => {
    const ast = sel(InExpr(ident("category"), [s("X"), s("Y")]));
    expect(ev(ast)).toBe(false);
  });

  it("number in list match", () => {
    const ast = sel(InExpr(ident("x"), [num("50"), num("100.00"), num("200")]));
    expect(ev(ast)).toBe(true);
  });

  it("number in list no match", () => {
    const ast = sel(InExpr(ident("x"), [num("1"), num("2")]));
    expect(ev(ast)).toBe(false);
  });

  it("NOT IN no match returns true", () => {
    const ast = sel(NotInExpr(ident("category"), [s("X"), s("Y")]));
    expect(ev(ast)).toBe(true);
  });

  it("NOT IN match returns false", () => {
    const ast = sel(NotInExpr(ident("category"), [s("A"), s("B")]));
    expect(ev(ast)).toBe(false);
  });

  it("IN with single item", () => {
    const ast = sel(InExpr(ident("category"), [s("B")]));
    expect(ev(ast)).toBe(true);
  });
});

describe("LIKE and NOT LIKE", () => {
  it("LIKE percent prefix match", () => {
    expect(ev(sel(LikeExpr(ident("status"), s("%tive"))))).toBe(true);
  });

  it("LIKE percent suffix match", () => {
    expect(ev(sel(LikeExpr(ident("status"), s("act%"))))).toBe(true);
  });

  it("LIKE percent both sides", () => {
    expect(ev(sel(LikeExpr(ident("status"), s("%ctiv%"))))).toBe(true);
  });

  it("LIKE exact match", () => {
    expect(ev(sel(LikeExpr(ident("status"), s("active"))))).toBe(true);
  });

  it("LIKE no match", () => {
    expect(ev(sel(LikeExpr(ident("status"), s("%xyz%"))))).toBe(false);
  });

  it("LIKE underscore single char wildcard", () => {
    expect(ev(sel(LikeExpr(ident("category"), s("_"))))).toBe(true);
  });

  it("LIKE underscore does not match multiple chars", () => {
    expect(ev(sel(LikeExpr(ident("status"), s("_"))))).toBe(false);
  });

  it("LIKE is case-insensitive", () => {
    expect(ev(sel(LikeExpr(ident("status"), s("ACTIVE"))))).toBe(true);
  });

  it("LIKE case-insensitive with wildcards", () => {
    expect(ev(sel(LikeExpr(ident("status"), s("%CTIV%"))))).toBe(true);
  });

  it("NOT LIKE no match returns true", () => {
    expect(ev(sel(NotLikeExpr(ident("status"), s("%xyz%"))))).toBe(true);
  });

  it("NOT LIKE match returns false", () => {
    expect(ev(sel(NotLikeExpr(ident("status"), s("%active%"))))).toBe(false);
  });
});

describe("NULL propagation", () => {
  it("null propagates through +, -, *, /", () => {
    expect(ev(sel(binop("plus", ident("nullable_field"), num("1"))))).toBeNull();
    expect(ev(sel(binop("minus", num("1"), ident("nullable_field"))))).toBeNull();
    expect(ev(sel(binop("multiply", num("2"), ident("nullable_field"))))).toBeNull();
    expect(ev(sel(binop("divide", ident("nullable_field"), num("2"))))).toBeNull();
  });

  it("ROUND returns null if value or precision is null", () => {
    expect(ev(sel(call("round", [ident("nullable_field"), num("2")])))).toBeNull();
    expect(ev(sel(call("round", [ident("x"), ident("nullable_field")])))).toBeNull();
  });

  it("ABS returns null for null", () => {
    expect(ev(sel(call("abs", [ident("nullable_field")])))).toBeNull();
  });
});

describe("LEAST / GREATEST", () => {
  it("LEAST picks smallest", () => {
    expect(ev(sel(call("least", [num("3"), num("1"), num("2")])))).toEqual(new Decimal("1"));
  });

  it("GREATEST picks largest", () => {
    expect(ev(sel(call("greatest", [num("3"), num("1"), num("2")])))).toEqual(new Decimal("3"));
  });

  it("single argument", () => {
    expect(ev(sel(call("least", [num("7")])))).toEqual(new Decimal("7"));
  });

  it("zero args is an error", () => {
    expect(() => ev(sel(call("least", [])))).toThrow("at least one argument");
    expect(() => ev(sel(call("greatest", [])))).toThrow("at least one argument");
  });

  it("returns null if any argument is null", () => {
    expect(ev(sel(call("least", [num("1"), ident("nullable_field"), num("2")])))).toBeNull();
    expect(ev(sel(call("greatest", [num("1"), ident("nullable_field")])))).toBeNull();
  });

  it("strings compare lexicographically", () => {
    expect(ev(sel(call("least", [s("banana"), s("apple"), s("cherry")])))).toBe("apple");
    expect(ev(sel(call("greatest", [s("banana"), s("apple"), s("cherry")])))).toBe("cherry");
  });

  it("preserves first on tie", () => {
    const first = num("1");
    expect(ev(sel(call("least", [first, num("1.0")])))).toEqual(new Decimal("1"));
  });

  it("compares Date values chronologically", () => {
    const ctx: Context = {
      a: new Date("2024-01-01T00:00:00Z"),
      b: new Date("2023-06-15T00:00:00Z"),
    };
    expect(evaluateAST(sel(call("least", [ident("a"), ident("b")])), ctx))
      .toEqual(new Date("2023-06-15T00:00:00Z"));
    expect(evaluateAST(sel(call("greatest", [ident("a"), ident("b")])), ctx))
      .toEqual(new Date("2024-01-01T00:00:00Z"));
    expect(evaluateAST(sel(binop("gt", ident("a"), ident("b"))), ctx)).toBe(true);
    expect(evaluateAST(sel(binop("lt", ident("a"), ident("b"))), ctx)).toBe(false);
  });
});

describe("Unary minus", () => {
  it("negates a number literal", () => {
    expect(ev(sel(UnaryOp("minus", num("5"))))).toEqual(new Decimal("-5"));
  });

  it("negates a Decimal context value", () => {
    expect(ev(sel(UnaryOp("minus", ident("x"))))).toEqual(new Decimal("-100.00"));
  });

  it("negates a nested arithmetic expression", () => {
    expect(ev(sel(UnaryOp("minus", binop("plus", num("1"), num("2")))))).toEqual(new Decimal("-3"));
  });

  it("coerces integer values", () => {
    expect(ev(sel(UnaryOp("minus", ident("group_id"))))).toEqual(new Decimal("-33"));
  });

  it("propagates null", () => {
    expect(ev(sel(UnaryOp("minus", nul())))).toBeNull();
    expect(ev(sel(UnaryOp("minus", ident("nullable_field"))))).toBeNull();
  });

  it("errors on non-numeric operand", () => {
    expect(() => ev(sel(UnaryOp("minus", s("abc"))))).toThrow(DsqlexError);
  });
});
