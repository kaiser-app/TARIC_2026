import handler from "../netlify/functions/cnen-content.mjs";

async function call(queryStringParameters = {}, httpMethod = "GET") {
  const params = new URLSearchParams(queryStringParameters);
  const response = await handler(new Request(`http://local/api/cnen-content?${params}`, { method: httpMethod }));
  return { status: response.status, data: await response.json() };
}

const browse = await call();
if (browse.status !== 200 || browse.data.recordCount !== 25820 || browse.data.chapters?.length < 50)
  throw new Error("A 25 820 soros KN10-magyarázat alapértelmezett tallózólistája hiányos.");
if (browse.data.results.length || !browse.data.chapters.every((chapter) => chapter.code.length === 2
  && chapter.items.every((record) => record.code.length === 4)))
  throw new Error("Az alapértelmezett tallózásnak összecsukott, kétjegyű KN-fejezetekkel kell indulnia.");

const codeSearch = await call({ q: "4202", limit: "50" });
if (codeSearch.status !== 200 || codeSearch.data.results[0]?.code !== "4202")
  throw new Error("A KN-kód szerinti keresésben nem az egzakt 4202 fejléc az első találat.");
if (!codeSearch.data.results.some((record) => record.codes?.some((code) => code.startsWith("4202"))))
  throw new Error("A kód szerinti tallózás nem adja vissza a 4202 alatti sorokat.");

const textSearch = await call({ q: "telephone sets", limit: "20" });
if (!textSearch.data.results.some((record) => record.snippet))
  throw new Error("Az angol magyarázatszöveg szerinti keresés nem működik.");
const huTextSearch = await call({ q: "távbeszélő-készülék", limit: "20" });
if (!huTextSearch.data.results.some((record) => record.snippetHu))
  throw new Error("A magyar magyarázatszöveg szerinti keresés nem működik.");

const phone = await call({ code: "8517130000" });
if (phone.status !== 200 || !phone.data.records?.length
  || !phone.data.records.some((record) => /telephone sets/i.test(record.content)
    && /távbeszélő-készülék/i.test(record.contentHu)))
  throw new Error("Az élő 8517130000 kódlekérdezés kétnyelvű tartalma hiányos.");
const animal = await call({ code: "0106190000" });
if (animal.status !== 200 || !animal.data.records?.some((record) => /giraffes/i.test(record.content)
  && /zsiráf/i.test(record.contentHu)))
  throw new Error("Az élőállat-magyarázat kétnyelvű tartalma hiányos.");

const coverage = await call({ coverage: "1" });
if (coverage.status !== 200 || coverage.data.recordCount !== 25820
  || coverage.data.coverage.missingRows !== 6282
  || coverage.data.pairing.matchedRows !== 25820
  || coverage.data.pairing.uniqueExplanationKeys !== 2447)
  throw new Error("A 25 820 soros lefedettségi API vagy párosítási metaadat hibás.");
const missingList = await call({ missing: "1", limit: "5" });
if (missingList.status !== 200 || missingList.data.total !== 6282
  || missingList.data.results.some((record) => record.status !== "no_explanatory_note"))
  throw new Error("A magyarázat nélküli KN10-sorok API-ja hibás.");

const missing = await call({ code: "7777777777" });
if (missing.status !== 404) throw new Error("Nem létező KN10-kódnál 404 válasz szükséges.");
const method = await call({}, "POST");
if (method.status !== 405) throw new Error("A tartalom API-nak el kell utasítania az író metódusokat.");

console.log("OK kétnyelvű KN10 magyarázat: 25 820 sor, nyelvi keresés, kódlekérdezés és hiánylista");
