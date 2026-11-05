#!/usr/bin/env node
// Keep the full audit visible. A clean audit passes; if the documented
// ESLint-only advisory returns, reject any changed chain or production exposure.
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
  [
    "minimatch",
    ["https://github.com/advisories/GHSA-g3hv-75wg-m249"],
  ],
  ["@typescript-eslint/typescript-estree", ["minimatch"]],
  ["@typescript-eslint/parser", ["@typescript-eslint/typescript-estree"]],
  ["@typescript-eslint/utils", ["@typescript-eslint/typescript-estree"]],
  [
    "@typescript-eslint/type-utils",
    ["@typescript-eslint/typescript-estree", "@typescript-eslint/utils"],
  ],
  [
    "@typescript-eslint/eslint-plugin",
    [
      "@typescript-eslint/parser",
      "@typescript-eslint/type-utils",
      "@typescript-eslint/utils",
    ],
  ],
  [
    "typescript-eslint",
    [
      "@typescript-eslint/eslint-plugin",
      "@typescript-eslint/parser",
      "@typescript-eslint/typescript-estree",
      "@typescript-eslint/utils",
    ],
  ],
  ["eslint-config-next", ["typescript-eslint"]],
]);
const actual = report.vulnerabilities ?? {};
const counts = report.metadata.vulnerabilities;
if (counts.total === 0 && Object.keys(actual).length === 0) {
  console.log("Full npm audit is clean.");
  process.exit(0);
}
const unexpected = Object.keys(actual).filter((name) => !expected.has(name));
const missing = [...expected.keys()].filter((name) => !actual[name]);
let valid = unexpected.length === 0 && missing.length === 0;
valid &&= counts.total === 8 && counts.moderate === 8;
valid &&= ["critical", "high", "low", "info"].every(
  (severity) => counts[severity] === 0,
);

for (const [name, causes] of expected) {
  const vulnerability = actual[name];
  if (!vulnerability) continue;
  valid &&= vulnerability.severity === "moderate";
  valid &&= vulnerability.nodes?.length === 1;
  valid &&= vulnerability.nodes?.every(
    (node) => lock.packages[node]?.dev === true,
  );
  const via = (vulnerability.via ?? [])
    .map((item) => (typeof item === "string" ? item : item?.url))
    .sort();
  valid &&= JSON.stringify(via) === JSON.stringify([...causes].sort());
}

if (!valid) {
  console.error(
    `Audit exception mismatch. New: ${unexpected.join(", ") || "none"}; missing: ${missing.join(", ") || "none"}.`,
  );
  process.exit(1);
}

console.warn(
  "Documented temporary dev-tooling exception: GHSA-g3hv-75wg-m249 through the eight-node Next.js ESLint chain only. Full audit remains eight MODERATE; production audit is a separate blocking gate.",
);
