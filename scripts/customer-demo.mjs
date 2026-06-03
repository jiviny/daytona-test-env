import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const root = process.cwd();
const artifactsDir = "demo-artifacts";
const nodeCommand = process.execPath;
const nextBin = "node_modules/next/dist/bin/next";
const pythonCommand = process.platform === "win32" ? "python" : "python3";
const host = "127.0.0.1";
const port = Number(process.env.CUSTOMER_DEMO_PORT || "3147");
const baseUrl = `http://${host}:${port}`;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      shell: false,
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
      env: { ...process.env, ...options.env },
    });

    let stdout = "";
    let stderr = "";
    if (child.stdout) child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    if (child.stderr) child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with ${code}\n${stderr}`));
    });
  });
}

async function waitFor(url) {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return response;
      lastError = new Error(`${url} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }
  throw lastError ?? new Error(`${url} did not respond`);
}

await mkdir(artifactsDir, { recursive: true });

if (!existsSync(".next/BUILD_ID")) {
  await run(nodeCommand, [nextBin, "build"]);
}

const upsert = await run(
  pythonCommand,
  [
    "scripts/daytona-pr-preview.py",
    "upsert",
    "--repository",
    "acme/launchpad",
    "--pr-number",
    "184",
    "--sha",
    "demoabc123",
    "--head-ref",
    "billing/meter-rollups",
    "--dry-run",
    "--output",
    `${artifactsDir}/daytona-upsert.json`,
    "--markdown-output",
    `${artifactsDir}/pr-comment.md`,
  ],
  { capture: true },
);

const preview = spawn(nodeCommand, [nextBin, "start", "--hostname", host, "--port", String(port)], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
  shell: false,
});

let previewOutput = "";
preview.stdout.on("data", (chunk) => (previewOutput += chunk.toString()));
preview.stderr.on("data", (chunk) => (previewOutput += chunk.toString()));

try {
  await waitFor(`${baseUrl}/api/health`);
  const waitlistResponse = await fetch(`${baseUrl}/api/waitlist`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "reviewer@example.com", company: "Acme" }),
  });
  const waitlist = await waitlistResponse.json();

  const del = await run(
    pythonCommand,
    [
      "scripts/daytona-pr-preview.py",
      "delete",
      "--repository",
      "acme/launchpad",
      "--pr-number",
      "184",
      "--sha",
      "demoabc123",
      "--head-ref",
      "billing/meter-rollups",
      "--dry-run",
      "--markdown-output",
      `${artifactsDir}/cleanup-comment.md`,
    ],
    { capture: true },
  );

  const report = [
    "# Daytona PR Preview Customer Demo",
    "",
    "Status: Local demo passed",
    "",
    "## What this demonstrates",
    "- A PR can produce a deterministic Daytona sandbox name.",
    "- The app can be built, started, and health-checked before a preview link is posted.",
    "- The PR comment body is generated from the same helper the GitHub Action uses.",
    "- Cleanup is represented as a first-class close-PR path.",
    "",
    "## Local preview",
    `- URL: ${baseUrl}`,
    "- Health check: passed",
    `- Waitlist API response: ${JSON.stringify(waitlist)}`,
    "",
    "## Daytona helper",
    "- Upsert dry-run: passed",
    "- Delete dry-run: passed",
    "",
    "## Artifacts",
    "- `demo-artifacts/daytona-upsert.json`",
    "- `demo-artifacts/pr-comment.md`",
    "- `demo-artifacts/cleanup-comment.md`",
  ].join("\n");

  await writeFile(`${artifactsDir}/customer-demo-report.md`, report + "\n", "utf8");
  console.log(report);
  console.log("");
  console.log("Raw helper output:");
  console.log(upsert.stdout.trim());
  console.log(del.stdout.trim());
} catch (error) {
  console.error(previewOutput.trim());
  throw error;
} finally {
  preview.kill("SIGTERM");
}
