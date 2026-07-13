const sessions = new Map();
const candidates = new Map();

const normalize = (value) => String(value || "")
  .toLocaleLowerCase("hu")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const conceptTerms = {
  live_animal: ["kutya", "eb", "puli", "dog", "macska", "hazimacska", "cat"],
  eyewear: ["szemuveg", "napszemuveg", "vedoszemuveg", "latasjavito szemuveg", "glasses", "sunglasses"],
  phone_case: ["telefontok", "telefon tok", "mobiltelefontok", "mobil telefon tok", "phone case"],
  tshirt: ["polo", "t shirt", "tshirt"],
  hunting_knife: ["vadaszkes", "vadasz kes"],
  kitchen_knife: ["konyhakes", "konyhai kes", "szakacskes", "szakacs kes"],
  electric_knife: ["elektromoskes", "elektromos kes", "villanykes", "motoros kes"],
  footwear: ["bakancs", "cipo", "surrano", "topanka", "labbeli"],
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
  steel: ["acel", "acelbol", "rozsdamentes acel", "acelpenge", "acelsodrony", "acelhuzal", "femsodrony", "femhuzal", "vasdrot"],
  leather: ["bor", "borbol"],
  plastic: ["muanyag", "muanyagbol", "szilikon", "gumi", "pvc", "pvcbol", "polivinil klorid"],
  cotton: ["pamut", "pamutbol"],
  wood: ["fa", "fabol"],
  glass: ["uveg", "uvegbol"],
  textile: ["textil", "textilbol"],
};

const containsTerm = (text, term) => {
  const haystack = ` ${normalize(text)} `;
  const needle = normalize(term);
  if (!needle) return false;
  if (haystack.includes(` ${needle} `)) return true;
  if (!needle.includes(" ") && needle.length >= 4) {
    const allowedSuffixes = ["bol", "tol", "rol", "ban", "ben", "val", "vel", "kent", "nak", "nek", "os", "es", "as", "i"];
    const tokens = normalize(text).split(" ").filter(Boolean);
    if (tokens.some((token) => allowedSuffixes.some((suffix) => token === `${needle}${suffix}`))) return true;
  }
  // Egybeírt összetételeket csak több szóból álló ismert fogalomnál kapcsolunk
  // össze (pl. „mobil telefon tok” → „mobiltelefontok”). Az egy szavas,
  // különösen rövid szinonimák nem egyezhetnek más szavak belsejében
  // (pl. „eb” az „ebbe”, „póló” a „hajápoló” szóban).
  return needle.includes(" ") && needle.replace(/ /g, "").length >= 6
    && normalize(text).replace(/ /g, "").includes(needle.replace(/ /g, ""));
};

const mentionsAccessoryRole = (value) => {
  const suffixes = ["tok", "tarto", "taska", "doboz", "huzat", "burkolat", "alkatresz"];
  return normalize(value).split(" ").some((token) => suffixes.includes(token)
    || suffixes.some((suffix) => token.length > suffix.length + 2 && token.endsWith(suffix)));
};

const animalStateFrom = (value) => {
  const text = normalize(value);
  if (/\belo\b/.test(text)) return "live";
  if (/\b(?:eledel|allateledel|takarmany|tap|jutalomfalat|ragoka|poraz|nyakorv|ham|szajkosar|jatekszer|gyogyszer)\b/.test(text)) return "animal_product";
  if (/\b(?:feldolgozott|elkeszitett|keszitmeny|konzerv|konzervalt|kikeszitett|cserzett|szaritott|aszalt|sozott|fustolt)\b/.test(text)) return "processed";
  if (/\b(?:fagyasztott|melyhutott)\b/.test(text)) return "frozen";
  if (/\b(?:friss|hutott)\b/.test(text)) return "fresh_chilled";
  if (/\b(?:hus|vagott|felezett|felbevagott|feltest)\b|hasitott test/.test(text)) return "carcass_meat";
  if (/\b(?:szorme|műszorme|muszorme|szor|gyapju|bor|bel|belsoseg|ver|tej)\b|\b(?:szorebol|gyapjabol|borbol)\b/.test(text)) return "animal_product";
  if (/\b\d+(?:[.,]\d+)?\s*(?:eves|honapos|hetes)\b|\b(?:torzskonyvezett|fajtatiszta|tenyesztesre|him|nosteny)\b/.test(text)) return "live";
  return "unknown";
};
const mentionsLiveAnimal = (value) => animalStateFrom(value) === "live";
const mentionsAnimalProductRole = (value) => !["unknown", "live"].includes(animalStateFrom(value));

const ignoredDictionaryTerms = new Set([
  "anyag", "aru", "termek", "eszkoz", "keszulek", "szerkezet",
  "fekete", "feher", "piros", "voros", "kek", "zold", "sarga", "barna", "szurke", "lila", "rozsaszin", "atlatszo", "szines",
]);
const materialAliases = {
  acel: "steel", vas: "steel", fem: "steel", "drot huzal": "steel",
  uveg: "glass", beton: "concrete", bor: "leather", muanyag: "plastic",
  gumi: "plastic", szilikon: "plastic", pvc: "plastic", "polivinil klorid": "plastic", fa: "wood", textil: "textile",
  pamut: "cotton", gyapju: "textile", selyem: "textile", len: "textile",
};

function semanticMatches(name, combinedText, semanticIndex) {
  if (!semanticIndex?.lookup || !semanticIndex?.records) return [];
  const normalizedName = normalize(name);
  const nameWords = normalizedName.split(" ").filter(Boolean);
  const words = normalize(combinedText).split(" ").filter((word) => word && !ignoredDictionaryTerms.has(word));
  const ids = new Set(semanticIndex.lookup[normalizedName] || []);
  const addNgrams = (tokens) => {
    for (let size = Math.min(4, tokens.length); size >= 1 && ids.size < 8; size--)
      for (let start = 0; start + size <= tokens.length && ids.size < 8; start++) {
        const term = tokens.slice(start, start + size).join(" ");
        if (term.length < 4 || ignoredDictionaryTerms.has(term)) continue;
        for (const id of semanticIndex.lookup[term] || []) ids.add(id);
      }
  };
  addNgrams(nameWords);
  if (!ids.size) {
    const compactName = normalizedName.replace(/ /g, "");
    for (const [term, recordIds] of Object.entries(semanticIndex.lookup)) {
      const compactTerm = term.replace(/ /g, "");
      if (compactTerm.length < 5 || ignoredDictionaryTerms.has(term)) continue;
      if (compactName.endsWith(compactTerm) || compactName.startsWith(compactTerm))
        for (const id of recordIds) ids.add(id);
      if (ids.size >= 8) break;
    }
  }
  if (!ids.size) addNgrams(words);
  const ranked = [...ids].map((id) => semanticIndex.records[id]).filter(Boolean)
    .sort((a, b) => (a.r === "H" ? -1 : 0) - (b.r === "H" ? -1 : 0));
  const highRelevance = ranked.filter((record) => record.r === "H");
  return (highRelevance.length ? highRelevance : ranked).slice(0, 8);
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
  const concepts = [];
  let canonicalProduct = null;
  for (const [concept, terms] of Object.entries(conceptTerms)) {
    const nameMatches = terms.filter((term) => containsTerm(name, term));
    const descriptionMatches = terms.filter((term) => containsTerm(description, term));
    const matches = nameMatches.length
      ? concept === "live_animal" && mentionsAnimalProductRole(combinedText) && !mentionsLiveAnimal(combinedText) ? [] : nameMatches
      : mentionsAccessoryRole(description)
        ? []
        : descriptionMatches;
    if (matches.length) {
      canonicalProduct = concept;
      concepts.push(concept);
      productTerms.push(...matches);
    }
  }
  const matches = semanticMatches(name, combinedText, semanticIndex);
  const indexedConcepts = matches.map((item) => item.concept).filter((concept) => concept
    && !(concept === "live_animal" && mentionsAnimalProductRole(combinedText) && !mentionsLiveAnimal(combinedText))
    && !((mentionsAccessoryRole(name) || mentionsAccessoryRole(description))
      && !(conceptTerms[concept] || []).some((term) => containsTerm(name, term))
      && concept !== "phone_case"));
  concepts.push(...indexedConcepts);
  if (!canonicalProduct && indexedConcepts.length) canonicalProduct = indexedConcepts[0];
  if (/\belo allat\b/.test(normalize(combinedText)) && !concepts.includes("live_animal")) {
    concepts.push("live_animal");
    productTerms.push("élő állat");
    if (!canonicalProduct) canonicalProduct = "live_animal";
  }
  const indexedAttributes = Object.assign({}, ...matches.map((item) => item.a).filter(Boolean));
  const materials = [];
  for (const [material, terms] of Object.entries(materialTerms))
    if (terms.some((term) => containsTerm(combinedText, term))) materials.push(material);
  const dictionaryMaterialHints = dictionaryMaterials(matches);
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
    concepts: [...new Set(concepts)],
    materials: [...new Set(materials)],
    materialHints: dictionaryMaterialHints,
    semanticIndexVersion: semanticIndex?.version || null,
    semanticMatches: matches.map((item) => ({ term: item.t, relevance: item.r, category: item.c, concept: item.concept || null })),
    semanticTerms: dictionaryTerms.join(" "),
    semanticSearchText: [...dictionaryTerms, ...dictionaryCategories, ...dictionaryFunctions].join(" "),
    inferredFacts: {
      ...(conceptKnowledge[canonicalProduct] || {}),
      functions: [...new Set([...(conceptKnowledge[canonicalProduct]?.functions || []), ...dictionaryFunctions])],
      productType: conceptKnowledge[canonicalProduct]?.productType || dictionaryCategories[0] || null,
      construction: /acel\s*(?:sodrony|huzal)/.test(normalize(combinedText)) ? "acélhuzalból vagy acélsodronyból készült" : null,
      capacityLitres: normalize(combinedText).match(/\b(\d+(?:[.,]\d+)?)\s*(?:l|liter|literes)\b/)?.[1] ?? null,
      thicknessMm: normalize(combinedText).match(/\b(\d+(?:[.,]\d+)?)\s*mm\b/)?.[1] ?? null,
      attributes: {
        protective: /vedo|vedelem|boritas|burkolat|utesallo|utesved|karcallo|vizallo|porallo|leejtes|razkodasallo|shockproof|impact resistant/.test(normalize(combinedText)),
        electric: /elektromos|villany|motoros|beepitett elektromotor/.test(normalize(combinedText)),
        foldingBlade: /osszecsukhato|behajthato|zsebkes|nem mereven rogzitett/.test(normalize(combinedText)),
        fixedBlade: /rogzitett penge|fix penge|merev penge|merevpenge/.test(normalize(combinedText)) ||
          (/(?:rozsdamentes )?acel/.test(normalize(combinedText)) && /\b\d+(?:[.,]\d+)?\s*mm\b/.test(normalize(combinedText)) && !/osszecsukhato|behajthato|zsebkes/.test(normalize(combinedText))),
        wireConstruction: /(?:acel|vas|fem)\s*(?:sodrony|huzal)|drot/.test(normalize(combinedText)),
        leatherSole: /bor (?:kulso )?talp|bortalp/.test(normalize(combinedText)),
        rubberPlasticSole: /gumi|muanyag (?:kulso )?talp|gumitalp/.test(normalize(combinedText)),
        metalToe: /fem (?:vedo )?cipoo?rr|fem labujjvedo/.test(normalize(combinedText)) && !/nincs|nelkul/.test(normalize(combinedText)),
        metalToeKnown: /fem (?:vedo )?cipoo?rr|fem labujjvedo|nincs fem|fem nelkul/.test(normalize(combinedText)),
        coversAnkle: (/bokat takar|bakancs/.test(normalize(combinedText))) && !/nem takar/.test(normalize(combinedText)),
        ankleKnown: /bokat takar|bokat nem takar|bokanal alacsony|bakancs/.test(normalize(combinedText)),
        leatherUpper: /bor fels|borbol keszult fels|bor felsoresz/.test(normalize(combinedText)),
        insoleUnder24: /24 cm nel kisebb/.test(normalize(combinedText)),
        insoleAtLeast24: /legalabb 24 cm/.test(normalize(combinedText)),
        mensFootwear: /ferfi labbeli|ferfi cipo|ferfi bakancs/.test(normalize(combinedText)),
        womensFootwear: /noi labbeli|noi cipo|noi bakancs/.test(normalize(combinedText)),
        finishedGood: /kesztermek|kesz aru|hasznalatra kesz|onalloan hasznalhato/.test(normalize(combinedText)),
        essentialMaterial: /uveg.{0,50}(?:lenyeges jelleget ad|adja a lenyeges jelleget|fo tartalyfal)/.test(normalize(combinedText)) ? "glass"
          : /beton.{0,50}(?:lenyeges jelleget ad|adja a lenyeges jelleget|fo tartoszerkezet)/.test(normalize(combinedText)) ? "concrete"
          : /muanyag.{0,50}(?:lenyeges jelleget ad|adja a lenyeges jelleget|fo tartalyfal)/.test(normalize(combinedText)) ? "plastic"
          : null,
        sunglasses: Boolean(indexedAttributes.sunglasses) || /napszemuveg|napvedo szemuveg/.test(normalize(combinedText)),
        correctiveEyewear: Boolean(indexedAttributes.correctiveEyewear) || /dioptrias|latasjavito|korrekcios/.test(normalize(combinedText)),
        protectiveEyewear: Boolean(indexedAttributes.protectiveEyewear) || /vedoszemuveg|munkavedelmi szemuveg/.test(normalize(combinedText)),
        plasticLens: Boolean(indexedAttributes.plasticLens) || /\b(?:muanyag|polikarbonat)\b.{0,60}\blencse(?:vel|bol|s)?\b|\blencse(?:vel|bol|s)?\b.{0,60}\b(?:muanyag|polikarbonat)\b|\b(?:muanyag|polikarbonat)lencse\b/.test(normalize(combinedText)),
        glassLens: Boolean(indexedAttributes.glassLens) || /\b(?:uveg|asvanyi uveg)\b.{0,60}\blencse(?:vel|bol|s)?\b|\blencse(?:vel|bol|s)?\b.{0,60}\b(?:uveg|asvanyi uveg)\b|\buveglencse\b/.test(normalize(combinedText)),
        opticallyWorkedLens: Boolean(indexedAttributes.opticallyWorkedLens) || /optikailag megmunkalt lencse|dioptrias/.test(normalize(combinedText)),
        animalClass: indexedAttributes.animalClass || null,
        tariffSpecies: indexedAttributes.tariffSpecies || null,
        animalGroup: indexedAttributes.animalGroup || null,
        ornamentalFish: /diszhal|guppi|guppy/.test(normalize(combinedText)),
        freshwaterOrnamental: /guppi|guppy|edesvizi diszhal/.test(normalize(combinedText)),
        aquaticSubtypeKnown: /pisztrang|angolna|ponty|tonhal|lazac|homar|languszta|garnela|folyami rak|tengeri rak|osztriga|kagylo|csiga|polip|tintahal/.test(normalize(combinedText)),
        equineType: /szamaroszver|looszver|oszver|muli/.test(normalize(name)) ? "mule"
          : /szamar/.test(normalize(name)) ? "donkey"
          : /\b(?:lo|poni)\b/.test(normalize(name)) ? "horse"
          : /szamaroszver|looszver|oszver|muli/.test(normalize(combinedText)) ? "mule"
          : /szamar/.test(normalize(combinedText)) ? "donkey"
          : /\b(?:lo|poni)\b/.test(normalize(combinedText)) ? "horse"
          : null,
        birdSpecies: /galamb/.test(normalize(name)) || /galamb/.test(normalize(combinedText)) ? "pigeon" : null,
        animalState: animalStateFrom(combinedText),
        liveAnimalKnown: animalStateFrom(combinedText) === "live",
        animalProductRole: mentionsAnimalProductRole(combinedText),
      },
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
