import { DsqlexError } from "./error.js";
import { Token } from "./tokens.js";

const WORD_MAP: Record<string, [Token["type"], string]> = {
  SELECT:   ["keyword",  "select"],
  CASE:     ["keyword",  "case"],
  WHEN:     ["keyword",  "when"],
  THEN:     ["keyword",  "then"],
  ELSE:     ["keyword",  "else"],
  END:      ["keyword",  "end"],
  AND:      ["keyword",  "and"],
  OR:       ["keyword",  "or"],
  NOT:      ["keyword",  "not"],
  NULL:     ["keyword",  "null"],
  TRUE:     ["keyword",  "true"],
  FALSE:    ["keyword",  "false"],
  IS:       ["keyword",  "is"],
  IN:       ["keyword",  "in"],
  LIKE:     ["keyword",  "like"],
  UPPER:    ["function", "upper"],
  LOWER:    ["function", "lower"],
  ROUND:    ["function", "round"],
  COALESCE: ["function", "coalesce"],
  NVL:      ["function", "coalesce"],
  ABS:      ["function", "abs"],
  CONCAT:   ["function", "concat"],
  LEAST:    ["function", "least"],
  GREATEST: ["function", "greatest"],
  EVENT:    ["function", "event"],
};

const SINGLE_OPS: Record<string, string> = {
  "+": "plus",
  "-": "minus",
  "*": "multiply",
  "/": "divide",
  "=": "eq",
  "<": "lt",
  ">": "gt",
};

function isAsciiAlpha(c: string): boolean {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
}

function isAsciiAlnum(c: string): boolean {
  return isAsciiAlpha(c) || (c >= "0" && c <= "9");
}

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}

export function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = expr.length;

  while (i < n) {
    const c = expr[i];

    // whitespace
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }

    // comma
    if (c === ",") {
      tokens.push({ type: "comma" });
      i++;
      continue;
    }

    // single-quoted string
    if (c === "'") {
      i++;
      const start = i;
      while (i < n && expr[i] !== "'") i++;
      if (i >= n) throw new DsqlexError("Unterminated string");
      tokens.push({ type: "string", value: expr.slice(start, i) });
      i++; // skip closing quote
      continue;
    }

    // parentheses
    if (c === "(") {
      tokens.push({ type: "lparen" });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ type: "rparen" });
      i++;
      continue;
    }

    // number
    if (isDigit(c)) {
      const start = i;
      while (i < n && isDigit(expr[i])) i++;
      if (i + 1 < n && expr[i] === "." && isDigit(expr[i + 1])) {
        i++; // consume '.'
        while (i < n && isDigit(expr[i])) i++;
      }
      tokens.push({ type: "number", value: expr.slice(start, i) });
      continue;
    }

    // identifier / keyword / function
    if (isAsciiAlpha(c) || c === "_") {
      const start = i;
      while (i < n && (isAsciiAlnum(expr[i]) || expr[i] === "_")) i++;
      // dot-path: consume '.' only when followed by ASCII letter or '_'
      while (
        i + 1 < n &&
        expr[i] === "." &&
        (isAsciiAlpha(expr[i + 1]) || expr[i + 1] === "_")
      ) {
        i++; // consume '.'
        while (i < n && (isAsciiAlnum(expr[i]) || expr[i] === "_")) i++;
      }
      if (i < n && expr[i] === "?") i++;
      const word = expr.slice(start, i);
      const upper = word.toUpperCase();
      if (!word.includes(".") && upper in WORD_MAP) {
        const [type, value] = WORD_MAP[upper];
        tokens.push({ type, value });
      } else {
        tokens.push({ type: "identifier", value: word });
      }
      continue;
    }

    // SQL line comment: -- ...
    if (expr[i] === "-" && expr[i + 1] === "-") {
      while (i < n && expr[i] !== "\n") i++;
      continue;
    }

    // MySQL-style line comment: # ...
    if (c === "#") {
      while (i < n && expr[i] !== "\n") i++;
      continue;
    }

    // block comment: /* ... */
    if (expr[i] === "/" && expr[i + 1] === "*") {
      i += 2;
      let closed = false;
      while (i < n) {
        if (expr[i] === "*" && expr[i + 1] === "/") {
          i += 2;
          closed = true;
          break;
        }
        i++;
      }
      if (!closed) throw new DsqlexError("Unterminated block comment");
      continue;
    }

    // multi-char operators (before single-char)
    if (expr[i] === "!" && expr[i + 1] === "=") {
      tokens.push({ type: "operator", value: "neq" });
      i += 2;
      continue;
    }
    if (expr[i] === "<" && expr[i + 1] === "=") {
      tokens.push({ type: "operator", value: "lte" });
      i += 2;
      continue;
    }
    if (expr[i] === ">" && expr[i + 1] === "=") {
      tokens.push({ type: "operator", value: "gte" });
      i += 2;
      continue;
    }

    // single-char operators
    if (c in SINGLE_OPS) {
      tokens.push({ type: "operator", value: SINGLE_OPS[c] });
      i++;
      continue;
    }

    throw new DsqlexError(`Unexpected character: '${c}'`);
  }

  return tokens;
}
