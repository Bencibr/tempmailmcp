import type {
  TempMailbox,
  EmailMessage,
  CreateMailboxParams,
} from "../types.js";
import { BaseProvider } from "../base-provider.js";
import { randomUsername, randomString } from "../utils.js";

/**
 * Mail.tm provider — completely free, no API key required.
 * API docs: https://docs.mail.tm/
 * Rate limit: 8 QPS per IP.
 */

// Type definitions for mail.tm API responses
interface MailTmDomain {
  domain: string;
  isActive: boolean;
}

interface MailTmFrom {
  address: string;
  name?: string;
}

interface MailTmMessageSummary {
  id: string;
  from: MailTmFrom;
  subject: string;
  intro?: string;
  createdAt: string;
  hasAttachments?: boolean;
}

interface MailTmMessageFull {
  id: string;
  from: MailTmFrom;
  subject: string;
  text: string;
  html?: string[];
  createdAt: string;
  attachments?: Array<{
    id: string;
    filename: string;
    contentType: string;
    size: number;
    downloadUrl?: string;
  }>;
}

interface MailTmDomainListResponse {
  "hydra:member": MailTmDomain[];
}

interface MailTmMessageListResponse {
  "hydra:member": MailTmMessageSummary[];
}

interface MailTmTokenResponse {
  token: string;
}

interface MailTmMeResponse {
  id: string;
}

export class MailTmProvider extends BaseProvider {
  readonly name = "mail.tm";
  readonly description =
    "Free temporary email via mail.tm. No API key required. 8 QPS rate limit.";
  readonly requiresApiKey = false;

  private baseUrl = "https://api.mail.tm";
  private token: string | null = null;

  private async api<T = unknown>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) ?? {}),
    };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `mail.tm API error ${res.status}: ${text || res.statusText}`
      );
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  async getDomains(): Promise<string[]> {
    const data = await this.api<MailTmDomainListResponse>("/domains");
    return data["hydra:member"]
      .filter((d) => d.isActive)
      .map((d) => d.domain);
  }

  async createMailbox(params: CreateMailboxParams): Promise<TempMailbox> {
    const domains = await this.getDomains();
    if (domains.length === 0) {
      throw new Error("No active domains available from mail.tm");
    }

    const username = params.username || randomUsername();
    const domain =
      params.domain && domains.includes(params.domain)
        ? params.domain
        : domains[Math.floor(Math.random() * domains.length)];

    const address = `${username}@${domain}`;
    const password = randomString(16);

    // Create account
    await this.api("/accounts", {
      method: "POST",
      body: JSON.stringify({ address, password }),
    });

    // Get token
    const tokenData = await this.api<MailTmTokenResponse>("/token", {
      method: "POST",
      body: JSON.stringify({ address, password }),
    });
    this.token = tokenData.token;

    return {
      address,
      provider: this.name,
      token: this.token ?? undefined,
      password,
      createdAt: new Date().toISOString(),
    };
  }

  async getMessages(mailbox: TempMailbox): Promise<EmailMessage[]> {
    if (mailbox.token) {
      this.token = mailbox.token;
    }
    const data = await this.api<MailTmMessageListResponse>("/messages");

    return data["hydra:member"].map((m) => ({
      id: m.id,
      from: m.from?.address ?? "",
      fromName: m.from?.name,
      subject: m.subject,
      bodyText: m.intro,
      date: m.createdAt,
    }));
  }

  async getMessage(
    mailbox: TempMailbox,
    messageId: string
  ): Promise<EmailMessage> {
    if (mailbox.token) {
      this.token = mailbox.token;
    }
    const m = await this.api<MailTmMessageFull>(`/messages/${messageId}`);

    return {
      id: m.id,
      from: m.from?.address ?? "",
      fromName: m.from?.name,
      subject: m.subject,
      bodyText: m.text,
      bodyHtml: m.html?.join("\n"),
      date: m.createdAt,
      attachments: m.attachments?.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        size: a.size,
        downloadUrl: a.downloadUrl,
      })),
    };
  }

  async deleteMailbox(mailbox: TempMailbox): Promise<void> {
    if (mailbox.token) {
      this.token = mailbox.token;
    }
    const meData = await this.api<MailTmMeResponse>("/me");
    await this.api(`/accounts/${meData.id}`, { method: "DELETE" });
    this.token = null;
  }
}
