# TempMail MCP

**[English](./README.md)** | [中文](./README.zh-CN.md)

A [Model Context Protocol](https://modelcontextprotocol.io) server that provides **temporary email** services for AI agents, enabling closed-loop verification of email-based registration flows.

> **For AI agents:** Read the [AI Guide](./GUIDE.md) for tool-by-tool instructions, decision trees, and workflow patterns.  
> **AI 代理指南：** 阅读 [中文指南](./GUIDE.zh-CN.md) 获取工具使用说明、决策树和工作流模式。

## Features

- **Multi-provider aggregation** — 6 temp-mail providers behind one unified interface
- **No API key required** for 4 out of 6 providers (Mail.tm, Guerrilla Mail, 1secmail, Catchmail)
- **Auto-registration** — automatically obtain MailDrop and mail.cx API keys via pure HTTP API calls (no browser needed)
- **Verification code extraction** — automatically extracts OTP/verification codes from incoming emails
- **Wait-for-email** — blocking/long-poll until a matching email arrives
- **Session management** — tracks created mailboxes in-memory for the MCP session
- **Zero heavy dependencies** — no Puppeteer, no Playwright, just Node.js built-in modules

## Supported Providers

| Provider | API Key | Free Tier | Special Features |
|----------|---------|-----------|-------------------|
| **Mail.tm** | No | 8 QPS | Full REST API, account-based |
| **Guerrilla Mail** | No | Unlimited | Session-based, 60-min expiry, custom username |
| **1secmail** | No | Unlimited | Simplest API, implicit mailbox |
| **Catchmail** | No | 1 req/s | Custom domains via MX records |
| **MailDrop** | Yes (auto-obtainable) | 300 req/day | Claim-based mailboxes, RSA pubkey auth |
| **Mail.cx** | Yes (auto-obtainable) | 500 req/day | Long-poll, SSE push, magic-link auth |

> **Tip:** Use the `auto_register` tool to automatically obtain MailDrop and mail.cx API keys — no manual signup needed.

## Installation

### From npm (when published)

```bash
npm install -g tempmail-mcp
```

### From source

```bash
git clone https://github.com/your-username/tempmail-mcp.git
cd tempmail-mcp
npm install
npm run build
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MAILDROP_API_KEY` | No | API key for MailDrop. Auto-obtainable via `auto_register` tool. |
| `MAILCX_API_TOKEN` | No | API token for Mail.cx. Auto-obtainable via `auto_register` tool. |

### Claude Desktop / Cursor / MCP Client Config

Add to your MCP client configuration (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "tempmail": {
      "command": "npx",
      "args": ["-y", "tempmail-mcp"],
      "env": {
        "MAILDROP_API_KEY": "your-maildrop-api-key",
        "MAILCX_API_TOKEN": "your-mailcx-api-token"
      }
    }
  }
}
```

If you only need the free providers (no API keys), simply omit the `env` block.

**Don't have an API key?** Use the `auto_register` tool to automatically obtain a free MailDrop or mail.cx API key — **no browser needed**, pure HTTP API calls. See [Auto-Register](#auto_register) below.

## Available Tools

### `list_providers`

List all available temporary email providers and their capabilities.

### `get_domains`

Get the list of available email domains for a given provider.

- **provider** (optional, default `"mail.tm"`): Provider name.

### `create_mailbox`

Create a new temporary email mailbox.

- **provider** (optional, default `"mail.tm"`): Provider name.
- **username** (optional): Preferred username (local part).
- **domain** (optional): Preferred domain.

### `get_messages`

Get the list of received emails for a mailbox.

- **address**: The temporary email address.

### `get_message`

Get the full content of a specific email.

- **address**: The temporary email address.
- **messageId**: The message ID (from `get_messages`).

### `wait_for_email`

Block until a matching email arrives. Returns the first matching message.

- **address**: The temporary email address.
- **subjectContains** (optional): Filter by subject substring.
- **fromContains** (optional): Filter by sender substring.
- **timeoutMs** (optional, default `60000`): Timeout in ms.
- **pollIntervalMs** (optional, default `3000`): Poll interval in ms.

### `get_verification_code`

Wait for a verification email and automatically extract the verification code.

- **address**: The temporary email address.
- **subjectContains** (optional): Filter (e.g. `"verification"`, `"confirm"`, `"code"`).
- **fromContains** (optional): Filter by sender.
- **timeoutMs** (optional, default `60000`): Timeout in ms.

### `list_mailboxes`

List all temporary mailboxes created in this session.

### `delete_mailbox`

Delete a temporary mailbox and all its messages.

- **address**: The temporary email address.

### `auto_register`

Automatically register an account and obtain an API key/token for a provider. **Pure HTTP API — no browser, no Puppeteer.**

#### `maildrop`

Uses RSA key generation + HTTP API:

1. Generates an RSA 2048 keypair (Node.js `crypto` module)
2. `POST /api/register.php` with the public key
3. Signs `timestamp-username` to create a passcode
4. `POST /api/login.php` to authenticate
5. `POST /api/account/keys.php` to create an API key (`md_...`)

#### `mail.cx`

Uses magic-link sign-in flow:

1. Creates a temp mailbox via mail.tm (no API key needed)
2. `POST /v1/auth/magic-link/request` to send a magic link to the temp email
3. Polls mail.tm for the magic link email
4. `POST /v1/auth/magic-link/verify` with the token — **returns the API token directly** (`tm_live_...`)

**Parameters:**

- **provider** (required): `"maildrop"` or `"mail.cx"`
- **tokenName** (optional, default `"tempmail-mcp"`): Name for the token (mail.cx only).
- **username** (optional): Username for the account (maildrop only).
- **timeoutMs** (optional, default `120000`): Overall timeout in milliseconds.

Returns the API key/token and automatically registers the provider in the current session. To make it permanent, set the corresponding environment variable (`MAILDROP_API_KEY` or `MAILCX_API_TOKEN`).

## Usage Examples

### Auto-Register to Get a Free API Key

**MailDrop** (fast, ~2 seconds):

```
1. auto_register (provider: "maildrop")
   → { apiKey: "md_...", email: "tmp_xxx@maildrop.cc", ... }

2. [Set MAILDROP_API_KEY=md_... in your MCP config]

3. list_providers
   → Now includes "maildrop" in the provider list!
```

**mail.cx** (~15-30 seconds, waits for email):

```
1. auto_register (provider: "mail.cx")
   → { apiKey: "tm_live_...", email: "abc@emalupe.com", ... }

2. [Set MAILCX_API_TOKEN=tm_live_... in your MCP config]

3. list_providers
   → Now includes "mail.cx" in the provider list!
```

Both providers are automatically available in the current session after registration — no restart needed.

### Typical Registration Verification Flow

```
1. create_mailbox (provider: "mail.tm")
   → { address: "abc123@somedomain.com", ... }

2. [Register on target website using the temp email address]

3. get_verification_code (address: "abc123@somedomain.com", subjectContains: "verification")
   → { code: "829451", from: "noreply@example.com", subject: "Your verification code", ... }

4. [Enter the code on the target website to complete registration]

5. delete_mailbox (address: "abc123@somedomain.com")
```

### Manual Email Checking

```
1. create_mailbox (provider: "guerrillamail", username: "mytest")
   → { address: "mytest@guerrillamailblock.com", ... }

2. get_messages (address: "mytest@guerrillamailblock.com")
   → { count: 2, messages: [{ id: "1", from: "...", subject: "..." }, ...] }

3. get_message (address: "mytest@guerrillamailblock.com", messageId: "1")
   → { id: "1", from: "...", subject: "...", bodyText: "...", bodyHtml: "..." }
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run locally
node dist/index.js

# Watch mode
npm run dev

# Test auto-registration
node test-auto-register-api.mjs maildrop   # Test MailDrop only
node test-auto-register-api.mjs mailcx     # Test mail.cx only
node test-auto-register-api.mjs all        # Test both
```

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                  MCP Client (Claude)                   │
│                      │                                │
│             stdio / Streamable HTTP                    │
│                      ▼                                │
│          ┌──────────────────────┐                      │
│          │  TempMail MCP Server  │                      │
│          │                      │                      │
│          │  ┌─── Tools ───────┐ │                      │
│          │  │ create_mailbox   │ │                      │
│          │  │ get_messages     │ │                      │
│          │  │ wait_for_email   │ │                      │
│          │  │ get_verification │ │                      │
│          │  │ auto_register    │ │                      │
│          │  │ ...              │ │                      │
│          │  └──────────────────┘ │                      │
│          └──────────┬───────────┘                      │
│                     │                                  │
│          ┌──────────▼───────────┐                      │
│          │  Provider Manager     │                      │
│          │  (adapter pattern)    │                      │
│          └──────────┬───────────┘                      │
│                     │                                  │
│   ┌────────┬────────┼────────┬──────────┐              │
│   ▼        ▼        ▼        ▼          ▼              │
│ Mail.tm  Guerrilla 1secmail  Catchmail  MailDrop        │
│          Mail                            Mail.cx        │
└──────────────────────────────────────────────────────┘

Auto-Register Flow (pure HTTP, no browser):
  ┌───────────────┐                    ┌───────────────┐
  │  MailDrop     │                    │  mail.cx       │
  │               │                    │                │
  │  RSA keygen   │                    │  mail.tm temp  │
  │  ↓            │                    │  mailbox       │
  │  POST register│                    │  ↓             │
  │  ↓            │                    │  POST magic    │
  │  RSA sign     │                    │  link request  │
  │  ↓            │                    │  ↓             │
  │  POST login   │                    │  Poll for email│
  │  ↓            │                    │  ↓             │
  │  POST create  │                    │  POST verify   │
  │  API key      │                    │  → API token  │
  │  → md_...     │                    │  → tm_live_... │
  └───────────────┘                    └───────────────┘
```

## License

MIT
