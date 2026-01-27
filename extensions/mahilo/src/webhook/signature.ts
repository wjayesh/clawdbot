/**
 * Webhook Signature Verification
 *
 * Verifies HMAC-SHA256 signatures on incoming webhook requests from Mahilo.
 * Addresses HIGH-1 finding: uses raw body bytes for signature verification.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const TIMESTAMP_TOLERANCE_SECONDS = 300; // 5 minutes

/**
 * Verify the Mahilo webhook signature.
 *
 * @param rawBody - The raw request body as a string (NOT JSON.stringify'd)
 * @param signature - The X-Mahilo-Signature header value
 * @param timestamp - The X-Mahilo-Timestamp header value
 * @param secret - The callback_secret from agent registration
 * @returns true if signature is valid, false otherwise
 */
export function verifyMahiloSignature(
  rawBody: string,
  signature: string,
  timestamp: string,
  secret: string,
): boolean {
  // 1. Check timestamp is recent (within 5 minutes)
  const timestampNum = parseInt(timestamp, 10);
  if (isNaN(timestampNum)) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestampNum) > TIMESTAMP_TOLERANCE_SECONDS) {
    return false; // Timestamp too old or in future
  }

  // 2. Compute expected signature
  // Format: timestamp.rawBody
  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedSignature = createHmac("sha256", secret).update(signedPayload).digest("hex");

  // 3. Compare signatures (timing-safe)
  const expectedBuffer = Buffer.from(`sha256=${expectedSignature}`);
  const providedBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

/**
 * Compute a signature for testing purposes.
 */
export function computeSignature(rawBody: string, timestamp: string, secret: string): string {
  const signedPayload = `${timestamp}.${rawBody}`;
  return createHmac("sha256", secret).update(signedPayload).digest("hex");
}
