import type {
  TempMailProvider,
  TempMailbox,
  EmailMessage,
  CreateMailboxParams,
  WaitForEmailOptions,
} from "./types.js";
import { sleep, mergeWaitOptions, messageMatches } from "./utils.js";

/**
 * Abstract base class that implements the common waitForEmail polling logic.
 * Provider adapters extend this and only need to implement the core methods.
 */
export abstract class BaseProvider implements TempMailProvider {
  abstract name: string;
  abstract description: string;
  abstract requiresApiKey: boolean;

  abstract getDomains(): Promise<string[]>;
  abstract createMailbox(params: CreateMailboxParams): Promise<TempMailbox>;
  abstract getMessages(mailbox: TempMailbox): Promise<EmailMessage[]>;
  abstract getMessage(
    mailbox: TempMailbox,
    messageId: string
  ): Promise<EmailMessage>;

  async deleteMailbox(mailbox: TempMailbox): Promise<void> {
    // Default: no-op. Override in subclass if the provider supports deletion.
    void mailbox;
  }

  /**
   * Default implementation: poll getMessages until a matching email arrives
   * or the timeout expires.
   */
  async waitForEmail(
    mailbox: TempMailbox,
    options?: WaitForEmailOptions
  ): Promise<EmailMessage> {
    const opts = mergeWaitOptions(options);
    const deadline = Date.now() + opts.timeoutMs;

    while (Date.now() < deadline) {
      const messages = await this.getMessages(mailbox);

      for (const msg of messages) {
        if (messageMatches(msg, opts.subjectContains, opts.fromContains)) {
          // Fetch the full message body
          const full = await this.getMessage(mailbox, msg.id);
          if (
            messageMatches(full, opts.subjectContains, opts.fromContains)
          ) {
            return full;
          }
        }
      }

      await sleep(opts.pollIntervalMs);
    }

    throw new Error(
      `Timed out after ${opts.timeoutMs / 1000}s waiting for email` +
        (opts.subjectContains ? ` matching subject "${opts.subjectContains}"` : "") +
        (opts.fromContains ? ` from "${opts.fromContains}"` : "")
    );
  }
}
