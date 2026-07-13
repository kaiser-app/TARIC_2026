import { buildEuTaricUrl } from "../src/taric-link.js";

const example = buildEuTaricUrl({ code: "0101 90 00 00", date: "2026-07-13", lang: "hu" });
const expected = "https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=hu&Taric=0101900000&SimDate=20260713";
if (example !== expected) throw new Error(`Az EU TARIC link eltér a várt formátumtól: ${example}`);

const english = buildEuTaricUrl({ code: "8517130000", date: "2026-07-14", lang: "en" });
if (!english.includes("Lang=en&Taric=8517130000&SimDate=20260714"))
  throw new Error(`Az angol EU TARIC link hibás: ${english}`);

const partial = buildEuTaricUrl({ code: "8517", date: "2026-07-14", lang: "hu" });
if (partial.includes("Taric=")) throw new Error("Részleges kód nem kerülhet végleges TARIC-paraméterként a linkbe.");
if (!partial.endsWith("Lang=hu&SimDate=20260714")) throw new Error(`A dátumos alaplink hibás: ${partial}`);

console.log("OK EU TARIC link: Lang + 10 jegyű Taric + YYYYMMDD SimDate");
