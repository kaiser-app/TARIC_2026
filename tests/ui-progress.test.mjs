import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const stages = [
  'setProgressStage("classification")',
  'setProgressStage("calculation")',
  'setProgressStage("measures")',
];
for (const stage of stages)
  if (!source.includes(stage)) throw new Error(`Hiányzó folyamatállapot: ${stage}`);

const labels = [
  "Betarifálás folyamatban…",
  "Közteher-kalkuláció folyamatban…",
  "Kapcsolódó intézkedések feldolgozása…",
];
for (const label of labels)
  if (!source.includes(label)) throw new Error(`Hiányzó folyamatfelirat: ${label}`);

if (!source.includes("{progressLabel}</button>"))
  throw new Error("A gomb nem az aktuális folyamatfeliratot jeleníti meg.");
if (!source.includes("setProgressStage(null)"))
  throw new Error("A folyamatállapot nem áll vissza befejezéskor.");

console.log("OK háromszakaszos folyamatjelző a betarifálási gombon");

for (const marker of ['group.type === "AAF"', 'variants: aafGroups', 'group.variants.length} {L("verzió"', 'variant.additionalCodes?.join'])
  if (!source.includes(marker)) throw new Error(`Hiányzó AAF-verziócsoportosítás: ${marker}`);
console.log("OK AAF sorok egy sorba csoportosítva, lenyitható kiegészítő kódokkal");

for (const marker of ["grid-template-columns:60px minmax(0,1fr) 90px 100px", "text-align:right", "width:100px"])
  if (!styles.includes(marker)) throw new Error(`Hiányzó fix kód-/jelvényoszlop igazítás: ${marker}`);
console.log("OK intézkedési kódok jobb széle fix függőleges vonalra igazítva");
