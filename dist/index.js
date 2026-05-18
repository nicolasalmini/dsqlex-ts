// src/error.ts
var DsqlexError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "DsqlexError";
  }
};

// src/lexer.ts
var WORD_MAP = {
  SELECT: ["keyword", "select"],
  CASE: ["keyword", "case"],
  WHEN: ["keyword", "when"],
  THEN: ["keyword", "then"],
  ELSE: ["keyword", "else"],
  END: ["keyword", "end"],
  AND: ["keyword", "and"],
  OR: ["keyword", "or"],
  NOT: ["keyword", "not"],
  NULL: ["keyword", "null"],
  TRUE: ["keyword", "true"],
  FALSE: ["keyword", "false"],
  IS: ["keyword", "is"],
  IN: ["keyword", "in"],
  LIKE: ["keyword", "like"],
  UPPER: ["function", "upper"],
  LOWER: ["function", "lower"],
  ROUND: ["function", "round"],
  COALESCE: ["function", "coalesce"],
  NVL: ["function", "coalesce"],
  ABS: ["function", "abs"],
  CONCAT: ["function", "concat"],
  EVENT: ["function", "event"]
};
var SINGLE_OPS = {
  "+": "plus",
  "-": "minus",
  "*": "multiply",
  "/": "divide",
  "=": "eq",
  "<": "lt",
  ">": "gt"
};
function isAsciiAlpha(c) {
  return c >= "a" && c <= "z" || c >= "A" && c <= "Z";
}
function isAsciiAlnum(c) {
  return isAsciiAlpha(c) || c >= "0" && c <= "9";
}
function isDigit(c) {
  return c >= "0" && c <= "9";
}
function tokenize(expr) {
  const tokens = [];
  let i = 0;
  const n = expr.length;
  while (i < n) {
    const c = expr[i];
    if (c === " " || c === "	" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c === ",") {
      tokens.push({ type: "comma" });
      i++;
      continue;
    }
    if (c === "'") {
      i++;
      const start = i;
      while (i < n && expr[i] !== "'") i++;
      if (i >= n) throw new DsqlexError("Unterminated string");
      tokens.push({ type: "string", value: expr.slice(start, i) });
      i++;
      continue;
    }
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
    if (isDigit(c)) {
      const start = i;
      while (i < n && isDigit(expr[i])) i++;
      if (i + 1 < n && expr[i] === "." && isDigit(expr[i + 1])) {
        i++;
        while (i < n && isDigit(expr[i])) i++;
      }
      tokens.push({ type: "number", value: expr.slice(start, i) });
      continue;
    }
    if (isAsciiAlpha(c) || c === "_") {
      const start = i;
      while (i < n && (isAsciiAlnum(expr[i]) || expr[i] === "_")) i++;
      while (i + 1 < n && expr[i] === "." && (isAsciiAlpha(expr[i + 1]) || expr[i + 1] === "_")) {
        i++;
        while (i < n && (isAsciiAlnum(expr[i]) || expr[i] === "_")) i++;
      }
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
    if (expr[i] === "-" && expr[i + 1] === "-") {
      while (i < n && expr[i] !== "\n") i++;
      continue;
    }
    if (c === "#") {
      while (i < n && expr[i] !== "\n") i++;
      continue;
    }
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
    if (c in SINGLE_OPS) {
      tokens.push({ type: "operator", value: SINGLE_OPS[c] });
      i++;
      continue;
    }
    throw new DsqlexError(`Unexpected character: '${c}'`);
  }
  return tokens;
}

// src/ast.ts
var Select = (expr) => ({ kind: "select", expr });
var Num = (value) => ({ kind: "number", value });
var Str = (value) => ({ kind: "string", value });
var Bool = (value) => ({ kind: "boolean", value });
var Null = () => ({ kind: "null" });
var Identifier = (name) => ({ kind: "identifier", name });
var BinaryOp = (op, left, right) => ({
  kind: "binary_op",
  op,
  left,
  right
});
var CaseExpr = (whenClauses, elseClause) => ({ kind: "case_expr", whenClauses, elseClause });
var WhenClause = (condition, result) => ({
  kind: "when_clause",
  condition,
  result
});
var FunctionCall = (name, args) => ({
  kind: "function_call",
  name,
  args
});
var InExpr = (expr, items) => ({
  kind: "in_expr",
  expr,
  items
});
var NotInExpr = (expr, items) => ({
  kind: "not_in_expr",
  expr,
  items
});
var LikeExpr = (expr, pattern) => ({
  kind: "like_expr",
  expr,
  pattern
});
var NotLikeExpr = (expr, pattern) => ({
  kind: "not_like_expr",
  expr,
  pattern
});

// src/parser.ts
var ADDITIVE_OPS = /* @__PURE__ */ new Set(["plus", "minus"]);
var MULTIPLICATIVE_OPS = /* @__PURE__ */ new Set(["multiply", "divide"]);
var COMPARISON_OPS = /* @__PURE__ */ new Set(["eq", "neq", "lt", "gt", "lte", "gte"]);
var Parser = class {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }
  peek() {
    return this.tokens[this.pos];
  }
  consume() {
    const t = this.tokens[this.pos++];
    if (t === void 0) throw new DsqlexError("Unexpected end of input");
    return t;
  }
  match(type, value) {
    const t = this.peek();
    if (!t) return false;
    if (t.type !== type) return false;
    return value === void 0 || t.value === value;
  }
  expectKeyword(kw) {
    if (this.match("keyword", kw)) {
      this.consume();
    } else {
      const got = JSON.stringify(this.peek());
      throw new DsqlexError(`Expected ${kw.toUpperCase()}, got: ${got}`);
    }
  }
  parse() {
    const ast = this.parseSelect();
    if (this.pos < this.tokens.length) {
      const remaining = this.tokens.slice(this.pos);
      throw new DsqlexError(`Unexpected tokens: ${JSON.stringify(remaining)}`);
    }
    return ast;
  }
  parseSelect() {
    if (this.match("keyword", "select")) this.consume();
    return Select(this.parseExpression());
  }
  parseExpression() {
    return this.parseLogical();
  }
  parseLogical() {
    const left = this.parseComparison();
    if (this.match("keyword", "and")) {
      this.consume();
      const right = this.parseComparison();
      return this.parseAndChain(BinaryOp("and", left, right));
    }
    if (this.match("keyword", "or")) {
      this.consume();
      const right = this.parseComparison();
      return this.parseOrChain(BinaryOp("or", left, right));
    }
    return left;
  }
  parseAndChain(left) {
    if (this.match("keyword", "and")) {
      this.consume();
      const right = this.parseComparison();
      return this.parseAndChain(BinaryOp("and", left, right));
    }
    if (this.match("keyword", "or")) {
      throw new DsqlexError("Ambiguous expression: mixing AND/OR requires parentheses");
    }
    return left;
  }
  parseOrChain(left) {
    if (this.match("keyword", "or")) {
      this.consume();
      const right = this.parseComparison();
      return this.parseOrChain(BinaryOp("or", left, right));
    }
    if (this.match("keyword", "and")) {
      throw new DsqlexError("Ambiguous expression: mixing AND/OR requires parentheses");
    }
    return left;
  }
  parseComparison() {
    const left = this.parseArithmetic();
    const t = this.peek();
    if (!t) return left;
    if (t.type === "operator" && t.value && COMPARISON_OPS.has(t.value)) {
      this.consume();
      const right = this.parseArithmetic();
      const t2 = this.peek();
      if (t2 && t2.type === "operator" && t2.value && COMPARISON_OPS.has(t2.value)) {
        throw new DsqlexError("Cannot chain comparison operators. Use parentheses.");
      }
      return BinaryOp(t.value, left, right);
    }
    if (t.type === "keyword" && t.value === "in") {
      this.consume();
      const items = this.parseInList();
      return InExpr(left, items);
    }
    if (t.type === "keyword" && t.value === "not") {
      const t2 = this.tokens[this.pos + 1];
      if (t2) {
        if (t2.type === "keyword" && t2.value === "in") {
          this.consume();
          this.consume();
          const items = this.parseInList();
          return NotInExpr(left, items);
        }
        if (t2.type === "keyword" && t2.value === "like") {
          this.consume();
          this.consume();
          const pattern = this.parsePrimary();
          return NotLikeExpr(left, pattern);
        }
      }
    }
    if (t.type === "keyword" && t.value === "is") {
      this.consume();
      let negate = false;
      if (this.match("keyword", "not")) {
        this.consume();
        negate = true;
      }
      const kw = this.peek();
      if (!kw || kw.type !== "keyword" || !["null", "true", "false"].includes(kw.value ?? "")) {
        throw new DsqlexError(`Expected NULL, TRUE, or FALSE after IS${negate ? " NOT" : ""}`);
      }
      this.consume();
      let literal;
      if (kw.value === "null") literal = Null();
      else if (kw.value === "true") literal = Bool(true);
      else literal = Bool(false);
      return BinaryOp(negate ? "neq" : "eq", left, literal);
    }
    if (t.type === "keyword" && t.value === "like") {
      this.consume();
      const pattern = this.parsePrimary();
      return LikeExpr(left, pattern);
    }
    return left;
  }
  parseInList() {
    if (!this.match("lparen")) throw new DsqlexError("Expected '(' after IN");
    this.consume();
    const items = [];
    if (this.match("rparen")) {
      this.consume();
      return items;
    }
    items.push(this.parsePrimary());
    while (this.match("comma")) {
      this.consume();
      items.push(this.parsePrimary());
    }
    if (!this.match("rparen")) {
      throw new DsqlexError("Expected closing parenthesis ')' after IN list");
    }
    this.consume();
    return items;
  }
  parseArithmetic() {
    const left = this.parsePrimary();
    const t = this.peek();
    if (!t || t.type !== "operator") return left;
    if (t.value && ADDITIVE_OPS.has(t.value)) {
      this.consume();
      const right = this.parsePrimary();
      return this.parseAdditiveChain(BinaryOp(t.value, left, right));
    }
    if (t.value && MULTIPLICATIVE_OPS.has(t.value)) {
      this.consume();
      const right = this.parsePrimary();
      return this.parseMultiplicativeChain(BinaryOp(t.value, left, right));
    }
    return left;
  }
  parseAdditiveChain(left) {
    const t = this.peek();
    if (!t || t.type !== "operator") return left;
    if (t.value && ADDITIVE_OPS.has(t.value)) {
      this.consume();
      const right = this.parsePrimary();
      return this.parseAdditiveChain(BinaryOp(t.value, left, right));
    }
    if (t.value && MULTIPLICATIVE_OPS.has(t.value)) {
      throw new DsqlexError("Ambiguous expression: mixing +/- and */\xF7 requires parentheses");
    }
    return left;
  }
  parseMultiplicativeChain(left) {
    const t = this.peek();
    if (!t || t.type !== "operator") return left;
    if (t.value && MULTIPLICATIVE_OPS.has(t.value)) {
      this.consume();
      const right = this.parsePrimary();
      return this.parseMultiplicativeChain(BinaryOp(t.value, left, right));
    }
    if (t.value && ADDITIVE_OPS.has(t.value)) {
      throw new DsqlexError("Ambiguous expression: mixing +/- and */\xF7 requires parentheses");
    }
    return left;
  }
  parsePrimary() {
    const t = this.peek();
    if (!t) throw new DsqlexError("Unexpected end of input");
    if (t.type === "number") {
      this.consume();
      return Num(t.value);
    }
    if (t.type === "string") {
      this.consume();
      return Str(t.value);
    }
    if (t.type === "identifier") {
      this.consume();
      return Identifier(t.value);
    }
    if (t.type === "keyword" && t.value === "null") {
      this.consume();
      return Null();
    }
    if (t.type === "keyword" && t.value === "true") {
      this.consume();
      return Bool(true);
    }
    if (t.type === "keyword" && t.value === "false") {
      this.consume();
      return Bool(false);
    }
    if (t.type === "lparen") {
      this.consume();
      const expr = this.parseExpression();
      if (!this.match("rparen")) throw new DsqlexError("Expected closing parenthesis ')'");
      this.consume();
      return expr;
    }
    if (t.type === "keyword" && t.value === "case") {
      this.consume();
      const whenClauses = this.parseWhenClauses();
      const elseClause = this.parseElseClause();
      this.expectKeyword("end");
      return CaseExpr(whenClauses, elseClause);
    }
    if (t.type === "function") {
      const fname = t.value;
      this.consume();
      if (!this.match("lparen")) throw new DsqlexError(`Expected '(' after function ${fname.toUpperCase()}`);
      this.consume();
      const args = this.parseFunctionArgs();
      if (!this.match("rparen")) throw new DsqlexError("Expected closing parenthesis ')' after function arguments");
      this.consume();
      return FunctionCall(fname, args);
    }
    throw new DsqlexError(`Unexpected token: ${JSON.stringify([t])}`);
  }
  parseWhenClauses() {
    const clauses = [this.parseWhenClause()];
    while (this.match("keyword", "when")) {
      clauses.push(this.parseWhenClause());
    }
    return clauses;
  }
  parseWhenClause() {
    if (!this.match("keyword", "when")) throw new DsqlexError("Expected WHEN clause");
    this.consume();
    const condition = this.parseExpression();
    this.expectKeyword("then");
    const result = this.parseExpression();
    return WhenClause(condition, result);
  }
  parseElseClause() {
    if (this.match("keyword", "else")) {
      this.consume();
      return this.parseExpression();
    }
    return null;
  }
  parseFunctionArgs() {
    if (this.match("rparen")) return [];
    const args = [this.parseExpression()];
    while (this.match("comma")) {
      this.consume();
      args.push(this.parseExpression());
    }
    return args;
  }
};
function parse(tokens) {
  return new Parser(tokens).parse();
}

// src/evaluator.ts
import Decimal from "decimal.js";
Decimal.set({ rounding: Decimal.ROUND_HALF_UP });
function evaluate(ast, context, opts = {}) {
  if (typeof context !== "object" || context === null || Array.isArray(context)) {
    throw new DsqlexError("context must be an object");
  }
  return evalNode(ast, context, opts);
}
function evalNode(node, ctx, opts) {
  switch (node.kind) {
    case "select":
      return evalNode(node.expr, ctx, opts);
    case "number":
      return new Decimal(node.value);
    case "string":
      return node.value;
    case "boolean":
      return node.value;
    case "null":
      return null;
    case "identifier":
      return evalIdentifier(node, ctx, opts);
    case "binary_op": {
      const op = node.op;
      if (op === "and") {
        const left2 = evalNode(node.left, ctx, opts);
        if (!isTruthy(left2)) return left2;
        return evalNode(node.right, ctx, opts);
      }
      if (op === "or") {
        const left2 = evalNode(node.left, ctx, opts);
        if (isTruthy(left2)) return left2;
        return evalNode(node.right, ctx, opts);
      }
      const left = evalNode(node.left, ctx, opts);
      const right = evalNode(node.right, ctx, opts);
      if (op === "plus") return toDecimal(left).plus(toDecimal(right));
      if (op === "minus") return toDecimal(left).minus(toDecimal(right));
      if (op === "multiply") return toDecimal(left).times(toDecimal(right));
      if (op === "divide") return toDecimal(left).div(toDecimal(right));
      const cmp = compare(left, right);
      if (op === "eq") return cmp === "eq";
      if (op === "neq") return cmp !== "eq";
      if (op === "lt") return cmp === "lt";
      if (op === "gt") return cmp === "gt";
      if (op === "lte") return cmp === "lt" || cmp === "eq";
      if (op === "gte") return cmp === "gt" || cmp === "eq";
      throw new DsqlexError(`Unknown operator: ${op}`);
    }
    case "case_expr": {
      for (const when of node.whenClauses) {
        if (isTruthy(evalNode(when.condition, ctx, opts))) {
          return evalNode(when.result, ctx, opts);
        }
      }
      if (node.elseClause !== null) return evalNode(node.elseClause, ctx, opts);
      return null;
    }
    case "when_clause":
      throw new DsqlexError("WhenClause evaluated directly");
    case "function_call":
      return evalFunction(node, ctx, opts);
    case "in_expr": {
      const val = evalNode(node.expr, ctx, opts);
      return node.items.some((item) => compare(val, evalNode(item, ctx, opts)) === "eq");
    }
    case "not_in_expr": {
      const val = evalNode(node.expr, ctx, opts);
      return !node.items.some((item) => compare(val, evalNode(item, ctx, opts)) === "eq");
    }
    case "like_expr": {
      const val = String(evalNode(node.expr, ctx, opts));
      const pat = String(evalNode(node.pattern, ctx, opts));
      return likeMatch(val, pat);
    }
    case "not_like_expr": {
      const val = String(evalNode(node.expr, ctx, opts));
      const pat = String(evalNode(node.pattern, ctx, opts));
      return !likeMatch(val, pat);
    }
  }
}
function evalIdentifier(node, ctx, opts) {
  const name = node.name;
  if (name in ctx) return ctx[name];
  if (name.includes(".")) return resolveDotPath(name, ctx);
  const resolver = opts.resolver;
  if (resolver !== void 0) {
    const visited = opts.visited ?? /* @__PURE__ */ new Set();
    if (visited.has(name)) {
      throw new DsqlexError(`Circular reference detected: ${name}`);
    }
    return resolver(name, visited);
  }
  throw new DsqlexError(`Unknown field: ${name}`);
}
function resolveDotPath(path, ctx) {
  const parts = path.split(".");
  return resolveParts(parts, ctx, path);
}
function resolveParts(parts, current, fullPath) {
  if (parts.length === 0) return current;
  if (current !== null && typeof current === "object" && !Array.isArray(current)) {
    const key = parts[0];
    const obj = current;
    if (!(key in obj)) {
      throw new DsqlexError(`Unknown field: ${fullPath} (failed at '${key}')`);
    }
    return resolveParts(parts.slice(1), obj[key], fullPath);
  }
  if (Array.isArray(current)) {
    const results = current.map((item) => resolveParts(parts, item, fullPath));
    if (results.every((r) => isDecimalLike(r))) {
      return results.reduce(
        (acc, r) => acc.plus(toDecimal(r)),
        new Decimal(0)
      );
    }
    return results;
  }
  throw new DsqlexError(`Cannot access '${parts[0]}' on non-map value in path '${fullPath}'`);
}
function evalFunction(node, ctx, opts) {
  const { name, args } = node;
  if (name === "round") {
    if (args.length !== 2) throw new DsqlexError("ROUND requires exactly 2 arguments");
    const value = toDecimal(evalNode(args[0], ctx, opts));
    const precision = toDecimal(evalNode(args[1], ctx, opts)).toNumber();
    if (!Number.isInteger(precision)) throw new DsqlexError("ROUND precision must be an integer");
    return roundDecimal(value, precision);
  }
  if (name === "coalesce") {
    for (const arg of args) {
      const result = evalNode(arg, ctx, opts);
      if (result !== null) return result;
    }
    return null;
  }
  if (name === "upper") {
    if (args.length !== 1) throw new DsqlexError("UPPER requires exactly 1 argument");
    return String(evalNode(args[0], ctx, opts)).toUpperCase();
  }
  if (name === "lower") {
    if (args.length !== 1) throw new DsqlexError("LOWER requires exactly 1 argument");
    return String(evalNode(args[0], ctx, opts)).toLowerCase();
  }
  if (name === "abs") {
    if (args.length !== 1) throw new DsqlexError("ABS requires exactly 1 argument");
    return toDecimal(evalNode(args[0], ctx, opts)).abs();
  }
  if (name === "concat") {
    return args.map((arg) => String(evalNode(arg, ctx, opts))).join("");
  }
  if (name === "event") {
    return evalEvent(args, ctx, opts);
  }
  throw new DsqlexError(`Unknown function: ${name}`);
}
function evalEvent(args, ctx, opts) {
  if (args.length === 2) {
    const [typeNode, subtypeNode] = args;
    if (typeNode.kind !== "identifier" || subtypeNode.kind !== "identifier") {
      throw new DsqlexError("EVENT arguments must be identifiers");
    }
    return resolveEvent(typeNode.name, subtypeNode.name, ctx, opts);
  }
  if (args.length === 3) {
    const [typeNode, subtypeNode, sourceNode] = args;
    if (typeNode.kind !== "identifier" || subtypeNode.kind !== "identifier" || sourceNode.kind !== "identifier") {
      throw new DsqlexError("EVENT arguments must be identifiers");
    }
    const sourceName = sourceNode.name;
    if (!(sourceName in ctx)) {
      throw new DsqlexError(`EVENT context source '${sourceName}' not found in context`);
    }
    const subContext = ctx[sourceName];
    if (Array.isArray(subContext)) {
      const results = subContext.map(
        (item) => resolveEvent(typeNode.name, subtypeNode.name, item, opts)
      );
      return results.reduce(
        (acc, r) => acc.plus(toDecimal(r)),
        new Decimal(0)
      );
    }
    if (subContext !== null && typeof subContext === "object") {
      return resolveEvent(typeNode.name, subtypeNode.name, subContext, opts);
    }
    throw new DsqlexError(
      `EVENT context source '${sourceName}' must be a map or list of maps`
    );
  }
  throw new DsqlexError(
    "EVENT requires 2 or 3 arguments: EVENT(type, subtype) or EVENT(type, subtype, context_source)"
  );
}
function resolveEvent(type, subtype, ctx, opts) {
  const eventResolver = opts.event_resolver;
  if (!eventResolver) {
    throw new DsqlexError("EVENT() calls require an :event_resolver option");
  }
  const eventKey = `${type}.${subtype}`;
  const visited = opts.visited ?? /* @__PURE__ */ new Set();
  if (visited.has(eventKey)) {
    throw new DsqlexError(`Circular reference detected: ${eventKey}`);
  }
  const newVisited = new Set(visited);
  newVisited.add(eventKey);
  const newOpts = { ...opts, visited: newVisited };
  return eventResolver(type, subtype, ctx, newOpts);
}
function isTruthy(value) {
  return value !== null && value !== false;
}
function toDecimal(value) {
  if (value instanceof Decimal) return value;
  if (typeof value === "boolean") throw new DsqlexError("Cannot convert boolean to Decimal");
  if (typeof value === "number") return new Decimal(value);
  if (typeof value === "string") {
    try {
      return new Decimal(value);
    } catch {
      throw new DsqlexError(`Cannot convert ${JSON.stringify(value)} to Decimal`);
    }
  }
  throw new DsqlexError(`Cannot convert ${typeof value} to Decimal`);
}
function roundDecimal(value, precision) {
  return value.toDecimalPlaces(precision, Decimal.ROUND_HALF_UP);
}
function compare(a, b) {
  if (a === null && b === null) return "eq";
  if (a === null || b === null) return "neq";
  if (a instanceof Decimal || b instanceof Decimal) {
    try {
      const da = toDecimal(a);
      const db = toDecimal(b);
      if (da.equals(db)) return "eq";
      return da.lt(db) ? "lt" : "gt";
    } catch {
    }
  }
  if (a === b) return "eq";
  try {
    if (a < b) return "lt";
    return "gt";
  } catch {
    return "neq";
  }
}
function isDecimalLike(value) {
  if (value instanceof Decimal) return true;
  if (typeof value === "number" && typeof value !== "boolean") return true;
  if (typeof value === "string") {
    try {
      new Decimal(value);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
function likeMatch(value, pattern) {
  const PCT = "\0PCT\0";
  const UND = "\0UND\0";
  const tmp = pattern.replace(/%/g, PCT).replace(/_/g, UND);
  const escaped = tmp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regexStr = escaped.replace(/\x00PCT\x00/g, ".*").replace(/\x00UND\x00/g, ".");
  return new RegExp(`^${regexStr}$`, "i").test(value);
}

// src/index.ts
function tokenize2(expression) {
  if (typeof expression !== "string") throw new DsqlexError("expression must be a string");
  return tokenize(expression);
}
function parse2(expression) {
  if (typeof expression !== "string") throw new DsqlexError("expression must be a string");
  const tokens = tokenize(expression);
  return parse(tokens);
}
function evaluateAST(ast, context, opts = {}) {
  return evaluate(ast, context, opts);
}
function eval_(expression, context, opts = {}) {
  if (typeof expression !== "string") throw new DsqlexError("expression must be a string");
  if (typeof context !== "object" || context === null || Array.isArray(context)) {
    throw new DsqlexError("context must be an object");
  }
  const tokens = tokenize(expression);
  const ast = parse(tokens);
  return evaluate(ast, context, opts);
}
export {
  BinaryOp,
  Bool,
  CaseExpr,
  DsqlexError,
  FunctionCall,
  Identifier,
  InExpr,
  LikeExpr,
  NotInExpr,
  NotLikeExpr,
  Null,
  Num,
  Select,
  Str,
  WhenClause,
  eval_,
  evaluateAST,
  parse2 as parse,
  tokenize2 as tokenize
};
//# sourceMappingURL=index.js.map