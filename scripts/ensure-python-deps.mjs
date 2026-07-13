import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { resolvePythonRuntime, runPython } from "./python-runtime.mjs";

const runtime = resolvePythonRuntime();
const target = resolve(".python-deps");
const env = {
  ...process.env,
  PYTHONPATH: [target, process.env.PYTHONPATH].filter(Boolean).join(":"),
};

const verify = () => runPython(runtime, [
  "-c",
  "import pdfplumber; assert pdfplumber.__version__ == '0.11.9'; print(pdfplumber.__version__)",
], { env, encoding: "utf8" });

if (verify().status !== 0) {
  await mkdir(target, { recursive: true });
  const install = runPython(runtime, [
    "-m", "pip", "install",
    "--disable-pip-version-check",
    "--no-warn-script-location",
    "--upgrade",
    "--target", target,
    "-r", resolve("requirements.txt"),
  ], { env: process.env, stdio: "inherit" });
  if (install.error) throw install.error;
  if (install.status !== 0) throw new Error(`A Python-függőségek telepítése hibával leállt (${install.status}).`);
}

const checked = verify();
if (checked.status !== 0) throw new Error("A pdfplumber 0.11.9 telepítése nem ellenőrizhető.");
console.log(`CNEN Python-környezet kész: pdfplumber ${checked.stdout.trim()}.`);
