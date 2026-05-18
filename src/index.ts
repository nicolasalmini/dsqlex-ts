import { tokenize as _tokenize } from "./lexer.js";
import { parse as _parse } from "./parser.js";
import { evaluate as _evaluate, EvalOptions, Value, Context } from "./evaluator.js";
import { DsqlexError } from "./error.js";
import { Token } from "./tokens.js";
import {
  ASTNode,
  SelectNode, NumberNode, StringNode, BooleanNode, NullNode, IdentifierNode,
  BinaryOpNode, CaseExprNode, WhenClauseNode, FunctionCallNode,
  InExprNode, NotInExprNode, LikeExprNode, NotLikeExprNode,
  Select, Num, Str, Bool, Null, Identifier,
  BinaryOp, CaseExpr, WhenClause, FunctionCall,
  InExpr, NotInExpr, LikeExpr, NotLikeExpr,
} from "./ast.js";

export { DsqlexError };
export { Token };
export type {
  ASTNode,
  SelectNode, NumberNode, StringNode, BooleanNode, NullNode, IdentifierNode,
  BinaryOpNode, CaseExprNode, WhenClauseNode, FunctionCallNode,
  InExprNode, NotInExprNode, LikeExprNode, NotLikeExprNode,
  Value, Context, EvalOptions,
};
export {
  Select, Num, Str, Bool, Null, Identifier,
  BinaryOp, CaseExpr, WhenClause, FunctionCall,
  InExpr, NotInExpr, LikeExpr, NotLikeExpr,
};

export function tokenize(expression: string): Token[] {
  if (typeof expression !== "string") throw new DsqlexError("expression must be a string");
  return _tokenize(expression);
}

export function parse(expression: string): ASTNode {
  if (typeof expression !== "string") throw new DsqlexError("expression must be a string");
  const tokens = _tokenize(expression);
  return _parse(tokens);
}

export function evaluateAST(ast: ASTNode, context: Context, opts: EvalOptions = {}): Value {
  return _evaluate(ast, context, opts);
}

export function eval_(expression: string, context: Context, opts: EvalOptions = {}): Value {
  if (typeof expression !== "string") throw new DsqlexError("expression must be a string");
  if (typeof context !== "object" || context === null || Array.isArray(context)) {
    throw new DsqlexError("context must be an object");
  }
  const tokens = _tokenize(expression);
  const ast = _parse(tokens);
  return _evaluate(ast, context, opts);
}
