export class FFIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FFIError';
  }
}

export class FFITypeError extends FFIError {
  constructor(message: string) {
    super(message);
    this.name = 'FFITypeError';
  }
}
