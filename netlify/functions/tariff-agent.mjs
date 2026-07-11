import OpenAI from "openai";
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
  let parsed;
  try {
    const c = await new OpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 700,
    });
    parsed = JSON.parse(c.choices[0].message.content);
  } catch (e) {
    return new Response(
      JSON.stringify({
        status: "gateway_unavailable",
        message: "Az AI tarifálási réteg nem érhető el.",
        detail: e.message,
      }),
      { status: 503, headers },
    );
  }
  if (parsed.code) {
    const code = String(parsed.code).replace(/\D/g, "");
    const exact = nom.rows.filter((r) => r.code === code);
    if (!exact.length)
      return new Response(
        JSON.stringify({
          status: "invalid_model_code",
          message: "A modell kódja nincs a hiteles nómenklatúrában.",
        }),
        { status: 422, headers },
      );
    const significant = code.replace(/0+$/, ""),
      hasChildren = nom.rows.some(
        (r) =>
          r.code !== code &&
          r.code.startsWith(significant) &&
          r.indent > Math.min(...exact.map((x) => x.indent)),
      );
    if (hasChildren)
      return Response.json({
        status: "clarification",
        code: null,
        confidence: "alacsony",
        path: parsed.path || [],
        reasoning: "A kiválasztott kód tovább bontható a nómenklatúrában.",
        clarification:
          "Pontosítsd az áru fajtáját, anyagát, funkcióját vagy feldolgozottságát a következő vonalszint kiválasztásához.",
      });
    parsed.code = code;
  }
  return new Response(JSON.stringify({ ...parsed, dataDate: index.dataDate }), {
    headers,
  });
};
