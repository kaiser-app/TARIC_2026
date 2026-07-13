import agent from "../netlify/functions/tariff-agent.mjs";
import { attachClassificationSources, findCnenEvidence } from "../netlify/functions/lib/cnen-rules.mjs";
import { loadCnenIndex } from "../netlify/functions/lib/cnen-index-data.mjs";
import { mayOverride, SOURCE_AUTHORITY } from "../netlify/functions/lib/source-authority.mjs";

const index = await loadCnenIndex();
if (index.source?.contentFormat !== "kn10-row-bilingual" || index.recordCount !== 25820 || index.records?.length !== 25820)
  throw new Error("A kétnyelvű KN10-index nem őrzi meg mind a 25 820 sort.");
if (!index.source.languages?.includes("EN") || !index.source.languages?.includes("HU")
  || index.pairing?.matchedRows !== 25820
  || index.pairing?.explanationPairs !== 19538
  || index.pairing?.rowsWithoutExplanation !== 6282
  || index.pairing?.uniqueExplanationKeys !== 2447)
  throw new Error("A magyar–angol KN10 sorpárosítás metaadatai hibásak.");
if (index.missingRecords?.length !== 6282)
  throw new Error("A magyarázat nélküli KN10-sorok száma hibás.");
const duplicateCode = Object.entries(index.exactLookup || {}).find(([, ids]) => ids.length > 1);
if (!duplicateCode || duplicateCode[1].some((id) => !index.records[id]))
  throw new Error("Az azonos KN10-kódú külön hierarchiasorok elvesztek.");

const smartphone = findCnenEvidence("8517130000", index, 10);
if (!smartphone.some((item) => /telephone sets/i.test(item.excerpt) && /távbeszélő-készülék/i.test(item.excerptHu)))
  throw new Error("A 8517130000 kétnyelvű telefonmagyarázata hiányzik.");
const animal = findCnenEvidence("0106190000", index, 10);
if (!animal.some((item) => /giraffes/i.test(item.excerpt) && /zsiráf/i.test(item.excerptHu)))
  throw new Error("A 0106190000 kétnyelvű élőállat-magyarázata hiányzik.");

if (mayOverride("binding_nomenclature", "learned_semantic_term")
  || !mayOverride("learned_semantic_term", "cn_explanatory_note")
  || SOURCE_AUTHORITY.binding_nomenclature <= SOURCE_AUTHORITY.cn_explanatory_note)
  throw new Error("A forráshierarchia sorrendje hibás.");
const enriched = attachClassificationSources({ status: "classified", code: "8517130000", dataDate: index.coverage.dataDate, path: [] }, index);
if (enriched.sourceValidation.status !== "cross_checked" || enriched.sourceValidation.bilingual !== true
  || enriched.legalSources[0].binding !== true)
  throw new Error("A kétnyelvű jogforrási ellenőrzés nem került a válaszba.");

async function classify(name, description) {
  const response = await agent(new Request("http://local/api/tariff-agent", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, description }),
  }));
  return response.json();
}
for (const [name, description, expected] of [
  ["ZSIRÁF", "ÉLŐ ÁLLAT, 6 HÓNAPOS", "0106190000"],
  ["MOBILTELEFON", "ANDROIDOS OKOS", "8517130000"],
]) {
  const result = await classify(name, description);
  if (result.code !== expected || result.sourceValidation?.status !== "cross_checked" || !result.cnenEvidence?.length)
    throw new Error(`${name}: hibás besorolás vagy KN-magyarázati ellenőrzés (${result.code}).`);
}

console.log(`OK kétnyelvű KN10: ${index.recordCount} sor, ${index.pairing.explanationPairs} magyarázatos, ${index.missingRecords.length} magyarázat nélküli`);
