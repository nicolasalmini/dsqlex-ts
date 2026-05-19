# dsqlex-ts

A TypeScript implementation of the DSQLEX expression evaluator. Uses [`decimal.js`](https://github.com/MikeMcl/decimal.js) for arbitrary-precision arithmetic. Runs on Node.js.

## Usage

```typescript
import { eval_, parse, evaluateAST } from 'dsqlex-ts';
import Decimal from 'decimal.js';

// One-shot: parse + evaluate
const result = eval_('(price * quantity) + tax', {
  price: new Decimal('100.00'),
  quantity: new Decimal('5'),
  tax: new Decimal('50.00'),
});
// result = Decimal('550.00')

// Parse once, evaluate many
const ast = parse('amount * rate');
for (const record of records) {
  const result = evaluateAST(ast, record);
}
```

## Building

```bash
npm install
npm run build
npm test
```

## Dependencies

- [`decimal.js`](https://github.com/MikeMcl/decimal.js) — Arbitrary-precision decimal arithmetic

## Supported Features

| Feature | Syntax |
|---------|--------|
| Arithmetic | `+`, `-`, `*`, `/` (decimal precision) |
| Comparison | `=`, `!=`, `<`, `>`, `<=`, `>=` |
| Logical | `AND`, `OR` (same-op chaining; mixing requires parens) |
| Conditionals | `CASE WHEN ... THEN ... ELSE ... END` |
| Functions | `ROUND()`, `COALESCE()`/`NVL()`, `UPPER()`, `LOWER()`, `ABS()`, `CONCAT()`, `EVENT()` |
| Membership | `IN (...)`, `NOT IN (...)` |
| Pattern | `LIKE`, `NOT LIKE` (case-insensitive) |
| Null check | `IS NULL`, `IS NOT NULL`, `IS TRUE`, `IS FALSE` |
| Literals | Numbers, strings (`'...'`), `TRUE`, `FALSE`, `NULL` |
| Dot-paths | `config.pricing.margin` (nested context access) |
| Comments | `--`, `#`, `/* ... */` |

## API

```typescript
// Tokenize expression into token array
function tokenize(expression: string): Token[];

// Parse expression into AST
function parse(expression: string): ASTNode;

// Evaluate a pre-parsed AST with context
function evaluateAST(ast: ASTNode, context: Context, opts?: EvalOptions): Value;

// Parse and evaluate in one call
function eval_(expression: string, context: Context, opts?: EvalOptions): Value;
```

### Context

A context is a plain object mapping field names to values:

```typescript
const context: Context = {
  amount: new Decimal('100.50'),
  status: 'active',
  enabled: true,
  discount: null,
  config: {            // nested context for dot-path resolution
    pricing: {
      margin: new Decimal('0.15'),
    },
  },
};
```

### Options

```typescript
const opts: EvalOptions = {
  // Custom field resolver
  resolver: (name: string, visited: Set<string>) => {
    return someExternalLookup(name);
  },
  // Event resolver for cross-event references
  eventResolver: (type: string, subtype: string, ctx: Context, opts: EvalOptions) => {
    return lookupEvent(type, subtype, ctx);
  },
};
```

## Design Decisions

- **`decimal.js`**: Arbitrary-precision arithmetic. No floating-point rounding issues.
- **Immutable AST nodes**: Frozen dataclass-style objects, safe to cache and share.
- **Explicit parentheses**: `a + b * c` is rejected. Use `(a + b) * c`.
- **ESM output**: Built with tsup for modern Node.js.

## Related

- [dsqlex-c](https://github.com/nicolasalmini/dsqlex-c) — C/C++ implementation (mpdecimal)
- [dsqlex-rs](https://github.com/nicolasalmini/dsqlex-rs) — Rust implementation (rust_decimal)
- [dsqlex-go](https://github.com/nicolasalmini/dsqlex-go) — Go implementation (govalues/decimal)
- [dsqlex-py](https://github.com/nicolasalmini/dsqlex-py) — Python implementation
- [dsqlex-bench](https://github.com/nicolasalmini/dsqlex-bench) — Cross-language benchmark suite
