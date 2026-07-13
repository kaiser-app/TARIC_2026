import { SOURCE_AUTHORITY } from "./source-authority.mjs";

const digits = (value) => String(value || "").replace(/\D/g, "");

function candidateSourceCodes(currentCode, index) {
  const normalized = digits(currentCode);
  const currentEight = normalized.slice(0, 8);
  const mapped = (index.codeMappings || [])
    .filter((mapping) => mapping.current === currentEight)
    .map((mapping) => mapping.source);
  // A kódolt CNEN-forrás 5 és 7 jegyű gyűjtőszinteket is tartalmaz.
  // Ezek kihagyása esetén a magyarázat létezne az indexben, mégsem kerülne
  // a döntési bizonyítékok közé.
  const currentLevels = [8, 7, 6, 5, 4]
    .map((length) => normalized.slice(0, length))
    .filter((code) => code.length >= 4);
  return [...new Set([...mapped, ...currentLevels])];
}

export function findCnenEvidence(currentCode, index, limit = 4) {
  if (!currentCode || !index?.records || !index?.lookup) return [];
  const normalized = digits(currentCode);
  const sourceCandidates = candidateSourceCodes(normalized, index);
  const result = [];
  const seen = new Set();
  for (const sourceCode of sourceCandidates) {
    for (const id of index.lookup[sourceCode] || []) {
      if (seen.has(id)) continue;
      seen.add(id);
      const record = index.records[id];
      if (!record) continue;
      result.push({
        id: `cnen-${index.source.documentDate}-${id}`,
        authority: "cn_explanatory_note",
        authorityWeight: SOURCE_AUTHORITY.cn_explanatory_note,
        binding: false,
        currentCode: normalized,
        sourceCodes: record.c,
        heading: record.h,
        // A teljes szöveg a tartalomböngészőből érhető el; a tarifálási
        // válaszban korlátozott kivonatot adunk, hogy az API-válasz kicsi maradjon.
        excerpt: record.t.slice(0, 2000),
        ruleTypes: record.y,
        referencedCodes: record.r,
        pdfPage: record.p,
        printedPage: record.n,
        mappedFromOlderCode: !record.c.some((code) => normalized.startsWith(code)),
      });
      if (result.length >= limit) return result;
    }
  }
  return result;
}

function candidateCodes(payload) {
  return [...new Set([
    payload.code,
    ...(payload.path || []).map((row) => row.code),
    ...(payload.clarificationOptions || []).map((option) => option.candidateCode),
  ].filter(Boolean))];
}

export function attachClassificationSources(payload, index) {
  if (!payload || typeof payload !== "object") return payload;
  const evidence = [];
  const seen = new Set();
  for (const code of candidateCodes(payload).reverse()) {
    for (const item of findCnenEvidence(code, index)) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      evidence.push(item);
      if (evidence.length >= 4) break;
    }
    if (evidence.length >= 4) break;
  }
  const legalSources = [
    {
      id: "current-cn-taric",
      label: "Aktuális KN/TARIC nómenklatúra",
      authority: "binding_nomenclature",
      authorityWeight: SOURCE_AUTHORITY.binding_nomenclature,
      binding: true,
      role: "classification_decision",
      dataDate: payload.dataDate || null,
    },
  ];
  if (evidence.length) legalSources.push({
    id: `cnen-${index.source.documentDate}`,
    label: "KN Magyarázat (CNEN)",
    authority: "cn_explanatory_note",
    authorityWeight: SOURCE_AUTHORITY.cn_explanatory_note,
    binding: false,
    role: "interpretation_and_cross_check",
    celex: index.source.celex,
    documentDate: index.source.documentDate,
    consolidation: index.source.consolidation,
  });
  return {
    ...payload,
    legalSources,
    cnenEvidence: evidence,
    sourceValidation: {
      status: evidence.length ? "cross_checked" : "current_nomenclature_only",
      currentCodeEdition: index.source.currentCodeEdition,
      explanatoryNoteDate: index.source.documentDate,
      explanatoryNoteBinding: false,
      mappedOlderCode: evidence.some((item) => item.mappedFromOlderCode),
      authorityFloor: "binding_nomenclature",
    },
  };
}
