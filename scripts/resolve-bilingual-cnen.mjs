import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";

const root = resolve(process.argv[2] || ".");
const sourceBase = resolve(root, "data/source/cnen-bilingual-source.json");
const nomenclaturePath = resolve(root, "data/generated/nomenclature-rows.json");
const outputPath = resolve(root, "data/generated/cnen-rules-index.json");
const missingPath = resolve(root, "data/generated/cnen-missing.json");
const coveragePath = resolve(root, "data/generated/cnen-coverage.json");
const publicCsvPath = resolve(root, "public/cnen-missing.csv");

const digits = (value) => String(value || "").replace(/\D/g, "");
const normalizeText = (value) => String(value || "")
  .toLocaleLowerCase("hu")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

async function readEncodedParts(basePath) {
  let encoded = "";
  for (let part = 0; part < 64; part += 1) {
    try {
      encoded += await readFile(`${basePath}.gz.b64.part${String(part).padStart(2, "0")}`, "utf8");
    } catch (error) {
      if (part === 0) throw error;
      break;
    }
  }
  return encoded.replace(/\s+/g, "");
}

function sourceMatchesCurrent(record, cn8) {
  const codes = (record.c || []).map(digits).filter(Boolean);
  if (!codes.length) return false;
  if (record.s === "range" && codes.length >= 2) {
    const lower = codes[0].padEnd(8, "0");
    const upper = codes[codes.length - 1].padEnd(8, "9");
    return cn8 >= lower && cn8 <= upper;
  }
  return codes.some((code) => cn8.startsWith(code));
}

function specificity(record) {
  const length = Math.max(0, ...(record.c || []).map((code) => digits(code).length));
  const scopeWeight = record.s === "single" ? 3 : record.s === "list" ? 2 : 1;
  return length * 10 + scopeWeight;
}

function representativeDescription(rows) {
  return [...rows]
    .sort((a, b) => Number(b.indent || 0) - Number(a.indent || 0))
    .map((row) => row.description)
    .find(Boolean) || "";
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const knownMappings = [
  {
    source: "85171200",
    current: ["85171300", "85171400"],
    kind: "split",
    noteHu: "A 2019-es 8517 12 00 mobiltelefon-ág 2026-ban az okostelefon és a más mobiltelefon ágára vált szét.",
    noteEn: "The 2019 CN 8517 12 00 mobile-phone branch was split into smartphone and other mobile-phone branches in 2026.",
  },
];

let bilingualSource;
try {
  bilingualSource = JSON.parse(await readFile(resolve(root, "data/generated/cnen-bilingual-source.json"), "utf8"));
} catch {
  const encoded = await readEncodedParts(sourceBase);
  bilingualSource = JSON.parse(gunzipSync(Buffer.from(encoded, "base64")).toString("utf8"));
}
const nomenclature = JSON.parse(await readFile(nomenclaturePath, "utf8"));
const allRows = (nomenclature.rows || []).filter((row) => /^\d{10}$/.test(String(row.code || "")));
let tariffRows = allRows.filter((row) => String(row.productLine || "") === "80");
if (!tariffRows.length) tariffRows = allRows;

const rowsByCn8 = new Map();
for (const row of tariffRows) {
  const cn8 = row.code.slice(0, 8);
  const rows = rowsByCn8.get(cn8) || [];
  rows.push(row);
  rowsByCn8.set(cn8, rows);
}
const cn8Codes = [...rowsByCn8.keys()].sort();

const records = bilingualSource.records.map((record) => ({
  id: record.id,
  c: record.c,
  s: record.s,
  se: record.se,
  sh: record.sh,
  ...(record.d ? { d: true } : {}),
  h: record.he,
  t: record.te,
  hHu: record.hh,
  tHu: record.th,
  y: record.y || [],
  r: record.r || [],
  p: record.pe,
  q: record.qe,
  n: record.ne,
  o: record.oe,
  pHu: record.ph,
  qHu: record.qh,
  nHu: record.nh,
  oHu: record.oh,
  sp: specificity(record),
}));

const sourceLookup = {};
for (const record of records) {
  for (const code of record.c || []) (sourceLookup[code] ||= []).push(record.id);
}

const currentLookup = {};
const matchedByRecord = Array.from({ length: records.length }, () => new Set());
const mappingReasons = new Map();

for (const cn8 of cn8Codes) {
  const ids = [];
  for (const record of records) {
    if (sourceMatchesCurrent(record, cn8)) ids.push(record.id);
  }
  for (const mapping of knownMappings) {
    if (!mapping.current.some((current) => cn8.startsWith(current))) continue;
    for (const record of records) {
      if ((record.c || []).includes(mapping.source) && !ids.includes(record.id)) {
        ids.push(record.id);
        mappingReasons.set(`${record.id}:${cn8}`, mapping.kind);
      }
    }
  }
  ids.sort((left, right) => records[right].sp - records[left].sp || left - right);
  if (ids.length) {
    currentLookup[cn8] = ids;
    for (const id of ids) matchedByRecord[id].add(cn8);
  }
}

const genericHeadings = new Set(["other", "mas", "general", "altalanos"]);
for (const record of records) {
  if (matchedByRecord[record.id].size || record.s === "range") continue;
  const heading = normalizeText(record.hHu || record.h);
  if (heading.length < 8 || genericHeadings.has(heading)) continue;
  const chapters = [...new Set((record.c || []).map((code) => digits(code).slice(0, 4)).filter((code) => code.length === 4))];
  const candidates = cn8Codes.filter((cn8) => chapters.some((chapter) => cn8.startsWith(chapter)));
  const headingMatches = candidates.filter((cn8) => {
    const description = normalizeText(representativeDescription(rowsByCn8.get(cn8) || []));
    return description === heading || (heading.length >= 14 && description.length >= 14 && (description.includes(heading) || heading.includes(description)));
  });
  if (!headingMatches.length || headingMatches.length > 8) continue;
  for (const cn8 of headingMatches) {
    const ids = currentLookup[cn8] || [];
    if (!ids.includes(record.id)) ids.push(record.id);
    ids.sort((left, right) => records[right].sp - records[left].sp || left - right);
    currentLookup[cn8] = ids;
    matchedByRecord[record.id].add(cn8);
    mappingReasons.set(`${record.id}:${cn8}`, "heading-successor-match");
  }
}

const missing = [];
let explainedTaric10 = 0;
let totalTaric10 = 0;
for (const cn8 of cn8Codes) {
  const rows = rowsByCn8.get(cn8) || [];
  const taricCodes = [...new Set(rows.map((row) => row.code))].sort();
  totalTaric10 += taricCodes.length;
  if (currentLookup[cn8]?.length) {
    explainedTaric10 += taricCodes.length;
    continue;
  }
  missing.push({
    code: cn8,
    displayCode: cn8.replace(/(....)(..)(..)/, "$1 $2 $3"),
    chapter: cn8.slice(0, 2),
    descriptionHu: representativeDescription(rows),
    taricCount: taricCodes.length,
    taricCodes,
    status: "no_applicable_cnen_note",
  });
}

const unmappedSourceRecords = records
  .filter((record) => matchedByRecord[record.id].size === 0)
  .map((record) => ({ id: record.id, codes: record.c, scopeType: record.s, heading: record.h, headingHu: record.hHu }));
const inferredMappingCount = [...mappingReasons.values()].filter((kind) => kind === "heading-successor-match").length;
const knownMappingCount = [...mappingReasons.values()].filter((kind) => kind === "split").length;

const coverage = {
  schemaVersion: "1.0.0",
  dataDate: nomenclature.dataDate || null,
  generatedAt: new Date().toISOString(),
  sourceRecordCount: records.length,
  totalKn8: cn8Codes.length,
  explainedKn8: cn8Codes.length - missing.length,
  missingKn8: missing.length,
  coveragePercent: cn8Codes.length ? Number((((cn8Codes.length - missing.length) / cn8Codes.length) * 100).toFixed(2)) : 0,
  totalTaric10,
  explainedTaric10,
  missingTaric10: totalTaric10 - explainedTaric10,
  unmappedSourceRecordCount: unmappedSourceRecords.length,
  knownMappingApplications: knownMappingCount,
  inferredHeadingMappingApplications: inferredMappingCount,
  pairing: bilingualSource.pairing,
};

const index = {
  schemaVersion: "2.0.0",
  generatorVersion: "cnen-bilingual-kn10-resolver-v1",
  source: {
    ...bilingualSource.source,
    contentFormat: "bilingual-range-resolved",
    currentNomenclatureDataDate: nomenclature.dataDate || null,
  },
  codeMappings: knownMappings.flatMap((mapping) => mapping.current.map((current) => ({
    current,
    source: mapping.source,
    kind: mapping.kind,
    note: mapping.noteHu,
    noteEn: mapping.noteEn,
  }))),
  pairing: bilingualSource.pairing,
  coverage,
  recordCount: records.length,
  records,
  lookup: sourceLookup,
  currentLookup,
  unmappedSourceRecords,
};

await mkdir(resolve(root, "data/generated"), { recursive: true });
await mkdir(resolve(root, "public"), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(index)}\n`);
await writeFile(missingPath, `${JSON.stringify({ schemaVersion: "1.0.0", coverage, records: missing })}\n`);
await writeFile(coveragePath, `${JSON.stringify({ ...coverage, unmappedSourceRecords }, null, 2)}\n`);
const csvLines = [
  ["KN8", "KN-kód", "Magyar megnevezés", "Kapcsolódó TARIC10-kódok száma", "TARIC10-kódok", "Állapot"],
  ...missing.map((item) => [item.code, item.displayCode, item.descriptionHu, item.taricCount, item.taricCodes.join(" | "), item.status]),
].map((row) => row.map(escapeCsv).join(";"));
await writeFile(publicCsvPath, `\uFEFF${csvLines.join("\r\n")}\r\n`, "utf8");

console.log(`Bilingual CNEN resolved: ${records.length} notes; ${coverage.explainedKn8}/${coverage.totalKn8} KN8 covered; ${coverage.missingKn8} without applicable note; ${coverage.unmappedSourceRecordCount} source records without 2026 match.`);
