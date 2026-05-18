import { describe, it, expect } from "vitest";
import { tokenize, DsqlexError, Token } from "../src/index.js";

function tok(type: Token["type"], value?: string): Token {
  return value !== undefined ? { type, value } : { type };
}

describe("Operators", () => {
  it("single char operators", () => {
    expect(tokenize("+")).toEqual([tok("operator", "plus")]);
    expect(tokenize("-")).toEqual([tok("operator", "minus")]);
    expect(tokenize("*")).toEqual([tok("operator", "multiply")]);
    expect(tokenize("/")).toEqual([tok("operator", "divide")]);
    expect(tokenize("=")).toEqual([tok("operator", "eq")]);
    expect(tokenize("<")).toEqual([tok("operator", "lt")]);
    expect(tokenize(">")).toEqual([tok("operator", "gt")]);
  });

  it("multi-char operators", () => {
    expect(tokenize("!=")).toEqual([tok("operator", "neq")]);
    expect(tokenize("<=")).toEqual([tok("operator", "lte")]);
    expect(tokenize(">=")).toEqual([tok("operator", "gte")]);
  });

  it("multi-char takes precedence over single-char", () => {
    expect(tokenize("<=>")).toEqual([tok("operator", "lte"), tok("operator", "gt")]);
  });
});

describe("Delimiters", () => {
  it("parentheses", () => {
    expect(tokenize("()")).toEqual([tok("lparen"), tok("rparen")]);
  });

  it("comma", () => {
    expect(tokenize(",")).toEqual([tok("comma")]);
  });
});

describe("Numbers", () => {
  it("integers", () => {
    expect(tokenize("123")).toEqual([tok("number", "123")]);
    expect(tokenize("0")).toEqual([tok("number", "0")]);
    expect(tokenize("999999")).toEqual([tok("number", "999999")]);
  });

  it("decimals", () => {
    expect(tokenize("3.14")).toEqual([tok("number", "3.14")]);
    expect(tokenize("0.5")).toEqual([tok("number", "0.5")]);
    expect(tokenize("100.00")).toEqual([tok("number", "100.00")]);
  });

  it("number followed by operator", () => {
    expect(tokenize("10+20")).toEqual([
      tok("number", "10"),
      tok("operator", "plus"),
      tok("number", "20"),
    ]);
  });
});

describe("Strings", () => {
  it("simple string", () => {
    expect(tokenize("'hello'")).toEqual([tok("string", "hello")]);
    expect(tokenize("'hello world'")).toEqual([tok("string", "hello world")]);
  });

  it("empty string", () => {
    expect(tokenize("''")).toEqual([tok("string", "")]);
  });

  it("string with numbers", () => {
    expect(tokenize("'abc123'")).toEqual([tok("string", "abc123")]);
  });

  it("unterminated string", () => {
    expect(() => tokenize("'hello")).toThrow(DsqlexError);
    expect(() => tokenize("'hello")).toThrow("Unterminated string");
  });
});

describe("Identifiers", () => {
  it("simple identifier", () => {
    expect(tokenize("my_var")).toEqual([tok("identifier", "my_var")]);
  });

  it("identifier with numbers", () => {
    expect(tokenize("field1")).toEqual([tok("identifier", "field1")]);
    expect(tokenize("var2_name")).toEqual([tok("identifier", "var2_name")]);
  });

  it("identifier starting with underscore", () => {
    expect(tokenize("_private")).toEqual([tok("identifier", "_private")]);
  });
});

describe("Keywords", () => {
  it("SQL keywords", () => {
    expect(tokenize("SELECT")).toEqual([tok("keyword", "select")]);
    expect(tokenize("CASE")).toEqual([tok("keyword", "case")]);
    expect(tokenize("WHEN")).toEqual([tok("keyword", "when")]);
    expect(tokenize("THEN")).toEqual([tok("keyword", "then")]);
    expect(tokenize("ELSE")).toEqual([tok("keyword", "else")]);
    expect(tokenize("END")).toEqual([tok("keyword", "end")]);
  });

  it("logical keywords", () => {
    expect(tokenize("AND")).toEqual([tok("keyword", "and")]);
    expect(tokenize("OR")).toEqual([tok("keyword", "or")]);
    expect(tokenize("NOT")).toEqual([tok("keyword", "not")]);
  });

  it("literal keywords", () => {
    expect(tokenize("NULL")).toEqual([tok("keyword", "null")]);
    expect(tokenize("TRUE")).toEqual([tok("keyword", "true")]);
    expect(tokenize("FALSE")).toEqual([tok("keyword", "false")]);
  });

  it("keywords are case-insensitive", () => {
    expect(tokenize("select")).toEqual([tok("keyword", "select")]);
    expect(tokenize("Select")).toEqual([tok("keyword", "select")]);
    expect(tokenize("sElEcT")).toEqual([tok("keyword", "select")]);
  });
});

describe("Functions", () => {
  it("built-in functions", () => {
    expect(tokenize("UPPER")).toEqual([tok("function", "upper")]);
    expect(tokenize("LOWER")).toEqual([tok("function", "lower")]);
    expect(tokenize("ROUND")).toEqual([tok("function", "round")]);
    expect(tokenize("COALESCE")).toEqual([tok("function", "coalesce")]);
    expect(tokenize("ABS")).toEqual([tok("function", "abs")]);
  });

  it("NVL is alias for COALESCE", () => {
    expect(tokenize("NVL")).toEqual([tok("function", "coalesce")]);
  });

  it("EVENT function", () => {
    expect(tokenize("EVENT")).toEqual([tok("function", "event")]);
    expect(tokenize("event")).toEqual([tok("function", "event")]);
    expect(tokenize("Event")).toEqual([tok("function", "event")]);
  });

  it("functions are case-insensitive", () => {
    expect(tokenize("round")).toEqual([tok("function", "round")]);
    expect(tokenize("Round")).toEqual([tok("function", "round")]);
  });
});

describe("Dot-path identifiers", () => {
  it("simple dot path", () => {
    expect(tokenize("config.pricing")).toEqual([tok("identifier", "config.pricing")]);
  });

  it("multi-level dot path", () => {
    expect(tokenize("config.pricing.margin_rate")).toEqual([
      tok("identifier", "config.pricing.margin_rate"),
    ]);
  });

  it("dot path in expression", () => {
    expect(tokenize("base_amount * config.pricing.settlement_rate")).toEqual([
      tok("identifier", "base_amount"),
      tok("operator", "multiply"),
      tok("identifier", "config.pricing.settlement_rate"),
    ]);
  });

  it("dot not consumed when followed by digit", () => {
    expect(tokenize("1.5")).toEqual([tok("number", "1.5")]);
  });
});

describe("Whitespace", () => {
  it("ignores spaces", () => {
    expect(tokenize("1 + 2")).toEqual([tok("number", "1"), tok("operator", "plus"), tok("number", "2")]);
  });

  it("ignores tabs", () => {
    expect(tokenize("1\t+\t2")).toEqual([tok("number", "1"), tok("operator", "plus"), tok("number", "2")]);
  });

  it("ignores newlines", () => {
    expect(tokenize("1\n+\n2")).toEqual([tok("number", "1"), tok("operator", "plus"), tok("number", "2")]);
  });

  it("handles multiple spaces", () => {
    expect(tokenize("SELECT    x")).toEqual([tok("keyword", "select"), tok("identifier", "x")]);
  });
});

describe("Complex expressions", () => {
  it("simple arithmetic", () => {
    expect(tokenize("SELECT (x / y)")).toEqual([
      tok("keyword", "select"),
      tok("lparen"),
      tok("identifier", "x"),
      tok("operator", "divide"),
      tok("identifier", "y"),
      tok("rparen"),
    ]);
  });

  it("CASE WHEN expression", () => {
    const tokens = tokenize("SELECT CASE WHEN category = 'A' THEN x ELSE y END");
    expect(tokens).toEqual([
      tok("keyword", "select"),
      tok("keyword", "case"),
      tok("keyword", "when"),
      tok("identifier", "category"),
      tok("operator", "eq"),
      tok("string", "A"),
      tok("keyword", "then"),
      tok("identifier", "x"),
      tok("keyword", "else"),
      tok("identifier", "y"),
      tok("keyword", "end"),
    ]);
  });

  it("function call with arguments", () => {
    expect(tokenize("ROUND(x, 2)")).toEqual([
      tok("function", "round"),
      tok("lparen"),
      tok("identifier", "x"),
      tok("comma"),
      tok("number", "2"),
      tok("rparen"),
    ]);
  });

  it("nested function calls", () => {
    expect(tokenize("ROUND(COALESCE(x, 0), 2)")).toEqual([
      tok("function", "round"),
      tok("lparen"),
      tok("function", "coalesce"),
      tok("lparen"),
      tok("identifier", "x"),
      tok("comma"),
      tok("number", "0"),
      tok("rparen"),
      tok("comma"),
      tok("number", "2"),
      tok("rparen"),
    ]);
  });

  it("comparison with AND/OR", () => {
    expect(tokenize("category = 'A' AND x > 100")).toEqual([
      tok("identifier", "category"),
      tok("operator", "eq"),
      tok("string", "A"),
      tok("keyword", "and"),
      tok("identifier", "x"),
      tok("operator", "gt"),
      tok("number", "100"),
    ]);
  });
});

describe("IN and LIKE", () => {
  it("IN keyword", () => {
    expect(tokenize("x IN ('a', 'b')")).toEqual([
      tok("identifier", "x"),
      tok("keyword", "in"),
      tok("lparen"),
      tok("string", "a"),
      tok("comma"),
      tok("string", "b"),
      tok("rparen"),
    ]);
  });

  it("NOT IN keywords", () => {
    expect(tokenize("x NOT IN (1, 2, 3)")).toEqual([
      tok("identifier", "x"),
      tok("keyword", "not"),
      tok("keyword", "in"),
      tok("lparen"),
      tok("number", "1"),
      tok("comma"),
      tok("number", "2"),
      tok("comma"),
      tok("number", "3"),
      tok("rparen"),
    ]);
  });

  it("LIKE keyword", () => {
    expect(tokenize("name LIKE '%test%'")).toEqual([
      tok("identifier", "name"),
      tok("keyword", "like"),
      tok("string", "%test%"),
    ]);
  });

  it("NOT LIKE keywords", () => {
    expect(tokenize("name NOT LIKE '%test%'")).toEqual([
      tok("identifier", "name"),
      tok("keyword", "not"),
      tok("keyword", "like"),
      tok("string", "%test%"),
    ]);
  });

  it("IN and LIKE are case-insensitive", () => {
    expect(tokenize("x in ('a')")).toEqual(tokenize("x IN ('a')"));
    expect(tokenize("x like '%a'")).toEqual(tokenize("x LIKE '%a'"));
  });
});

describe("Empty input", () => {
  it("empty string returns empty list", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("only whitespace returns empty list", () => {
    expect(tokenize("   ")).toEqual([]);
    expect(tokenize("\n\t ")).toEqual([]);
  });
});

describe("Comments", () => {
  it("double-dash comment to end of input", () => {
    expect(tokenize("x -- this is a comment")).toEqual([tok("identifier", "x")]);
  });

  it("double-dash comment ends at newline", () => {
    expect(tokenize("x -- comment\n+ y")).toEqual([
      tok("identifier", "x"),
      tok("operator", "plus"),
      tok("identifier", "y"),
    ]);
  });

  it("hash line comment", () => {
    expect(tokenize("# top comment\nx # trailing comment")).toEqual([tok("identifier", "x")]);
  });

  it("block comment inline", () => {
    expect(tokenize("x /* inline */ + y")).toEqual([
      tok("identifier", "x"),
      tok("operator", "plus"),
      tok("identifier", "y"),
    ]);
  });

  it("block comment multi-line", () => {
    expect(tokenize("x /*\n  multi\n  line\n*/ + y")).toEqual([
      tok("identifier", "x"),
      tok("operator", "plus"),
      tok("identifier", "y"),
    ]);
  });

  it("unterminated block comment", () => {
    expect(() => tokenize("x /* never closes")).toThrow(DsqlexError);
    expect(() => tokenize("x /* never closes")).toThrow("Unterminated block comment");
  });

  it("comment bodies may contain non-ASCII", () => {
    const expr =
      "status_id NOT IN (\n" +
      "  1,  -- pending review\n" +
      "  2,  -- archived – soft-deleted\n" +
      "  3,  -- naïve test\n" +
      "  4   -- staging\n" +
      ")";
    const tokens = tokenize(expr);
    expect(tokens).toContainEqual(tok("identifier", "status_id"));
    expect(tokens).toContainEqual(tok("keyword", "not"));
    expect(tokens).toContainEqual(tok("keyword", "in"));
    expect(tokens).toContainEqual(tok("number", "1"));
    expect(tokens).toContainEqual(tok("number", "4"));
    expect(tokens).not.toContainEqual(tok("operator", "minus"));
  });

  it("minus operator unaffected when not doubled", () => {
    expect(tokenize("x - y")).toEqual([
      tok("identifier", "x"),
      tok("operator", "minus"),
      tok("identifier", "y"),
    ]);
  });

  it("divide operator unaffected when not followed by star", () => {
    expect(tokenize("x / y")).toEqual([
      tok("identifier", "x"),
      tok("operator", "divide"),
      tok("identifier", "y"),
    ]);
  });
});

describe("Error messages", () => {
  it("non-ASCII character returns error", () => {
    expect(() => tokenize("ô")).toThrow(DsqlexError);
    expect(() => tokenize("ô")).toThrow("Unexpected character");
  });

  it("unexpected character message format", () => {
    expect(() => tokenize("ô")).toThrow("Unexpected character: 'ô'");
  });
});
