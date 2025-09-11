import { verifyMessage } from './utils.js';
import type { WebhookPayload, WebhookVerificationOptions } from './types.js';

export class WebhookClient {
  constructor() {
    // No makeRequest needed for webhook verification
  }

  /* 
  1. receivedSignature will be in the request header: "x-hmac-signature"
  2. receivedData will be the request body.
  3. secretKey is the key you set when creating this webhook in the CloudCruise portal.
  */
  verifySignature(
    receivedData: any,
    receivedSignature: string,
    secretKey: string,
    options?: WebhookVerificationOptions
  ): WebhookPayload {
    return verifyMessage(receivedData, receivedSignature, secretKey, options);
  }
}