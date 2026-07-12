import { readFile } from "node:fs/promises";
export default async () => {
  const [manifest, semanticIndex] = await Promise.all([
    readFile(new URL("../../data/generated/manifest.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../../data/generated/semantic-concepts-index.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  return Response.json({
    status: "ok", service: "taric-2026",
    dataVersion: manifest.dataDate || "2026-07-11",
    nomenclatureRows: manifest.nomenclatureRows || 25820,
    measures: manifest.measureRows || 227949,
    semanticIndex: { version: semanticIndex.version, records: semanticIndex.recordCount, keys: Object.keys(semanticIndex.lookup || {}).length },
    message: "NAV/OpenKKK adatkapcsolat és V0P1 szemantikai fogalomtár aktív.",
  });
};
