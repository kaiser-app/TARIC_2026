import { readFile } from "node:fs/promises";
import measures from "../netlify/functions/measures.mjs";

const meta = JSON.parse(await readFile(new URL("../data/generated/measures-index-meta.json", import.meta.url), "utf8"));
if (meta.runtimeFormat !== "chapter-sharded-v1" || !meta.chapters?.includes("85"))
  throw new Error("A fejezetenkénti intézkedésindex nem készült el a 85. árucsoporthoz.");

const response = await measures(new Request("http://local/api/measures?code=8517130000&origin=CN&direction=import&traffic=b2b&valueHuf=100000&ecbRate=354.13"));
const body = await response.json();
if (response.status !== 200)
  throw new Error(`A 8517130000 intézkedéslekérdezése hibás státuszt adott: ${response.status} ${body.error || ""}`);
if (body.runtimeFormat !== "chapter-sharded-v1" || body.code !== "8517130000" || !Array.isArray(body.groups) || body.groups.length === 0)
  throw new Error("A fejezetenkénti intézkedéslekérdezés válasza hiányos.");
if (!body.groups.some((group) => group.type === "103") || !body.groups.some((group) => group.type === "AAF"))
  throw new Error("Az okostelefonhoz tartozó vám- vagy áfaintézkedés hiányzik.");

console.log(`OK intézkedésindex: ${meta.chapters.length} fejezet, 8517130000 → ${body.groups.length} csoport`);
