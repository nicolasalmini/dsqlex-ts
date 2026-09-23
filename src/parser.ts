import { DsqlexError } from "./error.js";
import { Token } from "./tokens.js";
import {
  ASTNode,
  Select, Num, Str, Bool, Null, Identifier,
  BinaryOp, UnaryOp, CaseExpr, WhenClause, FunctionCall,
  InExpr, NotInExpr, LikeExpr, NotLikeExpr,
  WhenClauseNode,
} from "./ast.js";

const ADDITIVE_OPS = new Set(["plus", "minus"]);
const MULTIPLICATIVE_OPS = new Set(["multiply", "divide"]);
const COMPARISON_OPS = new Set(["eq", "neq", "lt", "gt", "lte", "gte"]);

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    const t = this.tokens[this.pos++];
    if (t === undefined) throw new DsqlexError("Unexpected end of input");
    return t;
  }

  private match(type: string, value?: string): boolean {
    const t = this.peek();
    if (!t) return false;
    if (t.type !== type) return false;
    return value === undefined || t.value === value;
  }

  private expectKeyword(kw: string): void {
    if (this.match("keyword", kw)) {
      this.consume();
    } else {
      const got = JSON.stringify(this.peek());
      throw new DsqlexError(`Expected ${kw.toUpperCase()}, got: ${got}`);
    }
  }

  parse(): ASTNode {
    const ast = this.parseSelect();
    if (this.pos < this.tokens.length) {
      const remaining = this.tokens.slice(this.pos);
      throw new DsqlexError(`Unexpected tokens: ${JSON.stringify(remaining)}`);
    }
    return ast;
  }

  private parseSelect(): ASTNode {
    if (this.match("keyword", "select")) this.consume();
    return Select(this.parseExpression());
  }

  private parseExpression(): ASTNode {
    return this.parseLogical();
  }

  private parseLogical(): ASTNode {
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

  private parseAndChain(left: ASTNode): ASTNode {
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

  private parseOrChain(left: ASTNode): ASTNode {
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

  private parseComparison(): ASTNode {
    const left = this.parseArithmetic();
    const t = this.peek();
    if (!t) return left;

    // Standard comparison operators
    if (t.type === "operator" && t.value && COMPARISON_OPS.has(t.value)) {
      this.consume();
      const right = this.parseArithmetic();
      const t2 = this.peek();
      if (t2 && t2.type === "operator" && t2.value && COMPARISON_OPS.has(t2.value)) {
        throw new DsqlexError("Cannot chain comparison operators. Use parentheses.");
      }
      return BinaryOp(t.value as any, left, right);
    }

    // expr IN (...)
    if (t.type === "keyword" && t.value === "in") {
      this.consume();
      const items = this.parseInList();
      return InExpr(left, items);
    }

    // expr NOT IN (...) or expr NOT LIKE pattern
    if (t.type === "keyword" && t.value === "not") {
      const t2 = this.tokens[this.pos + 1];
      if (t2) {
        if (t2.type === "keyword" && t2.value === "in") {
          this.consume(); // NOT
          this.consume(); // IN
          const items = this.parseInList();
          return NotInExpr(left, items);
        }
        if (t2.type === "keyword" && t2.value === "like") {
          this.consume(); // NOT
          this.consume(); // LIKE
          const pattern = this.parsePrimary();
          return NotLikeExpr(left, pattern);
        }
      }
    }

    // expr IS [NOT] NULL/TRUE/FALSE
    if (t.type === "keyword" && t.value === "is") {
      this.consume(); // IS
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
      let literal: ASTNode;
      if (kw.value === "null") literal = Null();
      else if (kw.value === "true") literal = Bool(true);
      else literal = Bool(false);
      return BinaryOp(negate ? "neq" : "eq", left, literal);
    }

    // expr LIKE pattern
    if (t.type === "keyword" && t.value === "like") {
      this.consume();
      const pattern = this.parsePrimary();
      return LikeExpr(left, pattern);
    }

    return left;
  }

  private parseInList(): ASTNode[] {
    if (!this.match("lparen")) throw new DsqlexError("Expected '(' after IN");
    this.consume();
    const items: ASTNode[] = [];
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

  private parseArithmetic(): ASTNode {
    const left = this.parsePrimary();
    const t = this.peek();
    if (!t || t.type !== "operator") return left;

    if (t.value && ADDITIVE_OPS.has(t.value)) {
      this.consume();
      const right = this.parsePrimary();
      return this.parseAdditiveChain(BinaryOp(t.value as any, left, right));
    }

    if (t.value && MULTIPLICATIVE_OPS.has(t.value)) {
      this.consume();
      const right = this.parsePrimary();
      return this.parseMultiplicativeChain(BinaryOp(t.value as any, left, right));
    }

    return left;
  }

  private parseAdditiveChain(left: ASTNode): ASTNode {
    const t = this.peek();
    if (!t || t.type !== "operator") return left;
    if (t.value && ADDITIVE_OPS.has(t.value)) {
      this.consume();
      const right = this.parsePrimary();
      return this.parseAdditiveChain(BinaryOp(t.value as any, left, right));
    }
    if (t.value && MULTIPLICATIVE_OPS.has(t.value)) {
      throw new DsqlexError("Ambiguous expression: mixing +/- and */÷ requires parentheses");
    }
    return left;
  }

  private parseMultiplicativeChain(left: ASTNode): ASTNode {
    const t = this.peek();
    if (!t || t.type !== "operator") return left;
    if (t.value && MULTIPLICATIVE_OPS.has(t.value)) {
      this.consume();
      const right = this.parsePrimary();
      return this.parseMultiplicativeChain(BinaryOp(t.value as any, left, right));
    }
    if (t.value && ADDITIVE_OPS.has(t.value)) {
      throw new DsqlexError("Ambiguous expression: mixing +/- and */÷ requires parentheses");
    }
    return left;
  }

  private parsePrimary(): ASTNode {
    const t = this.peek();
    if (!t) throw new DsqlexError("Unexpected end of input");

    if (t.type === "operator" && t.value === "minus") {
      this.consume();
      return UnaryOp("minus", this.parsePrimary());
    }

    if (t.type === "number") {
      this.consume();
      return Num(t.value!);
    }

    if (t.type === "string") {
      this.consume();
      return Str(t.value!);
    }

    if (t.type === "identifier") {
      this.consume();
      return Identifier(t.value!);
    }

    if (t.type === "keyword" && t.value === "null") { this.consume(); return Null(); }
    if (t.type === "keyword" && t.value === "true") { this.consume(); return Bool(true); }
    if (t.type === "keyword" && t.value === "false") { this.consume(); return Bool(false); }

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
      const fname = t.value!;
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

  private parseWhenClauses(): WhenClauseNode[] {
    const clauses: WhenClauseNode[] = [this.parseWhenClause()];
    while (this.match("keyword", "when")) {
      clauses.push(this.parseWhenClause());
    }
    return clauses;
  }

  private parseWhenClause(): WhenClauseNode {
    if (!this.match("keyword", "when")) throw new DsqlexError("Expected WHEN clause");
    this.consume();
    const condition = this.parseExpression();
    this.expectKeyword("then");
    const result = this.parseExpression();
    return WhenClause(condition, result);
  }

  private parseElseClause(): ASTNode | null {
    if (this.match("keyword", "else")) {
      this.consume();
      return this.parseExpression();
    }
    return null;
  }

  private parseFunctionArgs(): ASTNode[] {
    if (this.match("rparen")) return [];
    const args: ASTNode[] = [this.parseExpression()];
    while (this.match("comma")) {
      this.consume();
      args.push(this.parseExpression());
    }
    return args;
  }
}

export function parse(tokens: Token[]): ASTNode {
  return new Parser(tokens).parse();
}
