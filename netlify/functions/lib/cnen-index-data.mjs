import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";

const directManifestUrl = new URL("../../../data/generated/kn10-explanations-index.manifest.json", import.meta.url);
const noteBaseUrl = new URL("../../../data/source/kn10-explanations/", import.meta.url);
const nomenclatureUrl = new URL("../../../data/generated/nomenclature-rows.json", import.meta.url);
const legacyFullIndexUrl = new URL("../../../data/generated/cnen-rules-index.json", import.meta.url);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function canonicalRows(rows, sections) {
  return rows.map((row) => {
    const code = String(row.code || "").padStart(10, "0");
    return [
      sections[code.slice(0, 2)] ?? null,
      code.slice(0, 2),
      code.slice(0, 4),
      code,
      String(row.indent ?? "").padStart(2, "0"),
      String(row.productLine ?? "").padStart(2, "0"),
      String(row.description || ""),
    ];
  });
}

async function loadNoteShards(manifest) {
  if (manifest.encoding !== "json-note-shards" || !Array.isArray(manifest.parts))
    throw new Error(`Nem támogatott KN10 magyarázatforrás: ${manifest.encoding}`);
  const notes = [];
  for (const part of manifest.parts) {
    const text = await readFile(new URL(part.file, noteBaseUrl), "utf8");
    if (part.sha256 && sha256(Buffer.from(text, "utf8")) !== part.sha256)
      throw new Error(`A KN10 magyarázatforrás ellenőrzőösszege eltér: ${part.file}`);
    const records = JSON.parse(text);
    if (!Array.isArray(records) || records.length !== Number(part.count))
      throw new Error(`A KN10 magyarázatforrás darabszáma hibás: ${part.file}`);
    notes.push(...records);
  }
  if (notes.length !== Number(manifest.noteCount))
    throw new Error("A KN10 magyarázatkulcsok száma nem egyezik a manifesttel.");
  return notes;
}

function buildDirectIndex(manifest, nomenclature, notes) {
  const rows = nomenclature.rows || [];
  if (rows.length !== Number(manifest.recordCount))
    throw new Error(`A KN10 nómenklatúra ${rows.length} sora nem egyezik a várt ${manifest.recordCount} sorral.`);
  const canonical = Buffer.from(JSON.stringify(canonicalRows(rows, manifest.sections || {})), "utf8");
  if (manifest.rowMetadataSha256 && sha256(canonical) !== manifest.rowMetadataSha256)
    throw new Error("A KN10 sorok eltérnek a feltöltött magyar és angol JSON soraitól.");

  const noteByKey = new Map(notes.map((note) => [String(note.key), note]));
  const keyLengths = [...new Set(notes.map((note) => String(note.key).length))].sort((a, b) => b - a);
  const exactLookup = {}, currentLookup = {}, lookup = {}, headingIds = [], missingRecords = [];
  const add = (target, key, id) => (target[key] ||= []).push(id);
  let explainedRows = 0;
  const explainedKn8 = new Set(), allKn8 = new Set();

  const records = rows.map((row, id) => {
    const code = String(row.code || "").padStart(10, "0");
    const vtsz = code.slice(0, 4), chapter = code.slice(0, 2);
    const indent = String(row.indent ?? "").padStart(2, "0");
    const productLine = String(row.productLine ?? "").padStart(2, "0");
    const heading = productLine === "80" && indent === "00" && code === `${vtsz}000000`;
    const explanationKey = keyLengths.map((length) => code.slice(0, length)).find((key) => noteByKey.has(key)) || null;
    const note = explanationKey ? noteByKey.get(explanationKey) : null;
    const record = {
      id, c: [heading ? vtsz : code], s: "single", sp: Number(indent) * 10 + (productLine === "80" ? 5 : 0),
      h: String(row.description || ""), hHu: String(row.description || ""),
      t: note?.en || "", tHu: note?.hu || "", explanationKey,
      y: [], r: [], vtsz10: code, vtsz, section: manifest.sections?.[chapter] ?? null,
      chapter, indent, productLine,
    };
    add(exactLookup, code, id); add(currentLookup, code.slice(0, 8), id); add(lookup, vtsz, id);
    if (heading) headingIds.push(id);
    if (productLine === "80") {
      allKn8.add(code.slice(0, 8));
      if (note) explainedKn8.add(code.slice(0, 8));
    }
    if (note) explainedRows += 1;
    else missingRecords.push({
      id, code, displayCode: `${code.slice(0, 4)} ${code.slice(4, 6)} ${code.slice(6, 8)} ${code.slice(8, 10)}`,
      chapter, descriptionHu: record.hHu, taricCount: 1, taricCodes: [code], productLine, indent,
      status: "no_explanatory_note",
    });
    return record;
  });

  for (const target of [exactLookup, currentLookup, lookup])
    for (const ids of Object.values(target)) ids.sort((left, right) => records[right].sp - records[left].sp || left - right);

  if (explainedRows !== Number(manifest.explainedRows) || missingRecords.length !== Number(manifest.missingRows))
    throw new Error("A feltöltött KN10 magyarázatok sorlefedettsége eltér a manifesttől.");
  const totalKn8 = allKn8.size, explainedKn8Count = explainedKn8.size;
  const coverage = {
    schemaVersion: "2.0.0", dataDate: nomenclature.dataDate || null, generatedAt: new Date().toISOString(),
    sourceRecordCount: records.length, totalRows: records.length, explainedRows, missingRows: missingRecords.length,
    totalKn8, explainedKn8: explainedKn8Count, missingKn8: totalKn8 - explainedKn8Count,
    coveragePercent: totalKn8 ? Number((explainedKn8Count / totalKn8 * 100).toFixed(2)) : 0,
    totalTaric10: records.length, explainedTaric10: explainedRows, missingTaric10: missingRecords.length,
    unmappedSourceRecordCount: 0,
  };
  const pairing = {
    matchedRows: records.length, explanationPairs: explainedRows,
    rowsWithoutExplanation: missingRecords.length, uniqueExplanationKeys: notes.length,
    languages: ["HU", "EN"],
  };
  return {
    schemaVersion: "3.0.0", generatorVersion: "kn10-json-row-pair-v2",
    source: {
      documentDate: nomenclature.dataDate || "2026-07-13", consolidation: "KN10 JSON HU/EN",
      currentCodeEdition: "2026", currentNomenclatureDataDate: nomenclature.dataDate || null,
      contentFormat: "kn10-row-bilingual", languages: ["HU", "EN"],
      sourceFiles: manifest.sourceFiles,
    },
    pairing, coverage, recordCount: records.length, noteCount: notes.length,
    records, exactLookup, currentLookup, lookup, headingIds, missingRecords,
    codeMappings: [], unmappedSourceRecords: [],
  };
}

async function loadDirectIndex() {
  let manifestText;
  try { manifestText = await readFile(directManifestUrl, "utf8"); }
  catch (error) { if (error?.code === "ENOENT") return null; throw error; }
  const manifest = JSON.parse(manifestText);
  const [nomenclature, notes] = await Promise.all([
    readFile(nomenclatureUrl, "utf8").then(JSON.parse),
    loadNoteShards(manifest),
  ]);
  return buildDirectIndex(manifest, nomenclature, notes);
}

async function loadLegacyIndex() {
  try { return JSON.parse(await readFile(legacyFullIndexUrl, "utf8")); }
  catch {
    let encoded = "";
    for (let part = 0; part < 64; part += 1) {
      try { encoded += await readFile(new URL(`${legacyFullIndexUrl.href}.gz.b64.part${String(part).padStart(2, "0")}`), "utf8"); }
      catch (error) { if (part === 0) throw error; break; }
    }
    return JSON.parse(gunzipSync(Buffer.from(encoded, "base64")).toString("utf8"));
  }
}

let indexPromise;
export async function loadCnenIndex() {
  if (!indexPromise) indexPromise = loadDirectIndex().then((index) => index || loadLegacyIndex());
  return indexPromise;
}
