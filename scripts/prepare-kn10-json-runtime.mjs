import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadCnenIndex } from "../netlify/functions/lib/cnen-index-data.mjs";

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const index = await loadCnenIndex();
if (index?.source?.contentFormat !== "kn10-row-bilingual" || index.recordCount !== 25820)
  throw new Error("A 25 820 soros kétnyelvű KN10-index nem tölthető be.");
const missing = index.missingRecords || [];
const coverage = {
  ...index.coverage,
  sourceRecordCount: index.recordCount,
  totalTaric10: index.recordCount,
  explainedTaric10: index.pairing.explanationPairs,
  missingTaric10: missing.length,
  pairing: index.pairing,
};
await mkdir(resolve("data/generated"), { recursive: true });
await mkdir(resolve("public"), { recursive: true });
await writeFile(resolve("data/generated/cnen-missing.json"), `${JSON.stringify({ schemaVersion: "2.0.0", coverage, records: missing })}\n`);
await writeFile(resolve("data/generated/cnen-coverage.json"), `${JSON.stringify(coverage, null, 2)}\n`);
const csvRows = [
  ["Sorszám", "KN10", "KN-kód", "Magyar megnevezés", "Product line", "Behúzás", "Állapot"],
  ...missing.map((item) => [item.id + 1, item.code, item.displayCode, item.descriptionHu, item.productLine, item.indent, item.status]),
].map((row) => row.map(escapeCsv).join(";"));
await writeFile(resolve("public/cnen-missing.csv"), `\uFEFF${csvRows.join("\r\n")}\r\n`, "utf8");
console.log(`KN10 runtime files ready: ${index.recordCount} rows; ${index.pairing.explanationPairs} explained; ${missing.length} without explanation.`);
