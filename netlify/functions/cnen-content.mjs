import { readFile } from "node:fs/promises";
import { loadCnenIndex } from "./lib/cnen-index-data.mjs";

const nomenclatureUrl = new URL("../../data/generated/nomenclature-rows.json", import.meta.url);
const missingUrl = new URL("../../data/generated/cnen-missing.json", import.meta.url);

const json = (status, payload) => new Response(JSON.stringify(payload), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=300, stale-while-revalidate=3600",
  },
});

const digits = (value, limit = 10) => String(value || "").replace(/\D/g, "").slice(0, limit);
const searchable = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();
const displaySourceCode = (record) => (record.c || []).join(record.s === "range" ? "–" : " / ");

let preparedPromise;
async function preparedIndex() {
  if (!preparedPromise) preparedPromise = Promise.all([
    loadCnenIndex(),
    readFile(nomenclatureUrl, "utf8").then(JSON.parse),
    readFile(missingUrl, "utf8").then(JSON.parse),
  ]).then(([index, nomenclature, missing]) => {
    const chapterTitles = new Map();
    for (const row of (nomenclature.rows || []).filter((item) => /^\d{2}0{8}$/.test(item.code) && item.description))
      if (!chapterTitles.has(row.code.slice(0, 2))) chapterTitles.set(row.code.slice(0, 2), row.description);
    const records = index.records.map((record) => ({
      record,
      code: record.c?.[0] || "",
      codeSearch: (record.c || []).join(" "),
      headingSearch: searchable(`${record.h || ""} ${record.hHu || ""}`),
      textSearch: searchable(`${record.t || ""} ${record.tHu || ""} ${(record.c || []).join(" ")}`),
    }));
    return { index, records, chapterTitles, missing };
  });
  return preparedPromise;
}

function textSnippet(text, query = "") {
  const normalizedQuery = searchable(query);
  const normalizedText = searchable(text);
  const foundAt = normalizedQuery ? normalizedText.indexOf(normalizedQuery) : -1;
  const start = foundAt > 180 ? Math.max(0, foundAt - 140) : 0;
  const rawSnippet = String(text || "").slice(start, start + 620);
  return `${start ? "…" : ""}${rawSnippet}${String(text || "").length > start + 620 ? "…" : ""}`;
}

function summary(record, query = "") {
  return {
    id: record.id,
    code: record.c?.[0] || "",
    codes: record.c || [],
    codeExpression: displaySourceCode(record),
    scopeType: record.s || "single",
    scopeDiscrepancy: Boolean(record.d),
    heading: record.h,
    headingHu: record.hHu,
    snippet: textSnippet(record.t, query),
    snippetHu: textSnippet(record.tHu, query),
    ruleTypes: record.y || [],
    referencedCodes: (record.r || []).slice(0, 12),
    contentLength: String(record.t || "").length,
    contentLengthHu: String(record.tHu || "").length,
  };
}

function detail(record, requestedCode = null) {
  return {
    ...summary(record),
    requestedCode,
    content: record.t,
    contentHu: record.tHu,
    sourceScopeEn: record.se,
    sourceScopeHu: record.sh,
    pdfPage: record.p,
    printedPage: record.n,
    pdfPageHu: record.pHu,
    printedPageHu: record.nHu,
    mappedFrom: requestedCode && !(record.c || []).some((code) => digits(requestedCode).startsWith(code)) ? requestedCode : null,
  };
}

function scoreText(item, query) {
  const terms = searchable(query).split(/\s+/).filter(Boolean);
  if (!terms.length || !terms.every((term) => item.textSearch.includes(term) || item.headingSearch.includes(term))) return 0;
  const phrase = terms.join(" ");
  let score = 100;
  if (item.headingSearch === phrase) score += 900;
  else if (item.headingSearch.startsWith(phrase)) score += 600;
  else if (item.headingSearch.includes(phrase)) score += 400;
  else if (item.textSearch.includes(phrase)) score += 200;
  score += terms.filter((term) => item.headingSearch.includes(term)).length * 80;
  return score;
}

function recordsForCurrentCode(index, requestedCode) {
  const normalized = digits(requestedCode);
  const cn8 = normalized.slice(0, 8);
  const ids = index.currentLookup?.[cn8] || [];
  if (ids.length) return ids.map((id) => index.records[id]).filter(Boolean);
  const sourceCandidates = [8, 6, 4].map((length) => cn8.slice(0, length)).filter((code) => code.length >= 4);
  const sourceIds = [...new Set(sourceCandidates.flatMap((code) => index.lookup?.[code] || []))];
  return sourceIds.map((id) => index.records[id]).filter(Boolean);
}

export default async function handler(request = {}) {
  if ((request.method || request.httpMethod || "GET").toUpperCase() !== "GET")
    return json(405, { error: "A KN-magyarázat böngészője csak GET kérést fogad." });

  try {
    const { index, records, chapterTitles, missing } = await preparedIndex();
    const params = request.url
      ? Object.fromEntries(new URL(request.url, "http://localhost").searchParams)
      : request.queryStringParameters || {};

    if (params.coverage === "1") return json(200, {
      source: index.source,
      recordCount: index.recordCount,
      coverage: index.coverage,
      pairing: index.pairing,
      unmappedSourceRecords: index.unmappedSourceRecords || [],
      missingDownloadUrl: "/cnen-missing.csv",
    });

    if (params.missing === "1") {
      const query = String(params.q || "").trim().slice(0, 120);
      const normalizedQuery = searchable(query);
      const offset = Math.max(0, Number.parseInt(params.offset || "0", 10) || 0);
      const limit = Math.min(1000, Math.max(1, Number.parseInt(params.limit || "100", 10) || 100));
      const matches = (missing.records || []).filter((item) => !normalizedQuery
        || searchable(`${item.code} ${item.displayCode} ${item.descriptionHu}`).includes(normalizedQuery));
      return json(200, {
        source: index.source,
        coverage: missing.coverage || index.coverage,
        query,
        total: matches.length,
        offset,
        limit,
        results: matches.slice(offset, offset + limit),
        downloadUrl: "/cnen-missing.csv",
      });
    }

    const requestedCode = digits(params.code);
    if (requestedCode) {
      const applicable = recordsForCurrentCode(index, requestedCode);
      if (!applicable.length) return json(404, {
        error: "Ehhez a KN-kódhoz nincs alkalmazható magyarázó megjegyzés.",
        requestedCode,
        status: "no_applicable_cnen_note",
      });
      const detailed = applicable.map((record) => detail(record, requestedCode));
      return json(200, {
        source: index.source,
        recordCount: index.recordCount,
        coverage: index.coverage,
        requestedCode,
        record: detailed[0],
        records: detailed,
        inheritedCount: Math.max(0, detailed.length - 1),
      });
    }

    const query = String(params.q || "").trim().slice(0, 120);
    const queryDigits = /^\s*[\d\s.]+\s*$/.test(query) ? digits(query) : "";
    const offset = Math.max(0, Number.parseInt(params.offset || "0", 10) || 0);
    const limit = Math.min(100, Math.max(1, Number.parseInt(params.limit || "40", 10) || 40));
    let matches;
    if (!query) {
      const headings = records.filter((item) => item.record.s === "single" && item.code.length === 4);
      const chapters = [...new Set(headings.map((item) => item.code.slice(0, 2)))].sort().map((chapter) => ({
        code: chapter,
        headingHu: chapterTitles.get(chapter) || null,
        count: headings.filter((item) => item.code.startsWith(chapter)).length,
        items: headings.filter((item) => item.code.startsWith(chapter)).map((item) => summary(item.record)),
      }));
      return json(200, {
        source: index.source,
        recordCount: index.recordCount,
        coverage: index.coverage,
        query: "",
        total: headings.length,
        offset: 0,
        limit: headings.length,
        chapters,
        results: [],
        missingDownloadUrl: "/cnen-missing.csv",
      });
    }
    if (queryDigits) {
      const applicableIds = queryDigits.length >= 8 ? index.currentLookup?.[queryDigits.slice(0, 8)] || [] : [];
      const applicable = new Set(applicableIds);
      matches = records
        .filter((item) => applicable.has(item.record.id) || (item.record.c || []).some((code) => code.startsWith(queryDigits)))
        .map((item) => ({ item, score: applicable.has(item.record.id) ? 1200 + Number(item.record.sp || 0) : 800 - item.code.length }));
    } else {
      matches = records
        .map((item) => ({ item, score: scoreText(item, query) }))
        .filter(({ score }) => score > 0);
    }
    matches.sort((a, b) => b.score - a.score || a.item.code.localeCompare(b.item.code) || a.item.record.id - b.item.record.id);
    return json(200, {
      source: index.source,
      recordCount: index.recordCount,
      coverage: index.coverage,
      query,
      total: matches.length,
      offset,
      limit,
      results: matches.slice(offset, offset + limit).map(({ item }) => summary(item.record, query)),
      missingDownloadUrl: "/cnen-missing.csv",
    });
  } catch (error) {
    console.error("CNEN content API error", error);
    return json(500, { error: "A kétnyelvű KN Magyarázó Megjegyzések indexe nem tölthető be." });
  }
}
