# AI Guide: How to Use TempMail MCP

> This document is written for **AI agents** (Claude, GPT, etc.) that have access to the TempMail MCP server. It explains every available tool, when to use which, and provides copy-paste-ready decision trees for common tasks.

---

## Quick Start: The 3-Step Pattern

Almost every task with this MCP follows the same 3-step pattern:

```
1. create_mailbox  →  get a temporary email address
2. [do something that sends email to that address]
3. wait_for_email / get_verification_code  →  retrieve the result
```

That's it. Everything else is optimization (choosing the right provider, filtering, cleanup).

---

## Tool Reference (Quick)

| Tool | Purpose | Key Parameters |
|------|---------|---------------|
| `list_providers` | See which providers are available | — |
| `get_domains` | Get available email domains | `provider` |
| `create_mailbox` | Create a temp email inbox | `provider`, `username`, `domain` |
| `get_messages` | List current emails | `address` |
| `get_message` | Read full email content | `address`, `messageId` |
| `wait_for_email` | Block until email arrives | `address`, `subjectContains`, `fromContains`, `timeoutMs` |
| `get_verification_code` | Wait + extract OTP/code | `address`, `subjectContains`, `fromContains`, `timeoutMs` |
| `list_mailboxes` | Show all created mailboxes | — |
| `delete_mailbox` | Clean up | `address` |
| `auto_register` | Auto-obtain API key | `provider` (`"maildrop"` or `"mail.cx"`) |

---

## Choosing a Provider

### Default: `mail.tm`

Use `mail.tm` unless you have a specific reason not to. It's free, no API key needed, reliable, and supports account-based mailboxes.

### When to use other providers

| If you need... | Use |
|---|---|
| No setup, fastest path | `mail.tm` (default) |
| A specific username | `guerrillamail` (supports custom usernames, 60-min expiry) |
| The simplest API | `1secmail` (implicit mailbox, no account) |
| Custom domains | `catchmail` (MX-based) or `mail.cx` |
| Long-polling (faster email arrival) | `mail.cx` (25s server-side hold) |
| High volume (300/day) | `maildrop` (requires API key — use `auto_register`) |
| High volume (500/day) | `mail.cx` (requires API token — use `auto_register`) |

### When to call `auto_register`

Call `auto_register` when:
- The user needs `maildrop` or `mail.cx` but no API key is configured.
- You see `"maildrop"` or `"mail.cx"` missing from `list_providers` results.
- The user explicitly asks to "register" or "get an API key".

```json
// Call auto_register — it takes ~2s for maildrop, ~15-30s for mail.cx
{ "provider": "maildrop" }
{ "provider": "mail.cx", "tokenName": "my-project" }
```

After `auto_register`, the provider is **immediately available** in the current session — no need to restart or reconfigure.

---

## Common Workflows

### Workflow 1: Website Registration with Email Verification

This is the most common task: register on a website that requires email verification.

```
Step 1: create_mailbox
   → Returns: { address: "abc123@somedomain.com", ... }

Step 2: [User or you register on the website using this email address]

Step 3: get_verification_code
   → Waits for a verification email
   → Automatically extracts the code
   → Returns: { code: "829451", from: "noreply@example.com", ... }

Step 4: [Enter the code on the website to complete registration]

Step 5: delete_mailbox (optional cleanup)
```

**Tip:** Use `subjectContains` to filter for the right email:
- `"verification"` — most common
- `"confirm"` — alternative
- `"code"` — another common one
- `"activate"` — account activation emails

### Workflow 2: Waiting for a Specific Email

If you need a specific email (not just any verification code):

```
Step 1: create_mailbox
Step 2: [Trigger the email — fill form, request password reset, etc.]
Step 3: wait_for_email
   - Set subjectContains to filter by subject
   - Set fromContains to filter by sender
   - Set timeoutMs to 60000 (60s) or higher if needed
Step 4: get_message (if you need full body, attachments, etc.)
Step 5: delete_mailbox (cleanup)
```

### Workflow 3: Manual Email Checking

If you just want to see what's in the inbox:

```
Step 1: create_mailbox
Step 2: get_messages → See all emails (summary only)
Step 3: get_message → Read a specific email in full
```

### Workflow 4: Setting Up All Providers

If the user wants maximum capacity:

```
Step 1: auto_register (provider: "maildrop")     → ~2 seconds
Step 2: auto_register (provider: "mail.cx")      → ~15-30 seconds
Step 3: list_providers → Now shows all 6 providers
```

---

## Important Details

### Mailbox State

- Mailboxes are tracked **in-memory per session**. If the MCP server restarts, all mailbox references are lost.
- Always use `create_mailbox` before `get_messages`, `wait_for_email`, or `get_verification_code`.
- If you get "No mailbox found for address", call `create_mailbox` first.

### Timeouts

- Default timeout for `wait_for_email` and `get_verification_code` is **60 seconds**.
- If the email might take longer (slow sender, network issues), increase `timeoutMs` to `120000` (2 min).
- For `mail.cx`, the server uses 25-second long-polling, so emails arrive faster.

### Verification Code Extraction

`get_verification_code` uses multi-strategy pattern matching to extract codes:

1. **Contextual matching** (highest priority): Looks for keywords near a code-like token:
   - English: `code`, `verification`, `verify`, `otp`, `pin`, `passcode`, `confirm`
   - Chinese: `验证码`, `驗證碼`, `验证`, `认证`, `認証`, `激活`, `確認`, `确认`
   - Japanese: `認証`, `確認`, `コード`
   - Russian: `код`, `подтверждения`, `верификации`, `проверочный`, `пароль`, `подтвердить`
   - French: `code`, `vérification`, `confirmer`, `confirmation`, `activation`
   - German: `Code`, `Bestätigung`, `Verifizierung`, `Prüfung`, `Passwort`, `Pin`, `bestätigen`
   - Extracts 4-8 digit numbers or uppercase alphanumeric codes near those keywords
2. **Standalone pure-digit codes**: Falls back to any standalone 4-8 digit number (6-digit codes prioritized), filtering out obvious false positives like years
3. **Alphanumeric codes** (last resort): Falls back to uppercase alphanumeric tokens, filtering out pure-letter words

If extraction fails (returns `code: null`), call `get_message` and read the email body manually.

### Error Handling

- `isError: true` in the response means the tool call failed. Read the `text` field for details.
- Common errors: mailbox not found, timeout waiting for email, provider not available.
- For provider not available: use `auto_register` or check `list_providers`.

### Provider Quotas

| Provider | Limit | Behavior when exceeded |
|---|---|---|
| Mail.tm | 8 QPS | Rate limited (429) |
| Guerrilla Mail | Unlimited | — |
| 1secmail | Unlimited | — |
| Catchmail | 1 req/s | Rate limited |
| MailDrop | 300/day | 429 error |
| Mail.cx | 500/day | 429 error |

If you hit a quota, switch to another provider or use `auto_register` to get a new key.

---

## Response Formats

### `create_mailbox` response

```json
{
  "success": true,
  "address": "abc123@somedomain.com",
  "provider": "mail.tm",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "message": "Mailbox created. Use 'get_messages' to check for incoming emails..."
}
```

### `get_verification_code` response

```json
{
  "success": true,
  "code": "829451",
  "messageId": "msg_abc123",
  "from": "noreply@example.com",
  "subject": "Your verification code",
  "date": "2026-01-01T00:00:00.000Z",
  "bodyPreview": "Your verification code is 829451..."
}
```

If no code could be extracted:

```json
{
  "success": true,
  "code": null,
  "messageId": "msg_abc123",
  ...
}
```

### `auto_register` response

```json
{
  "success": true,
  "provider": "maildrop",
  "apiKey": "md_abc123...",
  "email": "tmp_xxx@maildrop.cc",
  "registeredAt": "2026-01-01T00:00:00.000Z",
  "instructions": "API key is now active for this session. To make it permanent, set:\n  MAILDROP_API_KEY=md_abc123..."
}
```

---

## Anti-Patterns: What NOT to Do

1. **Don't call `get_messages` in a tight loop.** Use `wait_for_email` or `get_verification_code` instead — they handle polling internally and are more efficient.

2. **Don't hardcode provider names unless necessary.** Call `list_providers` first to see what's available.

3. **Don't forget to pass the `address`.** All email-reading tools require the exact address returned by `create_mailbox`.

4. **Don't ignore `isError` responses.** If a tool returns `isError: true`, read the message and adjust your approach.

5. **Don't create multiple mailboxes for one task.** One mailbox per registration flow is enough.

6. **Don't call `auto_register` repeatedly.** It creates real accounts. Call it once per provider, save the key, and reuse it.

---

## Decision Tree: Which Tool to Call

```
What does the user want?
│
├── "I need a temp email"
│   └── create_mailbox (provider: "mail.tm" by default)
│
├── "I'm waiting for a verification code"
│   └── get_verification_code (address, subjectContains: "verification")
│
├── "I'm waiting for a specific email"
│   └── wait_for_email (address, subjectContains / fromContains)
│
├── "Show me what's in the inbox"
│   └── get_messages (address)
│
├── "Read a specific email"
│   └── get_message (address, messageId)
│
├── "I need MailDrop / mail.cx but have no API key"
│   └── auto_register (provider: "maildrop" or "mail.cx")
│
├── "What providers are available?"
│   └── list_providers
│
├── "What domains can I use?"
│   └── get_domains (provider)
│
├── "Show me all my temp mailboxes"
│   └── list_mailboxes
│
└── "Delete / clean up a mailbox"
    └── delete_mailbox (address)
```
