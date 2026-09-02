import {
  generateKeyPairSync,
  createSign,
  type KeyObject,
} from "node:crypto";
import { sleep, randomString, stripHtml } from "../utils.js";

/**
 * Auto-registration result — pure API, no browser needed.
 */
export interface AutoRegisterResult {
  /** The API key / token to use with the provider. */
  apiKey: string;
  /** The provider name ("maildrop" or "mail.cx"). */
  provider: string;
  /** The email address used for registration (if applicable). */
  email: string;
  /** ISO timestamp of registration. */
  registeredAt: string;
  /** Provider-specific metadata (e.g. private key for maildrop). */
  metadata?: Record<string, string>;
}

// ─── MailDrop auto-registration ────────────────────────────────────────────

/**
 * MailDrop uses RSA Public-Key authentication.
 *
 * Registration flow (all pure HTTP + Node.js crypto):
 * 1. Generate RSA 2048 keypair (RSASSA-PKCS1-v1_5, SHA-256)
 * 2. POST /api/register.php { username, pubkey, auth_type: "pubkey" }
 * 3. Sign timestamp-username to create a passcode
 * 4. POST /api/login.php { username, pubkey: passcode } → sets session cookie
 * 5. GET /account (with session cookie) or POST /api/create_api_key.php → get API key
 *
 * All crypto is done with Node's built-in `crypto` module — no browser needed.
 */
export async function autoRegisterMailDrop(options?: {
  username?: string;
  timeoutMs?: number;
}): Promise<AutoRegisterResult> {
  const username = options?.username ?? `tmp_${randomString(10)}`;
  const timeoutMs = options?.timeoutMs ?? 60_000;
  const deadline = Date.now() + timeoutMs;
  const base = "https://maildrop.cx";

  // Step 1: Generate RSA 2048 keypair
  // Store as KeyObject for signing, and export to base64 DER for API upload
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: "spki",
      format: "der",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "der",
    },
  });

  // Convert to base64 (matching the browser's exportKey("spki") → base64)
  const publicKeyBase64 = Buffer.from(publicKey).toString("base64");
  const privateKeyBase64 = Buffer.from(privateKey).toString("base64");

  // Re-import private key as KeyObject for signing
  const privKeyObj = await import("node:crypto").then((m) =>
    m.createPrivateKey({
      key: Buffer.from(privateKeyBase64, "base64"),
      format: "der",
      type: "pkcs8",
    })
  );

  // Step 2: Register
  const regRes = await fetch(`${base}/api/register.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: base,
      Referer: `${base}/app`,
    },
    body: JSON.stringify({
      username,
      pubkey: publicKeyBase64,
      auth_type: "pubkey",
    }),
  });

  const regData = await regRes.json().catch(() => ({}));
  if (!regData.success) {
    throw new Error(
      `MailDrop registration failed: ${regData.error || regRes.statusText}`
    );
  }

  // Step 3: Generate passcode (sign timestamp-username with RSA-SHA256)
  const timestamp = Math.floor(Date.now() / 1000);
  const dataToSign = `${timestamp}-${username}`;
  const signer = createSign("RSA-SHA256");
  signer.update(dataToSign);
  signer.end();
  const signature = signer.sign(privKeyObj);
  const signatureBase64 = signature.toString("base64");
  const dataToSignBase64 = Buffer.from(dataToSign).toString("base64");
  const passcode = `${signatureBase64}&&${dataToSignBase64}`;

  // Step 4: Login (get session cookie)
  const loginRes = await fetch(`${base}/api/login.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: base,
      Referer: `${base}/app`,
    },
    body: JSON.stringify({ username, pubkey: passcode }),
  });

  const loginData = await loginRes.json().catch(() => ({}));
  if (!loginData.success) {
    throw new Error(
      `MailDrop login failed: ${loginData.error || loginRes.statusText}`
    );
  }

  // Extract session cookie from Set-Cookie header
  const setCookie = loginRes.headers.get("set-cookie") || "";
  const cookies = setCookie
    .split(",")
    .map((c) => c.trim().split(";")[0])
    .filter(Boolean)
    .join("; ");

  if (Date.now() >= deadline) throw new Error("MailDrop registration timed out");

  // Step 5: Create an API key via /api/account/keys.php
  const commonHeaders = {
    Cookie: cookies,
    "Content-Type": "application/json",
    Origin: base,
    Referer: `${base}/account`,
  };

  // First, check if there are existing keys
  const keysListRes = await fetch(`${base}/api/account/keys.php`, {
    headers: commonHeaders,
  });
  const keysList = await keysListRes.json().catch(() => ({}));

  let apiKey: string | null = null;

  // Check if we already have a key
  if (keysList.keys && keysList.keys.length > 0) {
    apiKey = keysList.keys[0].api_key;
  }

  // If no existing key, create one
  if (!apiKey) {
    const createKeyRes = await fetch(`${base}/api/account/keys.php`, {
      method: "POST",
      headers: commonHeaders,
      body: JSON.stringify({ action: "create" }),
    });

    const createKeyData = await createKeyRes.json().catch(() => ({}));
    if (createKeyData.api_key) {
      apiKey = createKeyData.api_key;
    }
  }

  if (!apiKey) {
    throw new Error(
      "MailDrop registration succeeded but could not obtain API key. " +
        "You can try logging in manually at https://maildrop.cx/app to get your API key."
    );
  }

  return {
    apiKey,
    provider: "maildrop",
    email: `${username}@maildrop.cc`,
    registeredAt: new Date().toISOString(),
    metadata: {
      privateKey: privateKeyBase64,
      username,
      note: "Save the private key to re-login later. Store it securely.",
    },
  };
}

// ─── mail.cx auto-registration ─────────────────────────────────────────────

/**
 * mail.cx uses a magic-link sign-in flow.
 *
 * Registration flow (all pure HTTP, no browser needed):
 * 1. Create a temp mailbox via mail.tm (no key needed)
 * 2. POST https://mail.cx/v1/auth/magic-link/request { email } → sends magic link
 * 3. Poll mail.tm for the magic link email, extract the token
 * 4. POST https://mail.cx/v1/auth/magic-link/verify { token } → returns API token directly
 *
 * The verify endpoint returns the API token (tm_live_...) in the response body —
 * no need to create a separate token or use session cookies.
 */

import { MailTmProvider } from "./mail-tm.js";

export async function autoRegisterMailCx(options?: {
  tokenName?: string;
  timeoutMs?: number;
}): Promise<AutoRegisterResult> {
  const tokenName = options?.tokenName ?? "tempmail-mcp";
  const timeoutMs = options?.timeoutMs ?? 120_000;
  const deadline = Date.now() + timeoutMs;

  // Step 1: Create a temp mailbox via mail.tm
  const mailTm = new MailTmProvider();
  const mailbox = await mailTm.createMailbox({});
  const email = mailbox.address;

  // Step 2: Request magic link from mail.cx
  const magicRes = await fetch("https://mail.cx/v1/auth/magic-link/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  if (!magicRes.ok) {
    const text = await magicRes.text().catch(() => "");
    throw new Error(
      `mail.cx magic link request failed: ${magicRes.status} ${text}`
    );
  }

  const magicData = await magicRes.json().catch(() => ({}));
  // mail.cx should return some kind of request_id or just { success: true }

  // Step 3: Poll mail.tm for the magic link email
  let magicLink = "";
  const startWait = Date.now();

  while (Date.now() - startWait < 90_000 && Date.now() < deadline) {
    const messages = await mailTm.getMessages(mailbox);
    if (messages.length > 0) {
      const full = await mailTm.getMessage(mailbox, messages[0].id);
      const body = full.bodyText || (full.bodyHtml ? stripHtml(full.bodyHtml) : "") || "";
      // Look for mail.cx magic link URL
      const match = body.match(/https:\/\/mail\.cx\/magic[^\s"'<>\\]+/i);
      if (match) {
        magicLink = match[0];
        break;
      }
    }
    await sleep(3_000);
  }

  if (!magicLink) {
    throw new Error("Timed out waiting for mail.cx magic link email");
  }

  // Step 4: Extract the token from the magic link URL
  const tokenMatch = magicLink.match(/token=([a-f0-9]+)/i);
  if (!tokenMatch) {
    throw new Error(`Could not extract token from magic link URL: ${magicLink}`);
  }
  const magicToken = tokenMatch[1];

  // Step 5: Verify the magic link token — this returns the API token directly
  const verifyRes = await fetch("https://mail.cx/v1/auth/magic-link/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: magicToken }),
  });

  if (!verifyRes.ok) {
    const text = await verifyRes.text().catch(() => "");
    throw new Error(
      `mail.cx magic link verification failed: ${verifyRes.status} ${text}`
    );
  }

  const verifyData = await verifyRes.json().catch(() => ({}));
  let apiToken: string | null = null;

  if (verifyData.token) {
    apiToken = verifyData.token;
  } else if (verifyData.data?.token) {
    apiToken = verifyData.data.token;
  } else if (verifyData.api_token) {
    apiToken = verifyData.api_token;
  }

  if (!apiToken) {
    throw new Error(
      "mail.cx magic link verification succeeded but no API token in response. " +
        "Response: " + JSON.stringify(verifyData)
    );
  }

  return {
    apiKey: apiToken,
    provider: "mail.cx",
    email,
    registeredAt: new Date().toISOString(),
    metadata: {
      tempMailbox: mailbox.address,
      note: "The temp mailbox was used only to receive the magic link.",
    },
  };
}

/**
 * Auto-register on a provider and obtain an API key/token.
 * Dispatches to the appropriate registration function based on provider name.
 */
export async function autoRegister(
  provider: "maildrop" | "mail.cx",
  options?: {
    username?: string;
    tokenName?: string;
    timeoutMs?: number;
  }
): Promise<AutoRegisterResult> {
  switch (provider) {
    case "maildrop":
      return autoRegisterMailDrop(options);
    case "mail.cx":
      return autoRegisterMailCx(options);
    default:
      throw new Error(
        `Auto-registration not supported for provider "${provider}". Supported: maildrop, mail.cx`
      );
  }
}
