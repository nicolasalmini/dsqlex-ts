export class DsqlexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DsqlexError";
  }
}
