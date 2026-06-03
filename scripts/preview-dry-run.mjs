import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const args = new Set(process.argv.slice(2));
const forceBuild = args.has("--build");
const host = process.env.PREVIEW_HOST || "127.0.0.1";
const port = Number(process.env.PREVIEW_PORT || "3137");
const baseUrl = `http://${host}:${port}`;

const nextBin = "node_modules/next/dist/bin/next";
const nodeCommand = process.execPath;

function run(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: "inherit",
      shell: false,
      ...options
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${commandArgs.join(" ")} exited with ${code}`));
    });
  });
}

async function waitForPreview() {
  const deadline = Date.now() + 30_000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl, { cache: "no-store" });
      if (response.status < 500) {
        return response.status;
      }

      lastError = new Error(`preview returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(500);
  }

  throw lastError ?? new Error("preview did not respond before timeout");
}

if (forceBuild || !existsSync(".next/BUILD_ID")) {
  await run(nodeCommand, [nextBin, "build"]);
}

const preview = spawn(nodeCommand, [nextBin, "start", "--hostname", host, "--port", String(port)], {
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
  shell: false
});

let output = "";
preview.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
preview.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

try {
  const status = await waitForPreview();
  console.log(`Preview dry-run responded with HTTP ${status} at ${baseUrl}`);
} catch (error) {
  console.error(output.trim());
  throw error;
} finally {
  preview.kill("SIGTERM");
}
