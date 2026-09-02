# AI 使用指南：如何使用 TempMail MCP

> 本文档面向已接入 TempMail MCP 服务器的 **AI 代理**（Claude、GPT 等），解释每个可用工具的使用时机，并提供常见任务的决策树，可直接参考执行。

---

## 快速上手：三步模式

几乎所有任务都遵循同一个三步模式：

```
1. create_mailbox  →  获取一个临时邮箱地址
2. [用该地址触发某个会发送邮件的操作]
3. wait_for_email / get_verification_code  →  获取结果
```

其余工具用于优化体验（选择合适的服务商、过滤、清理）。

---

## 工具速查表

| 工具 | 用途 | 关键参数 |
|------|---------|---------------|
| `list_providers` | 查看可用服务商 | — |
| `get_domains` | 获取可用域名 | `provider` |
| `create_mailbox` | 创建临时邮箱 | `provider`, `username`, `domain` |
| `get_messages` | 列出当前邮件 | `address` |
| `get_message` | 读取邮件完整内容 | `address`, `messageId` |
| `wait_for_email` | 阻塞等待邮件到达 | `address`, `subjectContains`, `fromContains`, `timeoutMs` |
| `get_verification_code` | 等待并自动提取验证码 | `address`, `subjectContains`, `fromContains`, `timeoutMs` |
| `list_mailboxes` | 列出所有已创建的邮箱 | — |
| `delete_mailbox` | 清理邮箱 | `address` |
| `auto_register` | 自动获取 API Key | `provider`（`"maildrop"` 或 `"mail.cx"`） |

---

## 服务商选择指南

### 默认选择：`mail.tm`

除非有特殊需求，默认使用 `mail.tm`。免费、无需 API Key、稳定可靠。

### 何时使用其他服务商

| 需求 | 推荐服务商 |
|---|---|
| 无需配置，最快路径 | `mail.tm`（默认） |
| 需要指定用户名 | `guerrillamail`（支持自定义用户名，60 分钟过期） |
| 最简 API | `1secmail`（隐式邮箱，无需创建账号） |
| 自定义域名 | `catchmail`（基于 MX 记录）或 `mail.cx` |
| 长轮询（更快收到邮件） | `mail.cx`（服务端 25 秒长轮询） |
| 高频使用（300 次/天） | `maildrop`（需 API Key — 用 `auto_register` 获取） |
| 高频使用（500 次/天） | `mail.cx`（需 API Token — 用 `auto_register` 获取） |

### 何时调用 `auto_register`

以下情况调用 `auto_register`：
- 用户需要 `maildrop` 或 `mail.cx`，但未配置 API Key。
- `list_providers` 结果中缺少 `"maildrop"` 或 `"mail.cx"`。
- 用户明确要求"注册"或"获取 API Key"。

```json
// 调用 auto_register — maildrop 约 2 秒，mail.cx 约 15-30 秒
{ "provider": "maildrop" }
{ "provider": "mail.cx", "tokenName": "my-project" }
```

`auto_register` 后，该服务商在**当前会话中立即可用** — 无需重启或重新配置。

---

## 常见工作流

### 工作流 1：网站注册 + 邮箱验证

最常见的任务：在需要邮箱验证的网站上注册。

```
步骤 1：create_mailbox
   → 返回：{ address: "abc123@somedomain.com", ... }

步骤 2：[用户或你在网站上使用该邮箱地址注册]

步骤 3：get_verification_code
   → 等待验证邮件
   → 自动提取验证码
   → 返回：{ code: "829451", from: "noreply@example.com", ... }

步骤 4：[在网站上输入验证码完成注册]

步骤 5：delete_mailbox（可选清理）
```

**提示：** 使用 `subjectContains` 过滤正确邮件：
- `"verification"` — 最常见
- `"confirm"` — 备选
- `"code"` — 另一种常见
- `"activate"` — 账号激活邮件
- `"验证"` — 中文邮件

### 工作流 2：等待特定邮件

如果需要特定的邮件（不仅仅是验证码）：

```
步骤 1：create_mailbox
步骤 2：[触发邮件 — 填写表单、请求密码重置等]
步骤 3：wait_for_email
   - 设置 subjectContains 按主题过滤
   - 设置 fromContains 按发件人过滤
   - 设置 timeoutMs 为 60000（60 秒）或更长
步骤 4：get_message（如需完整正文、附件等）
步骤 5：delete_mailbox（清理）
```

### 工作流 3：手动查看邮件

如果只想查看邮箱内容：

```
步骤 1：create_mailbox
步骤 2：get_messages → 查看所有邮件（仅摘要）
步骤 3：get_message → 读取特定邮件的完整内容
```

### 工作流 4：启用所有服务商

如果用户需要最大容量：

```
步骤 1：auto_register (provider: "maildrop")     → 约 2 秒
步骤 2：auto_register (provider: "mail.cx")      → 约 15-30 秒
步骤 3：list_providers → 现在显示全部 6 个服务商
```

---

## 重要细节

### 邮箱状态

- 邮箱在**当前会话内存中跟踪**。MCP 服务器重启后，所有邮箱引用将丢失。
- 在调用 `get_messages`、`wait_for_email` 或 `get_verification_code` 之前，务必先调用 `create_mailbox`。
- 如果收到 "No mailbox found for address" 错误，请先调用 `create_mailbox`。

### 超时

- `wait_for_email` 和 `get_verification_code` 的默认超时为 **60 秒**。
- 如果邮件可能延迟（发送方慢、网络问题），将 `timeoutMs` 增加到 `120000`（2 分钟）。
- 对于 `mail.cx`，服务端使用 25 秒长轮询，邮件到达更快。

### 验证码提取

`get_verification_code` 使用多策略模式匹配提取验证码：

1. **上下文匹配**（最高优先级）：在关键词附近查找验证码：
   - 英文：`code`、`verification`、`verify`、`otp`、`pin`、`passcode`、`confirm`
   - 中文：`验证码`、`驗證碼`、`验证`、`认证`、`認証`、`激活`、`確認`、`确认`
   - 日文：`認証`、`確認`、`コード`
   - 俄文：`код`、`подтверждения`、`верификации`、`проверочный`、`пароль`、`подтвердить`
   - 法文：`code`、`vérification`、`confirmer`、`confirmation`、`activation`
   - 德文：`Code`、`Bestätigung`、`Verifizierung`、`Prüfung`、`Passwort`、`Pin`、`bestätigen`
   - 提取关键词附近的 4-8 位纯数字或大写字母数字代码
2. **独立纯数字验证码**：回退到任何独立的 4-8 位数字（优先匹配 6 位），自动过滤年份等误匹配
3. **字母数字验证码**（最后手段）：回退到大写字母数字组合，自动过滤纯字母单词

如果提取失败（返回 `code: null`），调用 `get_message` 手动阅读邮件正文。

### 错误处理

- 响应中 `isError: true` 表示工具调用失败。阅读 `text` 字段了解详情。
- 常见错误：邮箱未找到、等待邮件超时、服务商不可用。
- 服务商不可用时：使用 `auto_register` 或检查 `list_providers`。

### 服务商配额

| 服务商 | 限制 | 超限行为 |
|---|---|---|
| Mail.tm | 8 QPS | 限流（429） |
| Guerrilla Mail | 无限制 | — |
| 1secmail | 无限制 | — |
| Catchmail | 1 req/s | 限流 |
| MailDrop | 300 次/天 | 429 错误 |
| Mail.cx | 500 次/天 | 429 错误 |

如果达到配额限制，切换到其他服务商或使用 `auto_register` 获取新 Key。

---

## 响应格式

### `create_mailbox` 响应

```json
{
  "success": true,
  "address": "abc123@somedomain.com",
  "provider": "mail.tm",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "message": "Mailbox created. Use 'get_messages' to check for incoming emails..."
}
```

### `get_verification_code` 响应

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

无法提取验证码时：

```json
{
  "success": true,
  "code": null,
  "messageId": "msg_abc123",
  ...
}
```

### `auto_register` 响应

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

## 反模式：不应该做的事

1. **不要在紧密循环中调用 `get_messages`。** 改用 `wait_for_email` 或 `get_verification_code` — 它们内部处理轮询，效率更高。

2. **不要硬编码服务商名称。** 先调用 `list_providers` 查看可用服务商。

3. **不要忘记传递 `address`。** 所有邮件读取工具都要求传递 `create_mailbox` 返回的确切地址。

4. **不要忽略 `isError` 响应。** 如果工具返回 `isError: true`，阅读消息并调整策略。

5. **不要为一个任务创建多个邮箱。** 一次注册流程一个邮箱就够了。

6. **不要反复调用 `auto_register`。** 每次调用都会创建真实账号。每个服务商调用一次，保存 Key，然后复用。

---

## 决策树：该调用哪个工具

```
用户想要什么？
│
├── "我需要一个临时邮箱"
│   └── create_mailbox（默认 provider: "mail.tm"）
│
├── "我在等验证码"
│   └── get_verification_code（address, subjectContains: "verification"）
│
├── "我在等一封特定邮件"
│   └── wait_for_email（address, subjectContains / fromContains）
│
├── "查看邮箱里有什么"
│   └── get_messages（address）
│
├── "读取某封邮件"
│   └── get_message（address, messageId）
│
├── "需要 MailDrop / mail.cx 但没有 API Key"
│   └── auto_register（provider: "maildrop" 或 "mail.cx"）
│
├── "有哪些可用服务商？"
│   └── list_providers
│
├── "可以用哪些域名？"
│   └── get_domains（provider）
│
├── "查看我创建的所有邮箱"
│   └── list_mailboxes
│
└── "删除 / 清理邮箱"
    └── delete_mailbox（address）
```
