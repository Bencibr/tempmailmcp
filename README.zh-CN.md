# TempMail MCP

[English](./README.md) | **[中文](./README.zh-CN.md)**

一个 [Model Context Protocol](https://modelcontextprotocol.io) 服务器，为 AI 代理提供**临时邮箱**服务，实现邮件注册验证的闭环。

> **AI 代理指南：** 阅读 [中文指南](./GUIDE.zh-CN.md) 获取工具使用说明、决策树和工作流模式。  
> **For AI agents:** Read the [AI Guide](./GUIDE.md) for tool-by-tool instructions, decision trees, and workflow patterns.

## 特性

- **多服务商聚合** — 6 个临时邮箱服务商统一接口
- **4 个免费服务商无需 API Key**（Mail.tm、Guerrilla Mail、1secmail、Catchmail）
- **自动注册** — 通过纯 HTTP API 调用自动获取 MailDrop 和 mail.cx 的 API Key（无需浏览器）
- **验证码提取** — 自动从收到的邮件中提取 OTP/验证码
- **等待邮件** — 阻塞/长轮询直到收到匹配的邮件
- **会话管理** — 在内存中跟踪当前会话创建的邮箱
- **零重型依赖** — 无 Puppeteer、无 Playwright，仅使用 Node.js 内置模块

## 支持的服务商

| 服务商 | 需要 API Key | 免费额度 | 特性 |
|----------|---------|-----------|-------------------|
| **Mail.tm** | 否 | 8 QPS | 完整 REST API，基于账号 |
| **Guerrilla Mail** | 否 | 无限制 | 基于会话，60 分钟过期，自定义用户名 |
| **1secmail** | 否 | 无限制 | 最简 API，隐式邮箱 |
| **Catchmail** | 否 | 1 req/s | 通过 MX 记录自定义域名 |
| **MailDrop** | 是（可自动获取） | 300 次/天 | 认领式邮箱，RSA 公钥认证 |
| **Mail.cx** | 是（可自动获取） | 500 次/天 | 长轮询，SSE 推送，magic-link 认证 |

> **提示：** 使用 `auto_register` 工具自动获取 MailDrop 和 mail.cx 的 API Key — 无需手动注册。

## 安装

### 从 npm 安装

```bash
npm install -g @bencibro/tempmail-mcp
```

或直接使用 `npx` 运行（无需安装）：

```bash
npx @bencibro/tempmail-mcp
```

### 从源码安装

```bash
git clone https://github.com/Bencibr/tempmailmcp.git
cd tempmailmcp
npm install
npm run build
```

## 配置

### 环境变量

| 变量 | 是否必需 | 说明 |
|----------|----------|-------------|
| `MAILDROP_API_KEY` | 否 | MailDrop 的 API Key。可通过 `auto_register` 工具自动获取。 |
| `MAILCX_API_TOKEN` | 否 | Mail.cx 的 API Token。可通过 `auto_register` 工具自动获取。 |

### Claude Desktop / Cursor / MCP 客户端配置

#### 方式 A：使用 `npx`（推荐，无需安装）

将以下内容添加到你的 MCP 客户端配置中（如 `claude_desktop_config.json`）：

```json
{
  "mcpServers": {
    "tempmail": {
      "command": "npx",
      "args": ["-y", "@bencibro/tempmail-mcp"],
      "env": {
        "MAILDROP_API_KEY": "你的-maildrop-api-key",
        "MAILCX_API_TOKEN": "你的-mailcx-api-token"
      }
    }
  }
}
```

如果只需要免费服务商（无需 API Key），直接省略 `env` 块：

```json
{
  "mcpServers": {
    "tempmail": {
      "command": "npx",
      "args": ["-y", "@bencibro/tempmail-mcp"]
    }
  }
}
```

#### 方式 B：全局安装

```bash
npm install -g @bencibro/tempmail-mcp
```

然后使用 `tempmail-mcp` 作为命令：

```json
{
  "mcpServers": {
    "tempmail": {
      "command": "tempmail-mcp",
      "env": {
        "MAILDROP_API_KEY": "你的-maildrop-api-key",
        "MAILCX_API_TOKEN": "你的-mailcx-api-token"
      }
    }
  }
}
```

**没有 API Key？** 使用 `auto_register` 工具自动获取免费的 MailDrop 或 mail.cx API Key — **无需浏览器**，纯 HTTP API 调用。参见下方的[自动注册](#auto_register)。

## 可用工具

### `list_providers`

列出所有可用的临时邮箱服务商及其能力。

### `get_domains`

获取指定服务商的可用邮箱域名列表。

- **provider**（可选，默认 `"mail.tm"`）：服务商名称。

### `create_mailbox`

创建一个新的临时邮箱。

- **provider**（可选，默认 `"mail.tm"`）：服务商名称。
- **username**（可选）：首选用户名（邮箱本地部分）。
- **domain**（可选）：首选域名。

### `get_messages`

获取邮箱收到的邮件列表。

- **address**：临时邮箱地址。

### `get_message`

获取特定邮件的完整内容。

- **address**：临时邮箱地址。
- **messageId**：邮件 ID（来自 `get_messages`）。

### `wait_for_email`

阻塞直到收到匹配的邮件。返回第一条匹配的邮件。

- **address**：临时邮箱地址。
- **subjectContains**（可选）：按邮件主题子串过滤。
- **fromContains**（可选）：按发件人子串过滤。
- **timeoutMs**（可选，默认 `60000`）：超时时间（毫秒）。
- **pollIntervalMs**（可选，默认 `3000`）：轮询间隔（毫秒）。

### `get_verification_code`

等待验证邮件并自动提取验证码。

- **address**：临时邮箱地址。
- **subjectContains**（可选）：过滤器（如 `"verification"`、`"confirm"`、`"code"`）。
- **fromContains**（可选）：按发件人过滤。
- **timeoutMs**（可选，默认 `60000`）：超时时间（毫秒）。

### `list_mailboxes`

列出当前会话中创建的所有临时邮箱。

### `delete_mailbox`

删除临时邮箱及其所有邮件。

- **address**：临时邮箱地址。

### `auto_register`

自动注册账号并获取服务商的 API Key/Token。**纯 HTTP API — 无浏览器、无 Puppeteer。**

#### `maildrop`

使用 RSA 密钥生成 + HTTP API：

1. 生成 RSA 2048 密钥对（Node.js `crypto` 模块）
2. `POST /api/register.php` 提交公钥注册账号
3. 签名 `timestamp-username` 生成 passcode
4. `POST /api/login.php` 登录认证
5. `POST /api/account/keys.php` 创建 API Key（`md_...`）

#### `mail.cx`

使用 magic-link 登录流程：

1. 通过 mail.tm 创建临时邮箱（无需 API Key）
2. `POST /v1/auth/magic-link/request` 发送 magic link 到临时邮箱
3. 轮询 mail.tm 等待 magic link 邮件
4. `POST /v1/auth/magic-link/verify` 提交 token — **直接返回 API Token**（`tm_live_...`）

**参数：**

- **provider**（必填）：`"maildrop"` 或 `"mail.cx"`
- **tokenName**（可选，默认 `"tempmail-mcp"`）：Token 名称（仅 mail.cx）。
- **username**（可选）：账号用户名（仅 maildrop）。
- **timeoutMs**（可选，默认 `120000`）：总超时时间（毫秒）。

返回 API Key/Token 并在当前会话中自动注册该服务商。要永久生效，请设置对应的环境变量（`MAILDROP_API_KEY` 或 `MAILCX_API_TOKEN`）。

## 使用示例

### 自动注册获取免费 API Key

**MailDrop**（快速，约 2 秒）：

```
1. auto_register (provider: "maildrop")
   → { apiKey: "md_...", email: "tmp_xxx@maildrop.cc", ... }

2. [在 MCP 配置中设置 MAILDROP_API_KEY=md_...]

3. list_providers
   → 服务商列表中现在包含 "maildrop"！
```

**mail.cx**（约 15-30 秒，需要等待邮件）：

```
1. auto_register (provider: "mail.cx")
   → { apiKey: "tm_live_...", email: "abc@emalupe.com", ... }

2. [在 MCP 配置中设置 MAILCX_API_TOKEN=tm_live_...]

3. list_providers
   → 服务商列表中现在包含 "mail.cx"！
```

注册后两个服务商在当前会话中立即可用 — 无需重启。

### 典型注册验证流程

```
1. create_mailbox (provider: "mail.tm")
   → { address: "abc123@somedomain.com", ... }

2. [在目标网站上使用临时邮箱地址注册]

3. get_verification_code (address: "abc123@somedomain.com", subjectContains: "verification")
   → { code: "829451", from: "noreply@example.com", subject: "Your verification code", ... }

4. [在目标网站上输入验证码完成注册]

5. delete_mailbox (address: "abc123@somedomain.com")
```

### 手动查看邮件

```
1. create_mailbox (provider: "guerrillamail", username: "mytest")
   → { address: "mytest@guerrillamailblock.com", ... }

2. get_messages (address: "mytest@guerrillamailblock.com")
   → { count: 2, messages: [{ id: "1", from: "...", subject: "..." }, ...] }

3. get_message (address: "mytest@guerrillamailblock.com", messageId: "1")
   → { id: "1", from: "...", subject: "...", bodyText: "...", bodyHtml: "..." }
```

## 开发

```bash
# 安装依赖
npm install

# 编译
npm run build

# 本地运行
node dist/index.js

# 监听模式
npm run dev

# 测试自动注册
node test-auto-register-api.mjs maildrop   # 仅测试 MailDrop
node test-auto-register-api.mjs mailcx     # 仅测试 mail.cx
node test-auto-register-api.mjs all        # 测试全部
```

## 架构

```
┌──────────────────────────────────────────────────────┐
│                  MCP 客户端 (Claude)                   │
│                      │                                │
│             stdio / Streamable HTTP                    │
│                      ▼                                │
│          ┌──────────────────────┐                      │
│          │  TempMail MCP 服务器  │                      │
│          │                      │                      │
│          │  ┌─── 工具 ────────┐ │                      │
│          │  │ create_mailbox   │ │                      │
│          │  │ get_messages     │ │                      │
│          │  │ wait_for_email   │ │                      │
│          │  │ get_verification  │ │                      │
│          │  │ auto_register    │ │                      │
│          │  │ ...              │ │                      │
│          │  └──────────────────┘ │                      │
│          └──────────┬───────────┘                      │
│                     │                                  │
│          ┌──────────▼───────────┐                      │
│          │  服务商管理器          │                      │
│          │  (适配器模式)          │                      │
│          └──────────┬───────────┘                      │
│                     │                                  │
│   ┌────────┬────────┼────────┬──────────┐              │
│   ▼        ▼        ▼        ▼          ▼              │
│ Mail.tm  Guerrilla 1secmail  Catchmail  MailDrop        │
│          Mail                            Mail.cx        │
└──────────────────────────────────────────────────────┘

自动注册流程（纯 HTTP，无浏览器）：
  ┌───────────────┐                    ┌───────────────┐
  │  MailDrop     │                    │  mail.cx       │
  │               │                    │                │
  │  RSA 密钥生成  │                    │  mail.tm 临时   │
  │  ↓            │                    │  邮箱           │
  │  POST 注册    │                    │  ↓             │
  │  ↓            │                    │  POST magic    │
  │  RSA 签名     │                    │  link 请求     │
  │  ↓            │                    │  ↓             │
  │  POST 登录    │                    │  轮询等待邮件   │
  │  ↓            │                    │  ↓             │
  │  POST 创建    │                    │  POST verify   │
  │  API Key      │                    │  → API Token  │
  │  → md_...     │                    │  → tm_live_... │
  └───────────────┘                    └───────────────┘
```

## 许可证

MIT
