import { access, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const huZip = resolve("data/source/kn10/kn10_magyarazatok_HU.zip");
const enZip = resolve("data/source/kn10/kn10_magyarazatok_EN.zip");
const directIndex = resolve("data/generated/kn10-explanations-index.json");
const generatedSource = resolve("data/generated/cnen-bilingual-source.json");
const compressedSourcePart = resolve("data/source/cnen-bilingual-source.json.gz.b64.part00");
const exists = async (path) => { try { await access(path); return true; } catch { return false; } };
const run = (script) => {
  const result = spawnSync(process.execPath, [resolve(script)], { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${script} hibával leállt (${result.status}).`);
};

if (await exists(huZip) && await exists(enZip)) {
  run("scripts/build-kn10-explanations-from-zips.mjs");
} else if (await exists(directIndex)) {
  console.log("A 25 820 soros KN10 magyarázat-index már rendelkezésre áll.");
} else if (await exists(generatedSource) || await exists(compressedSourcePart)) {
  run("scripts/resolve-bilingual-cnen.mjs");
} else {
  await mkdir(resolve("data/generated"), { recursive: true });
  await mkdir(resolve("public"), { recursive: true });
  const coverage = { schemaVersion: "1.0.0", status: "bilingual_source_pending", sourceRecordCount: 2533,
    totalKn8: 0, explainedKn8: 0, missingKn8: 0, coveragePercent: 0,
    totalTaric10: 0, explainedTaric10: 0, missingTaric10: 0, unmappedSourceRecordCount: 0, pairing: null };
  await writeFile(resolve("data/generated/cnen-missing.json"), `${JSON.stringify({ schemaVersion: "1.0.0", coverage, records: [] })}\n`);
  await writeFile(resolve("data/generated/cnen-coverage.json"), `${JSON.stringify(coverage, null, 2)}\n`);
  await writeFile(resolve("public/cnen-missing.csv"), "\uFEFFKN8;KN-kód;Magyar megnevezés;Kapcsolódó TARIC10-kódok száma;TARIC10-kódok;Állapot\r\n", "utf8");
  console.warn("A két KN10 JSON ZIP még nincs a repóban; a build a korábbi indexszel folytatódik.");
}
