import agent from "../netlify/functions/tariff-agent.mjs";
import { readFile } from "node:fs/promises";
import { analyzeProductInput } from "../netlify/functions/lib/classification-learning.mjs";
const response = await agent(new Request("http://local/api/tariff-agent", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "szamáröszvér", description: "élő állat" })
}));
const result = await response.json();
if (result.code !== "0101900000") throw new Error(`Várt 0101900000, kapott: ${result.code}`);
console.log("OK szamáröszvér → 0101900000");

const phoneCaseResponse = await agent(new Request("http://local/api/tariff-agent", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    name: "telefontok",
    description: "szilikon telefontok védő funkció 1 db, 5000 Ft, b2c forgalom"
  })
}));
const phoneCase = await phoneCaseResponse.json();
if (phoneCase.code !== "3926909790")
  throw new Error(`Várt 3926909790, kapott: ${phoneCase.code}`);
if (phoneCase.status === "clarification")
  throw new Error("A rendszer már megadott anyagra vagy funkcióra kérdezett vissza.");
console.log("OK szilikon védő telefontok → 3926909790");

const knifeResponse = await agent(new Request("http://local/api/tariff-agent", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    name: "vadászkés",
    description: "szarvasbőr védőtokkal, 5 mm vastag rozsdamentes acélból, csont berakásos nyéllel, nyúlásra vadászat, 1 db, 50 000 Ft"
  })
}));
const knife = await knifeResponse.json();
if (knife.code !== "8211920000")
  throw new Error(`Várt 8211920000, kapott: ${knife.code}`);
if (knife.status === "clarification")
  throw new Error("A rendszer a már megadott vadászati funkcióra vagy anyagra kérdezett.");
if (knife.path?.[1]?.description !== "Más")
  throw new Error(`A köztes egyvonalas szülősor hibás: ${knife.path?.[1]?.description}`);
console.log("OK rögzített pengéjű vadászkés → 8211920000");

const tshirtResponse = await agent(new Request("http://local/api/tariff-agent", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "pamut póló", description: "pamut póló" })
}));
const tshirt = await tshirtResponse.json();
if (tshirt.code !== "6109100010")
  throw new Error(`Várt 6109100010, kapott: ${tshirt.code}`);
if (tshirt.status === "clarification")
  throw new Error("A rendszer a pamut póló már megadott anyagára kérdezett.");
console.log("OK pamut póló → 6109100010");


const swordResponse = await agent(new Request("http://local/api/tariff-agent", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "pallós", description: "nagy kard, acélból" })
}));
const sword = await swordResponse.json();
if (sword.code !== "9307000000")
  throw new Error(`Várt 9307000000, kapott: ${sword.code}`);
if (sword.status === "clarification")
  throw new Error("A rendszer a leírásban már megadott anyagra kérdezett.");
if (!sword.factsUsed?.extracted?.materials?.includes("steel"))
  throw new Error("Az acél anyagot nem nyerte ki az egyesített szövegből.");
if (!sword.factsUsed?.extracted?.productTerms?.some((term) => term === "pallos"))
  throw new Error("A pallós szinonimát nem ismerte fel.");
console.log("OK pallós + nagy kard + acélból → 9307000000");


const impactCaseResponse = await agent(new Request("http://local/api/tariff-agent", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "MOBIL TELEFON TOK", description: "SZILIKONBÓL, ÜTÉSÁLLÓ, KÉK SZÍNŰ" })
}));
const impactCase = await impactCaseResponse.json();
if (impactCase.code !== "3926909790")
  throw new Error(`Várt 3926909790, kapott: ${impactCase.code}`);
if (impactCase.status === "clarification")
  throw new Error("Az ütésálló tulajdonságból nem ismerte fel a védő funkciót.");
console.log("OK mobiltelefon-tok + szilikonból + ütésálló → 3926909790");


const aquariumResponse = await agent(new Request("http://local/api/tariff-agent", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "AKVÁRIUM", description: "6 MM-ES ÜVEGBŐL, 100 LITERES FEDÉLLEL ÉS BEÉPÍTETT VILÁGÍTÁSSAL" })
}));
const aquarium = await aquariumResponse.json();
if (aquarium.code !== "7013990000")
  throw new Error(`Várt 7013990000, kapott: ${aquarium.code}`);
if (aquarium.status === "clarification")
  throw new Error("A rendszer nem használta fel az akvárium leírásában már megadott tényeket.");
if (aquarium.factsUsed?.capacityLitres !== "100" || aquarium.factsUsed?.glassThicknessMm !== "6")
  throw new Error("A méret- vagy kapacitásadat kinyerése hibás.");
console.log("OK 100 literes, 6 mm-es üvegakvárium világítással → 7013990000");


const cageResponse = await agent(new Request("http://local/api/tariff-agent", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "KALITKA", description: "NÉGYZETHÁLÓS ACÉL KALITKA, ACÉLSODRONYBÓL, 100 LITERES FEDÉLLEL, AJTÓVAL, ETETŐVEL ÉS BEÉPÍTETT VILÁGÍTÁSSAL" })
}));
const cage = await cageResponse.json();
if (cage.code !== "7326200090")
  throw new Error(`Várt 7326200090, kapott: ${cage.code}`);
if (cage.status === "clarification")
  throw new Error("A kalitka implicit rendeltetését vagy az acélsodrony szerkezetet nem ismerte fel.");
if (!cage.factsUsed?.function?.length || cage.factsUsed?.construction !== "acélsodrony")
  throw new Error("A szemantikai ténykinyerés hiányos.");
console.log("OK acélsodrony kalitka → 7326200090");


const terrariumResponse = await agent(new Request("http://local/api/tariff-agent", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "TERRÁRIUM", description: "500 LITERES, ÜVEG ÉS BETON" })
}));
const terrarium = await terrariumResponse.json();
if (terrarium.status !== "clarification")
  throw new Error("Az üveg-beton összetett terráriumnál a lényeges jelleg tisztázása szükséges.");
if (/rendeltetése|termékfajtája/.test(terrarium.clarification || ""))
  throw new Error("A rendszer visszakérdezett a terrárium megnevezéséből már ismert rendeltetésre.");
if (!/fő tartószerkezete|lényeges jellegét/.test(terrarium.clarification || ""))
  throw new Error("A kérdés nem a tarifálást eldöntő anyagi szerepre vonatkozik.");
if (terrarium.clarificationOptions?.length !== 2)
  throw new Error("Az üveg és beton választási lehetőségei hiányoznak.");
console.log("OK terrárium + üveg és beton → csak a lényeges jelleget tisztázza");


const semanticIndex = JSON.parse(await readFile(new URL("../data/generated/semantic-concepts-index.json", import.meta.url), "utf8"));
if (semanticIndex.version !== "V0P1" || semanticIndex.recordCount !== 2980)
  throw new Error("A V0P1 szemantikai index verziója vagy rekordszáma hibás.");
const claspFacts = analyzeProductInput("csat", "öv két részének összekapcsolására", semanticIndex);
if (!claspFacts.inferredFacts.functions.some((value) => value.includes("összekapcsolására")))
  throw new Error("A V0P1 indexből nem töltődött be a csat funkciója.");
if (!claspFacts.semanticMatches.some((value) => value.term === "csat"))
  throw new Error("A címszó-index nem találta meg a csat rekordját.");
console.log("OK V0P1 index: csat → összekapcsolási funkció");

const dictionaryCageFacts = analyzeProductInput("ketrec", "fémből készült", semanticIndex);
if (!dictionaryCageFacts.productTerms.some((value) => String(value).toLowerCase().includes("kalitka")))
  throw new Error("A szótári szinonima-index nem kapcsolta a ketrecet a kalitkához.");
console.log("OK V0P1 szinonima-index: ketrec → kalitka");


const indexedTerrariumResponse = await agent(new Request("http://local/api/tariff-agent", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "TERRÁRIUM", description: "8 MM-ES ÜVEGBŐL KÉSZÜLT, TETŐBEL ÉS VILÁGÍTÁSSAL, 200 LITERES" })
}));
const indexedTerrarium = await indexedTerrariumResponse.json();
if (indexedTerrarium.code !== "7013990000")
  throw new Error(`Várt 7013990000, kapott: ${indexedTerrarium.code}`);
if (indexedTerrarium.status === "clarification")
  throw new Error("A teljes üvegterráriumnál a feldolgozás indokolatlanul pontosító kérdést adott.");
if (!indexedTerrarium.factsUsed?.extracted?.semanticMatches?.some((item) => item.term === "terrárium"))
  throw new Error("A V0P1 index nem szolgáltatta a terrárium fogalmi rekordját.");
if (indexedTerrarium.factsUsed?.capacityLitres !== "200" || indexedTerrarium.factsUsed?.glassThicknessMm !== "8")
  throw new Error("A terrárium méret- vagy kapacitásadata nem került feldolgozásra.");
console.log("OK V0P1 terrárium + üveg + tető + világítás + 200 liter → 7013990000");


const pvcPhoneCaseResponse = await agent(new Request("http://local/api/tariff-agent", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "TELEFONTOK", description: "PVC-BŐL, ÜTÉSÁLLÓ FUNKCIÓVAL" })
}));
const pvcPhoneCase = await pvcPhoneCaseResponse.json();
if (pvcPhoneCase.code !== "3926909790")
  throw new Error(`Várt 3926909790, kapott: ${pvcPhoneCase.code}`);
if (pvcPhoneCase.status === "clarification" || pvcPhoneCase.clarification)
  throw new Error(`A PVC ütésálló telefontoknál nem kérdezhet: ${pvcPhoneCase.clarification}`);
if (!pvcPhoneCase.factsUsed?.extracted?.materials?.includes("plastic"))
  throw new Error("A PVC anyagot nem normalizálta műanyagként.");
console.log("OK telefontok + PVC-ből + ütésálló funkció → 3926909790, kérdés nélkül");

if (pvcPhoneCase.engine !== "profile-engine-v1")
  throw new Error(`A telefontok még nem az általános profilmotoron fut: ${pvcPhoneCase.engine}`);

const incompleteCaseResponse = await agent(new Request("http://local/api/tariff-agent", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "telefontok", description: "PVC-ből készült" })
}));
const incompleteCase = await incompleteCaseResponse.json();
if (incompleteCase.status !== "clarification" || !/védelmére|hordtáska|pénztárca/i.test(incompleteCase.clarification || ""))
  throw new Error(`A hiányzó funkcióra nem konkrét kérdés érkezett: ${incompleteCase.clarification}`);
if (/melyik további jellemző|tarifális ág/i.test(incompleteCase.clarification || ""))
  throw new Error("A kérdéskapu absztrakt tarifális kérdést tett fel.");
console.log("OK hiányos telefontok → konkrét funkciókérdés");

for (const [label, result] of [["pamut póló", tshirt], ["pallós", sword], ["akvárium", aquarium], ["kalitka", cage], ["terrárium", indexedTerrarium]]) {
  if (result.engine !== "profile-engine-v1") throw new Error(`${label} nem az általános profilmotoron fut: ${result.engine}`);
}
console.log("OK korábbi termékesetek → általános profilmotor");

const footwearResponse = await agent(new Request("http://local/api/tariff-agent", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "bőr bakancs", description: "bőr felsőrész, gumitalp, nincs fém cipőorr, talpbélés hossza legalább 24 cm, férfi lábbeli" })
}));
const footwear = await footwearResponse.json();
if (footwear.code !== "6403919600" || footwear.engine !== "profile-engine-v1")
  throw new Error(`A bőr bakancs nem az általános profilmotoron osztályozódott: ${footwear.code}, ${footwear.engine}`);
console.log("OK bőr bakancs → általános profilmotor → 6403919600");
