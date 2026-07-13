import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const inputPath = resolve(process.argv[2] || "");
const outputPath = resolve(process.argv[3] || "data/generated/cnen-rules-index.json");

if (!process.argv[2]) {
  console.error("Használat: node scripts/build-cnen-index.mjs <CNEN.pdf|CNEN.txt> [kimenet.json]");
  process.exit(1);
}

const rawText = extname(inputPath).toLowerCase() === ".pdf"
  ? execFileSync("pdftotext", ["-layout", inputPath, "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  : readFileSync(inputPath, "utf8");

const versionMatch = rawText.match(/02019XC0329\(02\)\s+—\s+EN\s+—\s+(\d{2}\.\d{2}\.\d{4})\s+—\s+(\d{3}\.\d{3})/);
if (!versionMatch) throw new Error("A forrás verziófejléce nem ismerhető fel.");
const [, documentDate, consolidation] = versionMatch;
if (documentDate !== "13.02.2026")
  throw new Error(`Nem a jóváhagyott 2026-02-13-i egységes szerkezetű forrás: ${documentDate}`);

const normalizeCode = (value) => String(value || "").replace(/\D/g, "");
const codeHeading = /^\s{0,12}((?:\d{4}(?: \d{2}){0,2})(?:(?:\s+(?:and|to)\s+|\s*,\s*)\d{4}(?: \d{2}){0,2})*)\s{2,}(.+)$/;
const pageHeader = /02019XC0329\(02\)\s+—\s+EN\s+—\s+13\.02\.2026\s+—\s+016\.001\s+—\s+(\d+)/;
const amendmentMarker = /^\s*[▼►][A-Z0-9]+\s*$/;

function sourceCodes(segment) {
  return [...segment.matchAll(/\d{4}(?: \d{2}){0,2}/g)]
    .map((match) => normalizeCode(match[0]));
}

function ruleTypes(text) {
  const lower = text.toLowerCase();
  return [
    /\b(?:include|includes|included|cover|covers|covered)\b/.test(lower) && "inclusion",
    /\b(?:exclude|excludes|excluded|does not cover|do not cover|not included)\b/.test(lower) && "exclusion",
    /\b(?:means|considered as|for the purposes of|is regarded as|are regarded as)\b/.test(lower) && "definition",
    /\b(?:see |see also|referred to|reference to)\b/.test(lower) && "cross_reference",
  ].filter(Boolean);
}

function cleanLines(page) {
  return page.split(/\r?\n/).filter((line) => {
    if (pageHeader.test(line) || amendmentMarker.test(line)) return false;
    if (/^\s*Official Journal of the European Union\s*$/.test(line)) return false;
    return true;
  });
}

const records = [];
let current = null;
const pages = rawText.split("\f");

for (let pdfPage = 0; pdfPage < pages.length; pdfPage += 1) {
  const page = pages[pdfPage];
  const printedPage = Number(page.match(pageHeader)?.[1] || 0) || null;
  for (const line of cleanLines(page)) {
    const heading = line.match(codeHeading);
    if (heading) {
      if (current) records.push(current);
      current = {
        sourceCodes: sourceCodes(heading[1]),
        title: heading[2].trim(),
        body: [],
        pdfPageStart: pdfPage + 1,
        pdfPageEnd: pdfPage + 1,
        printedPageStart: printedPage,
        printedPageEnd: printedPage,
      };
      continue;
    }
    if (!current) continue;
    const cleaned = line.trim();
    if (cleaned) current.body.push(cleaned);
    current.pdfPageEnd = pdfPage + 1;
    if (printedPage) current.printedPageEnd = printedPage;
  }
}
if (current) records.push(current);

const compactRecords = records.map((record, index) => {
  const text = [record.title, ...record.body].join(" ").replace(/\s+/g, " ").trim();
  const referencedCodes = [...new Set([...text.matchAll(/\b\d{4}(?: \d{2}){0,2}\b/g)]
    .map((match) => normalizeCode(match[0]))
    .filter((code) => code.length >= 4 && !record.sourceCodes.includes(code)))];
  return {
    id: index,
    c: record.sourceCodes,
    h: record.title,
    t: text.slice(0, 5000),
    y: ruleTypes(text),
    r: referencedCodes,
    p: record.pdfPageStart,
    q: record.pdfPageEnd,
    n: record.printedPageStart,
    o: record.printedPageEnd,
  };
});

const lookup = {};
for (const record of compactRecords) {
  for (const code of record.c) (lookup[code] ||= []).push(record.id);
}

const index = {
  schemaVersion: "1.0.0",
  generatorVersion: "cnen-parser-v1",
  source: {
    title: "Explanatory notes to the Combined Nomenclature of the European Union",
    celex: "02019XC0329(02)",
    language: "EN",
    documentDate: "2026-02-13",
    consolidation,
    authority: "interpretive_guidance",
    legallyBinding: false,
    sourceCodeEdition: 2019,
    currentCodeEdition: 2026,
    pageCount: pages.filter((page) => page.trim()).length,
  },
  codeMappings: [
    {
      current: "85171300",
      source: "85171200",
      kind: "split",
      note: "A 2019-es 8517 12 00 mobiltelefon-ág 2026-ban okostelefon (8517 13) és más mobiltelefon (8517 14) ágakra vált szét.",
    },
    {
      current: "85171400",
      source: "85171200",
      kind: "split",
      note: "A 2019-es 8517 12 00 mobiltelefon-ág 2026-ban okostelefon (8517 13) és más mobiltelefon (8517 14) ágakra vált szét.",
    },
  ],
  recordCount: compactRecords.length,
  records: compactRecords,
  lookup,
};

mkdirSync(resolve(outputPath, ".."), { recursive: true });
const serialized = `${JSON.stringify(index)}\n`;
writeFileSync(outputPath, serialized);
const encoded = gzipSync(serialized, { level: 9 }).toString("base64");
const partSize = 60_000;
const partPrefix = `${outputPath}.gz.b64.part`;
for (const file of readdirSync(resolve(outputPath, ".."))) {
  const candidate = resolve(outputPath, "..", file);
  if (candidate.startsWith(partPrefix)) unlinkSync(candidate);
}
for (let offset = 0, part = 0; offset < encoded.length; offset += partSize, part += 1)
  writeFileSync(`${partPrefix}${String(part).padStart(2, "0")}`, encoded.slice(offset, offset + partSize));
console.log(`CNEN-index elkészült: ${compactRecords.length} szabályblokk, ${Object.keys(lookup).length} kódkulcs, ${Math.ceil(encoded.length / partSize)} tömörített rész → ${outputPath}`);
