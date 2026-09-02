import type {
  TempMailbox,
  EmailMessage,
  CreateMailboxParams,
} from "../types.js";
import { BaseProvider } from "../base-provider.js";
import { randomUsername } from "../utils.js";

/**
 * 1secmail provider — free, no auth required.
 * API: https://www.1secmail.com/api/v1/
 * Simple query-based API with no session management.
 *
 * Note: 1secmail has a new paid API at api.1secmail.com (requires key).
 * This adapter uses the legacy free public endpoints.
 */
export class OneSecMailProvider extends BaseProvider {
  readonly name = "1secmail";
  readonly description =
    "Free temporary email via 1secmail.com. No API key, no session. Simple and fast.";
  readonly requiresApiKey = false;

  private baseUrl = "https://www.1secmail.com/api/v1/";

  private async api<T = any>(params: Record<string, string>): Promise<T> {
    const url = new URL(this.baseUrl);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `1secmail API error ${res.status}: ${text || res.statusText}`
      );
    }
    return res.json() as Promise<T>;
  }

  async getDomains(): Promise<string[]> {
    // Hardcoded fallback list (the live API may return 403)
    return [
      "1secmail.com",
      "1secmail.org",
      "1secmail.net",
      "wwjmp.com",
      "esiix.com",
      "xojxe.com",
      "yoggm.com",
    ];
  }

  async createMailbox(params: CreateMailboxParams): Promise<TempMailbox> {
    const domains = await this.getDomains();
    const username = params.username || randomUsername();
    const domain =
      params.domain && domains.includes(params.domain)
        ? params.domain
        : domains[Math.floor(Math.random() * domains.length)];

    const address = `${username}@${domain}`;

    // 1secmail doesn't require account creation — the mailbox is implicit.
    // Any address@domain works and starts receiving mail immediately.
    return {
      address,
      provider: this.name,
      createdAt: new Date().toISOString(),
    };
  }

  async getMessages(mailbox: TempMailbox): Promise<EmailMessage[]> {
    const [login, domain] = mailbox.address.split("@");
    const data = await this.api<
      Array<{
        id: number;
        from: string;
        subject: string;
        date: string;
        attachments?: Array<{ name: string; size: number }>;
      }>
    >({
      action: "getMessages",
      login,
      domain,
    });

    return data.map((m) => ({
      id: String(m.id),
      from: m.from,
      subject: m.subject,
      date: m.date,
      attachments: m.attachments?.map((a) => ({
        filename: a.name,
        contentType: "",
        size: a.size,
      })),
    }));
  }

  async getMessage(
    mailbox: TempMailbox,
    messageId: string
  ): Promise<EmailMessage> {
    const [login, domain] = mailbox.address.split("@");
    const data = await this.api<{
      id: number;
      from: string;
      subject: string;
      date: string;
      body: string;
      textBody: string;
      htmlBody: string;
      attachments?: Array<{
        name: string;
        contentType: string;
        size: number;
        downloadUrl?: string;
      }>;
    }>({
      action: "readMessage",
      login,
      domain,
      id: messageId,
    });

    return {
      id: String(data.id),
      from: data.from,
      subject: data.subject,
      date: data.date,
      bodyText: data.textBody || data.body,
      bodyHtml: data.htmlBody,
      attachments: data.attachments?.map((a) => ({
        filename: a.name,
        contentType: a.contentType,
        size: a.size,
        downloadUrl: a.downloadUrl,
      })),
    };
  }

  // No deleteMailbox — 1secmail doesn't support explicit deletion.
  // Mailboxes auto-expire.
}
