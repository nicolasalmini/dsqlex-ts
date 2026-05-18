import Decimal from "decimal.js";
import { DsqlexError } from "./error.js";
import {
  ASTNode,
  IdentifierNode, FunctionCallNode,
} from "./ast.js";

Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

export type Value = Decimal | string | boolean | null | Value[];

export type Context = Record<string, unknown>;

export interface EvalOptions {
  resolver?: (name: string, visited: ReadonlySet<string>) => Value;
  event_resolver?: (
    type: string,
    subtype: string,
    context: Context,
    opts: EvalOptions,
  ) => Value;
  visited?: ReadonlySet<string>;
}

export function evaluate(ast: ASTNode, context: Context, opts: EvalOptions = {}): Value {
  if (typeof context !== "object" || context === null || Array.isArray(context)) {
    throw new DsqlexError("context must be an object");
  }
  return evalNode(ast, context, opts);
}

function evalNode(node: ASTNode, ctx: Context, opts: EvalOptions): Value {
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

      // Short-circuit logical
      if (op === "and") {
        const left = evalNode(node.left, ctx, opts);
        if (!isTruthy(left)) return left;
        return evalNode(node.right, ctx, opts);
      }
      if (op === "or") {
        const left = evalNode(node.left, ctx, opts);
        if (isTruthy(left)) return left;
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
      return node.items.some(item => compare(val, evalNode(item, ctx, opts)) === "eq");
    }

    case "not_in_expr": {
      const val = evalNode(node.expr, ctx, opts);
      return !node.items.some(item => compare(val, evalNode(item, ctx, opts)) === "eq");
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

// ---------------------------------------------------------------------------
// Identifier resolution
// ---------------------------------------------------------------------------

function evalIdentifier(node: IdentifierNode, ctx: Context, opts: EvalOptions): Value {
  const name = node.name;

  if (name in ctx) return ctx[name] as Value;

  if (name.includes(".")) return resolveDotPath(name, ctx);

  const resolver = opts.resolver;
  if (resolver !== undefined) {
    const visited = opts.visited ?? new Set<string>();
    if (visited.has(name)) {
      throw new DsqlexError(`Circular reference detected: ${name}`);
    }
    return resolver(name, visited);
  }

  throw new DsqlexError(`Unknown field: ${name}`);
}

function resolveDotPath(path: string, ctx: Context): Value {
  const parts = path.split(".");
  return resolveParts(parts, ctx as unknown, path);
}

function resolveParts(parts: string[], current: unknown, fullPath: string): Value {
  if (parts.length === 0) return current as Value;

  if (current !== null && typeof current === "object" && !Array.isArray(current)) {
    const key = parts[0];
    const obj = current as Record<string, unknown>;
    if (!(key in obj)) {
      throw new DsqlexError(`Unknown field: ${fullPath} (failed at '${key}')`);
    }
    return resolveParts(parts.slice(1), obj[key], fullPath);
  }

  if (Array.isArray(current)) {
    const results = current.map(item => resolveParts(parts, item, fullPath));
    if (results.every(r => isDecimalLike(r))) {
      return results.reduce(
        (acc, r) => (acc as Decimal).plus(toDecimal(r as Value)),
        new Decimal(0),
      ) as Decimal;
    }
    return results as Value[];
  }

  throw new DsqlexError(`Cannot access '${parts[0]}' on non-map value in path '${fullPath}'`);
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

function evalFunction(node: FunctionCallNode, ctx: Context, opts: EvalOptions): Value {
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
    return args.map(arg => String(evalNode(arg, ctx, opts))).join("");
  }

  if (name === "event") {
    return evalEvent(args, ctx, opts);
  }

  throw new DsqlexError(`Unknown function: ${name}`);
}

// ---------------------------------------------------------------------------
// EVENT() function
// ---------------------------------------------------------------------------

function evalEvent(args: readonly ASTNode[], ctx: Context, opts: EvalOptions): Value {
  if (args.length === 2) {
    const [typeNode, subtypeNode] = args;
    if (typeNode.kind !== "identifier" || subtypeNode.kind !== "identifier") {
      throw new DsqlexError("EVENT arguments must be identifiers");
    }
    return resolveEvent(typeNode.name, subtypeNode.name, ctx, opts);
  }

  if (args.length === 3) {
    const [typeNode, subtypeNode, sourceNode] = args;
    if (
      typeNode.kind !== "identifier" ||
      subtypeNode.kind !== "identifier" ||
      sourceNode.kind !== "identifier"
    ) {
      throw new DsqlexError("EVENT arguments must be identifiers");
    }
    const sourceName = sourceNode.name;
    if (!(sourceName in ctx)) {
      throw new DsqlexError(`EVENT context source '${sourceName}' not found in context`);
    }
    const subContext = ctx[sourceName];
    if (Array.isArray(subContext)) {
      const results = subContext.map(item =>
        resolveEvent(typeNode.name, subtypeNode.name, item as Context, opts),
      );
      return results.reduce(
        (acc, r) => (acc as Decimal).plus(toDecimal(r as Value)),
        new Decimal(0),
      ) as Decimal;
    }
    if (subContext !== null && typeof subContext === "object") {
      return resolveEvent(typeNode.name, subtypeNode.name, subContext as Context, opts);
    }
    throw new DsqlexError(
      `EVENT context source '${sourceName}' must be a map or list of maps`,
    );
  }

  throw new DsqlexError(
    "EVENT requires 2 or 3 arguments: EVENT(type, subtype) or EVENT(type, subtype, context_source)",
  );
}

function resolveEvent(type: string, subtype: string, ctx: Context, opts: EvalOptions): Value {
  const eventResolver = opts.event_resolver;
  if (!eventResolver) {
    throw new DsqlexError("EVENT() calls require an :event_resolver option");
  }
  const eventKey = `${type}.${subtype}`;
  const visited = opts.visited ?? new Set<string>();
  if (visited.has(eventKey)) {
    throw new DsqlexError(`Circular reference detected: ${eventKey}`);
  }
  const newVisited = new Set(visited);
  newVisited.add(eventKey);
  const newOpts: EvalOptions = { ...opts, visited: newVisited };
  return eventResolver(type, subtype, ctx, newOpts);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isTruthy(value: Value): boolean {
  return value !== null && value !== false;
}

function toDecimal(value: Value): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value === "boolean") throw new DsqlexError("Cannot convert boolean to Decimal");
  if (typeof value === "number") return new Decimal(value);
  if (typeof value === "string") {
    try { return new Decimal(value); }
    catch { throw new DsqlexError(`Cannot convert ${JSON.stringify(value)} to Decimal`); }
  }
  throw new DsqlexError(`Cannot convert ${typeof value} to Decimal`);
}

function roundDecimal(value: Decimal, precision: number): Decimal {
  return value.toDecimalPlaces(precision, Decimal.ROUND_HALF_UP);
}

type CmpResult = "eq" | "lt" | "gt" | "neq";

function compare(a: Value, b: Value): CmpResult {
  if (a === null && b === null) return "eq";
  if (a === null || b === null) return "neq";

  if (a instanceof Decimal || b instanceof Decimal) {
    try {
      const da = toDecimal(a as Value);
      const db = toDecimal(b as Value);
      if (da.equals(db)) return "eq";
      return da.lt(db) ? "lt" : "gt";
    } catch {
      // fall through to generic
    }
  }

  if (a === b) return "eq";
  try {
    if (a < (b as any)) return "lt";
    return "gt";
  } catch {
    return "neq";
  }
}

function isDecimalLike(value: unknown): boolean {
  if (value instanceof Decimal) return true;
  if (typeof value === "number" && typeof value !== "boolean") return true;
  if (typeof value === "string") {
    try { new Decimal(value); return true; }
    catch { return false; }
  }
  return false;
}

function likeMatch(value: string, pattern: string): boolean {
  const PCT = "\x00PCT\x00";
  const UND = "\x00UND\x00";
  const tmp = pattern.replace(/%/g, PCT).replace(/_/g, UND);
  const escaped = tmp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regexStr = escaped.replace(/\x00PCT\x00/g, ".*").replace(/\x00UND\x00/g, ".");
  return new RegExp(`^${regexStr}$`, "i").test(value);
}
