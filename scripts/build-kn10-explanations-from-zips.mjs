import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { inflateRawSync } from "node:zlib";

const root = resolve(process.argv[2] || ".");
const sourceDir = resolve(root, "data/source/kn10");
const huZipPath = resolve(sourceDir, "kn10_magyarazatok_HU.zip");
const enZipPath = resolve(sourceDir, "kn10_magyarazatok_EN.zip");
const outputPath = resolve(root, "data/generated/kn10-explanations-index.json");
const qaPath = resolve(root, "data/generated/kn10-explanations-qa.json");

const EXPECTED = {
  rows: 25820,
  explainedRows: 19538,
  missingRows: 6282,
  noteKeys: 2447,
  huSha256: "eb7971f59e2a9413c3f5c863dd04d84ca05934ed664870b859ed540264d8a6e2",
  enSha256: "619d50c235cbb1f937e65fc83ec93d34a0dddfab9408c0742799e4080f416015",
};
const PARITY_FIELDS = ["aruosztaly", "arucsoport", "vtsz", "vtsz10", "indent", "product_line", "megnevezes", "magyarazat_kulcs"];
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

function findEndOfCentralDirectory(buffer) {
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset -= 1)
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  throw new Error("A ZIP központi könyvtárának záróbejegyzése nem található.");
}

function readJsonFromZip(buffer, sourceName) {
  const eocd = findEndOfCentralDirectory(buffer);
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const jsonEntries = [];
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error(`${sourceName}: hibás ZIP központi könyvtár.`);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (name.toLowerCase().endsWith(".json") && !name.endsWith("/")) {
      if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`${sourceName}: hibás ZIP helyi fejléc.`);
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.subarray(start, start + compressedSize);
      const data = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null;
      if (!data) throw new Error(`${sourceName}: nem támogatott ZIP tömörítési mód (${method}).`);
      if (data.length !== uncompressedSize) throw new Error(`${sourceName}: a kitömörített JSON mérete eltér.`);
      jsonEntries.push({ name, data });
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (jsonEntries.length !== 1) throw new Error(`${sourceName}: pontosan egy JSON-állomány szükséges, talált: ${jsonEntries.length}.`);
  return { entryName: jsonEntries[0].name, records: JSON.parse(jsonEntries[0].data.toString("utf8")) };
}

const normalized = (value) => String(value ?? "");
const rowIdentity = (row) => PARITY_FIELDS.map((field) => normalized(row[field]));

const [huZip, enZip] = await Promise.all([readFile(huZipPath), readFile(enZipPath)]);
const huHash = sha256(huZip), enHash = sha256(enZip);
if (huHash !== EXPECTED.huSha256) throw new Error(`A magyar ZIP SHA-256 értéke eltér: ${huHash}`);
if (enHash !== EXPECTED.enSha256) throw new Error(`Az angol ZIP SHA-256 értéke eltér: ${enHash}`);
const huSource = readJsonFromZip(huZip, "HU"), enSource = readJsonFromZip(enZip, "EN");
const hu = huSource.records, en = enSource.records;
if (!Array.isArray(hu) || !Array.isArray(en) || hu.length !== EXPECTED.rows || en.length !== EXPECTED.rows)
  throw new Error(`Mindkét nyelvi JSON-nak pontosan ${EXPECTED.rows} sort kell tartalmaznia.`);

const names = [], nameIds = new Map(), notes = [], noteIds = new Map(), rows = [];
const allKn8 = new Set(), explainedKn8 = new Set();
let explainedRows = 0;
for (let index = 0; index < EXPECTED.rows; index += 1) {
  const huRow = hu[index], enRow = en[index];
  const huIdentity = rowIdentity(huRow), enIdentity = rowIdentity(enRow);
  for (let fieldIndex = 0; fieldIndex < PARITY_FIELDS.length; fieldIndex += 1)
    if (huIdentity[fieldIndex] !== enIdentity[fieldIndex])
      throw new Error(`Nyelvi sorazonossági hiba: sor ${index + 1}, mező ${PARITY_FIELDS[fieldIndex]}.`);

  const code = normalized(huRow.vtsz10).replace(/\D/g, "").padStart(10, "0").slice(-10);
  if (!/^\d{10}$/.test(code)) throw new Error(`Érvénytelen vtsz10 a(z) ${index + 1}. sorban.`);
  const name = normalized(huRow.megnevezes);
  let nameId = nameIds.get(name);
  if (nameId === undefined) { nameId = names.length; names.push(name); nameIds.set(name, nameId); }

  const key = normalized(huRow.magyarazat_kulcs).replace(/\D/g, "");
  let noteId = null;
  if (key) {
    if (!/^\d{2,10}$/.test(key)) throw new Error(`Érvénytelen magyarázat_kulcs a(z) ${index + 1}. sorban.`);
    explainedRows += 1;
    const note = [key, normalized(huRow.magyarazat), normalized(enRow.magyarazat)];
    noteId = noteIds.get(key);
    if (noteId === undefined) { noteId = notes.length; notes.push(note); noteIds.set(key, noteId); }
    else if (JSON.stringify(notes[noteId]) !== JSON.stringify(note)) throw new Error(`Eltérő szöveg ugyanahhoz a magyarázatkulcshoz: ${key}.`);
  }

  const productLine = normalized(huRow.product_line).padStart(2, "0");
  if (productLine === "80") {
    const cn8 = code.slice(0, 8); allKn8.add(cn8); if (noteId !== null) explainedKn8.add(cn8);
  }
  rows.push([
    normalized(huRow.aruosztaly) || null,
    normalized(huRow.arucsoport).padStart(2, "0"),
    normalized(huRow.vtsz).padStart(4, "0"),
    code,
    normalized(huRow.indent).padStart(2, "0"),
    productLine,
    nameId,
    noteId,
  ]);
}

if (explainedRows !== EXPECTED.explainedRows || EXPECTED.rows - explainedRows !== EXPECTED.missingRows || notes.length !== EXPECTED.noteKeys)
  throw new Error(`QA eltérés: magyarázatos sor ${explainedRows}, hiányzó sor ${EXPECTED.rows - explainedRows}, kulcs ${notes.length}.`);

const totalKn8 = allKn8.size, explainedKn8Count = explainedKn8.size;
const index = {
  schemaVersion: "3.0.0",
  generatorVersion: "kn10-zip-bilingual-v1",
  source: {
    contentFormat: "kn10-row-bilingual",
    languages: ["HU", "EN"],
    sourceFiles: [
      { name: "kn10_magyarazatok_HU.zip", entryName: huSource.entryName, sha256: huHash, size: huZip.length },
      { name: "kn10_magyarazatok_EN.zip", entryName: enSource.entryName, sha256: enHash, size: enZip.length },
    ],
  },
  recordCount: rows.length,
  noteCount: notes.length,
  nameCount: names.length,
  pairing: {
    matchedRows: rows.length,
    explanationPairs: explainedRows,
    rowsWithoutExplanation: rows.length - explainedRows,
    uniqueExplanationKeys: notes.length,
  },
  coverage: {
    totalRows: rows.length,
    explainedRows,
    missingRows: rows.length - explainedRows,
    totalKn8,
    explainedKn8: explainedKn8Count,
    missingKn8: totalKn8 - explainedKn8Count,
    coveragePercent: totalKn8 ? Number((explainedKn8Count / totalKn8 * 100).toFixed(2)) : 0,
  },
  names,
  notes,
  rows,
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(index)}\n`, "utf8");
await writeFile(qaPath, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  ...index.pairing,
  ...index.coverage,
  sourceFiles: index.source.sourceFiles,
}, null, 2)}\n`, "utf8");
console.log(`KN10 bilingual source built: ${rows.length} rows; ${explainedRows} explained; ${rows.length - explainedRows} without explanation; ${notes.length} unique keys.`);
