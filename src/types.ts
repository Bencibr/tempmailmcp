/**
 * Core type definitions for the temporary email service.
 */

/**
 * A received email message.
 */
export interface EmailMessage {
  /** Unique ID of the message within the provider. */
  id: string;
  /** Sender email address. */
  from: string;
  /** Sender display name (if available). */
  fromName?: string;
  /** Email subject line. */
  subject: string;
  /** Plain text body (if available). */
  bodyText?: string;
  /** HTML body (if available). */
  bodyHtml?: string;
  /** ISO 8601 date string. */
  date: string;
  /** List of attachments (metadata only). */
  attachments?: Attachment[];
}

/**
 * An email attachment.
 */
export interface Attachment {
  filename: string;
  contentType: string;
  size: number;
  downloadUrl?: string;
}

/**
 * A temporary email account / mailbox.
 */
export interface TempMailbox {
  /** The full email address (e.g. user@example.com). */
  address: string;
  /** The provider that created this mailbox. */
  provider: string;
  /** Provider-specific auth token or session ID (if any). */
  token?: string;
  /** Provider-specific session cookie (for Guerrilla Mail etc.). */
  sessionId?: string;
  /** Account password (for Mail.tm). */
  password?: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}

/**
 * Parameters for creating a mailbox.
 */
export interface CreateMailboxParams {
  /** Preferred username (local-part). If omitted, a random one is generated. */
  username?: string;
  /** Preferred domain. If omitted, a random one is chosen. */
  domain?: string;
}

/**
 * Options for waiting for an email.
 */
export interface WaitForEmailOptions {
  /** Subject filter — only return emails whose subject contains this substring. */
  subjectContains?: string;
  /** Sender filter — only return emails whose From contains this substring. */
  fromContains?: string;
  /** Timeout in milliseconds. Default 60_000 (60s). */
  timeoutMs?: number;
  /** Poll interval in milliseconds. Default 3_000 (3s). */
  pollIntervalMs?: number;
}

/**
 * The interface that every temp-mail provider adapter must implement.
 */
export interface TempMailProvider {
  /** Unique provider name (e.g. "mail.tm"). */
  name: string;

  /** Human-readable description. */
  description: string;

  /** Whether this provider requires an API key / token. */
  requiresApiKey: boolean;

  /** Get the list of available domains. */
  getDomains(): Promise<string[]>;

  /** Create (or claim) a temporary mailbox. */
  createMailbox(params: CreateMailboxParams): Promise<TempMailbox>;

  /** Get the list of messages for a mailbox. */
  getMessages(mailbox: TempMailbox): Promise<EmailMessage[]>;

  /** Get a single message by ID (full content). */
  getMessage(mailbox: TempMailbox, messageId: string): Promise<EmailMessage>;

  /** Delete a mailbox (if supported). */
  deleteMailbox?(mailbox: TempMailbox): Promise<void>;

  /** Wait for at least one email matching the options. Returns the first match. */
  waitForEmail(
    mailbox: TempMailbox,
    options?: WaitForEmailOptions
  ): Promise<EmailMessage>;
}
