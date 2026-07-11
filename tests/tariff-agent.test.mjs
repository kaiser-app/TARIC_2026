import agent from "../netlify/functions/tariff-agent.mjs";
const response = await agent(new Request("http://local/api/tariff-agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "szamáröszvér", description: "élő állat" }) }));
const result = await response.json();
if (result.code !== "0101900000") throw new Error(`Várt 0101900000, kapott: ${result.code}`);
console.log("OK szamáröszvér → 0101900000");
