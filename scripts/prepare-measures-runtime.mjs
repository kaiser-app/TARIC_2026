import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const sourcePath = resolve("data/generated/measures-index.json");
const outputDir = resolve("data/generated/measures-by-chapter");
const metaPath = resolve("data/generated/measures-index-meta.json");

const source = JSON.parse(await readFile(sourcePath, "utf8"));
const { byCode = {}, ratesByCode = {}, countryGroups = {}, ...metadata } = source;
const shards = new Map();

function shardKey(sourceCode) {
  const normalized = String(sourceCode || "").replace(/\D/g, "");
  const applicablePrefix = normalized.replace(/0+$/, "");
  return applicablePrefix.length >= 2 ? applicablePrefix.slice(0, 2) : "_global";
}

function addRows(kind, rowsByCode) {
  for (const [sourceCode, rows] of Object.entries(rowsByCode || {})) {
    const key = shardKey(sourceCode);
    const shard = shards.get(key) || { byCode: {}, ratesByCode: {} };
    shard[kind][sourceCode] = rows;
    shards.set(key, shard);
  }
}

addRows("byCode", byCode);
addRows("ratesByCode", ratesByCode);
if (!shards.has("_global")) shards.set("_global", { byCode: {}, ratesByCode: {} });

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
for (const [key, shard] of shards)
  await writeFile(resolve(outputDir, `${key}.json`), `${JSON.stringify(shard)}\n`, "utf8");

const chapters = [...shards.keys()].filter((key) => /^\d{2}$/.test(key)).sort();
await writeFile(metaPath, `${JSON.stringify({
  ...metadata,
  countryGroups,
  runtimeFormat: "chapter-sharded-v1",
  chapters,
  globalShard: "_global",
})}\n`, "utf8");

console.log(`Prepared measures runtime: ${chapters.length} chapter shards plus global data.`);
