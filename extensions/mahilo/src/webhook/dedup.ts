/**
 * Message Deduplication
 *
 * Tracks processed message IDs to prevent duplicate agent runs.
 * Addresses HIGH-2 finding: retry-induced duplicates.
 */

// Simple in-memory cache with TTL
// In production, this could be backed by Redis or similar
const processedMessages = new Map<string, number>();

// Message IDs are kept for 1 hour
const MESSAGE_TTL_MS = 60 * 60 * 1000;

// Cleanup interval
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Check if a message has already been processed.
 */
export function hasProcessedMessage(messageId: string): boolean {
  const timestamp = processedMessages.get(messageId);
  if (timestamp === undefined) {
    return false;
  }
  // Check if entry has expired
  if (Date.now() - timestamp > MESSAGE_TTL_MS) {
    processedMessages.delete(messageId);
    return false;
  }
  return true;
}

/**
 * Mark a message as processed.
 */
export function markMessageProcessed(messageId: string): void {
  processedMessages.set(messageId, Date.now());
}

/**
 * Start the cleanup interval.
 */
export function startCleanup(): void {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [id, timestamp] of processedMessages) {
      if (now - timestamp > MESSAGE_TTL_MS) {
        processedMessages.delete(id);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  // Don't block process exit
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }
}

/**
 * Stop the cleanup interval.
 */
export function stopCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

/**
 * Clear all tracked messages (for testing).
 */
export function clearProcessedMessages(): void {
  processedMessages.clear();
}
