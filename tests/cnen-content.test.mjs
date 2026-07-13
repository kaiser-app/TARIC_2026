import handler from "../netlify/functions/cnen-content.mjs";

async function call(queryStringParameters = {}, httpMethod = "GET") {
  const params = new URLSearchParams(queryStringParameters);
  const response = await handler(new Request(`http://local/api/cnen-content?${params}`, { method: httpMethod }));
  return { status: response.status, data: await response.json() };
}

const browse = await call();
if (browse.status !== 200 || browse.data.recordCount !== 2672 || browse.data.chapters?.length < 50)
  throw new Error("A kétnyelvű KN-magyarázat alapértelmezett tallózólistája hiányos.");
if (browse.data.results.length || !browse.data.chapters.every((chapter) => chapter.code.length === 2
  && chapter.items.every((record) => record.code.length === 4)))
  throw new Error("Az alapértelmezett tallózásnak összecsukott, kétjegyű KN-fejezetekkel kell indulnia.");
if (!browse.data.chapters.some((chapter) => chapter.items.some((item) => item.headingHu)))
  throw new Error("A tartalomböngészőből hiányoznak a magyar KN-magyarázatok.");
if (!browse.data.coverage || !browse.data.missingDownloadUrl)
  throw new Error("A lefedettségi adat vagy a hiánylista hivatkozása hiányzik.");

const codeSearch = await call({ q: "4202", limit: "50" });
if (codeSearch.status !== 200 || codeSearch.data.results[0]?.code !== "4202")
  throw new Error("A KN-kód szerinti keresésben nem az egzakt kód az első találat.");
if (!codeSearch.data.results[0]?.headingHu)
  throw new Error("A kód szerinti találatból hiányzik a magyar cím.");
if (!codeSearch.data.results.some((record) => record.codes?.some((code) => code.startsWith("4202")) && record.code.length > 4))
  throw new Error("A kód szerinti tallózás nem adja vissza az alszámokat.");

const textSearch = await call({ q: "mobile phones", limit: "20" });
if (!textSearch.data.results.some((record) => record.codes?.includes("85171200")))
  throw new Error("A teljes angol magyarázatszöveg szerinti keresés nem találja a mobiltelefon-szabályt.");
const huTextSearch = await call({ q: "mobiltelefon", limit: "20" });
if (!huTextSearch.data.results.some((record) => record.headingHu || record.snippetHu))
  throw new Error("A magyar magyarázatszöveg szerinti keresés nem működik.");

const phone = await call({ code: "85171300" });
if (phone.status !== 200 || !phone.data.records?.some((record) => record.codes?.includes("85171200")))
  throw new Error("A 2026-os okostelefon-kód nem követi a CNEN régi→aktuális megfeleltetést.");
if (!phone.data.records.every((record) => record.content && record.contentHu))
  throw new Error("Az élő kódlekérdezésből hiányzik valamelyik nyelvi változat.");

const tabletCase = await call({ code: "84733080" });
if (!tabletCase.data.records?.some((record) => /does not include cases[\s\S]*heading 4202[\s\S]*constituent material/i.test(record.content)))
  throw new Error("A teljes tartalmi nézet elveszítette a tablettok kizáró szabályát.");

const animal = await call({ code: "01061900" });
if (!animal.data.records?.some((record) => /giraffes[\s\S]*dogs and cats/i.test(record.content))
  || !animal.data.records?.some((record) => /zsiráf[\s\S]*(kutya|macska)/i.test(record.contentHu)))
  throw new Error("Az élőállat-magyarázat kétnyelvű tartalma hiányos.");

const coverage = await call({ coverage: "1" });
if (coverage.status !== 200 || coverage.data.coverage.missingKn8 < 0
  || coverage.data.pairing.matched !== 2671
  || coverage.data.pairing.monolingualSupplemental !== 1
  || coverage.data.pairing.generalRecords !== 41)
  throw new Error("A lefedettségi API vagy a párosítási metaadat hibás.");
const missingList = await call({ missing: "1", limit: "5" });
if (missingList.status !== 200 || missingList.data.total !== coverage.data.coverage.missingKn8
  || missingList.data.downloadUrl !== "/cnen-missing.csv")
  throw new Error("A magyarázat nélküli KN-kódok API-ja hibás.");

const missing = await call({ code: "99999999" });
if (missing.status !== 404) throw new Error("Nem létező vagy magyarázat nélküli kódnál 404 válasz szükséges.");
const method = await call({}, "POST");
if (method.status !== 405) throw new Error("A tartalom API-nak el kell utasítania az író metódusokat.");

console.log("OK kétnyelvű KN Magyarázat: 2 672 rekord, élő kódlekérdezés, lefedettség és hiánylista");
