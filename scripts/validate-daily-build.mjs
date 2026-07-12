import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";

const [dbPath = "taric-current.db", generatedDir = "data/generated", expectedDate] = process.argv.slice(2);
const db = new DatabaseSync(dbPath, { readOnly: true });
const integrity = db.prepare("PRAGMA integrity_check").get().integrity_check;
if (integrity !== "ok") throw new Error(`SQLite integrity: ${integrity}`);
const counts = db.prepare(`SELECT
  (SELECT COUNT(*) FROM nomenclature) nomenclature,
  (SELECT COUNT(*) FROM measures) measures,
  (SELECT COUNT(*) FROM source_files) sources`).get();
if (counts.nomenclature < 20000 || counts.measures < 100000 || counts.sources < 30) throw new Error(`Szokatlanul kevés rekord: ${JSON.stringify(counts)}`);
const manifest = JSON.parse(await readFile(`${generatedDir}/manifest.json`, "utf8"));
if (expectedDate && manifest.dataDate !== expectedDate) throw new Error(`Adatnap eltérés: ${manifest.dataDate} != ${expectedDate}`);
const nomenclature = JSON.parse(await readFile(`${generatedDir}/nomenclature-rows.json`, "utf8"));
if (nomenclature.rowCount < 20000) throw new Error("Hiányos nómenklatúra-index.");
const measures = JSON.parse(await readFile(`${generatedDir}/measures-index.json`, "utf8"));
if (Object.keys(measures.byCode).length < 1000) throw new Error("Hiányos intézkedés-index.");
console.log(JSON.stringify({ integrity, dataDate: manifest.dataDate, ...counts, measureCodes: Object.keys(measures.byCode).length }));
db.close();
