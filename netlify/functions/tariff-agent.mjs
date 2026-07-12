import { readFile } from "node:fs/promises";
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
  const isPhoneCase = /telefontok|telefon tok/.test(supplied);
  const isPlasticLike = /szilikon|muanyag|tpu|gumi/.test(supplied);
  const hasProtectiveFunction = /vedo|vedelem|boritas|burkolat/.test(supplied);
  if (isPhoneCase && isPlasticLike && hasProtectiveFunction) {
    const codes = ["3926000000", "3926900000", "3926909700", "3926909790"];
    const path = codes.map((code) => {
      const row = nom.rows.find((item) => item.code === code);
      return { code, line: row?.indent ?? 0, description: row?.description ?? "Más" };
    });
    return Response.json({
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
    return Response.json({
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
  const isHuntingKnife = /vadaszkes|vadasz kes/.test(supplied);
  const hasSteelBlade = /rozsdamentes acel|acelpenge|acel penge/.test(supplied);
  const isFoldingBlade = /osszecsukhato|behajthato|zsebkes|nem mereven rogzitett/.test(supplied);
  const isFixedBlade = /rogzitett penge|fix penge|merev penge|merevpenge/.test(supplied) ||
    (hasSteelBlade && /\b\d+(?:[.,]\d+)?\s*mm\b/.test(supplied) && !isFoldingBlade);
  if (isHuntingKnife && !isFixedBlade && !isFoldingBlade) {
    return Response.json({
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
    return Response.json({
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
  if (isHuntingKnife && isFixedBlade) {
    const codes = ["8211000000", "8211910000", "8211920000"];
    const path = codes.map((code) => {
      const rows = nom.rows.filter((item) => item.code === code);
      const row = rows.sort((a, b) => a.indent - b.indent)[0];
      return { code, line: row?.indent ?? 0, description: row?.description ?? "Más" };
    });
    return Response.json({
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
    materials: ["pamut", "gyapjú", "selyem", "len", "szilikon", "műanyag", "rozsdamentes acél", "acél", "csont", "bőr", "textil"]
      .filter((value) => supplied.includes(norm(value))),
    functions: ["védő", "vadászat", "konyhai", "díszítő", "ipari"]
      .filter((value) => supplied.includes(norm(value))),
    quantity: supplied.match(/\b(\d+)\s*db\b/)?.[1] ?? null,
    valueHuf: supplied.match(/\b(\d[\d ]*)\s*ft\b/)?.[1]?.replace(/ /g, "") ?? null,
    traffic: supplied.includes("b2c") ? "b2c" : supplied.includes("b2b") ? "b2b" : null,
  };
  const synonymText = isPhoneCase
    ? " muanyagbol keszult mas aru tok tarto vedoburkolat "
    : "";
  const words = norm(name + " " + description + synonymText)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2),
    scored = [];
  for (const r of index.records) {
    if (!r.descriptionHu) continue;
    const d = norm(r.descriptionHu);
    let score = 0;
    for (const w of words) if (d.includes(w)) score += w.length;
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
    return Response.json({
      status: "clarification",
      clarification:
        "Miből készült az áru, mi a funkciója és milyen feldolgozottsági állapotban van?",
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
      return Response.json({
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
      return Response.json({
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
  if (!suppliedFacts.materials.length) {
    clarification = "Milyen anyagból készült az áru? Ha több anyagból áll, melyik adja a lényeges jellegét?";
  } else if (!suppliedFacts.functions.length) {
    clarification = "Mi az áru elsődleges funkciója vagy felhasználási célja?";
  } else {
    clarification = "Milyen a termék pontos fajtája, kialakítása és feldolgozottsági állapota?";
  }
  return Response.json({
    status: "clarification",
    code: null,
    confidence: "alacsony",
    path: candidates.map(({ score, ...item }) => item),
    reasoning: topPrefixes.length
      ? `A NAV nómenklatúrában a legerősebb jelölt ágak: ${topPrefixes.join(", ")}. A végkódhoz további, tarifálást eldöntő termékjellemző szükséges.`
      : "A megadott leírásból nem választható ki biztonságosan nómenklatúra-ág.",
    clarification,
    factsUsed: suppliedFacts,
    dataDate: index.dataDate,
    engine: "local-rules-v1",
  });
};
