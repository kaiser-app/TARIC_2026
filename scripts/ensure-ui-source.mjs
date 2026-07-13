import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const appPath = resolve("src/App.jsx");
const source = await readFile(appPath, "utf8");

const alreadyPatched = [
  'from "./cnen-hierarchy.js"',
  'from "./taric-link.js"',
  'from "./AiProviderPanel.jsx"',
  'className="taric-code-input"',
  'const applyAiSelection=',
  'topPanel==="ai"&&<AiProviderPanel',
].every((marker) => source.includes(marker));

if (!alreadyPatched) {
  execFileSync(process.execPath, ["scripts/patch-ui-source.mjs"], { stdio: "inherit" });
} else {
  console.log("Az App.jsx UI-patch már alkalmazva; az ismételt teljes patch kihagyva.");
}

execFileSync(process.execPath, ["scripts/replace-main-navigation.mjs"], { stdio: "inherit" });
