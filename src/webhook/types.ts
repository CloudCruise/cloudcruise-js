import { EventType } from "../runs/types";

export class VerificationError extends Error {
  public readonly statusCode: number;

  constructor(message: string = "Verification failed", statusCode: number = 400) {
    super(message);
    this.statusCode = statusCode;
    this.name = "VerificationError";
  }
}

/* 
TODO: type webhook payloads.
*/
export interface WebhookPayload {
  event: EventType;
  expires_at: number;
  [key: string]: any;
}

export interface WebhookVerificationOptions {
  allowExpired?: boolean;
}