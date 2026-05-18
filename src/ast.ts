export type ASTNode =
  | SelectNode
  | NumberNode
  | StringNode
  | BooleanNode
  | NullNode
  | IdentifierNode
  | BinaryOpNode
  | CaseExprNode
  | WhenClauseNode
  | FunctionCallNode
  | InExprNode
  | NotInExprNode
  | LikeExprNode
  | NotLikeExprNode;

export interface SelectNode {
  readonly kind: "select";
  readonly expr: ASTNode;
}

export interface NumberNode {
  readonly kind: "number";
  readonly value: string;
}

export interface StringNode {
  readonly kind: "string";
  readonly value: string;
}

export interface BooleanNode {
  readonly kind: "boolean";
  readonly value: boolean;
}

export interface NullNode {
  readonly kind: "null";
}

export interface IdentifierNode {
  readonly kind: "identifier";
  readonly name: string;
}

export type BinaryOp =
  | "plus" | "minus" | "multiply" | "divide"
  | "eq" | "neq" | "lt" | "gt" | "lte" | "gte"
  | "and" | "or";

export interface BinaryOpNode {
  readonly kind: "binary_op";
  readonly op: BinaryOp;
  readonly left: ASTNode;
  readonly right: ASTNode;
}

export interface CaseExprNode {
  readonly kind: "case_expr";
  readonly whenClauses: readonly WhenClauseNode[];
  readonly elseClause: ASTNode | null;
}

export interface WhenClauseNode {
  readonly kind: "when_clause";
  readonly condition: ASTNode;
  readonly result: ASTNode;
}

export interface FunctionCallNode {
  readonly kind: "function_call";
  readonly name: string;
  readonly args: readonly ASTNode[];
}

export interface InExprNode {
  readonly kind: "in_expr";
  readonly expr: ASTNode;
  readonly items: readonly ASTNode[];
}

export interface NotInExprNode {
  readonly kind: "not_in_expr";
  readonly expr: ASTNode;
  readonly items: readonly ASTNode[];
}

export interface LikeExprNode {
  readonly kind: "like_expr";
  readonly expr: ASTNode;
  readonly pattern: ASTNode;
}

export interface NotLikeExprNode {
  readonly kind: "not_like_expr";
  readonly expr: ASTNode;
  readonly pattern: ASTNode;
}

// Constructors
export const Select = (expr: ASTNode): SelectNode => ({ kind: "select", expr });
export const Num = (value: string): NumberNode => ({ kind: "number", value });
export const Str = (value: string): StringNode => ({ kind: "string", value });
export const Bool = (value: boolean): BooleanNode => ({ kind: "boolean", value });
export const Null = (): NullNode => ({ kind: "null" });
export const Identifier = (name: string): IdentifierNode => ({ kind: "identifier", name });
export const BinaryOp = (op: BinaryOp, left: ASTNode, right: ASTNode): BinaryOpNode => ({
  kind: "binary_op", op, left, right,
});
export const CaseExpr = (
  whenClauses: readonly WhenClauseNode[],
  elseClause: ASTNode | null,
): CaseExprNode => ({ kind: "case_expr", whenClauses, elseClause });
export const WhenClause = (condition: ASTNode, result: ASTNode): WhenClauseNode => ({
  kind: "when_clause", condition, result,
});
export const FunctionCall = (name: string, args: readonly ASTNode[]): FunctionCallNode => ({
  kind: "function_call", name, args,
});
export const InExpr = (expr: ASTNode, items: readonly ASTNode[]): InExprNode => ({
  kind: "in_expr", expr, items,
});
export const NotInExpr = (expr: ASTNode, items: readonly ASTNode[]): NotInExprNode => ({
  kind: "not_in_expr", expr, items,
});
export const LikeExpr = (expr: ASTNode, pattern: ASTNode): LikeExprNode => ({
  kind: "like_expr", expr, pattern,
});
export const NotLikeExpr = (expr: ASTNode, pattern: ASTNode): NotLikeExprNode => ({
  kind: "not_like_expr", expr, pattern,
});
