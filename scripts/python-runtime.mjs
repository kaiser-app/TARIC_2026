import { spawnSync } from "node:child_process";

const candidates = process.platform === "win32"
  ? [
      { command: "py", prefix: ["-3"] },
      { command: "python", prefix: [] },
      { command: "python3", prefix: [] },
    ]
  : [
      { command: "python3", prefix: [] },
      { command: "python", prefix: [] },
    ];

export function resolvePythonRuntime() {
  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, [...candidate.prefix, "-c", "import sys; print(sys.executable)"], {
      encoding: "utf8",
    });
    if (result.status === 0) return candidate;
  }
  throw new Error("Python 3 nem található. A kétnyelvű KN Magyarázat előállításához Python 3 szükséges.");
}

export function runPython(runtime, args, options = {}) {
  return spawnSync(runtime.command, [...runtime.prefix, ...args], options);
}
