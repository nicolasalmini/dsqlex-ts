import Decimal from 'decimal.js';

type ASTNode = SelectNode | NumberNode | StringNode | BooleanNode | NullNode | IdentifierNode | BinaryOpNode | CaseExprNode | WhenClauseNode | FunctionCallNode | InExprNode | NotInExprNode | LikeExprNode | NotLikeExprNode;
interface SelectNode {
    readonly kind: "select";
    readonly expr: ASTNode;
}
interface NumberNode {
    readonly kind: "number";
    readonly value: string;
}
interface StringNode {
    readonly kind: "string";
    readonly value: string;
}
interface BooleanNode {
    readonly kind: "boolean";
    readonly value: boolean;
}
interface NullNode {
    readonly kind: "null";
}
interface IdentifierNode {
    readonly kind: "identifier";
    readonly name: string;
}
interface BinaryOpNode {
    readonly kind: "binary_op";
    readonly op: BinaryOp;
    readonly left: ASTNode;
    readonly right: ASTNode;
}
interface CaseExprNode {
    readonly kind: "case_expr";
    readonly whenClauses: readonly WhenClauseNode[];
    readonly elseClause: ASTNode | null;
}
interface WhenClauseNode {
    readonly kind: "when_clause";
    readonly condition: ASTNode;
    readonly result: ASTNode;
}
interface FunctionCallNode {
    readonly kind: "function_call";
    readonly name: string;
    readonly args: readonly ASTNode[];
}
interface InExprNode {
    readonly kind: "in_expr";
    readonly expr: ASTNode;
    readonly items: readonly ASTNode[];
}
interface NotInExprNode {
    readonly kind: "not_in_expr";
    readonly expr: ASTNode;
    readonly items: readonly ASTNode[];
}
interface LikeExprNode {
    readonly kind: "like_expr";
    readonly expr: ASTNode;
    readonly pattern: ASTNode;
}
interface NotLikeExprNode {
    readonly kind: "not_like_expr";
    readonly expr: ASTNode;
    readonly pattern: ASTNode;
}
declare const Select: (expr: ASTNode) => SelectNode;
declare const Num: (value: string) => NumberNode;
declare const Str: (value: string) => StringNode;
declare const Bool: (value: boolean) => BooleanNode;
declare const Null: () => NullNode;
declare const Identifier: (name: string) => IdentifierNode;
type BinaryOp = "plus" | "minus" | "multiply" | "divide" | "eq" | "neq" | "lt" | "gt" | "lte" | "gte" | "and" | "or";
declare const BinaryOp: (op: BinaryOp, left: ASTNode, right: ASTNode) => BinaryOpNode;
declare const CaseExpr: (whenClauses: readonly WhenClauseNode[], elseClause: ASTNode | null) => CaseExprNode;
declare const WhenClause: (condition: ASTNode, result: ASTNode) => WhenClauseNode;
declare const FunctionCall: (name: string, args: readonly ASTNode[]) => FunctionCallNode;
declare const InExpr: (expr: ASTNode, items: readonly ASTNode[]) => InExprNode;
declare const NotInExpr: (expr: ASTNode, items: readonly ASTNode[]) => NotInExprNode;
declare const LikeExpr: (expr: ASTNode, pattern: ASTNode) => LikeExprNode;
declare const NotLikeExpr: (expr: ASTNode, pattern: ASTNode) => NotLikeExprNode;

type Value = Decimal | string | boolean | null | Value[];
type Context = Record<string, unknown>;
interface EvalOptions {
    resolver?: (name: string, visited: ReadonlySet<string>) => Value;
    event_resolver?: (type: string, subtype: string, context: Context, opts: EvalOptions) => Value;
    visited?: ReadonlySet<string>;
}

declare class DsqlexError extends Error {
    constructor(message: string);
}

type TokenType = "keyword" | "function" | "operator" | "identifier" | "number" | "string" | "lparen" | "rparen" | "comma";
interface Token {
    readonly type: TokenType;
    readonly value?: string;
}

declare function tokenize(expression: string): Token[];
declare function parse(expression: string): ASTNode;
declare function evaluateAST(ast: ASTNode, context: Context, opts?: EvalOptions): Value;
declare function eval_(expression: string, context: Context, opts?: EvalOptions): Value;

export { type ASTNode, BinaryOp, type BinaryOpNode, Bool, type BooleanNode, CaseExpr, type CaseExprNode, type Context, DsqlexError, type EvalOptions, FunctionCall, type FunctionCallNode, Identifier, type IdentifierNode, InExpr, type InExprNode, LikeExpr, type LikeExprNode, NotInExpr, type NotInExprNode, NotLikeExpr, type NotLikeExprNode, Null, type NullNode, Num, type NumberNode, Select, type SelectNode, Str, type StringNode, type Token, type Value, WhenClause, type WhenClauseNode, eval_, evaluateAST, parse, tokenize };
