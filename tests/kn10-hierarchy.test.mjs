// A megbeszélt KN10 hierarchia-szabályok tesztjei:
//  - verem-bejárás (VTSZ ↑, INDENT ↑, PRODUCT_LINE ↑) → teljes őslánc
//  - "Más"-feloldás a nevesített testvérekből
//  - a tarifáló ügynök teljes vonalas útvonalat és breadcrumbot ad vissza
import { readFile } from "node:fs/promises";
import { buildKn10Hierarchy } from "../netlify/functions/lib/kn10-hierarchy.mjs";
import nomenclatureTree from "../netlify/functions/nomenclature-tree.mjs";
import agent from "../netlify/functions/tariff-agent.mjs";

const nomenclature = JSON.parse(await readFile(new URL("../data/generated/nomenclature-rows.json", import.meta.url), "utf8"));
const hierarchy = buildKn10Hierarchy(nomenclature);

// 1) Szamáröszvér — sekély ág: a "Más" = nem Ló, nem Szamár
const mule = hierarchy.breadcrumb("0101900000");
if (mule.map((step) => step.description).join(" › ") !== "ÉLŐ ÁLLATOK › Élő ló, szamár, lóöszvér (muli) és szamáröszvér › Más")
  throw new Error(`Hibás szamáröszvér-útvonal: ${mule.map((s) => s.description).join(" › ")}`);
const muleLeaf = mule[mule.length - 1];
if (!/nem:.*Ló/.test(muleLeaf.residualResolution || "") || !/Szamár/.test(muleLeaf.residualResolution || ""))
  throw new Error(`Hibás Más-feloldás: ${muleLeaf.residualResolution}`);
console.log("OK szamáröszvér: teljes útvonal + Más-feloldás (nem Ló, nem Szamár)");

// 2) Szilikon telefontok — háromszoros "Más"-lánc a 3926 ágon
const phoneCasePath = hierarchy.breadcrumb("3926909790");
const residualCount = phoneCasePath.filter((step) => step.residualResolution).length;
if (residualCount !== 3)
  throw new Error(`A 3926909790 útvonalán 3 Más-feloldást vártunk, kaptunk: ${residualCount}`);
if (!phoneCasePath[0].isChapter || phoneCasePath[0].code !== "3900000000")
  throw new Error("A breadcrumb nem az árucsoporttól indul.");
console.log("OK telefontok: háromszoros Más-lánc feloldva, árucsoporttól induló breadcrumb");

// 3) Elektromos kés — a Más-feloldás kizárja az őrlőt/keverőt/lékivonót
const knife = hierarchy.breadcrumb("8509800000");
const knifeLeaf = knife[knife.length - 1];
if (!/lelmiszer/i.test(knifeLeaf.residualResolution || ""))
  throw new Error(`Hibás 8509 80 Más-feloldás: ${knifeLeaf.residualResolution}`);
console.log("OK elektromos kés: 8509 80 Más-feloldás a nevesített testvérekből");

// 4) Mély szarvasmarha-ág — a közbenső fejlécsorok (PL 10/20) is az útvonal részei
const deep = hierarchy.breadcrumb("0102295911");
if (deep.length < 9)
  throw new Error(`A 0102295911 útvonala túl rövid (${deep.length} szint) — a közbenső fejlécsorok hiányoznak.`);
if (!deep.some((step) => step.description.includes("Üsző")) || !deep.some((step) => /300\D?kg/.test(step.description)))
  throw new Error("A mély szarvasmarha-útvonalból hiányzik az üsző- vagy tömegszint.");
console.log(`OK mély ág: 0102295911 → ${deep.length} szintű teljes útvonal`);

// 5) nomenclature-tree endpoint: kontextusfa a kiválasztott sorral és bevallhatósággal
const treeResponse = await nomenclatureTree(new Request("http://local/api/nomenclature-tree?path=0101900000"));
const treeData = await treeResponse.json();
if (treeResponse.status !== 200 || !treeData.contextTree?.some((row) => row.role === "selected"))
  throw new Error("A kontextusfa nem jelöli a kiválasztott sort.");
if (!treeData.contextTree.some((row) => row.role === "sibling" && row.description === "Szamár"))
  throw new Error("A kontextusfából hiányzik a Szamár testvérsor.");
if (!treeData.residualNote?.includes("GRI 6"))
  throw new Error("A Más-ág GRI 6 megjegyzése hiányzik.");
console.log("OK nomenclature-tree: kontextusfa, testvérek, GRI 6 megjegyzés");

// 6) Tarifáló ügynök: a besorolt eredmény teljes vonalas útvonalat és breadcrumbot ad
const response = await agent(new Request("http://local/api/tariff-agent", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "telefontok", description: "szilikon telefontok védő funkció, b2c" }),
}));
const result = await response.json();
if (result.code !== "3926909790") throw new Error(`Várt 3926909790, kapott: ${result.code}`);
if (!Array.isArray(result.path) || result.path.length < 4)
  throw new Error(`Az ügynök útvonala nem a teljes lánc (${result.path?.length} sor).`);
if (result.path.some((row) => row.code.startsWith("39") === false))
  throw new Error("Az ügynök útvonala kilóg a 39-es ágból.");
if (!result.breadcrumb?.length || !result.residualNote?.includes("GRI 6"))
  throw new Error("Az ügynök válaszából hiányzik a breadcrumb vagy a Más-szabály megjegyzése.");
const lines = result.path.map((row) => Number(row.line));
if (lines[0] !== 0 || lines.some((line, i) => i > 0 && line <= lines[i - 1] && result.path[i].code !== result.path[i - 1].code))
  throw new Error(`Az útvonal vonalszintjei nem monotonok: ${lines.join(",")}`);
console.log("OK tarifáló ügynök: teljes vonalas útvonal + breadcrumb + GRI 6 megjegyzés");

console.log("Minden KN10 hierarchia-teszt sikeres.");
