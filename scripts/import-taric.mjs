import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { XMLParser } from "fast-xml-parser";

const REQUIRED = ["KN_10.xml", "KN_kieg_kod.xml", "KN_mertekegys.xml"];
const sourceDir = resolve(process.argv[2] || "data/source");
const outputDir = resolve(process.argv[3] || "data/generated");

function nodes(value) {
  if (!value || typeof value !== "object") return [];
  const found = [];
  if ("VTSZ" in value) found.push(value);
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach(item => found.push(...nodes(item)));
    else if (child && typeof child === "object") found.push(...nodes(child));
  }
  return found;
}

function text(value) {
  return value == null ? null : String(value).trim();
}

const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
const records = new Map();
const sources = [];

for (const file of REQUIRED) {
  const path = resolve(sourceDir, file);
  const info = await stat(path).catch(() => null);
  if (!info) throw new Error(`Hiányzó kötelező forrásfájl: ${file}`);
  const xml = await readFile(path, "utf8");
  const parsed = parser.parse(xml);
  const rows = nodes(parsed);
  if (!rows.length) throw new Error(`A fájlban nem található VTSZ mező: ${file}`);
  sources.push({ file: basename(path), bytes: info.size, rows: rows.length });
  for (const row of rows) {
    const vtsz = text(row.VTSZ)?.replace(/\D/g, "");
    if (!vtsz) continue;
    const current = records.get(vtsz) || { vtsz, descriptionHu: null, additionalCodes: [], units: [], sourceFiles: [] };
    current.descriptionHu ??= text(row.MEGNEVEZES || row.ARULEIRAS || row.LEIRAS);
    const additional = text(row.KIEG_KOD || row.KIEGESZITO_KOD);
    const unit = text(row.MERTEKEGYSEG || row.MERTEKEGYSEG_KOD);
    if (additional && !current.additionalCodes.includes(additional)) current.additionalCodes.push(additional);
    if (unit && !current.units.includes(unit)) current.units.push(unit);
    if (!current.sourceFiles.includes(file)) current.sourceFiles.push(file);
    records.set(vtsz, current);
  }
}

const generatedAt = new Date().toISOString();
const payload = { schemaVersion: 1, generatedAt, sources, recordCount: records.size, records: [...records.values()].sort((a,b) => a.vtsz.localeCompare(b.vtsz)) };
await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, "taric-index.json"), JSON.stringify(payload));
await writeFile(resolve(outputDir, "manifest.json"), JSON.stringify({ schemaVersion: 1, generatedAt, sources, recordCount: records.size }, null, 2));
console.log(`${records.size} VTSZ rekord elkészült: ${outputDir}`);
