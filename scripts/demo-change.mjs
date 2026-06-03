import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dashboardPath = path.join(root, "components", "PreviewDashboard.tsx");
const mode = process.argv[2] ?? "apply";

const replacements = [
  [
    "Every pull request gets a live app without building a preview platform.",
    "Billing approvals are live on this branch before staging exists.",
  ],
  [
    "Daytona turns branch code into a disposable sandbox URL, then keeps\n              secrets, setup failures, and cleanup visible in the PR.",
    "This visible copy changed on a feature branch. Daytona can run that\n              branch in a disposable sandbox before anything reaches staging.",
  ],
  ["Usage-based billing review", "Previewed billing approvals"],
  ["Billing meters branch", "Demo branch change"],
];

function pairsForMode(selectedMode) {
  if (selectedMode === "apply") {
    return replacements;
  }
  if (selectedMode === "reset") {
    return replacements.map(([before, after]) => [after, before]);
  }
  throw new Error("Usage: node scripts/demo-change.mjs apply|reset");
}

let source = await readFile(dashboardPath, "utf8");
let changed = false;

for (const [before, after] of pairsForMode(mode)) {
  if (source.includes(before)) {
    source = source.replace(before, after);
    changed = true;
  }
}

if (!changed) {
  console.log(`No demo change needed; '${mode}' already appears applied.`);
  process.exit(0);
}

await writeFile(dashboardPath, source);
console.log(`Demo change '${mode}' updated components/PreviewDashboard.tsx`);
