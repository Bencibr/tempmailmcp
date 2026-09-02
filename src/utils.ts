/**
 * Shared utility functions.
 */

/**
 * Generate a random alphanumeric string of the given length.
 */
export function randomString(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Generate a random username (6-12 chars, always starts with a letter).
 */
export function randomUsername(): string {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const start = letters[Math.floor(Math.random() * letters.length)];
  return start + randomString(5 + Math.floor(Math.random() * 7));
}

/**
 * Sleep for the given milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Default wait-for-email options merged with user-provided overrides.
 */
export function mergeWaitOptions(
  options?: import("./types.js").WaitForEmailOptions
): Required<import("./types.js").WaitForEmailOptions> {
  return {
    subjectContains: options?.subjectContains ?? "",
    fromContains: options?.fromContains ?? "",
    timeoutMs: options?.timeoutMs ?? 60_000,
    pollIntervalMs: options?.pollIntervalMs ?? 3_000,
  };
}

/**
 * Check if a message matches the filter criteria.
 */
export function messageMatches(
  msg: import("./types.js").EmailMessage,
  subjectContains: string,
  fromContains: string
): boolean {
  if (subjectContains) {
    if (!msg.subject.toLowerCase().includes(subjectContains.toLowerCase())) {
      return false;
    }
  }
  if (fromContains) {
    const fromField = `${msg.from} ${msg.fromName ?? ""}`.toLowerCase();
    if (!fromField.includes(fromContains.toLowerCase())) {
      return false;
    }
  }
  return true;
}

/**
 * Extract verification code from an email body.
 * Looks for common patterns: 4-8 digit codes, alphanumeric codes, etc.
 */
export function extractVerificationCode(
  msg: import("./types.js").EmailMessage
): string | null {
  const text = msg.bodyText ?? stripHtml(msg.bodyHtml ?? "");

  if (!text) return null;

  // Common patterns for verification codes:
  // "code is 123456" / "verification code: 123456" / "Your code: ABC123"
  const patterns: RegExp[] = [
    /(?:code|verification|verify|otp|pin|passcode)\s*(?:is|:|-|=)?\s*([A-Z0-9]{4,8})\b/i,
    /\b(\d{4,8})\b/, // Just a 4-8 digit number
    /\b([A-Z0-9]{6})\b/, // 6-char alphanumeric
    /\b([A-Z0-9]{5})\b/, // 5-char alphanumeric
    /\b([A-Z0-9]{4})\b/, // 4-char alphanumeric
  ];

  // Try contextual patterns first (more reliable)
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1] ?? match[0];
    }
  }

  return null;
}

/**
 * Strip HTML tags and return plain text.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
