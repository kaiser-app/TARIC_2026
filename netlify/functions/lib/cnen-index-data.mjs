import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { brotliDecompressSync, gunzipSync } from "node:zlib";

const directManifestUrl = new URL("../../../data/generated/kn10-explanations-index.manifest.json", import.meta.url);
const directIndexBaseUrl = new URL("../../../data/generated/kn10-explanations-index.json", import.meta.url);
const legacyFullIndexUrl = new URL("../../../data/generated/cnen-rules-index.json", import.meta.url);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function hydrateDirectIndex(index) {
  if (index?.source?.contentFormat !== "kn10-row-bilingual") return index;
  if (!Array.isArray(index.rows) || !Array.isArray(index.names) || !Array.isArray(index.notes)) return index;

  const exactLookup = {}, currentLookup = {}, lookup = {}, headingIds = [], missingRecords = [];
  const add = (target, key, id) => (target[key] ||= []).push(id);
  const records = index.rows.map((row, id) => {
    const [z, section, indentNumber, productLineNumber, nameIndex, noteIndex] = row;
    const vtsz = z.slice(0, 4), chapter = z.slice(0, 2);
    const indent = String(indentNumber).padStart(2, "0");
    const productLine = String(productLineNumber).padStart(2, "0");
    const heading = productLine === "80" && indent === "00" && z === `${vtsz}000000`;
    const name = index.names[nameIndex] || "";
    const note = Number.isInteger(noteIndex) ? index.notes[noteIndex] : null;
    const explanationKey = note?.[0] || null;
    const record = {
      id, c: [heading ? vtsz : z], z, v: vtsz, a: section, g: chapter, i: indent, l: productLine,
      h: name, hHu: name, k: Number.isInteger(noteIndex) ? noteIndex : null,
      t: note?.[2] || "", tHu: note?.[1] || "", explanationKey,
      s: "single", sp: Number(indentNumber) * 10 + (productLine === "80" ? 5 : 0), y: [], r: [],
      vtsz10: z, vtsz, section, chapter, indent, productLine,
    };
    add(exactLookup, z, id); add(currentLookup, z.slice(0, 8), id); add(lookup, vtsz, id);
    if (heading) headingIds.push(id);
    if (!note) missingRecords.push({
      id, code: z, displayCode: `${z.slice(0, 4)} ${z.slice(4, 6)} ${z.slice(6, 8)} ${z.slice(8, 10)}`,
      chapter, descriptionHu: name, taricCount: 1, taricCodes: [z], productLine, indent,
      status: "no_explanatory_note",
    });
    return record;
  });
  for (const target of [exactLookup, currentLookup, lookup])
    for (const ids of Object.values(target)) ids.sort((left, right) => records[right].sp - records[left].sp || left - right);

  index.records = records;
  index.exactLookup = exactLookup;
  index.currentLookup = currentLookup;
  index.lookup = lookup;
  index.headingIds = headingIds;
  index.missingRecords = missingRecords;
  delete index.rows;
  delete index.names;
  delete index.notes;
  return index;
}

async function loadDirectIndex() {
  let manifestText;
  try { manifestText = await readFile(directManifestUrl, "utf8"); }
  catch (error) { if (error?.code === "ENOENT") return null; throw error; }
  const manifest = JSON.parse(manifestText);
  const partCount = Number(manifest.partCount);
  if (!Number.isInteger(partCount) || partCount < 1 || partCount > 64)
    throw new Error("A KN10 magyarázat-index manifestjében érvénytelen a partCount.");
  if (manifest.encoding !== "brotli+base64")
    throw new Error(`Nem támogatott KN10 magyarázat-index kódolás: ${manifest.encoding}`);
  let encoded = "";
  for (let part = 0; part < partCount; part += 1)
    encoded += await readFile(new URL(`${directIndexBaseUrl.href}.br.b64.part${String(part).padStart(2, "0")}`), "utf8");
  const compressed = Buffer.from(encoded.replace(/\s+/g, ""), "base64");
  if (manifest.compressedSha256 && sha256(compressed) !== manifest.compressedSha256)
    throw new Error("A KN10 magyarázat-index tömörített ellenőrzőösszege eltér.");
  const uncompressed = brotliDecompressSync(compressed);
  if (manifest.sha256 && sha256(uncompressed) !== manifest.sha256)
    throw new Error("A KN10 magyarázat-index ellenőrzőösszege eltér.");
  const index = JSON.parse(uncompressed.toString("utf8"));
  if (Number(index.recordCount) !== Number(manifest.recordCount))
    throw new Error("A KN10 magyarázat-index rekordszáma nem egyezik a manifesttel.");
  return hydrateDirectIndex(index);
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
