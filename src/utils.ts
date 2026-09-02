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
 * Supports English, Chinese, Japanese, Russian, French, and German email content.
 */
export function extractVerificationCode(
  msg: import("./types.js").EmailMessage
): string | null {
  const text = msg.bodyText ?? stripHtml(msg.bodyHtml ?? "");

  if (!text) return null;

  // ── Strategy 1: Contextual patterns (keyword + nearby code) ──────────────
  // These are the most reliable because they look for a verification-related
  // keyword near a code-like token. Supports EN, ZH, JP, RU, FR, DE keywords.
  //
  // English:     code, verification, verify, otp, pin, passcode, confirm
  // Chinese:     验证码, 驗證碼, 验证, 认证, 認証, 激活, 確認, 确认
  // Japanese:    認証, 確認, コード
  // Russian:     код, подтверждения, верификации, проверочный, пароль, подтвердить
  // French:      code, vérification, confirmer, confirmation, activation
  // German:      Code, Bestätigung, Verifizierung, Prüfung, Passwort, Pin, bestätigen
  //
  // We split into two sub-strategies to avoid a critical bug:
  //   1a: keyword + pure-digit code (digits only — unambiguous)
  //   1b: keyword + uppercase alphanumeric code (case-sensitive, no /i)
  // Using /i on the capture group [A-Z0-9] would match lowercase words like
  // "code" itself, causing the function to return the keyword instead of the
  // actual code. This affects EN (code), FR (code), and DE (Code) alike.
  const contextualDigitPatterns: RegExp[] = [
    // English: "code is 123456" / "verification code: 123456"
    /(?:code|verification|verify|otp|pin|passcode|confirm)\s*(?:is|:|-|=)?\s*(\d{4,8})\b/i,
    // Chinese: "验证码：123456" / "验证码是 123456" / "您的验证码为 123456"
    /(?:验证码|驗證碼|验证|认证|認証|激活|確認|确认)\s*(?:是|为|：|:|=\s*)?\s*(\d{4,8})/,
    // Japanese: "認証コード：123456" / "確認コード: 123456"
    /(?:認証|確認|コード)\s*(?:は|:|：|=)?\s*(\d{4,8})/,
    // Russian: "код: 123456" / "код подтверждения: 123456" / "ваш код 123456"
    /(?:код|подтверждения|верификации|проверочный|пароль|подтвердить)\s*(?:это|:|：|-|=)?\s*(\d{4,8})\b/i,
    // French: "code : 123456" / "code de vérification: 123456" / "votre code 123456"
    /(?:code|vérification|confirmer|confirmation|activation)\s*(?:de\s+\S+)?\s*(?:est|:|：|-|=)?\s*(\d{4,8})\b/i,
    // German: "Code: 123456" / "Bestätigungscode: 123456" / "Ihr Code 123456"
    /(?:code|bestätigung|verifizierung|prüfung|passwort|pin|bestätigen)\s*(?:scode)?\s*(?:ist|:|：|-|=)?\s*(\d{4,8})\b/i,
  ];

  for (const pattern of contextualDigitPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  // 1b: keyword + uppercase alphanumeric code (e.g. "code: ABC123")
  // Case-sensitive — no /i flag — so lowercase words are never captured.
  const contextualAlnumPatterns: RegExp[] = [
    /(?:code|verification|verify|otp|pin|passcode|confirm)\s*(?:is|:|-|=)?\s*([A-Z0-9]{4,8})\b/i,
    /(?:验证码|驗證碼|验证|认证|認証|激活|確認|确认)\s*(?:是|为|：|:|=\s*)?\s*([A-Z0-9]{4,8})\b/,
    // Russian with alnum code: "код: ABC123"
    /(?:код|подтверждения|верификации|проверочный|пароль)\s*(?:это|:|：|-|=)?\s*([A-Z0-9]{4,8})\b/i,
    // French with alnum code: "code: ABC123"
    /(?:code|vérification|confirmation|activation)\s*(?:de\s+\S+)?\s*(?:est|:|：|-|=)?\s*([A-Z0-9]{4,8})\b/i,
    // German with alnum code: "Code: ABC123"
    /(?:code|bestätigung|verifizierung|prüfung|passwort)\s*(?:scode)?\s*(?:ist|:|：|-|=)?\s*([A-Z0-9]{4,8})\b/i,
  ];

  for (const pattern of contextualAlnumPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      // Reject pure-letter captures that are just the keyword reflected back
      const code = match[1];
      if (/^[A-Za-z]+$/.test(code)) {
        continue;
      }
      return code;
    }
  }

  // ── Strategy 2: Standalone pure-digit codes (high priority for 6 digits) ─
  // Many verification emails use pure 6-digit codes. Try 6 digits first,
  // then 4, then 5, then 7-8. Filter out obvious false positives like years.
  const pureDigitPatterns: RegExp[] = [
    /\b(\d{6})\b/, // 6-digit — most common verification code length
    /\b(\d{4})\b/, // 4-digit — also common (OTP)
    /\b(\d{5})\b/, // 5-digit
    /\b(\d{7})\b/, // 7-digit
    /\b(\d{8})\b/, // 8-digit
  ];

  for (const pattern of pureDigitPatterns) {
    const matches = text.match(pattern);
    if (matches && matches[1]) {
      const code = matches[1];
      // Filter out 4-digit years (19xx, 20xx) that are not verification codes
      if (code.length === 4) {
        const n = parseInt(code, 10);
        if ((n >= 1900 && n <= 2099) || (n >= 1800 && n <= 1899)) {
          continue; // Skip years, try next pattern or occurrence
        }
      }
      return code;
    }
  }

  // ── Strategy 3: Alphanumeric codes (fallback, least reliable) ────────────
  // Only use these if no pure-digit code was found.
  // Use case-sensitive [A-Z0-9] (no /i flag) to avoid matching random words.
  const alphanumericPatterns: RegExp[] = [
    /\b([A-Z0-9]{6})\b/, // 6-char uppercase alphanumeric
    /\b([A-Z0-9]{5})\b/, // 5-char
    /\b([A-Z0-9]{4})\b/, // 4-char
    /\b([A-Z0-9]{7,8})\b/, // 7-8 char
  ];

  for (const pattern of alphanumericPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      // Filter out pure-letter matches that are likely words, not codes
      const code = match[1];
      if (/^[A-Z]+$/.test(code) && code.length <= 6) {
        // Pure letters — could be a word like "CODE", "TEAM", "WELCOME"
        // Only accept if it contains at least one digit
        continue;
      }
      return code;
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
