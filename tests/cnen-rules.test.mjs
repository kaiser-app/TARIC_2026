import agent from "../netlify/functions/tariff-agent.mjs";
import { attachClassificationSources, findCnenEvidence } from "../netlify/functions/lib/cnen-rules.mjs";
import { loadCnenIndex } from "../netlify/functions/lib/cnen-index-data.mjs";
import { mayOverride, SOURCE_AUTHORITY } from "../netlify/functions/lib/source-authority.mjs";

const index = await loadCnenIndex();
const requireEvidence = (code, pattern) => {
  const evidence = findCnenEvidence(code, index);
  if (!evidence.length) throw new Error(`Hiányzó CNEN-bizonyíték: ${code}`);
  if (!pattern.test(evidence.map((item) => item.excerpt).join(" ")))
    throw new Error(`A CNEN-részlet nem tartalmazza a várt szabályt: ${code}`);
  return evidence;
};

if (index.source.documentDate !== "2026-02-13" || index.source.consolidation !== "016.001")
  throw new Error("Hibás CNEN-forrásverzió.");
if (index.source.legallyBinding !== false || index.recordCount !== 2533 || index.source.contentFormat !== "code-keyed-json")
  throw new Error("A CNEN jogi minősítése vagy feldolgozottsága hibás.");

requireEvidence("0106190000", /giraffes[\s\S]*dogs and cats/i);
requireEvidence("0106391000", /pigeon[\s\S]*wild or domestic/i);
const smartphoneEvidence = requireEvidence("8517130000", /mobile phones[\s\S]*SIM/i);
const traditionalMobileEvidence = requireEvidence("8517140000", /mobile phones[\s\S]*principal function/i);
requireEvidence("8517620000", /routers/i);
requireEvidence("9004000000", /spectacle (?:cords|chains)[\s\S]*constituent material/i);
if (!smartphoneEvidence.some((item) => item.mappedFromOlderCode)
  || !traditionalMobileEvidence.some((item) => item.mappedFromOlderCode))
  throw new Error("A 2019→2026 mobiltelefon-kódmegfeleltetés hiányzik.");

if (mayOverride("binding_nomenclature", "learned_semantic_term"))
  throw new Error("A tanult szinonima nem írhatja felül a kötelező nómenklatúrát.");
if (!mayOverride("learned_semantic_term", "cn_explanatory_note")
  || SOURCE_AUTHORITY.binding_nomenclature <= SOURCE_AUTHORITY.cn_explanatory_note)
  throw new Error("A forráshierarchia sorrendje hibás.");

const enriched = attachClassificationSources({
  status: "classified", code: "8517130000", dataDate: "2026-07-12", path: [],
}, index);
if (enriched.sourceValidation.status !== "cross_checked" || enriched.legalSources[0].binding !== true)
  throw new Error("A jogforrási ellenőrzés nem került a válaszba.");

async function classify(name, description) {
  const response = await agent(new Request("http://local/api/tariff-agent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, description }),
  }));
  return response.json();
}

for (const fixture of [
  ["ZSIRÁF", "ÉLŐ ÁLLAT, 6 HÓNAPOS, TENYÉSZTÉSI CÉLRA", "0106190000", false],
  ["MOBILTELEFON", "ANDROIDOS OKOS", "8517130000", true],
  ["TELEFON", "HAGYOMÁNYOS, NEM OKOS MOBILTELEFON", "8517140000", true],
  ["WI-FI ROUTER", "ADATOK VÉTELÉRE ÉS TOVÁBBÍTÁSÁRA", "8517620000", false],
]) {
  const [name, description, expected, mapped] = fixture;
  const result = await classify(name, description);
  if (result.code !== expected || result.status !== "classified")
    throw new Error(`${name}: várt ${expected}, kapott ${result.code}; ${result.clarification || ""}`);
  if (result.sourceValidation?.status !== "cross_checked" || !result.cnenEvidence?.length)
    throw new Error(`${name}: a besorolás nem futott át a CNEN-ellenőrzésen.`);
  if (Boolean(result.sourceValidation.mappedOlderCode) !== mapped)
    throw new Error(`${name}: hibás régi→aktuális kódmegfeleltetési jelzés.`);
  if (result.legalSources[0]?.authority !== "binding_nomenclature")
    throw new Error(`${name}: nem a kötelező nómenklatúra maradt az elsődleges forrás.`);
}

const exclusionResult = await classify(
  "Fémpolírozók",
  "Lábbeli-, bútor-, padló-, autókarosszéria-, üvegfényesítők vagy fémpolírozók; Más; Fémpolírozók",
);
if (exclusionResult.code !== "3405901000")
  throw new Error(`A „fémpolírozók kivételével” ág tévesen pozitív találat lett: ${exclusionResult.code}`);

console.log(`OK CNEN 2026 index: ${index.recordCount} szabályblokk, forráshierarchia és 2019→2026 kódmegfeleltetés`);
