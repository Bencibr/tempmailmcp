// Full end-to-end MCP protocol test: create mailbox, get messages, get message
// Tests the actual MCP server via stdio protocol

import { spawn } from "child_process";

function sendMcpRequest(child, id, method, params) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  child.stdin.write(msg + "\n");
}

function waitForResponse(child, id, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for response id=${id}`));
    }, timeoutMs);

    const handler = (data) => {
      const lines = data.toString().split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id === id) {
            clearTimeout(timer);
            child.stdout.off("data", handler);
            resolve(msg);
          }
        } catch (e) {
          // Not JSON, skip
        }
      }
    };
    child.stdout.on("data", handler);
  });
}

async function main() {
  console.log("Starting MCP server...");
  const child = spawn("node", ["dist/index.js"], {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "inherit"],
  });

  // 1. Initialize
  console.log("\n[1] Initialize...");
  const initPromise = waitForResponse(child, 1, 10000);
  sendMcpRequest(child, 1, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test-client", version: "1.0.0" },
  });
  const initResult = await initPromise;
  console.log("  Server info:", JSON.stringify(initResult.result.serverInfo));

  // 2. List providers
  console.log("\n[2] List providers...");
  const listPromise = waitForResponse(child, 2, 10000);
  sendMcpRequest(child, 2, "tools/call", {
    name: "list_providers",
    arguments: {},
  });
  const listResult = await listPromise;
  console.log("  Providers:", listResult.result.content[0].text);

  // 3. Get domains for guerrillamail
  console.log("\n[3] Get domains (guerrillamail)...");
  const domainsPromise = waitForResponse(child, 3, 10000);
  sendMcpRequest(child, 3, "tools/call", {
    name: "get_domains",
    arguments: { provider: "guerrillamail" },
  });
  const domainsResult = await domainsPromise;
  console.log("  Domains:", domainsResult.result.content[0].text);

  // 4. Create mailbox with guerrillamail
  console.log("\n[4] Create mailbox (guerrillamail)...");
  const createPromise = waitForResponse(child, 4, 15000);
  sendMcpRequest(child, 4, "tools/call", {
    name: "create_mailbox",
    arguments: { provider: "guerrillamail", username: "mcpTest" },
  });
  const createResult = await createPromise;
  console.log("  Mailbox:", createResult.result.content[0].text);
  const mailboxData = JSON.parse(createResult.result.content[0].text);
  const address = mailboxData.address;

  // 5. Get messages (should have welcome email)
  console.log("\n[5] Get messages...");
  const msgsPromise = waitForResponse(child, 5, 10000);
  sendMcpRequest(child, 5, "tools/call", {
    name: "get_messages",
    arguments: { address },
  });
  const msgsResult = await msgsPromise;
  console.log("  Messages:", msgsResult.result.content[0].text);
  const msgsData = JSON.parse(msgsResult.result.content[0].text);

  // 6. Get full message
  if (msgsData.count > 0) {
    console.log("\n[6] Get full message...");
    const msgId = msgsData.messages[0].id;
    const msgPromise = waitForResponse(child, 6, 10000);
    sendMcpRequest(child, 6, "tools/call", {
      name: "get_message",
      arguments: { address, messageId: msgId },
    });
    const msgResult = await msgPromise;
    const msgData = JSON.parse(msgResult.result.content[0].text);
    console.log("  From:", msgData.from);
    console.log("  Subject:", msgData.subject);
    console.log("  Body preview:", (msgData.bodyText || "").slice(0, 200));
  }

  // 7. List mailboxes
  console.log("\n[7] List mailboxes...");
  const listMbPromise = waitForResponse(child, 7, 10000);
  sendMcpRequest(child, 7, "tools/call", {
    name: "list_mailboxes",
    arguments: {},
  });
  const listMbResult = await listMbPromise;
  console.log("  Mailboxes:", listMbResult.result.content[0].text);

  // 8. Delete mailbox
  console.log("\n[8] Delete mailbox...");
  const delPromise = waitForResponse(child, 8, 10000);
  sendMcpRequest(child, 8, "tools/call", {
    name: "delete_mailbox",
    arguments: { address },
  });
  const delResult = await delPromise;
  console.log("  Delete:", delResult.result.content[0].text);

  // 9. Test mail.tm create + get messages
  console.log("\n[9] Create mailbox (mail.tm)...");
  const mtmPromise = waitForResponse(child, 9, 15000);
  sendMcpRequest(child, 9, "tools/call", {
    name: "create_mailbox",
    arguments: { provider: "mail.tm" },
  });
  const mtmResult = await mtmPromise;
  console.log("  Mailbox:", mtmResult.result.content[0].text);

  console.log("\n" + "=".repeat(60));
  console.log("\u2705 ALL MCP PROTOCOL TESTS PASSED");
  console.log("=".repeat(60));

  child.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
