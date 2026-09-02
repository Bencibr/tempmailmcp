import type {
  TempMailbox,
  EmailMessage,
  CreateMailboxParams,
  Attachment,
} from "../types.js";
import { BaseProvider } from "../base-provider.js";
import { randomUsername } from "../utils.js";

/**
 * MailDrop provider — requires API key (free tier available, 300 req/day).
 * API docs: https://maildrop.cx/api-docs
 * Auth: Bearer token in Authorization header.
 */
export class MailDropProvider extends BaseProvider {
  readonly name = "maildrop";
  readonly description =
    "Temporary email via MailDrop. Free tier: 300 req/day. Requires API key from maildrop.cx.";
  readonly requiresApiKey = true;

  private baseUrl = "https://maildrop.cx/api/v1";
  private apiKey: string | null = null;

  constructor(apiKey?: string) {
    super();
    if (apiKey) this.apiKey = apiKey;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  private async api<T = any>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: { ...this.getHeaders(), ...(options.headers as Record<string, string>) },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `MailDrop API error ${res.status}: ${text || res.statusText}`
      );
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  async getDomains(): Promise<string[]> {
    // MailDrop's public domains
    return ["maildrop.cc", "206969.xyz", "8191.us"];
  }

  async createMailbox(params: CreateMailboxParams): Promise<TempMailbox> {
    const username = (params.username || randomUsername()).toLowerCase();
    const domains = await this.getDomains();
    const domain =
      params.domain && domains.includes(params.domain)
        ? params.domain
        : domains[0];

    const data = await this.api<{ address: string; prefix: string; suffix: string }>(
      "/mailboxes",
      {
        method: "POST",
        body: JSON.stringify({ prefix: username, suffix: domain }),
      }
    );

    return {
      address: data.address,
      provider: this.name,
      createdAt: new Date().toISOString(),
    };
  }

  async getMessages(mailbox: TempMailbox): Promise<EmailMessage[]> {
    const data = await this.api<{
      messages: Array<{
        id: string;
        from?: string;
        subject?: string;
        date?: string;
        size?: number;
      }>;
    }>(`/mailboxes/${mailbox.address}/messages`);

    return (data.messages ?? []).map((m) => ({
      id: m.id,
      from: m.from ?? "",
      subject: m.subject ?? "",
      date: m.date ?? new Date().toISOString(),
    }));
  }

  async getMessage(
    _mailbox: TempMailbox,
    messageId: string
  ): Promise<EmailMessage> {
    const m = await this.api<{
      id: string;
      from?: string;
      subject?: string;
      date?: string;
      html?: string;
      text?: string;
      attachments?: Array<{
        filename: string;
        content_type: string;
        size: number;
        download_url?: string;
      }>;
    }>(`/messages/${messageId}`);

    return {
      id: m.id,
      from: m.from ?? "",
      subject: m.subject ?? "",
      date: m.date ?? new Date().toISOString(),
      bodyText: m.text,
      bodyHtml: m.html,
      attachments: m.attachments?.map((a: any) => ({
        filename: a.filename,
        contentType: a.content_type,
        size: a.size,
        downloadUrl: a.download_url,
      })),
    };
  }
}
