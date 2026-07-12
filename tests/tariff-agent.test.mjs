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
