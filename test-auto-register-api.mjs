#!/usr/bin/env node
/**
 * Test the pure-API auto-registration for MailDrop and mail.cx.
 * No browser needed — all HTTP + Node crypto.
 */

import { autoRegisterMailDrop, autoRegisterMailCx } from "./dist/providers/auto-register.js";

async function testMailDrop() {
  console.log("\n=== Testing MailDrop auto-registration (pure API) ===\n");
  try {
    const result = await autoRegisterMailDrop({ timeoutMs: 60_000 });
    console.log("✅ MailDrop registration succeeded!");
    console.log("  API Key:", result.apiKey);
    console.log("  Email:", result.email);
    console.log("  Provider:", result.provider);
    console.log("  Registered at:", result.registeredAt);
    if (result.metadata) {
      console.log("  Private key (first 50 chars):", result.metadata.privateKey?.slice(0, 50) + "...");
      console.log("  Username:", result.metadata.username);
    }
    return result;
  } catch (err) {
    console.error("❌ MailDrop registration failed:", err.message);
    throw err;
  }
}

async function testMailCx() {
  console.log("\n=== Testing mail.cx auto-registration (pure API) ===\n");
  try {
    const result = await autoRegisterMailCx({
      tokenName: "test-auto-api",
      timeoutMs: 120_000,
    });
    console.log("✅ mail.cx registration succeeded!");
    console.log("  API Token:", result.apiKey);
    console.log("  Email:", result.email);
    console.log("  Provider:", result.provider);
    console.log("  Registered at:", result.registeredAt);
    return result;
  } catch (err) {
    console.error("❌ mail.cx registration failed:", err.message);
    throw err;
  }
}

// Run tests
const test = process.argv[2] || "all";

if (test === "maildrop" || test === "all") {
  await testMailDrop();
}

if (test === "mailcx" || test === "all") {
  await testMailCx();
}

console.log("\n✅ All tests completed!\n");
