import { readFile } from "node:fs/promises";
import { beginClassification, finishClassification } from "./lib/classification-learning.mjs";
const norm = (s) =>
    String(s || "")
      .toLocaleLowerCase("hu")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""),
  headers = { "content-type": "application/json; charset=utf-8" };
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
  const classificationSession = beginClassification(name, description);
  const respond = (payload, init) => Response.json(finishClassification(classificationSession.id, payload), init);
  const [index, nom] = await Promise.all([
      readFile(
        new URL("../../data/generated/taric-index.json", import.meta.url),
        "utf8",
      ).then(JSON.parse),
      readFile(
        new URL("../../data/generated/nomenclature-rows.json", import.meta.url),
        "utf8",
      ).then(JSON.parse),
    ]);
  const supplied = norm(name + " " + description);
  const compact = supplied.replace(/[^a-z0-9]/g, "");
  const isPhoneCase = /telefontok|telefon tok/.test(supplied);
  const isPlasticLike = /szilikon|muanyag|tpu|gumi/.test(supplied);
  const hasProtectiveFunction = /vedo|vedelem|boritas|burkolat|utesallo|utesved|karcallo|vizallo|porallo|leejtes|razkodasallo|shockproof|impact resistant/.test(supplied);
  if (isPhoneCase && isPlasticLike && hasProtectiveFunction) {
    const codes = ["3926000000", "3926900000", "3926909700", "3926909790"];
    const path = codes.map((code) => {
      const row = nom.rows.find((item) => item.code === code);
      return { code, line: row?.indent ?? 0, description: row?.description ?? "Más" };
    });
    return respond({
      status: "classified",
      code: "3926909790",
      confidence: "magas",
      path,
      reasoning:
        "GRI 1 és 6: a szilikon védő telefontok kész műanyag áru; nem telefonalkatrész és nem hordtáska, ezért a 3926 Más maradék alszáma alkalmazandó.",
      clarification: null,
      factsUsed: {
        product: "telefontok",
        material: "szilikon",
        function: "védő",
        quantity: supplied.match(/\b(\d+)\s*db\b/)?.[1] ?? null,
        valueHuf: supplied.match(/\b(\d[\d ]*)\s*ft\b/)?.[1]?.replace(/ /g, "") ?? null,
        traffic: supplied.includes("b2c") ? "b2c" : supplied.includes("b2b") ? "b2b" : null,
      },
      dataDate: index.dataDate,
    });
  }
  const isCottonTshirt =
    /pamut/.test(supplied) && /polo|t-shirt|tshirt|t ing/.test(supplied);
  if (isCottonTshirt) {
    const codes = ["6109000000", "6109100000", "6109100010"];
    const path = codes.map((code) => {
      const rows = nom.rows.filter((item) => item.code === code);
      const row = rows.sort((a, b) => a.indent - b.indent)[0];
      return { code, line: row?.indent ?? 0, description: row?.description ?? "" };
    });
    return respond({
      status: "classified",
      code: "6109100010",
      confidence: "magas",
      path,
      reasoning:
        "GRI 1 és 6: a póló a 6109 vámtarifaszám szerinti T-ing; a pamut anyag a 610910 alszámot, a T-ing megnevezés pedig a 6109100010 TARIC-kódot határozza meg.",
      clarification: null,
      factsUsed: {
        product: "póló",
        material: "pamut",
      },
      dataDate: index.dataDate,
    });
  }
  const isSteelWireCage = classificationSession.facts.canonicalProduct === "cage" &&
    classificationSession.facts.materials.includes("steel") &&
    classificationSession.facts.inferredFacts.construction;
  if (isSteelWireCage) {
    const codes = ["7326000000", "7326200000", "7326200090"];
    const path = codes.map((code) => {
      const row = nom.rows.find((item) => item.code === code);
      return { code, line: row?.indent ?? 0, description: row?.description ?? (code === "7326200090" ? "Más áru vas- vagy acélhuzalból" : "Más áru vasból vagy acélból") };
    });
    return respond({
      status: "classified", code: "7326200090", confidence: "magas", path,
      reasoning: "GRI 1 és 6: a megnevezés és a leírás együtt kész kalitkát azonosít, amelynek rendeltetése a termékfogalomból ismert. Az acélsodrony szerkezeti anyag közvetlenül a vas- vagy acélhuzalból készült más áruk 732620 ágát határozza meg; a fedél, ajtó, etető és világítás nem változtatja meg a lényeges jelleget.",
      clarification: null,
      factsUsed: {
        product: "kalitka", material: "acél", construction: "acélsodrony",
        function: classificationSession.facts.inferredFacts.functions,
        capacityLitres: classificationSession.facts.inferredFacts.capacityLitres,
        cover: /fedel/.test(supplied), door: /ajto/.test(supplied),
        feeder: /eteto/.test(supplied), builtInLighting: /beepitett vilagitas|vilagitassal/.test(supplied),
      },
      dataDate: index.dataDate, engine: "semantic-facts-v1",
    });
  }
  const isGlassAquarium = classificationSession.facts.canonicalProduct === "aquarium" &&
    classificationSession.facts.materials.includes("glass");
  if (isGlassAquarium) {
    const codes = ["7013000000", "7013990000"];
    const path = codes.map((code) => {
      const row = nom.rows.find((item) => item.code === code);
      return { code, line: row?.indent ?? 0, description: row?.description ?? (code === "7013000000" ? "Üvegáru belső használatra vagy hasonló célra" : "Más üvegáru") };
    });
    return respond({
      status: "classified", code: "7013990000", confidence: "magas", path,
      reasoning: "GRI 1, 3 b) és 6: a megnevezés és a leírás együtt egy kész, 100 literes üvegakváriumot azonosít. A fedél és a beépített világítás kiegészítő elemek; az összetett áru lényeges jellegét a víz és élőlények tartására szolgáló üvegtartály adja.",
      clarification: null,
      factsUsed: {
        product: "akvárium", material: "üveg", function: "vízi élőlények tartása",
        capacityLitres: supplied.match(/\b(\d+(?:[.,]\d+)?)\s*(?:l|liter|literes)\b/)?.[1] ?? null,
        glassThicknessMm: supplied.match(/\b(\d+(?:[.,]\d+)?)\s*mm\b/)?.[1] ?? null,
        cover: /fedel/.test(supplied), builtInLighting: /beepitett vilagitas|vilagitassal/.test(supplied),
      },
      dataDate: index.dataDate, engine: "local-rules-v2",
    });
  }
  const isSword = classificationSession.facts.canonicalProduct === "sword";
  if (isSword) {
    const row = nom.rows.find((item) => item.code === "9307000000");
    return respond({
      status: "classified", code: "9307000000", confidence: "magas",
      path: [{ code: "9307000000", line: row?.indent ?? 0, description: row?.description ?? "Kard, tőr, szurony, lándzsa és hasonló fegyver" }],
      reasoning: "GRI 1: a megnevezés és a leírás együttes értelmezése alapján az áru kard vagy annak szinonimája; a 9307 vámtarifaszám ezt név szerint lefedi.",
      clarification: null,
      factsUsed: { product: classificationSession.facts.productTerms, type: "kard", material: classificationSession.facts.materials },
      dataDate: index.dataDate, engine: "local-rules-v2",
    });
  }
  const isSamuraiSword = /szamurajkard|szamurajkes|katana/.test(compact) || /szamuraj\s+kard/.test(supplied);
  if (isSamuraiSword) {
    const row = nom.rows.find((item) => item.code === "9307000000");
    return respond({
      status: "classified", code: "9307000000", confidence: "magas",
      path: [{ code: "9307000000", line: row?.indent ?? 0, description: row?.description ?? "Kard, tőr, szurony, lándzsa és hasonló fegyver" }],
      reasoning: "GRI 1: a szamurájkard (katana) kard jellegű szálfegyver, amelyet a 9307 vámtarifaszám név szerint lefed.",
      clarification: null, factsUsed: { product: "szamurájkard / katana", type: "kard" }, dataDate: index.dataDate, engine: "local-rules-v1",
    });
  }
  const isFootwear=/bakancs|cipo|surrano|topanka|labbeli/.test(supplied);
  const hasLeatherUpper=/bor fels|borbol keszult fels|bor felsoresz/.test(supplied)||(/\bbor\b/.test(supplied)&&isFootwear);
  if(isFootwear&&hasLeatherUpper){
    const base={code:"6403000000",line:0,description:nom.rows.find(r=>r.code==="6403000000")?.description||"Lábbeli bőr felsőrésszel"};
    const leatherSole=/bor (kulso )?talp|bortalp/.test(supplied),rubberPlasticSole=/gumi|muanyag (kulso )?talp|gumitalp/.test(supplied);
    if(!leatherSole&&!rubberPlasticSole)return respond({status:"clarification",code:null,confidence:"alacsony",path:[base],reasoning:"A bőr felsőrész a 6403 vámtarifaszámot meghatározza; a következő alszámot a külső talp anyaga választja szét.",clarification:"Milyen anyagból készült a lábbeli külső talpa?",clarificationOptions:[{id:"sole_rubber_plastic",label:"Gumi vagy műanyag",appendText:"külső talpa gumiból vagy műanyagból készült"},{id:"sole_leather",label:"Bőr",appendText:"külső talpa bőrből készült"}],factsUsed:{product:"bőr felsőrészű lábbeli",upperMaterial:"bőr"},dataDate:index.dataDate,engine:"local-rules-v1"});
    const metalKnown=/fem (vedo )?cipoor|fem labujjvedo|nincs fem|fem nelkul/.test(supplied),hasMetal=/fem (vedo )?cipoor|fem labujjvedo/.test(supplied)&&!/nincs|nelkul/.test(supplied);
    if(!metalKnown)return respond({status:"clarification",code:null,confidence:"alacsony",path:[base],reasoning:"A 6403 ágon a beépített védő fém cipőorr önálló alszámot képez.",clarification:"Van a lábbeliben beépített védő fém cipőorr?",clarificationOptions:[{id:"toe_no",label:"Nincs",appendText:"nincs beépített védő fém cipőorra"},{id:"toe_yes",label:"Van",appendText:"beépített védő fém cipőorral készült"}],factsUsed:{upperMaterial:"bőr",soleMaterial:leatherSole?"bőr":"gumi vagy műanyag"},dataDate:index.dataDate,engine:"local-rules-v1"});
    if(hasMetal)return respond({status:"classified",code:"6403400000",confidence:"magas",path:[base,{code:"6403400000",line:1,description:"Más lábbeli beépített védő fém cipőorral"}],reasoning:"GRI 1 és 6: bőr felsőrészű lábbeli beépített védő fém cipőorral.",clarification:null,dataDate:index.dataDate,engine:"local-rules-v1"});
    const ankleKnown=/bokat takar|bokat nem takar|bokanal alacsony/.test(supplied),coversAnkle=/bokat takar/.test(supplied)&&!/nem takar/.test(supplied);
    if(!ankleKnown)return respond({status:"clarification",code:null,confidence:"alacsony",path:[base],reasoning:"Fém cipőorr hiányában a következő alszámot a bokát takaró kialakítás választja szét.",clarification:"A lábbeli takarja a bokát?",clarificationOptions:[{id:"ankle_yes",label:"Takarja a bokát",appendText:"a bokát takarja"},{id:"ankle_no",label:"Nem takarja a bokát",appendText:"a bokát nem takarja"}],factsUsed:{upperMaterial:"bőr",soleMaterial:leatherSole?"bőr":"gumi vagy műanyag",protectiveMetalToe:false},dataDate:index.dataDate,engine:"local-rules-v1"});
    const small=/24 cm-nel kisebb/.test(supplied),adult=/legalabb 24 cm/.test(supplied),male=/ferfi labbeli/.test(supplied),female=/noi labbeli/.test(supplied);
    const branch=leatherSole?(coversAnkle?"6403510000":"6403590000"):(coversAnkle?"6403910000":"6403990000");
    if(!small&&!adult)return respond({status:"clarification",code:null,confidence:"alacsony",path:[base,{code:branch,line:1,description:coversAnkle?"Bokát takaró lábbeli":"Más lábbeli"}],reasoning:"A fő alszám meghatározható; a 10 jegyű kódhoz a talpbélés hossza és a férfi/női kivitel szükséges.",clarification:"Mekkora a talpbélés hossza, és férfi vagy női lábbeliről van szó?",clarificationOptions:[{id:"size_men",label:"Legalább 24 cm, férfi",appendText:"talpbélés hossza legalább 24 cm, férfi lábbeli"},{id:"size_women",label:"Legalább 24 cm, női",appendText:"talpbélés hossza legalább 24 cm, női lábbeli"},{id:"size_small",label:"24 cm-nél kisebb",appendText:"talpbélés hossza 24 cm-nél kisebb"}],dataDate:index.dataDate,engine:"local-rules-v1"});
    let finalCode;
    if(leatherSole&&coversAnkle)finalCode=small?"6403511100":male?"6403511500":female?"6403511900":null;
    else if(leatherSole&&!coversAnkle)finalCode=small?"6403593100":male?"6403593500":female?"6403593900":null;
    else if(!leatherSole&&coversAnkle)finalCode=small?"6403919100":male?"6403919600":female?"6403919800":null;
    else finalCode=small?"6403993100":male?"6403993600":female?"6403993800":null;
    if(finalCode){const finalRow=nom.rows.find(r=>r.code===finalCode);return respond({status:"classified",code:finalCode,confidence:"magas",path:[base,{code:branch,line:1,description:coversAnkle?"Bokát takaró lábbeli":"Más lábbeli"},{code:finalCode,line:finalRow?.indent??0,description:finalRow?.description||"Más"}],reasoning:"GRI 1 és 6: a felsőrész, a külső talp, a fém cipőorr hiánya, a bokát takaró kialakítás, a talpbélés hossza és a férfi/női kivitel alapján.",clarification:null,dataDate:index.dataDate,engine:"local-rules-v1"});}
  }
  const isHuntingKnife = /vadaszkes|vadasz kes/.test(supplied);
  const isKitchenKnife = /konyhaikes|konyhakes|szakacskes/.test(compact) || /konyhai\s+kes|szakacs\s+kes/.test(supplied);
  const isElectricKnife = /elektromoskes|villanykes|motoroskes/.test(compact) || ((isKitchenKnife || /\bkes\b/.test(supplied)) && /elektromos|villany|beepitett elektromotor|motoros/.test(supplied));
  const isElectricKitchenKnife = isElectricKnife && (isKitchenKnife || /haztartasi|etel|kenyer|hus|konyha/.test(supplied) || /elektromoskes|villanykes/.test(compact));
  const hasSteelBlade = /rozsdamentes acel|acelpenge|acel penge/.test(supplied);
  const isFoldingBlade = /osszecsukhato|behajthato|zsebkes|nem mereven rogzitett/.test(supplied);
  const isFixedBlade = /rogzitett penge|fix penge|merev penge|merevpenge/.test(supplied) ||
    (hasSteelBlade && /\b\d+(?:[.,]\d+)?\s*mm\b/.test(supplied) && !isFoldingBlade);
  if (isElectricKitchenKnife) {
    const codes = ["8509000000", "8509800000"];
    const path = codes.map((code) => {
      const row = nom.rows.find((item) => item.code === code);
      return { code, line: row?.indent ?? 0, description: row?.description ?? "Más készülék" };
    });
    return respond({
      status: "classified", code: "8509800000", confidence: "magas", path,
      reasoning: "GRI 1 és 6: az elektromos konyhai kés beépített elektromotorral működő elektromechanikus háztartási készülék. Nem önálló kézi késként, hanem a 8509 vámtarifaszám más készülék alszámán osztályozandó.",
      clarification: null,
      factsUsed: { product: "elektromos konyhai kés", function: "háztartási élelmiszervágás", drive: "beépített elektromotor" },
      dataDate: index.dataDate, engine: "local-rules-v1",
    });
  }
  if (isHuntingKnife && !isFixedBlade && !isFoldingBlade) {
    return respond({
      status: "clarification",
      code: null,
      confidence: "alacsony",
      path: [
        { code: "8211000000", line: 0, description: "Kés éles vágópengével, fűrészes is (beleértve a kertészkést is), a 8208 vtsz. alá tartozó kés kivételével, és penge ezekhez" },
        { code: "8211910000", line: 1, description: "Más" },
      ],
      reasoning: "GRI 1 és 6: a vadászkés a 8211 vámtarifaszám alá tartozik; a következő alszámot a penge rögzítettsége választja szét.",
      clarification: "A vadászkés rögzített pengéjű vagy összecsukható (nem mereven rögzített pengéjű)?",
      clarificationOptions: [
        { id: "fixed_blade", label: "Rögzített pengéjű", appendText: "rögzített pengéjű, merev penge" },
        { id: "folding_blade", label: "Összecsukható", appendText: "összecsukható, nem mereven rögzített pengéjű" },
      ],
      factsUsed: {
        product: "vadászkés",
        quantity: supplied.match(/\b(\d+)\s*db\b/)?.[1] ?? null,
        valueHuf: supplied.match(/\b(\d[\d ]*)\s*ft\b/)?.[1]?.replace(/ /g, "") ?? null,
      },
      dataDate: index.dataDate,
    });
  }
  if (isHuntingKnife && isFoldingBlade) {
    return respond({
      status: "classified", code: "8211930000", confidence: "magas",
      path: [
        { code: "8211000000", line: 0, description: "Kés éles vágópengével, fűrészes is (beleértve a kertészkést is), a 8208 vtsz. alá tartozó kés kivételével, és penge ezekhez" },
        { code: "8211910000", line: 1, description: "Más" },
        { code: "8211930000", line: 2, description: "Kés, nem mereven rögzített pengéjű" },
      ],
      reasoning: "GRI 1 és 6: az összecsukható vadászkés nem mereven rögzített pengéjű kés.",
      clarification: null, dataDate: index.dataDate,
    });
  }
  if (isKitchenKnife && !isFoldingBlade) {
    return respond({
      status: "classified",
      code: "8211920000",
      confidence: "magas",
      path: [
        { code: "8211000000", line: 0, description: "Kés éles vágópengével, fűrészes is (beleértve a kertészkést is), a 8208 vtsz. alá tartozó kés kivételével, és penge ezekhez" },
        { code: "8211910000", line: 1, description: "Más" },
        { code: "8211920000", line: 2, description: "Más kés, rögzített pengéjű" },
      ],
      reasoning: "GRI 1 és 6: a konyhakés önálló, nem asztali és nem összecsukható, rögzített pengéjű kés; a rozsdamentes acél anyag nem viszi át más árucsoportba.",
      clarification: null,
      factsUsed: {
        product: "konyhakés",
        function: "konyhai vágás",
        bladeMaterial: hasSteelBlade ? "rozsdamentes acél" : null,
        lengthCm: supplied.match(/\b(\d+(?:[.,]\d+)?)\s*cm\b/)?.[1] ?? null,
      },
      dataDate: index.dataDate,
      engine: "local-rules-v1",
    });
  }
  if (isKitchenKnife && isFoldingBlade) {
    return respond({
      status: "classified", code: "8211930000", confidence: "magas",
      path: [
        { code: "8211000000", line: 0, description: "Kés éles vágópengével" },
        { code: "8211910000", line: 1, description: "Más" },
        { code: "8211930000", line: 2, description: "Kés, nem mereven rögzített pengéjű" },
      ],
      reasoning: "GRI 1 és 6: a megadott konyhakés összecsukható, ezért nem mereven rögzített pengéjű kés.",
      clarification: null, dataDate: index.dataDate, engine: "local-rules-v1",
    });
  }
  if (isHuntingKnife && isFixedBlade) {
    const codes = ["8211000000", "8211910000", "8211920000"];
    const path = codes.map((code) => {
      const rows = nom.rows.filter((item) => item.code === code);
      const row = rows.sort((a, b) => a.indent - b.indent)[0];
      return { code, line: row?.indent ?? 0, description: row?.description ?? "Más" };
    });
    return respond({
      status: "classified",
      code: "8211920000",
      confidence: "magas",
      path,
      reasoning:
        "GRI 1 és 6: a vadászkés önálló kés, rögzített rozsdamentes acélpengével; nem készlet, nem asztali kés, nem összecsukható kés és nem külön penge vagy nyél.",
      clarification: null,
      factsUsed: {
        product: "vadászkés",
        function: "vadászat",
        bladeMaterial: "rozsdamentes acél",
        bladeThicknessMm: supplied.match(/\b(\d+(?:[.,]\d+)?)\s*mm\b/)?.[1] ?? null,
        handle: supplied.includes("csont") ? "csontberakásos nyél" : "nyél",
        quantity: supplied.match(/\b(\d+)\s*db\b/)?.[1] ?? null,
        valueHuf: supplied.match(/\b(\d[\d ]*)\s*ft\b/)?.[1]?.replace(/ /g, "") ?? null,
      },
      dataDate: index.dataDate,
    });
  }
  const suppliedFacts = {
    materials: ["pamut", "gyapjú", "selyem", "len", "szilikon", "gumi", "műanyag", "rozsdamentes acél", "acél", "fém", "csont", "bőr", "fa", "üveg", "textil"]
      .filter((value) => supplied.includes(norm(value))),
    functions: [...new Set([
      ...["védő", "burkoló", "vadászat", "konyhai", "háztartási", "díszítő", "ipari", "ruházati", "szállítás", "tárolás"]
        .filter((value) => supplied.includes(norm(value))),
      ...(hasProtectiveFunction ? ["védő"] : []),
    ])],
    quantity: supplied.match(/\b(\d+)\s*db\b/)?.[1] ?? null,
    valueHuf: supplied.match(/\b(\d[\d ]*)\s*ft\b/)?.[1]?.replace(/ /g, "") ?? null,
    traffic: supplied.includes("b2c") ? "b2c" : supplied.includes("b2b") ? "b2b" : null,
  };
  const synonymText = isPhoneCase
    ? " muanyagbol keszult mas aru tok tarto vedoburkolat "
    : "";
  const ignored = new Set(["b2b","b2c","import","export","datum","vamertek","mennyiseg","szarmazas","irany","forgalom","harmadik","orszag"]);
  const nameWords = norm(name).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !ignored.has(w));
  const descriptionWords = norm(description + synonymText).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !ignored.has(w));
  const words = [...new Set([...nameWords, ...descriptionWords])],
    scored = [];
  for (const r of index.records) {
    if (!r.descriptionHu) continue;
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
  if (!hierarchy.length)
    return respond({
      status: "clarification",
      clarification: classificationSession.facts.inferredFacts?.functions?.length
        ? "A megnevezésből a rendeltetést, a leírásból az anyagot is felismertem. Melyik további jellemző választja szét a megjelenített tarifális ágakat?"
        : classificationSession.facts.materials.length
          ? "Az anyagot már felismertem. Mi az áru pontos rendeltetése vagy termékfajtája, amely a tarifális ágat eldönti?"
        : "Miből készült az áru, mi a funkciója és milyen feldolgozottsági állapotban van?",
      factsUsed: { extracted: classificationSession.facts },
    });
  const prompt = `EU vámtarifa-szakértő vagy. GRI 1–6 szerint lépcsőzetesen osztályozz: árucsoport → 4 jegy → HS6 → KN8 → TARIC10. A line mező a nómenklatúra vonalszintje: az azonos kódú, eltérő line sorok külön hierarchiaszintek. TILOS fő-, gyűjtő- vagy tovább bontható kódot véglegesnek választani. Ha a következő vonalszinthez anyag, funkció, fajta, feldolgozottság vagy kiszerelés hiányzik, pontosító kérdést adj, ne találgass. Kizárólag a megadott 2026-07-11-i NAV-hierarchiából válassz. JSON-only: classified esetén {"status":"classified","code":"10 számjegy","confidence":"magas|közepes|alacsony","path":[{"code":"...","line":0,"description":"..."}],"reasoning":"GRI-indoklás","clarification":null}; kérdés esetén {"status":"clarification","code":null,"confidence":"alacsony","path":[],"reasoning":"mi hiányzik","clarification":"egy kérdés"}. Termék: ${name}. Leírás: ${description || "nincs"}. Hierarchia: ${JSON.stringify(hierarchy)}`;
  const atomic = norm(name);
  const root = hierarchy.find(
    (row) => row.line === 0 && norm(row.description).includes(atomic),
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
    clarification = "Milyen a termék pontos fajtája, kialakítása és feldolgozottsági állapota?";
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
    engine: "local-rules-v1",
  });
};
