import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const cacheDir = resolve("data/cache");
const output = resolve("data/generated/cnen-bilingual-source.json");
const qa = resolve("data/generated/cnen-bilingual-qa.json");
const sources = [
  {
    language: "EN",
    path: resolve(cacheDir, "cnen-en-20260213.pdf"),
    url: "https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX%3A02019XC0329%2802%29-20260213",
  },
  {
    language: "HU",
    path: resolve(cacheDir, "cnen-hu-20260213.pdf"),
    url: "https://eur-lex.europa.eu/legal-content/HU/TXT/PDF/?uri=CELEX%3A02019XC0329%2802%29-20260213",
  },
];

async function validPdf(path) {
  try {
    const info = await stat(path);
    if (info.size < 1_000_000) return false;
    return (await readFile(path, { encoding: "ascii", length: 5 })).startsWith("%PDF-");
  } catch {
    return false;
  }
}

async function download(source) {
  if (await validPdf(source.path)) return;
  const response = await fetch(source.url, {
    headers: { "user-agent": "TARIC-2026 CNEN source builder" },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`${source.language} EUR-Lex PDF letöltési hiba: HTTP ${response.status}`);
  const content = Buffer.from(await response.arrayBuffer());
  if (content.length < 1_000_000 || content.subarray(0, 5).toString("ascii") !== "%PDF-")
    throw new Error(`${source.language} forrás nem érvényes PDF.`);
  await writeFile(source.path, content);
  console.log(`${source.language} KN Magyarázat letöltve: ${content.length} bájt.`);
}

await mkdir(cacheDir, { recursive: true });
await Promise.all(sources.map(download));

const result = spawnSync("python3", [
  resolve("scripts/build-bilingual-cnen.py"),
  sources[0].path,
  sources[1].path,
  "--output", output,
  "--qa", qa,
], {
  stdio: "inherit",
  env: {
    ...process.env,
    PYTHONPATH: [resolve(".python-deps"), process.env.PYTHONPATH].filter(Boolean).join(":"),
  },
});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`A kétnyelvű KN Magyarázat építése hibával leállt (${result.status}).`);
await access(output);
