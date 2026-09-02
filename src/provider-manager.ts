import type { TempMailProvider } from "./types.js";
import { MailTmProvider } from "./providers/mail-tm.js";
import { GuerrillaMailProvider } from "./providers/guerrillamail.js";
import { OneSecMailProvider } from "./providers/one-secmail.js";
import { CatchmailProvider } from "./providers/catchmail.js";
import { MailDropProvider } from "./providers/maildrop.js";
import { MailCxProvider } from "./providers/mail-cx.js";

export { MailTmProvider } from "./providers/mail-tm.js";
export { GuerrillaMailProvider } from "./providers/guerrillamail.js";
export { OneSecMailProvider } from "./providers/one-secmail.js";
export { CatchmailProvider } from "./providers/catchmail.js";
export { MailDropProvider } from "./providers/maildrop.js";
export { MailCxProvider } from "./providers/mail-cx.js";
export {
  autoRegister,
  autoRegisterMailDrop,
  autoRegisterMailCx,
} from "./providers/auto-register.js";
export type { AutoRegisterResult } from "./providers/auto-register.js";
export { BaseProvider } from "./base-provider.js";
export * from "./types.js";
export { extractVerificationCode, stripHtml } from "./utils.js";

/**
 * Provider manager — creates and caches provider instances.
 * Provider instances are singleton per provider name.
 */
export class ProviderManager {
  private providers = new Map<string, TempMailProvider>();

  /**
   * Initialize providers based on available API keys.
   * Providers without API keys are always available.
   * Providers that need keys are only registered if the key is provided.
   */
  init(options?: {
    maildropApiKey?: string;
    mailCxApiToken?: string;
  }): void {
    // Always-available providers (no API key needed)
    this.providers.set("mail.tm", new MailTmProvider());
    this.providers.set("guerrillamail", new GuerrillaMailProvider());
    this.providers.set("1secmail", new OneSecMailProvider());
    this.providers.set("catchmail", new CatchmailProvider());

    // Optional providers (require API key)
    if (options?.maildropApiKey) {
      this.providers.set("maildrop", new MailDropProvider(options.maildropApiKey));
    }
    if (options?.mailCxApiToken) {
      this.providers.set("mail.cx", new MailCxProvider(options.mailCxApiToken));
    }
  }

  /**
   * Dynamically register a provider with an API key (e.g. after auto-registration).
   */
  registerProvider(name: string, provider: TempMailProvider): void {
    this.providers.set(name, provider);
  }

  getProvider(name: string): TempMailProvider | undefined {
    return this.providers.get(name);
  }

  getProviderOrThrow(name: string): TempMailProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(
        `Provider "${name}" not available. ` +
          `Available providers: ${this.listProviders()
            .map((p) => p.name)
            .join(", ")}. ` +
          `If this provider requires an API key, set the corresponding environment variable ` +
          `or use the 'auto_register' tool.`
      );
    }
    return provider;
  }

  listProviders(): TempMailProvider[] {
    return Array.from(this.providers.values());
  }
}
