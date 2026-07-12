import { readFile } from "node:fs/promises";
export default async () => {
  const manifest = JSON.parse(await readFile(new URL("../../data/generated/manifest.json", import.meta.url), "utf8"));
  return Response.json({ status: "ok", service: "taric-2026", dataVersion: manifest.dataDate || "2026-07-11", nomenclatureRows: manifest.nomenclatureRows || 25820, measures: manifest.measureRows || 227949, message: "NAV/OpenKKK adatkapcsolat aktív." });
};
