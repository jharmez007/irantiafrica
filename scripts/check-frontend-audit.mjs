#!/usr/bin/env node
// Keep the full audit visible while narrowly tracking the unpatched ESLint-only
// advisory. Any additional advisory, changed chain, or production exposure fails.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../frontend");
const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
const audit = spawnSync("npm", ["audit", "--json"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 8 * 1024 * 1024,
});
if (audit.error || ![0, 1].includes(audit.status)) {
  console.error("Full npm audit could not complete.");
  process.exit(1);
}

let report;
try {
  report = JSON.parse(audit.stdout);
} catch {
  console.error("Full npm audit did not return valid JSON.");
  process.exit(1);
}
if (report.error || !report.metadata?.vulnerabilities) {
  console.error("Full npm audit returned an error or incomplete result.");
  process.exit(1);
}

const expected = new Map([
  ["braces", "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm"],
  ["micromatch", "braces"],
  ["fast-glob", "micromatch"],
  ["@next/eslint-plugin-next", "fast-glob"],
  ["eslint-config-next", "@next/eslint-plugin-next"],
]);
const actual = report.vulnerabilities ?? {};
const counts = report.metadata.vulnerabilities;
const unexpected = Object.keys(actual).filter((name) => !expected.has(name));
const missing = [...expected.keys()].filter((name) => !actual[name]);
let valid = unexpected.length === 0 && missing.length === 0;
valid &&= counts.total === 5 && counts.high === 5;
valid &&= ["critical", "moderate", "low", "info"].every(
  (severity) => counts[severity] === 0,
);

for (const [name, cause] of expected) {
  const vulnerability = actual[name];
  if (!vulnerability) continue;
  valid &&= vulnerability.severity === "high";
  valid &&= vulnerability.nodes?.length === 1;
  valid &&= vulnerability.nodes?.every(
    (node) => lock.packages[node]?.dev === true,
  );
  valid &&= vulnerability.via?.length === 1;
  const via = vulnerability.via?.[0];
  valid &&= typeof via === "string" ? via === cause : via?.url === cause;
}

if (!valid) {
  console.error(
    `Audit exception mismatch. New: ${unexpected.join(", ") || "none"}; missing: ${missing.join(", ") || "none"}.`,
  );
  process.exit(1);
}

console.warn(
  "Documented temporary dev-tooling exception: GHSA-vfj7-8cjw-p6xm through the five-node ESLint chain only. Full audit remains five HIGH; production audit is a separate blocking gate.",
);
