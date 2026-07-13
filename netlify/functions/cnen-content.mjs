import { loadCnenIndex } from "./lib/cnen-index-data.mjs";
import { readFile } from "node:fs/promises";

const nomenclatureUrl = new URL("../../data/generated/nomenclature-rows.json", import.meta.url);

const json = (status, payload) => new Response(JSON.stringify(payload), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=300, stale-while-revalidate=3600",
  },
});

const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 8);
const searchable = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

let preparedPromise;
function officialHungarianHeading(code, index, rowsByCode) {
  const exactDescriptions = (candidate) => (rowsByCode.get(candidate.padEnd(10, "0")) || [])
    .sort((left, right) => right.indent - left.indent)
    .map((row) => row.description)
    .filter(Boolean);
  const direct = exactDescriptions(code);
  if (direct.length) return direct[0];
  const mapped = (index.codeMappings || [])
    .filter((mapping) => mapping.source === code)
    .flatMap((mapping) => exactDescriptions(mapping.current));
  if (mapped.length) return [...new Set(mapped)].join(" / ");
  for (let length = Math.min(8, code.length - 1); length >= 4; length -= 1) {
    const parent = exactDescriptions(code.slice(0, length));
    if (parent.length) return parent[0];
  }
  return null;
}

async function preparedIndex() {
  if (!preparedPromise) preparedPromise = Promise.all([
    loadCnenIndex(),
    readFile(nomenclatureUrl, "utf8").then(JSON.parse),
  ]).then(([index, nomenclature]) => {
    const rowsByCode = new Map();
    for (const row of nomenclature.rows) {
      const list = rowsByCode.get(row.code) || [];
      list.push(row);
      rowsByCode.set(row.code, list);
    }
    const records = index.records.map((record) => {
      const code = record.c[0];
      const headingHu = officialHungarianHeading(code, index, rowsByCode);
      return {
        record, code, headingHu,
        headingSearch: searchable(`${record.h} ${headingHu || ""}`),
        textSearch: searchable(`${record.t} ${headingHu || ""}`),
      };
    });
    const chapterTitles = new Map();
    for (const row of nomenclature.rows.filter((item) => /^\d{2}0{8}$/.test(item.code) && item.description))
      if (!chapterTitles.has(row.code.slice(0, 2))) chapterTitles.set(row.code.slice(0, 2), row.description);
    return { index, records, chapterTitles };
  });
  return preparedPromise;
}

function summary(record, query = "", headingHu = null) {
  const normalizedQuery = searchable(query);
  const normalizedText = searchable(record.t);
  const foundAt = normalizedQuery ? normalizedText.indexOf(normalizedQuery) : -1;
  const start = foundAt > 180 ? Math.max(0, foundAt - 140) : 0;
  const rawSnippet = record.t.slice(start, start + 620);
  return {
    code: record.c[0],
    heading: record.h,
    headingHu,
    snippet: `${start ? "…" : ""}${rawSnippet}${record.t.length > start + 620 ? "…" : ""}`,
    ruleTypes: record.y,
    referencedCodes: record.r.slice(0, 12),
    contentLength: record.t.length,
  };
}

function browseSummary(item) {
  return {
    code: item.code,
    heading: item.record.h,
    headingHu: item.headingHu,
    ruleTypes: item.record.y,
  };
}

function detail(record, requestedCode, mappedFrom = null, headingHu = null) {
  return {
    requestedCode,
    mappedFrom,
    code: record.c[0],
    heading: record.h,
    headingHu,
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

export default async function handler(request = {}) {
  if ((request.method || request.httpMethod || "GET").toUpperCase() !== "GET")
    return json(405, { error: "A KN-magyarázat böngészője csak GET kérést fogad." });

  try {
    const { index, records, chapterTitles } = await preparedIndex();
    const params = request.url
      ? Object.fromEntries(new URL(request.url, "http://localhost").searchParams)
      : request.queryStringParameters || {};
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
      const item = records.find((candidate) => candidate.code === sourceCode);
      const record = item?.record;
      if (!record) return json(404, { error: "Ehhez a KN-kódhoz nincs külön magyarázó megjegyzés.", requestedCode });
      const children = records
        .filter((item) => item.code.startsWith(sourceCode) && item.code !== sourceCode)
        .slice(0, 100)
        .map((child) => summary(child.record, "", child.headingHu));
      return json(200, {
        source: index.source,
        recordCount: index.recordCount,
        record: detail(record, requestedCode, mappedFrom, item.headingHu),
        children,
      });
    }

    const query = String(params.q || "").trim().slice(0, 120);
    const queryDigits = /^\s*[\d\s.]+\s*$/.test(query) ? digits(query) : "";
    const offset = Math.max(0, Number.parseInt(params.offset || "0", 10) || 0);
    const limit = Math.min(100, Math.max(1, Number.parseInt(params.limit || "40", 10) || 40));
    let matches;
    if (!query) {
      const headings = records.filter((item) => item.code.length === 4);
      const chapters = [...new Set(headings.map((item) => item.code.slice(0, 2)))].sort().map((chapter) => ({
        code: chapter,
        headingHu: chapterTitles.get(chapter) || null,
        count: headings.filter((item) => item.code.startsWith(chapter)).length,
        items: headings.filter((item) => item.code.startsWith(chapter)).map(browseSummary),
      }));
      return json(200, {
        source: index.source, recordCount: index.recordCount, query: "",
        total: headings.length, offset: 0, limit: headings.length, chapters, results: [],
      });
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
      results: matches.slice(offset, offset + limit).map(({ item }) => summary(item.record, query, item.headingHu)),
    });
  } catch (error) {
    console.error("CNEN content API error", error);
    return json(500, { error: "A KN Magyarázó Megjegyzések indexe nem tölthető be." });
  }
}
