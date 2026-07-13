import { loadCnenIndex } from "./lib/cnen-index-data.mjs";

const json = (statusCode, payload) => ({
  statusCode,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=300, stale-while-revalidate=3600",
  },
  body: JSON.stringify(payload),
});

const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 8);
const searchable = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

let preparedPromise;
async function preparedIndex() {
  if (!preparedPromise) preparedPromise = loadCnenIndex().then((index) => ({
    index,
    records: index.records.map((record) => ({
      record,
      code: record.c[0],
      headingSearch: searchable(record.h),
      textSearch: searchable(record.t),
    })),
  }));
  return preparedPromise;
}

function summary(record, query = "") {
  const normalizedQuery = searchable(query);
  const normalizedText = searchable(record.t);
  const foundAt = normalizedQuery ? normalizedText.indexOf(normalizedQuery) : -1;
  const start = foundAt > 180 ? Math.max(0, foundAt - 140) : 0;
  const rawSnippet = record.t.slice(start, start + 620);
  return {
    code: record.c[0],
    heading: record.h,
    snippet: `${start ? "…" : ""}${rawSnippet}${record.t.length > start + 620 ? "…" : ""}`,
    ruleTypes: record.y,
    referencedCodes: record.r.slice(0, 12),
    contentLength: record.t.length,
  };
}

function detail(record, requestedCode, mappedFrom = null) {
  return {
    requestedCode,
    mappedFrom,
    code: record.c[0],
    heading: record.h,
    content: record.t,
    ruleTypes: record.y,
    referencedCodes: record.r,
    pdfPage: record.p,
    printedPage: record.n,
  };
}

function scoreText(item, query) {
  const terms = searchable(query).split(/\s+/).filter(Boolean);
  if (!terms.length || !terms.every((term) => item.textSearch.includes(term))) return 0;
  const phrase = terms.join(" ");
  let score = 100;
  if (item.headingSearch === phrase) score += 900;
  else if (item.headingSearch.startsWith(phrase)) score += 600;
  else if (item.headingSearch.includes(phrase)) score += 400;
  else if (item.textSearch.includes(phrase)) score += 200;
  score += terms.filter((term) => item.headingSearch.includes(term)).length * 80;
  return score;
}

export default async function handler(event = {}) {
  if ((event.httpMethod || "GET").toUpperCase() !== "GET")
    return json(405, { error: "A KN-magyarázat böngészője csak GET kérést fogad." });

  try {
    const { index, records } = await preparedIndex();
    const params = event.queryStringParameters || {};
    const requestedCode = digits(params.code);
    if (requestedCode) {
      let sourceCode = requestedCode;
      let mappedFrom = null;
      if (!index.lookup[sourceCode]) {
        const mapping = (index.codeMappings || []).find((item) => item.current === sourceCode);
        if (mapping) {
          mappedFrom = requestedCode;
          sourceCode = mapping.source;
        }
      }
      const record = index.records[index.lookup[sourceCode]?.[0]];
      if (!record) return json(404, { error: "Ehhez a KN-kódhoz nincs külön magyarázó megjegyzés.", requestedCode });
      const children = records
        .filter((item) => item.code.startsWith(sourceCode) && item.code !== sourceCode)
        .slice(0, 100)
        .map((item) => summary(item.record));
      return json(200, {
        source: index.source,
        recordCount: index.recordCount,
        record: detail(record, requestedCode, mappedFrom),
        children,
      });
    }

    const query = String(params.q || "").trim().slice(0, 120);
    const queryDigits = /^\s*[\d\s.]+\s*$/.test(query) ? digits(query) : "";
    const offset = Math.max(0, Number.parseInt(params.offset || "0", 10) || 0);
    const limit = Math.min(100, Math.max(1, Number.parseInt(params.limit || "40", 10) || 40));
    let matches;
    if (!query) {
      matches = records.filter((item) => item.code.length === 4).map((item) => ({ item, score: 1 }));
    } else if (queryDigits) {
      matches = records
        .filter((item) => item.code.startsWith(queryDigits))
        .map((item) => ({ item, score: item.code === queryDigits ? 1000 : 800 - item.code.length }));
    } else {
      matches = records
        .map((item) => ({ item, score: scoreText(item, query) }))
        .filter(({ score }) => score > 0);
    }
    matches.sort((a, b) => b.score - a.score || a.item.code.localeCompare(b.item.code));
    return json(200, {
      source: index.source,
      recordCount: index.recordCount,
      query,
      total: matches.length,
      offset,
      limit,
      results: matches.slice(offset, offset + limit).map(({ item }) => summary(item.record, query)),
    });
  } catch (error) {
    console.error("CNEN content API error", error);
    return json(500, { error: "A KN Magyarázó Megjegyzések indexe nem tölthető be." });
  }
}
