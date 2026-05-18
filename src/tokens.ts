export type TokenType =
  | "keyword"
  | "function"
  | "operator"
  | "identifier"
  | "number"
  | "string"
  | "lparen"
  | "rparen"
  | "comma";

export interface Token {
  readonly type: TokenType;
  readonly value?: string;
}

export function token(type: "lparen" | "rparen" | "comma"): Token;
export function token(type: Exclude<TokenType, "lparen" | "rparen" | "comma">, value: string): Token;
export function token(type: TokenType, value?: string): Token {
  return value !== undefined ? { type, value } : { type };
}
