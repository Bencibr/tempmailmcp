import type {
  TempMailbox,
  EmailMessage,
  CreateMailboxParams,
} from "../types.js";
import { BaseProvider } from "../base-provider.js";
import { randomUsername } from "../utils.js";

/**
 * Mail.cx provider — requires API token (free tier: 500 req/day).
 * API docs: https://mail.cx/api-docs/
 * Supports long-poll and SSE push. Mail kept for 1 hour.
 *
 * This adapter uses long-poll for waitForEmail, which is more efficient
 * than the base class polling.
 */
export class MailCxProvider extends BaseProvider {
  readonly name = "mail.cx";
  readonly description =
    "Temporary email via mail.cx. Free tier: 500 req/day. Supports long-poll. Requires API token.";
  readonly requiresApiKey = true;

  private baseUrl = "https://api.mail.cx/v1";
  private apiToken: string | null = null;

  constructor(apiToken?: string) {
    super();
    if (apiToken) this.apiToken = apiToken;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.apiToken) {
      headers["x-api-token"] = this.apiToken;
    }
    return headers;
  }

  private async api<T = any>(
    path: string,
    options: RequestInit = {},
    timeoutMs?: number
  ): Promise<T> {
    const controller = new AbortController();
    const timer = timeoutMs
      ? setTimeout(() => controller.abort(), timeoutMs)
      : undefined;

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: { ...this.getHeaders(), ...(options.headers as Record<string, string>) },
        signal: controller.signal,
      });
      if (!res.ok && res.status !== 204) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Mail.cx API error ${res.status}: ${text || res.statusText}`
        );
      }
      if (res.status === 204) return undefined as T;
      return res.json() as Promise<T>;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async getDomains(): Promise<string[]> {
    const data = await this.api<{ domains?: string[]; mail_domains?: string[] }>(
      "/config"
    );
    // The config endpoint returns available system domains
    return data.domains ?? data.mail_domains ?? [];
  }

  async createMailbox(params: CreateMailboxParams): Promise<TempMailbox> {
    const domains = await this.getDomains();
    const username = (params.username || randomUsername()).toLowerCase();
    const domain =
      params.domain && domains.length > 0 && domains.includes(params.domain)
        ? params.domain
        : domains[0] ?? "mail.cx";

    const address = `${username}@${domain}`;

    // Mail.cx: mailbox is implicit, no creation needed.
    return {
      address,
      provider: this.name,
      token: this.apiToken ?? undefined,
      createdAt: new Date().toISOString(),
    };
  }

  async getMessages(mailbox: TempMailbox): Promise<EmailMessage[]> {
    // Long-poll: block up to 25s for new mail
    const data = await this.api<{
      emails?: Array<{
        id: string;
        from_email?: string;
        subject?: string;
        preview_text?: string;
        created_at?: string;
      }>;
    }>(`/inbox/${mailbox.address}`, {}, 30_000);

    return (data.emails ?? []).map((e) => ({
      id: e.id,
      from: e.from_email ?? "",
      subject: e.subject ?? "",
      bodyText: e.preview_text,
      date: e.created_at ?? new Date().toISOString(),
    }));
  }

  async getMessage(
    _mailbox: TempMailbox,
    messageId: string
  ): Promise<EmailMessage> {
    const m = await this.api<{
      id: string;
      from_email?: string;
      subject?: string;
      text?: string;
      html?: string;
      created_at?: string;
      attachments?: Array<{
        filename: string;
        content_type: string;
        size: number;
      }>;
    }>(`/email/${messageId}`);

    return {
      id: m.id,
      from: m.from_email ?? "",
      subject: m.subject ?? "",
      bodyText: m.text,
      bodyHtml: m.html,
      date: m.created_at ?? new Date().toISOString(),
      attachments: m.attachments?.map((a) => ({
        filename: a.filename,
        contentType: a.content_type,
        size: a.size,
      })),
    };
  }

  /**
   * Override waitForEmail to use mail.cx long-poll (more efficient).
   */
  async waitForEmail(
    mailbox: TempMailbox,
    options?: import("../types.js").WaitForEmailOptions
  ): Promise<EmailMessage> {
    const opts = {
      subjectContains: options?.subjectContains ?? "",
      fromContains: options?.fromContains ?? "",
      timeoutMs: options?.timeoutMs ?? 60_000,
      pollIntervalMs: options?.pollIntervalMs ?? 25_000, // mail.cx long-poll is 25s
    };

    const deadline = Date.now() + opts.timeoutMs;
    let since: string | undefined;

    while (Date.now() < deadline) {
      let path = `/inbox/${mailbox.address}`;
      const params = new URLSearchParams();
      if (since) params.set("since", since);
      if (opts.subjectContains)
        params.set("subject", opts.subjectContains);
      if (opts.fromContains) params.set("from", opts.fromContains);
      const qs = params.toString();
      if (qs) path += `?${qs}`;

      const data = await this.api<{
        emails?: Array<{
          id: string;
          from_email?: string;
          subject?: string;
          text?: string;
          html?: string;
          created_at?: string;
        }>;
        next_since?: string;
      }>(path, {}, 30_000);

      if (data.next_since) since = data.next_since;

      for (const e of data.emails ?? []) {
        const full = await this.getMessage(mailbox, e.id);
        const fromField = `${full.from}`.toLowerCase();
        const subjectMatch = opts.subjectContains
          ? full.subject
              .toLowerCase()
              .includes(opts.subjectContains.toLowerCase())
          : true;
        const fromMatch = opts.fromContains
          ? fromField.includes(opts.fromContains.toLowerCase())
          : true;
        if (subjectMatch && fromMatch) {
          return full;
        }
      }
    }

    throw new Error(
      `Timed out after ${opts.timeoutMs / 1000}s waiting for email` +
        (opts.subjectContains
          ? ` matching subject "${opts.subjectContains}"`
          : "") +
        (opts.fromContains ? ` from "${opts.fromContains}"` : "")
    );
  }

  async deleteMailbox(mailbox: TempMailbox): Promise<void> {
    // Clear all emails at the address
    await this.api(`/inbox/${mailbox.address}`, { method: "DELETE" });
  }
}
