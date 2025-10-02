export class VerificationError extends Error {
  public readonly statusCode: number;

  constructor(message: string = "Verification failed", statusCode: number = 400) {
    super(message);
    this.statusCode = statusCode;
    this.name = "VerificationError";
  }
}

export interface WebhookVerificationOptions {
  allowExpired?: boolean;
}
