// KN10 vonalas fa és útvonal-lekérdezés a megbeszélt hierarchia-logikával.
//  GET /api/nomenclature-tree?code=<prefix>   → a prefix alá tartozó vonalas fa
//  GET /api/nomenclature-tree?path=<10jegyű>  → breadcrumb + kontextusfa a kódhoz
import { readFile } from "node:fs/promises";
import { kn10HierarchyFor, displayCode } from "./lib/kn10-hierarchy.mjs";

const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300" };
const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 10);

let nomenclaturePromise;
const loadNomenclature = () => nomenclaturePromise ??= readFile(
  new URL("../../data/generated/nomenclature-rows.json", import.meta.url), "utf8",
).then(JSON.parse);

export default async (request) => {
  const url = new URL(request.url);
  const pathCode = digits(url.searchParams.get("path") || "");
  const prefix = digits(url.searchParams.get("code") || "");
  if (!pathCode && prefix.length < 2)
    return new Response(JSON.stringify({ error: "Legalább 2 számjegy szükséges." }), { status: 400, headers });
  const nomenclature = await loadNomenclature();
  const hierarchy = kn10HierarchyFor(nomenclature);

  if (pathCode) {
    const code = pathCode.padEnd(10, "0");
    const breadcrumb = hierarchy.breadcrumb(code);
    if (!breadcrumb.length)
      return new Response(JSON.stringify({ error: "A kód nem található az aktuális nómenklatúrában.", code }), { status: 404, headers });
    return new Response(JSON.stringify({
      status: "ok",
      dataDate: hierarchy.dataDate,
      code,
      displayCode: displayCode(code),
      breadcrumb,
      contextTree: hierarchy.contextTree(code),
      residualNote: hierarchy.residualNote(code),
    }), { headers });
  }

  const tree = hierarchy.nodes
    .filter((node) => node.code.startsWith(prefix))
    .map((node) => ({
      code: node.code,
      displayCode: displayCode(node.code),
      depth: node.depth,
      line: "─".repeat(Math.max(0, node.depth - 1)),
      productLine: node.productLine,
      description: node.description,
      residualResolution: hierarchy.resolveResidual(node),
      terminal: node.isDeclarableLine && !node.hasDeeperLines,
    }));
  return new Response(JSON.stringify({ status: "ok", dataDate: hierarchy.dataDate, prefix, count: tree.length, tree }), { headers });
};
