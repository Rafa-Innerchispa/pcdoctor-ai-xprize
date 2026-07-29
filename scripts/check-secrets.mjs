import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const candidateFiles = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);

const forbiddenNames = [
  /(^|\/)\.env($|\.)/i,
  /service-account.*\.json$/i,
  /application_default_credentials\.json$/i,
  /\.(pem|p12|pfx|key)$/i,
];

const filenameViolations = candidateFiles.filter(
  (file) =>
    file !== ".env.example" &&
    !file.endsWith("/.env.example") &&
    forbiddenNames.some((pattern) => pattern.test(file)),
);

if (filenameViolations.length) {
  console.error("Potential secret-bearing files are tracked:");
  for (const file of filenameViolations) console.error(`- ${file}`);
  process.exit(1);
}

const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/,
  /"type"\s*:\s*"service_account"/,
];

const contentViolations = [];
for (const file of candidateFiles) {
  if (file.replaceAll("\\", "/") === "scripts/check-secrets.mjs") continue;
  if (statSync(file).size > 2_000_000) continue;
  const content = readFileSync(file);
  if (content.includes(0)) continue;
  const text = content.toString("utf8");
  if (secretPatterns.some((pattern) => pattern.test(text))) {
    contentViolations.push(file);
  }
}

if (contentViolations.length) {
  console.error("Potential credential material detected:");
  for (const file of contentViolations) console.error(`- ${file}`);
  process.exit(1);
}

console.log(`Secret checks passed for ${candidateFiles.length} repository files.`);
