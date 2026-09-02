import type {
  TempMailbox,
  EmailMessage,
  CreateMailboxParams,
} from "../types.js";
import { BaseProvider } from "../base-provider.js";
import { randomUsername } from "../utils.js";

/**
 * Guerrilla Mail provider — free, session-based.
 * API docs: https://www.guerrillamail.com/GuerrillaMailAPI.html
 * Uses PHPSESSID cookie for session management.
 * Emails expire after 60 minutes.
 */
export class GuerrillaMailProvider extends BaseProvider {
  readonly name = "guerrillamail";
  readonly description =
    "Free temporary email via Guerrilla Mail. Session-based, 60 min expiry. No API key required.";
  readonly requiresApiKey = false;

  private baseUrl = "https://api.guerrillamail.com/ajax.php";

  private async api<T = any>(
    params: Record<string, string>,
    method: "GET" | "POST" = "GET",
    sessionId?: string
  ): Promise<T & { sid_token?: string }> {
    const url = new URL(this.baseUrl);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    const headers: Record<string, string> = {};
    if (sessionId) {
      headers["Cookie"] = `PHPSESSID=${sessionId}`;
    }
    const res = await fetch(url, { method, headers });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Guerrilla Mail API error ${res.status}: ${text || res.statusText}`
      );
    }
    return res.json() as Promise<T & { sid_token?: string }>;
  }

  async getDomains(): Promise<string[]> {
    // Guerrilla Mail has fixed domains
    return [
      "guerrillamail.com",
      "guerrillamailblock.com",
      "grr.la",
      "sharklasers.com",
      "guerrillamail.net",
      "guerrillamail.org",
      "guerrillamail.biz",
      "spam4.me",
      "pokemail.net",
    ];
  }

  async createMailbox(params: CreateMailboxParams): Promise<TempMailbox> {
    // Initialize session
    const init = await this.api<{ email_addr: string; email_timestamp: number; sid_token: string }>({
      f: "get_email_address",
      lang: "en",
    });

    const sessionId = init.sid_token;
    let address = init.email_addr;

    // If user wants a custom username, set it
    if (params.username || params.domain) {
      const username = params.username || randomUsername();
      const domains = await this.getDomains();
      const domain =
        params.domain && domains.includes(params.domain)
          ? params.domain
          : "guerrillamailblock.com";

      const setResult = await this.api<{ email_addr: string; email_timestamp: number }>(
        { f: "set_email_user", email_user: username, lang: "en" },
        "POST",
        sessionId
      );
      address = setResult.email_addr;
    }

    return {
      address,
      provider: this.name,
      sessionId,
      createdAt: new Date().toISOString(),
    };
  }

  async getMessages(mailbox: TempMailbox): Promise<EmailMessage[]> {
    if (!mailbox.sessionId) {
      throw new Error("No session ID for Guerrilla Mail mailbox");
    }
    const data = await this.api<{
      list?: Array<{
        mail_id: string;
        mail_from: string;
        mail_subject: string;
        mail_excerpt: string;
        mail_timestamp: number;
        mail_date: string;
        mail_read: string;
      }>;
      count?: number;
    }>({ f: "check_email", seq: "0" }, "GET", mailbox.sessionId);

    return (data.list ?? []).map((m) => ({
      id: m.mail_id,
      from: m.mail_from,
      subject: decodeHtmlEntities(m.mail_subject),
      bodyText: decodeHtmlEntities(m.mail_excerpt),
      date: m.mail_date || new Date(m.mail_timestamp * 1000).toISOString(),
    }));
  }

  async getMessage(
    mailbox: TempMailbox,
    messageId: string
  ): Promise<EmailMessage> {
    if (!mailbox.sessionId) {
      throw new Error("No session ID for Guerrilla Mail mailbox");
    }
    const m = await this.api<{
      mail_id: string;
      mail_from: string;
      mail_subject: string;
      mail_body: string;
      mail_timestamp: number;
      mail_date: string;
    }>({ f: "fetch_email", email_id: messageId }, "GET", mailbox.sessionId);

    return {
      id: m.mail_id,
      from: m.mail_from,
      subject: decodeHtmlEntities(m.mail_subject),
      bodyText: decodeHtmlEntities(m.mail_body),
      bodyHtml: m.mail_body,
      date: m.mail_date || new Date(m.mail_timestamp * 1000).toISOString(),
    };
  }

  async deleteMailbox(mailbox: TempMailbox): Promise<void> {
    if (!mailbox.sessionId) return;
    await this.api(
      { f: "forget_me", email_addr: mailbox.address },
      "POST",
      mailbox.sessionId
    );
  }
}

/**
 * Decode HTML entities (Guerrilla Mail escapes subject/excerpt).
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}
