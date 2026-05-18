import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { eval_, DsqlexError } from "../src/index.js";
import { EvalOptions, Context, Value } from "../src/evaluator.js";

const SAMPLE: Context = {
  price: new Decimal("500.00"),
  quantity: new Decimal("100.00"),
  category: "B",
  rate: new Decimal("5.00"),
  status: "completed",
  group_id: 33,
  label: "hello world",
  tax: new Decimal("10.00"),
  discount: new Decimal("2.00"),
  bonus: null,
};

function run(expression: string, context: Context = SAMPLE): Value {
  return eval_(expression, context);
}

describe("Simple expressions", () => {
  it("select a field", () => {
    expect(run("SELECT price")).toEqual(new Decimal("500.00"));
  });

  it("select a literal", () => {
    expect(run("SELECT 42")).toEqual(new Decimal("42"));
  });

  it("select a string", () => {
    expect(run("SELECT 'hello'")).toBe("hello");
  });
});

describe("Arithmetic calculations", () => {
  it("simple division", () => {
    expect(run("SELECT price / rate")).toEqual(new Decimal("100"));
  });

  it("addition", () => {
    expect(run("SELECT price + quantity")).toEqual(new Decimal("600.00"));
  });

  it("complex arithmetic with parentheses", () => {
    expect(run("SELECT (price + tax) / rate")).toEqual(new Decimal("102"));
  });

  it("nested parentheses", () => {
    expect(run("SELECT ((price / rate) + discount)")).toEqual(new Decimal("102.00"));
  });
});

describe("Comparisons and logic", () => {
  it("equality check", () => {
    expect(run("SELECT category = 'B'")).toBe(true);
    expect(run("SELECT category = 'A'")).toBe(false);
  });

  it("numeric comparison", () => {
    expect(run("SELECT price > 100")).toBe(true);
    expect(run("SELECT price < 100")).toBe(false);
  });

  it("AND condition", () => {
    expect(run("SELECT category = 'B' AND group_id = 33")).toBe(true);
    expect(run("SELECT category = 'A' AND group_id = 33")).toBe(false);
  });

  it("OR condition", () => {
    expect(run("SELECT category = 'A' OR group_id = 33")).toBe(true);
    expect(run("SELECT category = 'A' OR group_id = 99")).toBe(false);
  });

  it("chained AND", () => {
    expect(run("SELECT category = 'B' AND group_id = 33 AND status = 'completed'")).toBe(true);
  });

  it("mixed AND/OR with parentheses", () => {
    expect(run("SELECT (category = 'A' OR category = 'B') AND group_id = 33")).toBe(true);
    expect(run("SELECT category = 'B' AND (group_id = 33 OR group_id = 55)")).toBe(true);
  });
});

describe("CASE/WHEN", () => {
  it("conditional selection category B", () => {
    const result = run(`
      SELECT CASE
        WHEN category = 'A' THEN quantity
        WHEN category != 'A' THEN (price / rate)
      END
    `);
    expect(result).toEqual(new Decimal("100"));
  });

  it("conditional selection category A", () => {
    const ctx = { ...SAMPLE, category: "A" };
    const result = run(`
      SELECT CASE
        WHEN category = 'A' THEN quantity
        WHEN category != 'A' THEN (price / rate)
      END
    `, ctx);
    expect(result).toEqual(new Decimal("100.00"));
  });

  it("multiple conditions with ELSE", () => {
    const result = run(`
      SELECT CASE
        WHEN status = 'pending' THEN 'waiting'
        WHEN status = 'completed' THEN 'done'
        ELSE 'unknown'
      END
    `);
    expect(result).toBe("done");
  });

  it("complex condition in WHEN", () => {
    const result = run(`
      SELECT CASE
        WHEN category = 'B' AND price > 100 THEN 'large B item'
        ELSE 'other'
      END
    `);
    expect(result).toBe("large B item");
  });

  it("nested CASE", () => {
    const result = run(`
      SELECT CASE
        WHEN category = 'B' THEN
          CASE
            WHEN price > 1000 THEN 'large'
            ELSE 'small'
          END
        ELSE 'other'
      END
    `);
    expect(result).toBe("small");
  });
});

describe("Functions", () => {
  it("ROUND calculation result", () => {
    expect(run("SELECT ROUND(price / rate, 2)")).toEqual(new Decimal("100.00"));
  });

  it("COALESCE with null", () => {
    expect(run("SELECT COALESCE(bonus, 0)")).toEqual(new Decimal("0"));
  });

  it("COALESCE with non-null", () => {
    expect(run("SELECT COALESCE(quantity, 0)")).toEqual(new Decimal("100.00"));
  });

  it("UPPER", () => {
    expect(run("SELECT UPPER(label)")).toBe("HELLO WORLD");
  });

  it("nested functions", () => {
    expect(run("SELECT ROUND(COALESCE((price / rate), quantity), 2)")).toEqual(new Decimal("100.00"));
  });

  it("function in CASE result", () => {
    const result = run(`
      SELECT CASE
        WHEN category = 'B' THEN ROUND(price / rate, 2)
        ELSE quantity
      END
    `);
    expect(result).toEqual(new Decimal("100.00"));
  });

  it("CONCAT strings", () => {
    expect(run("CONCAT('Hello', ' ', 'World')")).toBe("Hello World");
  });

  it("CONCAT with fields", () => {
    expect(run("CONCAT(label, ' in ', category)")).toBe("hello world in B");
  });

  it("CONCAT in CASE", () => {
    const result = run(`
      CASE
        WHEN category = 'B' THEN CONCAT('Category: ', category)
        ELSE CONCAT('Other: ', category)
      END
    `);
    expect(result).toBe("Category: B");
  });
});

describe("Advanced calculation scenarios", () => {
  it("net value after deductions", () => {
    expect(run("SELECT (price - tax) / rate")).toEqual(new Decimal("98"));
  });

  it("percentage calculation", () => {
    expect(run("SELECT (tax / price) * 100")).toEqual(new Decimal("2.00"));
  });

  it("conditional value selection", () => {
    const result = run(`
      SELECT CASE
        WHEN category = 'A' THEN discount
        ELSE (tax / rate)
      END
    `);
    expect(result).toEqual(new Decimal("2"));
  });

  it("complex conditional rule", () => {
    const result = run(`
      SELECT CASE
        WHEN category = 'A' AND quantity > 50 THEN ROUND(quantity * 1.1, 2)
        WHEN category != 'A' AND price > 100 THEN ROUND((price / rate) * 1.05, 2)
        ELSE 0
      END
    `);
    expect(result).toEqual(new Decimal("105.00"));
  });
});

describe("Error handling", () => {
  it("lexer error - unterminated string", () => {
    expect(() => run("SELECT 'hello")).toThrow("Unterminated string");
  });

  it("parser error - missing parenthesis", () => {
    expect(() => run("SELECT (1 + 2")).toThrow("Expected closing parenthesis");
  });

  it("parser error - ambiguous expression", () => {
    expect(() => run("SELECT 1 + 2 * 3")).toThrow("Ambiguous expression");
  });

  it("evaluator error - unknown field", () => {
    expect(() => run("SELECT nonexistent")).toThrow("Unknown field: nonexistent");
  });
});

describe("Cross-event references (resolver pattern)", () => {
  const EVENT_FORMULAS: Record<string, string> = {
    event_a: "x + y",
    event_b: "z - event_a",
    event_c: "event_a + event_b",
    event_circular: "event_circular + 1",
  };

  const REF_CTX: Context = {
    x: new Decimal("100"),
    y: new Decimal("20"),
    z: new Decimal("200"),
  };

  function makeResolver(formulas: Record<string, string>, context: Context) {
    return function resolver(name: string, visited: ReadonlySet<string>): Value {
      if (name in formulas) {
        const newVisited = new Set(visited);
        newVisited.add(name);
        return eval_(formulas[name], context, {
          resolver: makeResolver(formulas, context),
          visited: newVisited,
        });
      }
      throw new DsqlexError(`Unknown event: ${name}`);
    };
  }

  it("event_b references event_a", () => {
    const resolver = makeResolver(EVENT_FORMULAS, REF_CTX);
    const result = eval_("event_b", REF_CTX, { resolver });
    expect(result).toEqual(new Decimal("80"));
  });

  it("event_c references event_a and event_b", () => {
    const resolver = makeResolver(EVENT_FORMULAS, REF_CTX);
    const result = eval_("event_c", REF_CTX, { resolver });
    expect(result).toEqual(new Decimal("200"));
  });

  it("direct event reference", () => {
    const resolver = makeResolver(EVENT_FORMULAS, REF_CTX);
    const result = eval_("event_a", REF_CTX, { resolver });
    expect(result).toEqual(new Decimal("120"));
  });

  it("circular reference is detected", () => {
    const resolver = makeResolver(EVENT_FORMULAS, REF_CTX);
    expect(() => eval_("event_circular", REF_CTX, { resolver })).toThrow("Circular reference detected: event_circular");
  });

  it("unknown event returns error", () => {
    const resolver = makeResolver(EVENT_FORMULAS, REF_CTX);
    expect(() => eval_("nonexistent_event", REF_CTX, { resolver })).toThrow("Unknown event: nonexistent_event");
  });

  it("event reference in arithmetic", () => {
    const resolver = makeResolver(EVENT_FORMULAS, REF_CTX);
    const result = eval_("event_a * 2", REF_CTX, { resolver });
    expect(result).toEqual(new Decimal("240"));
  });

  it("event reference in CASE expression", () => {
    const resolver = makeResolver(EVENT_FORMULAS, REF_CTX);
    const result = eval_(`
      CASE
        WHEN event_a > 100 THEN event_b
        ELSE 0
      END
    `, REF_CTX, { resolver });
    expect(result).toEqual(new Decimal("80"));
  });
});

describe("EVENT() function end-to-end", () => {
  function mockEventResolver(formulas: Record<string, string>) {
    return function resolver(
      type: string,
      subtype: string,
      evalContext: Context,
      opts: EvalOptions,
    ): Value {
      const key = `${type}.${subtype}`;
      if (key in formulas) return eval_(formulas[key], evalContext, opts);
      throw new DsqlexError(`No formula found for EVENT(${type}, ${subtype})`);
    };
  }

  function runWithEvents(expression: string, context: Context, formulas: Record<string, string>): Value {
    return eval_(expression, context, { event_resolver: mockEventResolver(formulas) });
  }

  it("2 args uses current context", () => {
    const formulas = { "ORDER_PLACED.FEE": "amount * rate" };
    const ctx: Context = { amount: new Decimal("100"), rate: new Decimal("0.05") };
    expect(runWithEvents("EVENT(ORDER_PLACED, FEE)", ctx, formulas)).toEqual(new Decimal("5.000"));
  });

  it("3 args map context source", () => {
    const formulas = { "P.REC": "amount" };
    const ctx: Context = {
      amount: new Decimal("999"),
      order_data: { amount: new Decimal("500") },
    };
    expect(runWithEvents("EVENT(P, REC, order_data)", ctx, formulas)).toEqual(new Decimal("500"));
  });

  it("3 args list context source implicit sum", () => {
    const formulas = { "R.REC": "amount" };
    const ctx: Context = { adjustments: [
      { amount: new Decimal("50") },
      { amount: new Decimal("30") },
    ]};
    expect(runWithEvents("EVENT(R, REC, adjustments)", ctx, formulas)).toEqual(new Decimal("80"));
  });

  it("net total pattern", () => {
    const formulas = {
      "ORDER_PLACED.ORDER_TOTAL": "amount",
      "RETURN_PROCESSED.RETURN_TOTAL": "amount",
    };
    const ctx: Context = {
      order_data: { amount: new Decimal("1000") },
      adjustments: [
        { amount: new Decimal("200") },
        { amount: new Decimal("100") },
      ],
    };
    const result = runWithEvents(
      "EVENT(ORDER_PLACED, ORDER_TOTAL, order_data) - EVENT(RETURN_PROCESSED, RETURN_TOTAL, adjustments)",
      ctx, formulas);
    expect(result).toEqual(new Decimal("700"));
  });

  it("EVENT in CASE expression", () => {
    const formulas = { "P.FEE": "amount * rate" };
    const ctx: Context = { currency: "USD", amount: new Decimal("100"), rate: new Decimal("0.03") };
    const result = runWithEvents(`
      CASE
        WHEN currency = 'USD' THEN EVENT(P, FEE)
        ELSE 0
      END
    `, ctx, formulas);
    expect(result).toEqual(new Decimal("3.00"));
  });

  it("circular event reference detected", () => {
    const formulas = { "A.X": "EVENT(B, Y)", "B.Y": "EVENT(A, X)" };
    expect(() => runWithEvents("EVENT(A, X)", {}, formulas)).toThrow("Circular reference detected: A.X");
  });

  it("missing formula returns error", () => {
    expect(() => runWithEvents("EVENT(UNKNOWN, MISSING_SUBTYPE)", {}, {})).toThrow("No formula found for EVENT");
  });

  it("nested event references", () => {
    const formulas = {
      "A.CALC": "amount * 2",
      "B.CALC": "EVENT(A, CALC) + 10",
    };
    const ctx: Context = { amount: new Decimal("50") };
    expect(runWithEvents("EVENT(B, CALC)", ctx, formulas)).toEqual(new Decimal("110"));
  });
});

describe("Edge cases", () => {
  it("empty string literal", () => {
    expect(run("SELECT ''")).toBe("");
  });

  it("zero values", () => {
    expect(run("SELECT 0")).toEqual(new Decimal("0"));
  });

  it("negative result", () => {
    expect(run("SELECT 10 - 20")).toEqual(new Decimal("-10"));
  });

  it("decimal precision maintained", () => {
    const result = run("SELECT 1 / 3");
    expect(result).toBeInstanceOf(Decimal);
  });

  it("whitespace handling", () => {
    expect(run("SELECT    price   /   rate")).not.toBeNull();
    expect(run("SELECT\n  price\n  /\n  rate")).not.toBeNull();
  });

  it("case-insensitive keywords", () => {
    expect(run("select price")).toEqual(new Decimal("500.00"));
    expect(run("SELECT CASE when category = 'B' then price ELSE 0 end")).toEqual(new Decimal("500.00"));
  });

  it("SELECT is optional", () => {
    expect(run("price")).toEqual(new Decimal("500.00"));
    expect(run("price / rate")).toEqual(new Decimal("100"));
    expect(run("(price / rate) + discount")).toEqual(new Decimal("102.00"));
    expect(run("CASE WHEN category = 'B' THEN price ELSE quantity END")).toEqual(new Decimal("500.00"));
    expect(run("ROUND(price, 2)")).toEqual(new Decimal("500.00"));
  });
});

describe("IN operator", () => {
  it("string in list match", () => {
    expect(run("category IN ('A', 'B', 'C')")).toBe(true);
  });

  it("string in list no match", () => {
    expect(run("category IN ('X', 'Y')")).toBe(false);
  });

  it("number in list", () => {
    const ctx: Context = { country_id: new Decimal("33") };
    expect(run("country_id IN (33, 44, 55)", ctx)).toBe(true);
  });

  it("NOT IN", () => {
    expect(run("category NOT IN ('X', 'Y')")).toBe(true);
    expect(run("category NOT IN ('A', 'B')")).toBe(false);
  });

  it("IN combined with AND", () => {
    expect(run("category IN ('A', 'B') AND status = 'completed'")).toBe(true);
  });

  it("IN combined with OR", () => {
    expect(run("category IN ('X', 'Y') OR status = 'completed'")).toBe(true);
  });
});

const IS_CTX: Context = {
  a: new Decimal("1.00"),
  b: null,
  flag: true,
  tag: "x",
};

describe("IS / IS NOT", () => {
  it("IS NULL true when null", () => {
    expect(run("b IS NULL", IS_CTX)).toBe(true);
  });

  it("IS NULL false when not null", () => {
    expect(run("a IS NULL", IS_CTX)).toBe(false);
  });

  it("IS NOT NULL true when not null", () => {
    expect(run("a IS NOT NULL", IS_CTX)).toBe(true);
  });

  it("IS NOT NULL false when null", () => {
    expect(run("b IS NOT NULL", IS_CTX)).toBe(false);
  });

  it("IS TRUE true when field true", () => {
    expect(run("flag IS TRUE", IS_CTX)).toBe(true);
  });

  it("IS TRUE false when field false", () => {
    expect(run("flag IS TRUE", { ...IS_CTX, flag: false })).toBe(false);
  });

  it("IS FALSE true when field false", () => {
    expect(run("flag IS FALSE", { ...IS_CTX, flag: false })).toBe(true);
  });

  it("IS NOT TRUE true when field false", () => {
    expect(run("flag IS NOT TRUE", { ...IS_CTX, flag: false })).toBe(true);
  });

  it("IS NOT FALSE true when field true", () => {
    expect(run("flag IS NOT FALSE", IS_CTX)).toBe(true);
  });

  it("IS NULL in CASE WHEN", () => {
    const result = run(`
      CASE
        WHEN b IS NULL THEN 'missing'
        ELSE 'present'
      END
    `, IS_CTX);
    expect(result).toBe("missing");
  });

  it("IS NOT NULL combined with AND", () => {
    expect(run("a IS NOT NULL AND tag = 'x'", IS_CTX)).toBe(true);
  });
});

describe("LIKE operator", () => {
  it("percent wildcard contains", () => {
    expect(run("label LIKE '%world%'")).toBe(true);
  });

  it("percent wildcard starts with", () => {
    expect(run("label LIKE 'hello%'")).toBe(true);
  });

  it("percent wildcard ends with", () => {
    expect(run("label LIKE '%world'")).toBe(true);
  });

  it("exact match", () => {
    expect(run("label LIKE 'hello world'")).toBe(true);
    expect(run("label LIKE 'hello'")).toBe(false);
  });

  it("underscore wildcard", () => {
    expect(run("category LIKE '_'")).toBe(true);
    expect(run("label LIKE '_'")).toBe(false);
  });

  it("LIKE is case-insensitive", () => {
    expect(run("label LIKE 'HELLO WORLD'")).toBe(true);
    expect(run("label LIKE '%WORLD'")).toBe(true);
    expect(run("status LIKE 'COMPLETED'")).toBe(true);
  });

  it("NOT LIKE", () => {
    expect(run("label NOT LIKE '%xyz%'")).toBe(true);
    expect(run("label NOT LIKE '%world%'")).toBe(false);
  });

  it("LIKE combined with AND", () => {
    expect(run("label LIKE '%hello%' AND status = 'completed'")).toBe(true);
  });

  it("LIKE and IN combined", () => {
    expect(run("category IN ('A', 'B') AND label LIKE '%world%'")).toBe(true);
  });
});
