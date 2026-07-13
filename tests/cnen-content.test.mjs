import handler from "../netlify/functions/cnen-content.mjs";

async function call(queryStringParameters = {}, httpMethod = "GET") {
  const response = await handler({ httpMethod, queryStringParameters });
  return { status: response.statusCode, data: JSON.parse(response.body) };
}

const browse = await call();
if (browse.status !== 200 || browse.data.recordCount !== 2533 || browse.data.results.length < 30)
  throw new Error("A KN-magyarázat alapértelmezett tallózólistája hiányos.");
if (!browse.data.results.every((record) => record.code.length === 4))
  throw new Error("Az alapértelmezett tallózásnak áruosztályszintű kódokkal kell indulnia.");

const codeSearch = await call({ q: "4202", limit: "50" });
if (codeSearch.status !== 200 || codeSearch.data.results[0]?.code !== "4202")
  throw new Error("A KN-kód szerinti keresésben nem az egzakt kód az első találat.");
if (!codeSearch.data.results.some((record) => record.code.startsWith("4202") && record.code.length > 4))
  throw new Error("A kód szerinti tallózás nem adja vissza az alszámokat.");

const textSearch = await call({ q: "mobile phones", limit: "20" });
if (!textSearch.data.results.some((record) => record.code === "85171200"))
  throw new Error("A teljes magyarázatszöveg szerinti keresés nem találja a mobiltelefon-szabályt.");

const phone = await call({ code: "85171300" });
if (phone.status !== 200 || phone.data.record.code !== "85171200" || phone.data.record.mappedFrom !== "85171300")
  throw new Error("A 2026-os okostelefon-kód nem követi a CNEN régi→aktuális megfeleltetést.");

const tabletCase = await call({ code: "84733080" });
if (!/does not include cases[\s\S]*heading 4202[\s\S]*constituent material/i.test(tabletCase.data.record.content))
  throw new Error("A teljes tartalmi nézet elveszítette a tablettok kizáró szabályát.");

const animal = await call({ code: "01061900" });
if (!/giraffes[\s\S]*dogs and cats/i.test(animal.data.record.content))
  throw new Error("Az élőállat-magyarázat tartalma hiányos.");

const missing = await call({ code: "99999999" });
if (missing.status !== 404) throw new Error("Nem létező magyarázó kódnál 404 válasz szükséges.");
const method = await call({}, "POST");
if (method.status !== 405) throw new Error("A tartalom API-nak el kell utasítania az író metódusokat.");

console.log("OK KN Magyarázó Megjegyzések: 2 533 rekord, kódos/textes keresés, teljes tartalom és kódmegfeleltetés");
