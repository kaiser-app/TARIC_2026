import agent from "../netlify/functions/tariff-agent.mjs";

async function classify(name, description) {
  const response = await agent(new Request("http://local/api/tariff-agent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, description }),
  }));
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return response.json();
}

const fixtures = [
  {
    label: "bőr bakancs",
    name: "BŐR BAKANCS",
    description: "bőr felsőrész, gumitalp, nincs fém cipőorr, bokát takar, talpbélés hossza legalább 24 cm, férfi lábbeli",
    code: "6403919600",
    concept: "footwear",
  },
  {
    label: "bőr cipő",
    name: "BŐR CIPŐ",
    description: "bőr felsőrész, gumitalp, nincs fém cipőorr, bokát nem takar, talpbélés hossza legalább 24 cm, férfi lábbeli",
    code: "6403993600",
    concept: "footwear",
  },
  {
    label: "bőr surranó",
    name: "BŐR SURRANÓ",
    description: "bőr felsőrész, gumitalp, nincs fém cipőorr, bokát takar, talpbélés hossza legalább 24 cm, férfi lábbeli",
    code: "6403919600",
    concept: "footwear",
  },
  {
    label: "bőr topánka",
    name: "BŐR TOPÁNKA",
    description: "bőr felsőrész, gumitalp, nincs fém cipőorr, bokát nem takar, talpbélés hossza legalább 24 cm, női lábbeli",
    code: "6403993800",
    concept: "footwear",
  },
  {
    label: "szamurájkard",
    name: "SZAMURÁJKARD",
    description: "katana jellegű, acélból készült kard jellegű szálfegyver",
    code: "9307000000",
    concept: "sword",
  },
  {
    label: "elektromos kés",
    name: "ELEKTROMOS KÉS",
    description: "háztartási konyhai kés beépített elektromotorral",
    code: "8509800000",
    concept: "electric_knife",
  },
];

for (const fixture of fixtures) {
  const result = await classify(fixture.name, fixture.description);
  if (result.status !== "classified" || result.code !== fixture.code)
    throw new Error(`${fixture.label}: várt ${fixture.code}, kapott ${result.code}; kérdés: ${result.clarification || "nincs"}`);
  if (result.engine !== "profile-engine-v1")
    throw new Error(`${fixture.label}: nem az általános profilmotor futott (${result.engine})`);
  if (!result.factsUsed?.extracted?.concepts?.includes(fixture.concept))
    throw new Error(`${fixture.label}: a(z) ${fixture.concept} fogalom felismerése hiányzik`);
  console.log(`OK ${fixture.label} → ${fixture.code}`);
}
