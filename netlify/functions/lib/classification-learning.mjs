const sessions = new Map();
const candidates = new Map();

const normalize = (value) => String(value || "")
  .toLocaleLowerCase("hu")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const conceptTerms = {
  terrarium: ["terrarium", "allattarto terrarium", "novenyterrarium"],
  cage: ["kalitka", "madarkalitka", "allatketrec", "ketrec", "bird cage", "animal cage"],
  aquarium: ["akvarium", "haltarto medence", "halas akvarium", "fish tank"],
  sword: ["kard", "pallos", "pallos", "szablya", "katana", "szamurajkard", "szamuraj kard"],
};

const conceptKnowledge = {
  terrarium: { functions: ["szárazföldi élőlények vagy növények tartása"], productType: "terrárium" },
  cage: { functions: ["élő állat elhelyezése", "elkülönítés"], productType: "állattartó kalitka vagy ketrec" },
  aquarium: { functions: ["vízi élőlények tartása"], productType: "akvárium" },
  sword: { functions: ["kard jellegű szálfegyver"], productType: "kard" },
};

const materialTerms = {
  concrete: ["beton", "betonbol"],
  steel: ["acel", "acelbol", "rozsdamentes acel", "acelpenge"],
  leather: ["bor", "borbol"],
  plastic: ["muanyag", "muanyagbol", "szilikon", "gumi"],
  cotton: ["pamut", "pamutbol"],
  wood: ["fa", "fabol"],
  glass: ["uveg", "uvegbol"],
  textile: ["textil", "textilbol"],
};

const containsTerm = (text, term) => {
  const haystack = ` ${normalize(text)} `;
  const needle = normalize(term);
  return haystack.includes(` ${needle} `) || normalize(text).replace(/ /g, "").includes(needle.replace(/ /g, ""));
};

const ignoredDictionaryTerms = new Set(["anyag", "aru", "termek", "eszkoz", "keszulek", "szerkezet"]);
const materialAliases = {
  acel: "steel", vas: "steel", fem: "steel", "drot huzal": "steel",
  uveg: "glass", beton: "concrete", bor: "leather", muanyag: "plastic",
  gumi: "plastic", szilikon: "plastic", fa: "wood", textil: "textile",
  pamut: "cotton", gyapju: "textile", selyem: "textile", len: "textile",
};

function semanticMatches(name, combinedText, semanticIndex) {
  if (!semanticIndex?.lookup || !semanticIndex?.records) return [];
  const normalizedName = normalize(name);
  const normalizedCombined = ` ${normalize(combinedText)} `;
  const ids = new Set(semanticIndex.lookup[normalizedName] || []);
  for (const [term, recordIds] of Object.entries(semanticIndex.lookup)) {
    if (ids.size >= 8) break;
    if (term.length < 4 || ignoredDictionaryTerms.has(term)) continue;
    if (normalizedCombined.includes(` ${term} `)) for (const id of recordIds) ids.add(id);
  }
  return [...ids].map((id) => semanticIndex.records[id]).filter(Boolean)
    .sort((a, b) => (a.r === "H" ? -1 : 0) - (b.r === "H" ? -1 : 0)).slice(0, 8);
}

function dictionaryMaterials(matches) {
  const found = [];
  for (const match of matches) for (const raw of String(match.m || "").split(";")) {
    const key = normalize(raw);
    const mapped = materialAliases[key];
    if (mapped) found.push(mapped);
  }
  return [...new Set(found)];
}

export function analyzeProductInput(name, description, semanticIndex) {
  const combinedText = [name, description].filter(Boolean).join(" ").trim();
  const productTerms = [];
  let canonicalProduct = null;
  for (const [concept, terms] of Object.entries(conceptTerms)) {
    const matches = terms.filter((term) => containsTerm(combinedText, term));
    if (matches.length) {
      canonicalProduct = concept;
      productTerms.push(...matches);
    }
  }
  const matches = semanticMatches(name, combinedText, semanticIndex);
  const materials = [];
  for (const [material, terms] of Object.entries(materialTerms))
    if (terms.some((term) => containsTerm(combinedText, term))) materials.push(material);
  materials.push(...dictionaryMaterials(matches));
  const dictionaryFunctions = [...new Set(matches.map((item) => item.f).filter(Boolean))];
  const dictionaryCategories = [...new Set(matches.map((item) => item.c).filter(Boolean))];
  const dictionaryTerms = [...new Set(matches.flatMap((item) => [item.t, ...(item.s || [])]).filter(Boolean))];
  if (!canonicalProduct && matches.length) canonicalProduct = matches[0].n || normalize(matches[0].t);
  productTerms.push(...dictionaryTerms);
  return {
    originalName: String(name || "").trim(),
    originalDescription: String(description || "").trim(),
    combinedText,
    normalizedText: normalize(combinedText),
    productTerms: [...new Set(productTerms)],
    canonicalProduct,
    materials: [...new Set(materials)],
    semanticIndexVersion: semanticIndex?.version || null,
    semanticMatches: matches.map((item) => ({ term: item.t, relevance: item.r, category: item.c })),
    semanticTerms: dictionaryTerms.join(" "),
    semanticSearchText: [...dictionaryTerms, ...dictionaryCategories, ...dictionaryFunctions].join(" "),
    inferredFacts: {
      ...(conceptKnowledge[canonicalProduct] || {}),
      functions: [...new Set([...(conceptKnowledge[canonicalProduct]?.functions || []), ...dictionaryFunctions])],
      productType: conceptKnowledge[canonicalProduct]?.productType || dictionaryCategories[0] || null,
      construction: /acel\s*(?:sodrony|huzal)/.test(normalize(combinedText)) ? "acélhuzalból vagy acélsodronyból készült" : null,
      capacityLitres: normalize(combinedText).match(/\b(\d+(?:[.,]\d+)?)\s*(?:l|liter|literes)\b/)?.[1] ?? null,
    },
  };
}

export function beginClassification(name, description, semanticIndex) {
  const facts = analyzeProductInput(name, description, semanticIndex);
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessions.set(id, { id, createdAt: new Date().toISOString(), status: "processing", facts });
  if (sessions.size > 1000) sessions.delete(sessions.keys().next().value);
  return { id, facts };
}

export function finishClassification(sessionId, result) {
  const session = sessions.get(sessionId);
  if (!session) return result;
  session.status = result?.status || "unknown";
  session.resultCode = result?.code || null;
  session.finishedAt = new Date().toISOString();
  if (result?.status === "classified" && result.code && result.confidence === "magas") {
    const learnedTerms = [...new Set([...session.facts.productTerms, session.facts.originalName].map(normalize).filter((term) => term.length >= 3))];
    for (const term of learnedTerms) {
      const concept = session.facts.canonicalProduct || null;
      const key = `${concept || "unresolved"}:${term}:${result.code}`;
      const current = candidates.get(key) || {
        term, canonicalProduct: concept, taricCode: result.code,
        occurrences: 0, status: "candidate", firstSeenAt: new Date().toISOString(),
      };
      current.occurrences += 1;
      current.lastSeenAt = new Date().toISOString();
      candidates.set(key, current);
    }
  }
  return { ...result, sessionId, factsUsed: { ...(result.factsUsed || {}), extracted: session.facts } };
}

export function getLearningSnapshot() {
  return { sessions: [...sessions.values()], candidates: [...candidates.values()] };
}
