import { verifyMessage } from './utils.js';
import type { WebhookEventType, WebhookPayload, WebhookVerificationOptions } from './types.js';

export class WebhookClient {
  constructor() {
    // No makeRequest needed for webhook verification
  }

  /**
   * Verifies the signature of an incoming webhook payload.
   *
   * @param receivedData - Raw request body supplied by the webhook sender.
   * @param receivedSignature - Value from the `x-hmac-signature` request header. e.g req.headers["x-hmac-signature"]
   * @param secretKey - Webhook secret configured in the CloudCruise portal.
   * @param options - Optional overrides controlling signature verification behavior.
   * @returns Verified webhook payload when the signature matches.
   */
  verifySignature<E extends WebhookEventType = WebhookEventType>(
    receivedData: any,
    receivedSignature: string,
    secretKey: string,
    options?: WebhookVerificationOptions
  ): WebhookPayload<E> {
    return verifyMessage<E>(receivedData, receivedSignature, secretKey, options);
  }
}