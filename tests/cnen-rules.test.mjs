import agent from "../netlify/functions/tariff-agent.mjs";
import { attachClassificationSources, findCnenEvidence } from "../netlify/functions/lib/cnen-rules.mjs";
import { loadCnenIndex } from "../netlify/functions/lib/cnen-index-data.mjs";
import { mayOverride, SOURCE_AUTHORITY } from "../netlify/functions/lib/source-authority.mjs";

const index = await loadCnenIndex();
const evidence = (code) => {
  const result = findCnenEvidence(code, index);
  if (!result.length) throw new Error(`Hiányzó CNEN-bizonyíték: ${code}`);
  return result;
};

if (index.source.documentDate !== "2026-02-13" || index.source.consolidation !== "016.001"
  || index.source.contentFormat !== "bilingual-range-resolved" || index.recordCount !== 2672)
  throw new Error("A kétnyelvű CNEN-forrás verziója vagy rekordszáma hibás.");
if (!index.source.languages?.includes("EN") || !index.source.languages?.includes("HU")
  || index.pairing?.matched !== 2671
  || index.pairing?.monolingualSupplemental !== 1
  || index.pairing?.generalRecords !== 41
  || index.pairing?.scopeDiscrepancies !== 4)
  throw new Error("A magyar–angol párosítás metaadatai hibásak.");
if (!index.coverage || index.coverage.missingKn8 !== index.coverage.totalKn8 - index.coverage.explainedKn8)
  throw new Error("A KN8-lefedettségi összesítés hibás.");

const smartphone = evidence("8517130000");
const traditional = evidence("8517140000");
if (!smartphone.some((item) => /mobile phones/i.test(item.excerpt) && /mobiltelefon/i.test(item.excerptHu))
  || !traditional.some((item) => item.mappedFromOlderCode))
  throw new Error("A kétnyelvű mobiltelefon-magyarázat vagy a 2019→2026 megfeleltetés hiányzik.");

const rangeRecord = index.records.find((record) => record.s === "range"
  && record.c?.length === 2 && record.c.every((code) => code.length >= 4));
if (!rangeRecord) throw new Error("A tartományrekordok elvesztek.");
const lower = rangeRecord.c[0].padEnd(8, "0"), upper = rangeRecord.c.at(-1).padEnd(8, "9");
const currentInsideRange = Object.keys(index.currentLookup).filter((code) => code >= lower && code <= upper);
if (currentInsideRange.length && !currentInsideRange.every((code) => index.currentLookup[code].includes(rangeRecord.id)))
  throw new Error("A tartomány nem terjed ki minden létező köztes KN8-kódra.");

const conservativeList = index.records.find((record) => record.c?.join("|") === "22011011|22011019");
if (!conservativeList || conservativeList.s !== "list" || !conservativeList.d)
  throw new Error("Az eltérő EN/HU tartományjelölés konzervatív kezelése hiányzik.");
const intermediate = Object.keys(index.currentLookup).filter((code) => code > "22011011" && code < "22011019");
if (intermediate.some((code) => index.currentLookup[code].includes(conservativeList.id)))
  throw new Error("A felsorolásos megjegyzés tévesen köztes kódokra is kiterjed.");

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
  ["TELEFON", "HAGYOMÁNYOS, NEM OKOS MOBILTELEFON", "8517140000"],
  ["WI-FI ROUTER", "ADATOK VÉTELÉRE ÉS TOVÁBBÍTÁSÁRA", "8517620000"],
]) {
  const result = await classify(name, description);
  if (result.code !== expected || result.sourceValidation?.status !== "cross_checked" || !result.cnenEvidence?.length)
    throw new Error(`${name}: hibás besorolás vagy CNEN-ellenőrzés (${result.code}).`);
}
const exclusion = await classify("Fémpolírozók", "Lábbeli-, bútor-, padló-, autókarosszéria-, üvegfényesítők vagy fémpolírozók; Más; Fémpolírozók");
if (exclusion.code !== "3405901000") throw new Error(`A kizárás téves pozitív találat lett: ${exclusion.code}`);

console.log(`OK kétnyelvű CNEN: ${index.recordCount} rekord, tartományfeloldás, ${index.coverage.explainedKn8}/${index.coverage.totalKn8} KN8`);
