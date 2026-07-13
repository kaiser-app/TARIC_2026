import { readFile } from "node:fs/promises";
import { beginClassification, finishClassification } from "./lib/classification-learning.mjs";
import { decideByProfiles } from "./lib/tariff-decision-engine.mjs";
const norm = (s) =>
    String(s || "")
      .toLocaleLowerCase("hu")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""),
  headers = { "content-type": "application/json; charset=utf-8" };
const accessoryRole = (value) => {
  const tokens = norm(value).replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const suffixes = ["tok", "tarto", "taska", "doboz", "huzat", "burkolat", "alkatresz"];
  return tokens.some((token) => suffixes.includes(token)
    || suffixes.some((suffix) => token.length > suffix.length + 2 && token.endsWith(suffix)));
};
let classificationDataPromise;
const loadClassificationData = () => classificationDataPromise ??= Promise.all([
  readFile(new URL("../../data/generated/taric-index.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../../data/generated/nomenclature-rows.json", import.meta.url), "utf8").then(JSON.parse),
  Promise.all([
    readFile(new URL("../../data/generated/semantic-concepts-index.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../../data/generated/semantic-concepts-supplement.json", import.meta.url), "utf8").then(JSON.parse),
  ]).then(([base, supplement]) => {
    const offset = base.records.length;
    const lookup = Object.fromEntries(Object.entries(base.lookup).map(([term, ids]) => [term, [...ids]]));
    for (const [term, ids] of Object.entries(supplement.lookup))
      lookup[term] = [...new Set([...(lookup[term] || []), ...ids.map((id) => id + offset)])];
    return {
      ...base,
      version: `${base.version}+${supplement.version}`,
      source: `${base.source}; ${supplement.source}`,
      records: [...base.records, ...supplement.records],
      lookup,
      recordCount: base.records.length + supplement.records.length,
    };
  }),
]);
export default async (request) => {
  if (request.method !== "POST")
    return new Response(JSON.stringify({ error: "POST szükséges" }), {
      status: 405,
      headers,
    });
  const b = await request.json(),
    name = String(b.name || "").trim(),
    description = String(b.description || "").trim();
  if (!name)
    return new Response(JSON.stringify({ error: "A terméknév kötelező." }), {
      status: 400,
      headers,
    });
  const [index, nom, semanticIndex] = await loadClassificationData();
  const classificationSession = beginClassification(name, description, semanticIndex);
  const respond = (payload, init) => Response.json(finishClassification(classificationSession.id, payload), init);
  const supplied = norm(name + " " + description);
  const profileDecision = decideByProfiles(classificationSession.facts, nom, index.dataDate);
  if (profileDecision) return respond(profileDecision);
  const suppliedFacts = {
    materials: [...new Set([
      ...classificationSession.facts.materials,
      ...["pamut", "gyapjú", "selyem", "len", "szilikon", "gumi", "műanyag", "rozsdamentes acél", "acél", "fém", "csont", "bőr", "fa", "üveg", "textil"]
        .filter((value) => supplied.includes(norm(value))),
    ])],
    functions: [...new Set([
      ...(classificationSession.facts.inferredFacts.functions || []),
      ...["védő", "burkoló", "vadászat", "konyhai", "háztartási", "díszítő", "ipari", "ruházati", "szállítás", "tárolás"]
        .filter((value) => supplied.includes(norm(value))),
      ...(classificationSession.facts.inferredFacts.attributes.protective ? ["védő"] : []),
    ])],
    quantity: supplied.match(/\b(\d+)\s*db\b/)?.[1] ?? null,
    valueHuf: supplied.match(/\b(\d[\d ]*)\s*ft\b/)?.[1]?.replace(/ /g, "") ?? null,
    traffic: supplied.includes("b2c") ? "b2c" : supplied.includes("b2b") ? "b2b" : null,
  };
  const synonymText = [
    classificationSession.facts.semanticSearchText || "",
  ].join(" ");
  const ignored = new Set(["b2b","b2c","import","export","datum","vamertek","mennyiseg","szarmazas","irany","forgalom","harmadik","orszag","fekete","feher","piros","voros","kek","zold","sarga","barna","szurke","lila","rozsaszin","atlatszo","szines"]);
  const nameWords = norm(name + " " + (classificationSession.facts.semanticTerms || "")).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !ignored.has(w));
  const descriptionWords = norm(description + synonymText).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !ignored.has(w));
  const words = [...new Set([...nameWords, ...descriptionWords])],
    scored = [];
  const animalAttributes = classificationSession.facts.inferredFacts?.attributes || {};
  const hasAnimalTaxonomy = Boolean(animalAttributes.animalGroup || animalAttributes.animalClass || animalAttributes.tariffSpecies);
  const excludesLiveAnimalChapter = hasAnimalTaxonomy
    && !["unknown", "live"].includes(animalAttributes.animalState);
  for (const r of index.records) {
    if (!r.descriptionHu) continue;
    if (excludesLiveAnimalChapter && r.vtsz.startsWith("01")) continue;
    const d = norm(r.descriptionHu);
    let score = 0;const descriptionTokens=d.split(/[^a-z0-9]+/).filter(Boolean);
    let nameMatches=0;
    for (const w of words) {
      const matched=descriptionTokens.includes(w)||(w.length>=6&&descriptionTokens.some(token=>token.startsWith(w)));
      if(matched){const inName=nameWords.includes(w);score += w.length*(inName?4:1);if(inName)nameMatches++;}
    }
    if(nameWords.length && !nameMatches)continue;
    if (score) scored.push({ ...r, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const roots = scored.slice(0, 25),
    prefixes = [...new Set(roots.map((r) => r.vtsz.slice(0, 4)))],
    hierarchy = nom.rows
      .filter((r) => prefixes.includes(r.code.slice(0, 4)))
      .slice(0, 500)
      .map((r) => ({
        code: r.code,
        line: r.indent,
        productLine: r.productLine,
        description: r.description,
      }));
  if (!hierarchy.length) {
    const knownMaterials = classificationSession.facts.materials;
    const knownFunction = classificationSession.facts.inferredFacts?.functions?.length;
    const mixedMaterial = knownMaterials.length > 1;
    return respond({
      status: "clarification",
      clarification: mixedMaterial
        ? "Több anyagot is felismertem. Melyik anyagból készült a termék fő tartószerkezete vagy tartályrésze, amely az áru lényeges jellegét adja?"
        : !knownMaterials.length
          ? "Milyen anyag adja a termék fő tömegét vagy lényeges jellegét?"
          : !knownFunction
            ? "Mire használják elsődlegesen a terméket a szokásos működése során?"
            : "A termék kész, önállóan használható áru, egy másik termék alkatrésze, vagy további feldolgozásra szánt alapanyag?",
      clarificationOptions: mixedMaterial
        ? knownMaterials.map((material) => ({
            id: `essential_${material}`,
            label: ({ glass: "Üveg", concrete: "Beton", steel: "Acél", plastic: "Műanyag", wood: "Fa", leather: "Bőr", textile: "Textil" })[material] || material,
            appendText: `a termék lényeges jellegét adó fő tartószerkezet vagy tartály anyaga: ${material}`,
          }))
        : !knownMaterials.length
          ? [
              { id: "material_plastic", label: "Műanyag / PVC / szilikon", appendText: "fő anyaga műanyag" },
              { id: "material_metal", label: "Vas / acél / más fém", appendText: "fő anyaga vas, acél vagy más fém" },
              { id: "material_glass", label: "Üveg", appendText: "fő anyaga üveg" },
              { id: "material_leather", label: "Bőr", appendText: "fő anyaga bőr" },
              { id: "material_textile", label: "Textil", appendText: "fő anyaga textil" },
              { id: "material_wood", label: "Fa", appendText: "fő anyaga fa" },
            ]
          : !knownFunction
            ? [
                { id: "function_protect", label: "Védelem / burkolás", appendText: "elsődleges rendeltetése védelem vagy burkolás" },
                { id: "function_hold", label: "Tárolás / tartás", appendText: "elsődleges rendeltetése tárolás vagy tartás" },
                { id: "function_cut", label: "Vágás / megmunkálás", appendText: "elsődleges rendeltetése vágás vagy megmunkálás" },
                { id: "function_clothing", label: "Ruházati használat", appendText: "elsődleges rendeltetése ruházati használat" },
                { id: "function_machine", label: "Gépi / elektromos működés", appendText: "elsődleges rendeltetése gépi vagy elektromos működés" },
              ]
            : [
                { id: "state_finished", label: "Kész, önálló áru", appendText: "kész, önállóan használható áru" },
                { id: "state_part", label: "Alkatrész", appendText: "más termék kizárólagos vagy főként használt alkatrésze" },
                { id: "state_material", label: "Alapanyag / félkész", appendText: "további feldolgozásra szánt alapanyag vagy félkész termék" },
              ],
      reasoning: mixedMaterial
        ? "A rendeltetés már ismert; a GRI 3 b) alkalmazásához az összetett áru lényeges jellegét adó anyagot kell meghatározni."
        : undefined,
      factsUsed: { extracted: classificationSession.facts },
    });
  }
  const atomic = norm(name);
  const suppliedIsAccessory = accessoryRole(`${name} ${description}`);
  const normalizedSuppliedContext = norm(`${name} ${description}`).replace(/[^a-z0-9]+/g, " ").trim();
  const ambiguousExactName = new Set([
    ...index.records.filter((record) => norm(record.descriptionHu).trim() === atomic.trim()).map((record) => record.vtsz),
    ...nom.rows.filter((row) => norm(row.description).trim() === atomic.trim()).map((row) => row.code),
  ]).size > 1;
  const root = hierarchy.find(
    (row) => row.line === 0
      && norm(row.description).includes(atomic)
      && (suppliedIsAccessory || !accessoryRole(row.description))
      && (!ambiguousExactName || normalizedSuppliedContext.includes(norm(row.description).replace(/[^a-z0-9]+/g, " ").trim())),
  );
  if (root) {
    const branch = root.code.slice(0, 4);
    const children = hierarchy.filter(
      (row) => row.line === 1 && row.code.startsWith(branch),
    );
    const specific = children.find((row) =>
      norm(row.description).split(/[^a-z0-9]+/).includes(atomic),
    );
    if (specific)
      return respond({
        status: "classified",
        code: specific.code,
        confidence: "magas",
        path: [root, specific],
        reasoning: "GRI 1: pontos egyezés az egyvonalas alszámmal.",
        clarification: null,
        dataDate: index.dataDate,
      });
    const residual = children.find((row) => norm(row.description) === "mas");
    if (residual && !children.some((row) => norm(row.description).includes(atomic)))
      return respond({
        status: "classified",
        code: residual.code,
        confidence: "magas",
        path: [root, residual],
        reasoning:
          "GRI 1 és 6: egyik konkrét testvéralszám sem alkalmazható, ezért a Más maradék alszám következik.",
        clarification: null,
        dataDate: index.dataDate,
      });
  }
  // Helyi, adatbázis-vezérelt tartalék helyett ez az elsődleges döntési réteg.
  // Nem talál ki kódot: a NAV nómenklatúra legjobb ágait mutatja, és csak a
  // következő hierarchiaszintet eldöntő terméktulajdonságra kérdez rá.
  const candidates = [];
  const seen = new Set();
  for (const row of scored) {
    if (seen.has(row.vtsz)) continue;
    seen.add(row.vtsz);
    const nomRow = nom.rows.find((item) => item.code === row.vtsz);
    candidates.push({
      code: row.vtsz,
      line: nomRow?.indent ?? 0,
      description: row.descriptionHu || nomRow?.description || "",
      score: row.score,
    });
    if (candidates.length === 5) break;
  }
  const topPrefixes = [...new Set(candidates.map((item) => item.code.slice(0, 4)))];
  const exactName = norm(name).trim();
  const suppliedTokens = new Set(norm(`${name} ${description}`).split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !ignored.has(word)));
  const exactByCode = new Map();
  const normalizedSupplied = norm(`${name} ${description}`).replace(/[^a-z0-9]+/g, " ").trim();
  const exactRecords = [
    ...index.records.map((record) => ({ code: record.vtsz, description: record.descriptionHu })),
    ...nom.rows.map((row) => ({ code: row.code, description: row.description })),
  ];
  for (const record of exactRecords) {
    if (norm(record.description).trim() !== exactName) continue;
    const rootsForCode = nom.rows.filter((row) => row.indent === 0 && row.code.startsWith(record.code.slice(0, 4)));
    const rankedRoots = rootsForCode.map((row) => {
      const normalizedRoot = norm(row.description).replace(/[^a-z0-9]+/g, " ").trim();
      const contextScore = (normalizedRoot.length >= 12 && normalizedSupplied.includes(normalizedRoot) ? 1000 : 0) + norm(row.description).split(/[^a-z0-9]+/)
        .filter((word) => word.length > 2 && !ignored.has(word) && suppliedTokens.has(word))
        .reduce((score, word) => score + word.length, 0);
      return { description: row.description, contextScore };
    }).sort((a, b) => b.contextScore - a.contextScore);
    const { description: rootDescription = "", contextScore = 0 } = rankedRoots[0] || {};
    const current = exactByCode.get(record.code);
    if (!current || contextScore > current.contextScore)
      exactByCode.set(record.code, { code: record.code, description: record.description, contextScore, rootDescription });
  }
  const exactRanked = [...exactByCode.values()].sort((a, b) => b.contextScore - a.contextScore);
  const exactCandidate = exactRanked.length === 1
    ? exactRanked[0]
    : exactRanked[0]?.contextScore >= 12 && exactRanked[0].contextScore >= (exactRanked[1]?.contextScore || 0) + 6
      ? exactRanked[0]
      : null;
  if (exactCandidate) {
    const exactRows = nom.rows.filter((row) => row.code === exactCandidate.code).sort((a, b) => a.indent - b.indent);
    const rootRow = nom.rows.find((row) => row.indent === 0
      && row.code.startsWith(exactCandidate.code.slice(0, 4))
      && row.description === exactCandidate.rootDescription);
    return respond({
      status: "classified", code: exactCandidate.code, confidence: "magas",
      path: [rootRow, exactRows.at(-1)].filter(Boolean).map((row) => ({ code: row.code, line: row.indent, productLine: row.productLine, description: row.description })),
      reasoning: exactRanked.length === 1
        ? "GRI 1: a termék megnevezése egyetlen NAV-nómenklatúra-sorral egyezik pontosan."
        : "GRI 1: a több helyen előforduló pontos termékmegnevezést a teljes leírás és a vámtarifaszám fejezetszövege egyértelműsítette.",
      clarification: null, factsUsed: suppliedFacts, dataDate: index.dataDate,
      engine: "exact-nomenclature-match-v1",
    });
  }
  let clarification;
  let clarificationOptions;
  if (!suppliedFacts.materials.length) {
    clarification = "Milyen anyagból készült az áru? Ha több anyagból áll, melyik adja a lényeges jellegét?";
    const materialPool = [
      ["cotton", "Pamut", "pamutból készült"], ["plastic", "Műanyag", "műanyagból készült"],
      ["steel", "Fém / acél", "fémből vagy acélból készült"], ["leather", "Bőr", "bőrből készült"],
      ["wood", "Fa", "fából készült"], ["glass", "Üveg", "üvegből készült"],
      ["rubber", "Gumi / szilikon", "gumiból vagy szilikonból készült"], ["textile", "Más textil", "textilanyagból készült"],
    ];
    const candidateText = norm(candidates.map((item) => item.description).join(" "));
    const preferred = materialPool.filter(([, label]) => candidateText.includes(norm(label.split(" /")[0])));
    const selected = [...preferred, ...materialPool.filter((item) => !preferred.includes(item))].slice(0, 6);
    clarificationOptions = selected.map(([id, label, appendText]) => ({ id: `material_${id}`, label, appendText }));
  } else if (!suppliedFacts.functions.length) {
    clarification = "Mi az áru elsődleges funkciója vagy felhasználási célja?";
    clarificationOptions = [
      { id: "function_protective", label: "Védő / burkoló", appendText: "elsődleges funkciója védő vagy burkoló" },
      { id: "function_household", label: "Háztartási", appendText: "háztartási használatra" },
      { id: "function_industrial", label: "Ipari", appendText: "ipari felhasználásra" },
      { id: "function_clothing", label: "Ruházati", appendText: "ruházati rendeltetésű" },
      { id: "function_decorative", label: "Díszítő", appendText: "díszítő funkciójú" },
      { id: "function_transport", label: "Szállítás / tárolás", appendText: "szállításra vagy tárolásra szolgál" },
    ];
  } else {
    clarification = "A termék az alábbi konkrét kialakítások közül melyiknek felel meg?";
    clarificationOptions = candidates.slice(0, 5).map((item) => ({
      id: `candidate_${item.code}`,
      label: item.description.length > 72 ? `${item.description.slice(0, 69)}…` : item.description,
      appendText: `pontos fajtája: ${item.description}`,
      candidateCode: item.code,
    }));
  }
  return respond({
    status: "clarification",
    code: null,
    confidence: "alacsony",
    path: candidates.map(({ score, ...item }) => item),
    reasoning: topPrefixes.length
      ? `A NAV nómenklatúrában a legerősebb jelölt ágak: ${topPrefixes.join(", ")}. A végkódhoz további, tarifálást eldöntő termékjellemző szükséges.`
      : "A megadott leírásból nem választható ki biztonságosan nómenklatúra-ág.",
    clarification,
    clarificationOptions,
    factsUsed: suppliedFacts,
    dataDate: index.dataDate,
    engine: "semantic-index-v0p1",
    semanticIndex: { version: semanticIndex.version, records: semanticIndex.recordCount },
  });
};
