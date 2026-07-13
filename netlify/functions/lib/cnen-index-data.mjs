import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";

const directIndexUrl = new URL("../../../data/generated/kn10-explanations-index.json", import.meta.url);
const legacyFullIndexUrl = new URL("../../../data/generated/cnen-rules-index.json", import.meta.url);

function hydrateDirectIndex(index) {
  if (index?.source?.contentFormat !== "kn10-row-bilingual" || !Array.isArray(index.rows)) return index;
  const exactLookup = {}, currentLookup = {}, lookup = {}, headingIds = [], missingRecords = [];
  const add = (target, key, id) => (target[key] ||= []).push(id);
  const records = index.rows.map((row, id) => {
    const [section, chapter, vtsz, code, indent, productLine, nameId, noteId] = row;
    const name = index.names[nameId] || "";
    const note = Number.isInteger(noteId) ? index.notes[noteId] : null;
    const heading = productLine === "80" && indent === "00" && code === `${vtsz}000000`;
    const record = {
      id,
      c: [heading ? vtsz : code],
      s: "single",
      sp: Number(indent || 0) * 10 + (productLine === "80" ? 5 : 0),
      h: name,
      hHu: name,
      t: note?.[2] || "",
      tHu: note?.[1] || "",
      explanationKey: note?.[0] || null,
      y: [], r: [],
      section, chapter, vtsz, vtsz10: code, indent, productLine,
    };
    add(exactLookup, code, id);
    add(currentLookup, code.slice(0, 8), id);
    add(lookup, vtsz, id);
    if (heading) headingIds.push(id);
    if (!note) missingRecords.push({
      id,
      code,
      displayCode: `${code.slice(0, 4)} ${code.slice(4, 6)} ${code.slice(6, 8)} ${code.slice(8, 10)}`,
      chapter,
      descriptionHu: name,
      taricCount: 1,
      taricCodes: [code],
      productLine,
      indent,
      status: "no_explanatory_note",
    });
    return record;
  });
  for (const target of [exactLookup, currentLookup, lookup])
    for (const ids of Object.values(target)) ids.sort((left, right) => records[right].sp - records[left].sp || left - right);
  return {
    ...index,
    records,
    exactLookup,
    currentLookup,
    lookup,
    headingIds,
    missingRecords,
    missing: { coverage: index.coverage, records: missingRecords },
    codeMappings: [],
    unmappedSourceRecords: [],
  };
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
  if (!indexPromise) indexPromise = readFile(directIndexUrl, "utf8")
    .then(JSON.parse)
    .then(hydrateDirectIndex)
    .catch((error) => error?.code === "ENOENT" ? loadLegacyIndex() : Promise.reject(error));
  return indexPromise;
}
