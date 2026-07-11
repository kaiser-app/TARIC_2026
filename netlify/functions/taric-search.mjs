import { readFile } from "node:fs/promises";

const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300" };

export default async (request) => {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return new Response(JSON.stringify({ error: "A q keresési paraméter kötelező." }), { status: 400, headers });

  let dataset;
  try {
    dataset = JSON.parse(await readFile(new URL("../../data/generated/taric-index.json", import.meta.url), "utf8"));
  } catch {
    return new Response(JSON.stringify({
      status: "data_not_loaded",
      message: "A hiteles NAV/OpenKKK adatcsomag még nincs importálva.",
      results: []
    }), { status: 503, headers });
  }

  const digits = q.replace(/\D/g, "");
  const needle = q.toLocaleLowerCase("hu");
  const results = dataset.records.filter(row =>
    (digits && row.vtsz.startsWith(digits)) ||
    row.descriptionHu?.toLocaleLowerCase("hu").includes(needle)
  ).slice(0, 25);

  return new Response(JSON.stringify({
    status: "ok",
    generatedAt: dataset.generatedAt,
    recordCount: dataset.recordCount,
    results
  }), { headers });
};
