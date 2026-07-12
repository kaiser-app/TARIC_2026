import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { resolve, basename } from "node:path";

const required = ["KN_10.xml", "KN_kieg_kod.xml", "KN_mertekegys.xml"];
const sourceDir = resolve(process.argv[2] || "data/source");
const outputDir = resolve(process.argv[3] || "data/generated");
const dataDate = process.argv[4] || new Date().toISOString().slice(0, 10);

const decode = value => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

function spreadsheetRows(xml) {
  const rows = [...xml.matchAll(/<Row\b[^>]*>([\s\S]*?)<\/Row>/g)].map(match =>
    [...match[1].matchAll(/<Data\b[^>]*>([\s\S]*?)<\/Data>/g)].map(cell => decode(cell[1]))
  );
  if (rows.length < 2) throw new Error("A munkalap nem tartalmaz feldolgozható adatsorokat.");
  const headers = rows[0];
  return rows.slice(1).map(cells => Object.fromEntries(headers.map((name, i) => [name, cells[i] ?? ""])));
}

const records = new Map();
const sources = [];
for (const file of required) {
  const path = resolve(sourceDir, file);
  const info = await stat(path).catch(() => null);
  if (!info) throw new Error(`Hiányzó kötelező forrásfájl: ${file}`);
  const rows = spreadsheetRows(await readFile(path, "utf8"));
  if (!rows.some(row => row.VTSZ)) throw new Error(`A fájlban nem található VTSZ oszlop: ${file}`);
  sources.push({ file: basename(path), bytes: info.size, rows: rows.length });
  for (const row of rows) {
    const vtsz = String(row.VTSZ || "").replace(/\D/g, "");
    if (!vtsz) continue;
    const current = records.get(vtsz) || {
      vtsz, descriptionHu: null, indent: null, productLine: null,
      additionalCodes: [], units: [], sourceFiles: []
    };
    current.descriptionHu ??= row.MEGNEVEZES || null;
    current.indent ??= row.INDENT || null;
    current.productLine ??= row.PRODUCT_LINE || null;
    const additional = row.KIEG_KOD || row.KIEGESZITO_KOD || row.KOD;
    const unit = row.MERTEKEGYSEG || row.MERTEKEGYSEG_KOD || row.MEGYSEG_KOD;
    if (additional && file === "KN_kieg_kod.xml" && !current.additionalCodes.includes(additional)) current.additionalCodes.push(additional);
    if (unit && file === "KN_mertekegys.xml" && !current.units.includes(unit)) current.units.push(unit);
    if (!current.sourceFiles.includes(file)) current.sourceFiles.push(file);
    records.set(vtsz, current);
  }
}

const generatedAt = new Date().toISOString();
const payload = {
  schemaVersion: 1, dataDate, generatedAt, sources,
  recordCount: records.size,
  records: [...records.values()].sort((a, b) => a.vtsz.localeCompare(b.vtsz))
};
await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, "taric-index.json"), JSON.stringify(payload));
await writeFile(resolve(outputDir, "manifest.json"), JSON.stringify({
  schemaVersion: 1, dataDate: payload.dataDate, generatedAt, sources, recordCount: records.size
}, null, 2));
console.log(`${records.size} VTSZ rekord elkészült (${payload.dataDate}).`);
