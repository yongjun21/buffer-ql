export class KeyAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeyAccessError';
  }
}

export class TraversalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TraversalError';
  }
}

export class TypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TypeError';
  }
}
