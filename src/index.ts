#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  ProviderManager,
  autoRegister,
  type AutoRegisterResult,
} from "./provider-manager.js";
import { MailDropProvider } from "./providers/maildrop.js";
import { MailCxProvider } from "./providers/mail-cx.js";
import {
  extractVerificationCode,
  stripHtml,
  randomUsername,
} from "./utils.js";
import type { TempMailbox } from "./types.js";

// ─── In-memory mailbox store ──────────────────────────────────────────────
// Keeps track of created mailboxes by address for later lookups.
const mailboxStore = new Map<string, TempMailbox>();

function serializeMailbox(mb: TempMailbox) {
  return {
    address: mb.address,
    provider: mb.provider,
    createdAt: mb.createdAt,
    password: mb.password,
    token: mb.token,
    sessionId: mb.sessionId,
  };
}

// ─── Initialize providers ─────────────────────────────────────────────────
const manager = new ProviderManager();
manager.init({
  maildropApiKey: process.env.MAILDROP_API_KEY,
  mailCxApiToken: process.env.MAILCX_API_TOKEN,
});

// ─── Create MCP Server ────────────────────────────────────────────────────
const server = new McpServer({
  name: "tempmail-mcp",
  version: "0.0.1",
});

// ═════════════════════════════════════════════════════════════════════════
//  Tool: list_providers
// ═════════════════════════════════════════════════════════════════════════
server.tool(
  "list_providers",
  "List all available temporary email providers and their capabilities.",
  {},
  async () => {
    const providers = manager.listProviders();
    const lines = providers.map((p) => {
      return `- **${p.name}**: ${p.description} (API key required: ${p.requiresApiKey ? "Yes" : "No"})`;
    });
    return {
      content: [
        {
          type: "text" as const,
          text:
            `Available temporary email providers:\n\n` +
            lines.join("\n") +
            `\n\nUse the \`create_mailbox\` tool with one of these provider names.`,
        },
      ],
    };
  }
);

// ═════════════════════════════════════════════════════════════════════════
//  Tool: create_mailbox
// ═════════════════════════════════════════════════════════════════════════
server.tool(
  "create_mailbox",
  "Create a new temporary email mailbox. Returns the email address and account details.",
  {
    provider: z
      .string()
      .optional()
      .describe(
        "Provider name (e.g. 'mail.tm', 'guerrillamail', '1secmail', 'catchmail', 'maildrop', 'mail.cx'). Defaults to 'mail.tm'."
      ),
    username: z
      .string()
      .optional()
      .describe("Preferred username (local part of the email). If omitted, a random one is generated."),
    domain: z
      .string()
      .optional()
      .describe("Preferred domain. If omitted, a random one is chosen from the provider's available domains."),
  },
  async ({ provider: providerName, username, domain }) => {
    const provider = manager.getProviderOrThrow(providerName ?? "mail.tm");
    const mailbox = await provider.createMailbox({ username, domain });
    mailboxStore.set(mailbox.address, mailbox);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: true,
              address: mailbox.address,
              provider: mailbox.provider,
              createdAt: mailbox.createdAt,
              message: `Mailbox created. Use 'get_messages' to check for incoming emails, or 'wait_for_email' to block until one arrives.`,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ═════════════════════════════════════════════════════════════════════════
//  Tool: get_messages
// ═════════════════════════════════════════════════════════════════════════
server.tool(
  "get_messages",
  "Get the list of received emails for a temporary mailbox. Returns message summaries (ID, from, subject, date).",
  {
    address: z
      .string()
      .describe("The temporary email address to check for messages."),
  },
  async ({ address }) => {
    const mailbox = mailboxStore.get(address);
    if (!mailbox) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: No mailbox found for address "${address}". Use 'create_mailbox' first, or ensure the address was created by this server.`,
          },
        ],
        isError: true,
      };
    }
    const provider = manager.getProviderOrThrow(mailbox.provider);
    const messages = await provider.getMessages(mailbox);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              address,
              count: messages.length,
              messages: messages.map((m) => ({
                id: m.id,
                from: m.from,
                fromName: m.fromName,
                subject: m.subject,
                date: m.date,
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ═════════════════════════════════════════════════════════════════════════
//  Tool: get_message
// ═════════════════════════════════════════════════════════════════════════
server.tool(
  "get_message",
  "Get the full content of a specific email message (body text, HTML, attachments metadata).",
  {
    address: z
      .string()
      .describe("The temporary email address that received the message."),
    messageId: z
      .string()
      .describe("The message ID (from 'get_messages' result)."),
  },
  async ({ address, messageId }) => {
    const mailbox = mailboxStore.get(address);
    if (!mailbox) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: No mailbox found for address "${address}".`,
          },
        ],
        isError: true,
      };
    }
    const provider = manager.getProviderOrThrow(mailbox.provider);
    const msg = await provider.getMessage(mailbox, messageId);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              id: msg.id,
              from: msg.from,
              fromName: msg.fromName,
              subject: msg.subject,
              date: msg.date,
              bodyText: msg.bodyText,
              bodyHtml: msg.bodyHtml,
              bodyTextStripped: msg.bodyHtml
                ? stripHtml(msg.bodyHtml)
                : undefined,
              attachments: msg.attachments,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ═════════════════════════════════════════════════════════════════════════
//  Tool: wait_for_email
// ═════════════════════════════════════════════════════════════════════════
server.tool(
  "wait_for_email",
  "Block (poll/long-poll) until a matching email arrives in the mailbox. Returns the first matching message. Useful for waiting for verification emails during signups.",
  {
    address: z
      .string()
      .describe("The temporary email address to wait for emails on."),
    subjectContains: z
      .string()
      .optional()
      .describe("Only return emails whose subject contains this substring."),
    fromContains: z
      .string()
      .optional()
      .describe("Only return emails whose sender (from) contains this substring."),
    timeoutMs: z
      .number()
      .optional()
      .describe("Timeout in milliseconds. Default 60000 (60s)."),
    pollIntervalMs: z
      .number()
      .optional()
      .describe("Poll interval in milliseconds. Default 3000 (3s)."),
  },
  async ({ address, subjectContains, fromContains, timeoutMs, pollIntervalMs }) => {
    const mailbox = mailboxStore.get(address);
    if (!mailbox) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: No mailbox found for address "${address}".`,
          },
        ],
        isError: true,
      };
    }
    const provider = manager.getProviderOrThrow(mailbox.provider);

    try {
      const msg = await provider.waitForEmail(mailbox, {
        subjectContains,
        fromContains,
        timeoutMs,
        pollIntervalMs,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                found: true,
                message: {
                  id: msg.id,
                  from: msg.from,
                  fromName: msg.fromName,
                  subject: msg.subject,
                  date: msg.date,
                  bodyText: msg.bodyText,
                  bodyHtml: msg.bodyHtml,
                  bodyTextStripped: msg.bodyHtml
                    ? stripHtml(msg.bodyHtml)
                    : undefined,
                  attachments: msg.attachments,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Timed out or error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ═════════════════════════════════════════════════════════════════════════
//  Tool: get_verification_code
// ═════════════════════════════════════════════════════════════════════════
server.tool(
  "get_verification_code",
  "Wait for a verification/confirmation email and automatically extract the verification code from it. Returns the extracted code. This is a convenience tool that combines 'wait_for_email' + code extraction.",
  {
    address: z
      .string()
      .describe("The temporary email address to check."),
    subjectContains: z
      .string()
      .optional()
      .describe("Filter: only look at emails whose subject contains this (e.g. 'verification', 'confirm', 'code')."),
    fromContains: z
      .string()
      .optional()
      .describe("Filter: only look at emails from senders containing this substring."),
    timeoutMs: z
      .number()
      .optional()
      .describe("Timeout in milliseconds. Default 60000 (60s)."),
  },
  async ({ address, subjectContains, fromContains, timeoutMs }) => {
    const mailbox = mailboxStore.get(address);
    if (!mailbox) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: No mailbox found for address "${address}".`,
          },
        ],
        isError: true,
      };
    }
    const provider = manager.getProviderOrThrow(mailbox.provider);

    try {
      const msg = await provider.waitForEmail(mailbox, {
        subjectContains,
        fromContains,
        timeoutMs,
      });

      const code = extractVerificationCode(msg);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                code: code,
                messageId: msg.id,
                from: msg.from,
                subject: msg.subject,
                date: msg.date,
                bodyPreview: (msg.bodyText ?? stripHtml(msg.bodyHtml ?? ""))
                  .slice(0, 500),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Failed to get verification code: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ═════════════════════════════════════════════════════════════════════════
//  Tool: delete_mailbox
// ═════════════════════════════════════════════════════════════════════════
server.tool(
  "delete_mailbox",
  "Delete a temporary mailbox and all its messages (if supported by the provider).",
  {
    address: z
      .string()
      .describe("The temporary email address to delete."),
  },
  async ({ address }) => {
    const mailbox = mailboxStore.get(address);
    if (!mailbox) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: No mailbox found for address "${address}".`,
          },
        ],
        isError: true,
      };
    }
    const provider = manager.getProviderOrThrow(mailbox.provider);

    if (provider.deleteMailbox) {
      try {
        await provider.deleteMailbox(mailbox);
        mailboxStore.delete(address);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: true, address, deleted: true }),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error deleting mailbox: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }

    // Provider doesn't support deletion — just remove from store
    mailboxStore.delete(address);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            address,
            deleted: false,
            note: "This provider does not support explicit mailbox deletion. Mailbox auto-expires.",
          }),
        },
      ],
    };
  }
);

// ═════════════════════════════════════════════════════════════════════════
//  Tool: list_mailboxes
// ═════════════════════════════════════════════════════════════════════════
server.tool(
  "list_mailboxes",
  "List all temporary mailboxes created in this session.",
  {},
  async () => {
    const mailboxes = Array.from(mailboxStore.values()).map(serializeMailbox);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { count: mailboxes.length, mailboxes },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ═════════════════════════════════════════════════════════════════════════
//  Tool: get_domains
// ═════════════════════════════════════════════════════════════════════════
server.tool(
  "get_domains",
  "Get the list of available email domains for a given provider.",
  {
    provider: z
      .string()
      .optional()
      .describe("Provider name. Defaults to 'mail.tm'."),
  },
  async ({ provider: providerName }) => {
    const provider = manager.getProviderOrThrow(providerName ?? "mail.tm");
    const domains = await provider.getDomains();
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { provider: provider.name, domains },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ═════════════════════════════════════════════════════════════════════════
//  Tool: auto_register
// ═════════════════════════════════════════════════════════════════════════
server.tool(
  "auto_register",
  "Automatically register an account and obtain an API key/token for a provider. " +
    "Uses pure HTTP API calls — no browser automation needed. " +
    "Supported providers: 'maildrop' and 'mail.cx'. " +
    "The resulting API key/token is automatically registered in the current session " +
    "and also returned for the user to save.",
  {
    provider: z
      .enum(["maildrop", "mail.cx"])
      .describe(
        "The provider to auto-register. " +
          "'maildrop': uses RSA key generation + HTTP API to register and obtain an md_ API key. " +
          "'mail.cx': uses magic-link sign-in flow (creates a temp mailbox via mail.tm, receives the magic link, follows it, and creates an API token)."
      ),
    tokenName: z
      .string()
      .optional()
      .describe(
        "Name for the created API token (mail.cx only). Default: 'tempmail-mcp'."
      ),
    username: z
      .string()
      .optional()
      .describe(
        "Username for the account (maildrop only). If omitted, a random one is generated."
      ),
    timeoutMs: z
      .number()
      .optional()
      .describe(
        "Overall timeout in milliseconds. Default: 120000 (2 minutes)."
      ),
  },
  async ({ provider, tokenName, username, timeoutMs }) => {
    try {
      const result: AutoRegisterResult = await autoRegister(provider, {
        tokenName: tokenName ?? "tempmail-mcp",
        username,
        timeoutMs: timeoutMs ?? 120_000,
      });

      // Dynamically register the provider with the obtained key
      if (provider === "maildrop") {
        manager.registerProvider(
          "maildrop",
          new MailDropProvider(result.apiKey)
        );
        process.env.MAILDROP_API_KEY = result.apiKey;
      } else if (provider === "mail.cx") {
        manager.registerProvider(
          "mail.cx",
          new MailCxProvider(result.apiKey)
        );
        process.env.MAILCX_API_TOKEN = result.apiKey;
      }

      // Build a user-friendly summary
      const summary: Record<string, any> = {
        success: true,
        provider: result.provider,
        apiKey: result.apiKey,
        email: result.email,
        registeredAt: result.registeredAt,
      };

      if (result.metadata) {
        summary.metadata = result.metadata;
      }

      if (provider === "maildrop") {
        summary.instructions =
          "API key is now active for this session. To make it permanent, set:\n" +
          `  MAILDROP_API_KEY=${result.apiKey}\n` +
          (result.metadata?.privateKey
            ? `  MAILDROP_PRIVATE_KEY=${result.metadata.privateKey}\n` +
              "  (Save the private key to re-login later if needed.)"
            : "");
      } else {
        summary.instructions =
          "API token is now active for this session. To make it permanent, set:\n" +
          `  MAILCX_API_TOKEN=${result.apiKey}`;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Auto-registration failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ═════════════════════════════════════════════════════════════════════════
//  Start the server
// ═════════════════════════════════════════════════════════════════════════

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("tempmail-mcp server started on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
