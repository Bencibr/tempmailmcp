import type {
  TempMailbox,
  EmailMessage,
  CreateMailboxParams,
} from "../types.js";
import { BaseProvider } from "../base-provider.js";
import { randomUsername } from "../utils.js";

/**
 * Catchmail provider — free, no auth required for public endpoints.
 * API docs: https://catchmail.io/docs
 * Rate limit: 1 req/s per IP (anonymous).
 * Custom domains supported via MX records.
 */
export class CatchmailProvider extends BaseProvider {
  readonly name = "catchmail";
  readonly description =
    "Free temporary email via catchmail.io. No API key required. Supports custom domains via MX records.";
  readonly requiresApiKey = false;

  private baseUrl = "https://api.catchmail.io";

  async getDomains(): Promise<string[]> {
    // Catchmail uses a single public domain + any custom domain with MX setup
    return ["catchmail.io"];
  }

  async createMailbox(params: CreateMailboxParams): Promise<TempMailbox> {
    const username = params.username || randomUsername();
    const domain = params.domain || "catchmail.io";
    const address = `${username}@${domain}`;

    // Catchmail doesn't require account creation — any address works.
    return {
      address,
      provider: this.name,
      createdAt: new Date().toISOString(),
    };
  }

  async getMessages(mailbox: TempMailbox): Promise<EmailMessage[]> {
    const url = new URL(`${this.baseUrl}/api/v1/mailbox`);
    url.searchParams.set("address", mailbox.address);
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Catchmail API error ${res.status}: ${text || res.statusText}`
      );
    }
    const data = (await res.json()) as {
      messages?: Array<{
        id: string;
        from: string;
        subject: string;
        date: string;
        size: number;
      }>;
    };
    return (data.messages ?? []).map((m) => ({
      id: m.id,
      from: m.from,
      subject: m.subject,
      date: m.date,
    }));
  }

  async getMessage(
    mailbox: TempMailbox,
    messageId: string
  ): Promise<EmailMessage> {
    const url = new URL(`${this.baseUrl}/api/v1/message/${messageId}`);
    url.searchParams.set("mailbox", mailbox.address);
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Catchmail API error ${res.status}: ${text || res.statusText}`
      );
    }
    const m = (await res.json()) as {
      id: string;
      from: string;
      subject: string;
      date: string;
      body: { text?: string; html?: string };
      attachments?: Array<{
        id: string;
        filename: string;
        content_type: string;
        size: number;
        download_url?: string;
      }>;
    };

    return {
      id: m.id,
      from: m.from,
      subject: m.subject,
      date: m.date,
      bodyText: m.body?.text,
      bodyHtml: m.body?.html,
      attachments: m.attachments?.map((a) => ({
        filename: a.filename,
        contentType: a.content_type,
        size: a.size,
        downloadUrl: a.download_url,
      })),
    };
  }

  async deleteMailbox(mailbox: TempMailbox): Promise<void> {
    // Delete all messages in the mailbox
    const messages = await this.getMessages(mailbox);
    for (const msg of messages) {
      const url = new URL(
        `${this.baseUrl}/api/v1/message/${msg.id}`
      );
      url.searchParams.set("mailbox", mailbox.address);
      await fetch(url, { method: "DELETE" });
    }
  }
}
