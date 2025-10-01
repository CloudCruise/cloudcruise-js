import crypto from 'crypto';
import {
  VerificationError,
  WebhookEventType,
  type WebhookPayload,
  type WebhookVerificationOptions
} from './types.js';

function verifyHmac(
  receivedData: string,
  receivedSignature: string,
  secretKey: string
): boolean {
  const hmac = crypto.createHmac("sha256", secretKey);
  hmac.update(receivedData);
  const calculatedSignature = hmac.digest("hex");

  const formattedReceivedSignature = receivedSignature.split("=")[1];

  if (formattedReceivedSignature.length !== calculatedSignature.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(calculatedSignature, "hex"),
    Buffer.from(formattedReceivedSignature, "hex")
  );
}

export function verifyMessage<E extends WebhookEventType = WebhookEventType>(
  receivedData: any,
  receivedSignature: string,
  secretKey: string,
  options?: WebhookVerificationOptions
): WebhookPayload<E> {
  if (!receivedData) {
    throw new VerificationError("Received request without body", 400);
  }

  if (!receivedSignature) {
    throw new VerificationError("Missing HMAC signature", 400);
  }

  if (!secretKey) {
    throw new VerificationError("Missing secret key", 400);
  }

  let dataJson: WebhookPayload<E>;
  let dataString: string;

  if (typeof receivedData === 'string') {
    dataString = receivedData;
    try {
      dataJson = JSON.parse(receivedData);
    } catch (error) {
      throw new VerificationError(`Failed to decode JSON: ${error instanceof Error ? error.message : 'Unknown error'}`, 400);
    }
  } else {
    dataJson = receivedData;
    dataString = JSON.stringify(receivedData);
  }

  const expiresAt = dataJson.expires_at;
  if (!expiresAt) {
    throw new VerificationError("No expiration date sent", 400);
  }

  if (!verifyHmac(dataString, receivedSignature, secretKey)) {
    throw new VerificationError("Invalid HMAC signature", 401);
  }

  if (!options?.allowExpired && Date.now() / 1000 > expiresAt) {
    throw new VerificationError("Webhook message expired", 400);
  }

  return dataJson;
}