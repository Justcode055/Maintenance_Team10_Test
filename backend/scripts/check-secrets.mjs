import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
const patterns = [
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+/,
  /\bsb_secret_[A-Za-z0-9_-]{20,}/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
let failures = 0;
for (const file of files) {
  if (/(^|\/)\.env(?:\..*)?$/.test(file) && !file.endsWith(".env.example")) {
    console.error(`Private environment file is tracked: ${file}`); failures++;
  }
  if (/\.(?:png|jpe?g|gif|ico|pdf|woff2?)$/i.test(file)) continue;
  const lines = readFileSync(new URL(file, new URL("../../", import.meta.url)), "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (patterns.some((pattern) => pattern.test(line))) {
      // Report location only, never print the matched credential.
      console.error(`Possible credential at ${file}:${index + 1}`); failures++;
    }
  });
}
if (failures) process.exitCode = 1;
else console.log("Tracked-file credential scan passed");
