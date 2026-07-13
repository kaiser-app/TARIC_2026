import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { brotliDecompressSync, gunzipSync } from "node:zlib";

const directManifestUrl = new URL("../../../data/generated/kn10-explanations-index.manifest.json", import.meta.url);
const directIndexBaseUrl = new URL("../../../data/generated/kn10-explanations-index.json", import.meta.url);
const legacyFullIndexUrl = new URL("../../../data/generated/cnen-rules-index.json", import.meta.url);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function hydrateDirectIndex(index) {
  if (index?.source?.contentFormat !== "kn10-row-bilingual" || !Array.isArray(index.notes)) return index;
  for (const record of index.records || []) {
    const note = Number.isInteger(record.k) ? index.notes[record.k] : null;
    record.t = note?.e || "";
    record.tHu = note?.h || "";
    record.explanationKey = note?.k || null;
    record.vtsz10 = record.z || record.c?.[0] || "";
    record.vtsz = record.v || record.vtsz10.slice(0, 4);
    record.section = record.a || null;
    record.chapter = record.g || record.vtsz10.slice(0, 2);
    record.indent = record.i || "00";
    record.productLine = record.l || "80";
  }
  return index;
}

async function loadDirectIndex() {
  let manifestText;
  try {
    manifestText = await readFile(directManifestUrl, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }

  const manifest = JSON.parse(manifestText);
  const partCount = Number(manifest.partCount);
  if (!Number.isInteger(partCount) || partCount < 1 || partCount > 64)
    throw new Error("A KN10 magyarázat-index manifestjében érvénytelen a partCount.");
  if (manifest.encoding !== "brotli+base64")
    throw new Error(`Nem támogatott KN10 magyarázat-index kódolás: ${manifest.encoding}`);

  let encoded = "";
  for (let part = 0; part < partCount; part += 1) {
    const suffix = String(part).padStart(2, "0");
    encoded += await readFile(new URL(`${directIndexBaseUrl.href}.br.b64.part${suffix}`), "utf8");
  }

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
  try {
    return JSON.parse(await readFile(legacyFullIndexUrl, "utf8"));
  } catch {
    let encoded = "";
    for (let part = 0; part < 64; part += 1) {
      try {
        encoded += await readFile(new URL(`${legacyFullIndexUrl.href}.gz.b64.part${String(part).padStart(2, "0")}`), "utf8");
      } catch (error) {
        if (part === 0) throw error;
        break;
      }
    }
    return JSON.parse(gunzipSync(Buffer.from(encoded, "base64")).toString("utf8"));
  }
}

let indexPromise;
export async function loadCnenIndex() {
  if (!indexPromise) indexPromise = loadDirectIndex().then((index) => index || loadLegacyIndex());
  return indexPromise;
}
