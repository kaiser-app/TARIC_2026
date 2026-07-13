import { tariffProfiles } from "./tariff-profiles.mjs";

const valueAt = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);

function testCondition(facts, test) {
  const value = valueAt(facts, test.path);
  if (Object.hasOwn(test, "equals")) return value === test.equals;
  if (test.includesAny) return Array.isArray(value) && test.includesAny.some((item) => value.includes(item));
  if (test.materialIsEssential) return facts.materials?.length === 1 && facts.materials.includes(test.materialIsEssential)
    || facts.inferredFacts?.attributes?.essentialMaterial === test.materialIsEssential;
  if (test.exists) return value !== null && value !== undefined && value !== "";
  return false;
}

function passesAny(facts, tests = []) { return tests.some((test) => testCondition(facts, test)); }
function passesAll(facts, tests = []) { return tests.every((test) => testCondition(facts, test)); }

function pathFor(codes, nomenclature) {
  return codes.map((code, index) => {
    const rows = nomenclature.rows.filter((row) => row.code === code).sort((a, b) => a.indent - b.indent);
    const row = index === codes.length - 1 ? rows[rows.length - 1] : rows[0];
    return { code, line: row?.indent ?? 0, description: row?.description ?? "" };
  });
}

function eyewearDecision(facts, nomenclature, dataDate) {
  const a = facts.inferredFacts.attributes;
  const profile = { id: "eyewear" };
  const ask = (id, question, options, reasoning, pathCodes = ["9004000000"]) => ({
    ...clarification(profile, { id, question, options }, facts, dataDate),
    reasoning, path: pathFor(pathCodes, nomenclature),
  });
  if (!a.sunglasses && !a.correctiveEyewear && !a.protectiveEyewear)
    return ask("eyewear_type", "Milyen típusú szemüvegről van szó?", [["Napszemüveg", "napszemüveg"], ["Dioptriás / látásjavító", "dioptriás látásjavító szemüveg"], ["Védőszemüveg", "védőszemüveg"]], "A 9004 vámtarifaszámon belül a szemüveg rendeltetése választja szét a napszemüveget és a más szemüveget.");
  if (a.sunglasses) {
    if (a.opticallyWorkedLens) return { status: "classified", code: "9004101000", confidence: "magas", path: pathFor(["9004000000", "9004100000", "9004101000"], nomenclature), reasoning: "GRI 1 és 6: napszemüveg optikailag megmunkált lencsével.", clarification: null, factsUsed: { profile: profile.id, known: facts }, dataDate, engine: "profile-engine-v1" };
    if (a.plasticLens) return { status: "classified", code: "9004109100", confidence: "magas", path: pathFor(["9004000000", "9004100000", "9004109100", "9004109100"], nomenclature), reasoning: "GRI 1 és 6: más napszemüveg műanyag lencsével.", clarification: null, factsUsed: { profile: profile.id, known: facts }, dataDate, engine: "profile-engine-v1" };
    if (a.glassLens) return { status: "classified", code: "9004109900", confidence: "magas", path: pathFor(["9004000000", "9004100000", "9004109100", "9004109900"], nomenclature), reasoning: "GRI 1 és 6: más napszemüveg nem műanyag lencsével.", clarification: null, factsUsed: { profile: profile.id, known: facts }, dataDate, engine: "profile-engine-v1" };
    return ask("sunglass_lens", "A napszemüveg lencséje optikailag megmunkált, műanyagból készült, vagy más anyagú?", [["Optikailag megmunkált", "optikailag megmunkált lencsével"], ["Műanyag lencse", "műanyag lencsével"], ["Más anyagú lencse", "nem műanyag, más anyagú lencsével"]], "A napszemüveg 10 jegyű kódját a lencse optikai megmunkáltsága és anyaga választja szét.", ["9004000000", "9004100000"]);
  }
  if (a.plasticLens) return { status: "classified", code: "9004901000", confidence: "magas", path: pathFor(["9004000000", "9004900000", "9004901000"], nomenclature), reasoning: "GRI 1 és 6: más szemüveg műanyag lencsével.", clarification: null, factsUsed: { profile: profile.id, known: facts }, dataDate, engine: "profile-engine-v1" };
  if (a.glassLens) return { status: "classified", code: "9004909000", confidence: "magas", path: pathFor(["9004000000", "9004900000", "9004909000"], nomenclature), reasoning: "GRI 1 és 6: más szemüveg nem műanyag lencsével.", clarification: null, factsUsed: { profile: profile.id, known: facts }, dataDate, engine: "profile-engine-v1" };
  return ask("other_eyewear_lens", "A szemüveg lencséje műanyagból vagy más anyagból készült?", [["Műanyag lencse", "műanyag lencsével"], ["Más anyagú lencse", "nem műanyag, más anyagú lencsével"]], "A más szemüveg 10 jegyű kódját a lencse anyaga választja szét.", ["9004000000", "9004900000"]);
}

function clarification(profile, requirement, facts, dataDate) {
  const materialLabels = { glass: "Üveg", concrete: "Beton", steel: "Vas vagy acél", plastic: "Műanyag", wood: "Fa", leather: "Bőr", textile: "Textil", cotton: "Pamut" };
  const sourceOptions = requirement.id === "essential_material" && facts.materials?.length > 1
    ? facts.materials.map((material) => [materialLabels[material] || material, `${materialLabels[material] || material} alkotja a fő tartószerkezetet vagy tartályfalat, és ez adja az áru lényeges jellegét`])
    : (requirement.options || []);
  return {
    status: "clarification", code: null, confidence: "alacsony", path: [],
    reasoning: `A(z) ${profile.id} termékprofil felismerhető, de a következő tarifális döntési tény nincs még bizonyítva: ${requirement.id}.`,
    clarification: requirement.question,
    clarificationOptions: sourceOptions.map(([label, appendText], index) => ({
      id: `${profile.id}_${requirement.id}_${index + 1}`, label, appendText,
    })),
    factsUsed: { profile: profile.id, known: facts }, dataDate, engine: "profile-engine-v1",
  };
}

function footwearDecision(facts, nomenclature, dataDate) {
  const a = facts.inferredFacts.attributes;
  if (!a.leatherUpper) return null;
  const baseCode = "6403000000";
  const profile = { id: "leather_upper_footwear" };
  const ask = (id, question, options, reasoning) => clarification(profile, { id, question, options }, facts, dataDate) && {
    ...clarification(profile, { id, question, options }, facts, dataDate), reasoning,
    path: pathFor([baseCode], nomenclature),
  };
  if (!a.leatherSole && !a.rubberPlasticSole) return ask("outer_sole_material", "Milyen anyagból készült a lábbeli talajjal érintkező külső talpa?", [["Gumi vagy műanyag", "külső talpa gumiból vagy műanyagból készült"], ["Bőr", "külső talpa bőrből készült"]], "A bőr felsőrész a 6403 ágat meghatározza; a következő alszámot a külső talp anyaga választja szét.");
  if (!a.metalToeKnown) return ask("protective_metal_toe", "Van a lábbeliben beépített védő fém cipőorr?", [["Nincs", "nincs beépített védő fém cipőorra"], ["Van", "beépített védő fém cipőorral készült"]], "A 6403 ágon a beépített védő fém cipőorr önálló alszámot képez.");
  if (a.metalToe) return { status: "classified", code: "6403400000", confidence: "magas", path: pathFor([baseCode, "6403400000"], nomenclature), reasoning: "GRI 1 és 6: bőr felsőrészű lábbeli beépített védő fém cipőorral.", clarification: null, factsUsed: { profile: profile.id, known: facts }, dataDate, engine: "profile-engine-v1" };
  if (!a.ankleKnown) return ask("covers_ankle", "A lábbeli felsőrésze takarja a bokát?", [["Takarja", "a bokát takarja"], ["Nem takarja", "a bokát nem takarja"]], "Fém cipőorr hiányában a következő alszámot a bokát takaró kialakítás választja szét.");
  const branch = a.leatherSole ? (a.coversAnkle ? "6403510000" : "6403590000") : (a.coversAnkle ? "6403910000" : "6403990000");
  if (!a.insoleUnder24 && !a.insoleAtLeast24) return ask("insole_and_gender", "A talpbélés hossza 24 cm alatti, vagy legalább 24 cm-es férfi/női lábbeliről van szó?", [["24 cm alatti", "talpbélés hossza 24 cm-nél kisebb"], ["Legalább 24 cm, férfi", "talpbélés hossza legalább 24 cm, férfi lábbeli"], ["Legalább 24 cm, női", "talpbélés hossza legalább 24 cm, női lábbeli"]], "A 10 jegyű kódot a talpbélés hossza és legalább 24 cm esetén a férfi/női kivitel választja szét.");
  let code;
  if (a.leatherSole && a.coversAnkle) code = a.insoleUnder24 ? "6403511100" : a.mensFootwear ? "6403511500" : a.womensFootwear ? "6403511900" : null;
  else if (a.leatherSole) code = a.insoleUnder24 ? "6403593100" : a.mensFootwear ? "6403593500" : a.womensFootwear ? "6403593900" : null;
  else if (a.coversAnkle) code = a.insoleUnder24 ? "6403919100" : a.mensFootwear ? "6403919600" : a.womensFootwear ? "6403919800" : null;
  else code = a.insoleUnder24 ? "6403993100" : a.mensFootwear ? "6403993600" : a.womensFootwear ? "6403993800" : null;
  if (!code) return ask("gender", "Legalább 24 cm-es talpbélés esetén férfi vagy női lábbeliről van szó?", [["Férfi", "férfi lábbeli"], ["Női", "női lábbeli"]], "A 10 jegyű kódhoz a férfi/női kivitel szükséges.");
  return { status: "classified", code, confidence: "magas", path: pathFor([baseCode, branch, code], nomenclature), reasoning: "GRI 1 és 6: a felsőrész, a külső talp, a fém cipőorr, a bokát takaró kialakítás, a talpbélés hossza és a férfi/női kivitel alapján.", clarification: null, factsUsed: { profile: profile.id, known: facts }, dataDate, engine: "profile-engine-v1" };
}

export function decideByProfiles(facts, nomenclature, dataDate) {
  if (facts.concepts?.includes("eyewear")) return eyewearDecision(facts, nomenclature, dataDate);
  if (facts.concepts?.includes("footwear")) {
    const footwear = footwearDecision(facts, nomenclature, dataDate);
    if (footwear) return footwear;
  }
  const candidates = tariffProfiles
    .filter((profile) => !profile.conceptsAny || profile.conceptsAny.some((concept) => facts.concepts?.includes(concept)))
    .filter((profile) => passesAll(facts, profile.factsAll || []))
    .filter((profile) => !(profile.rejectIf || []).some((test) => testCondition(facts, test)))
    .sort((a, b) => b.priority - a.priority);

  for (const profile of candidates) {
    const missing = (profile.required || []).find((requirement) => {
      if (requirement.testAny) return !passesAny(facts, requirement.testAny);
      return !testCondition(facts, requirement.test);
    });
    if (missing) return clarification(profile, missing, facts, dataDate);
    return {
      status: "classified", code: profile.result.code, confidence: "magas",
      path: pathFor(profile.result.path, nomenclature), reasoning: profile.result.reasoning,
      clarification: null, factsUsed: {
        profile: profile.id, known: facts,
        function: facts.inferredFacts?.functions || [],
        construction: facts.inferredFacts?.attributes?.wireConstruction ? "acélsodrony" : facts.inferredFacts?.construction,
        capacityLitres: facts.inferredFacts?.capacityLitres ?? null,
        glassThicknessMm: facts.inferredFacts?.thicknessMm ?? null,
      },
      dataDate, engine: "profile-engine-v1",
    };
  }
  return null;
}
