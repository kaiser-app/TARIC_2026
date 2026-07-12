import agent from "../netlify/functions/tariff-agent.mjs";
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
