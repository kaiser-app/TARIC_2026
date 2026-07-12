import { readFile, writeFile } from "node:fs/promises";
const source = process.argv[2] || "data/source/KN_10.xml";
const output = process.argv[3] || "data/generated/nomenclature-rows.json";
const dataDate = process.argv[4] || new Date().toISOString().slice(0, 10);
const xml = await readFile(source, "utf8");
const decode = (v) => v.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
const all = [...xml.matchAll(/<Row\b[^>]*>([\s\S]*?)<\/Row>/g)].map((m) => [...m[1].matchAll(/<Data\b[^>]*>([\s\S]*?)<\/Data>/g)].map((c) => decode(c[1])));
const headers = all[0];
const rows = all.slice(1).map((cells, index) => {
  const row = Object.fromEntries(headers.map((name, i) => [name, cells[i] || ""]));
  return { id: index, code: (row.VTSZ || "").replace(/\D/g, ""), indent: Number(row.INDENT || 0), productLine: row.PRODUCT_LINE || "", description: row.MEGNEVEZES || "", validFrom: row.MEGNEVEZES_KEZD || row.VTSZ_KEZD || "", validTo: row.VTSZ_VEGE || null };
}).filter((row) => row.code);
await writeFile(output, JSON.stringify({ schemaVersion: 1, dataDate, rowCount: rows.length, rows }));
console.log(rows.length);
