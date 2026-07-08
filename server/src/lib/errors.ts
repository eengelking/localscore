export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export class NotImplementedError extends HttpError {
  constructor(message: string) {
    super(501, message);
  }
}
