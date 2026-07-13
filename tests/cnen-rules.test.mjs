import { findCnenEvidence } from "../netlify/functions/lib/cnen-rules.mjs";
import { loadCnenIndex } from "../netlify/functions/lib/cnen-index-data.mjs";

const index = await loadCnenIndex();
if (index.source.contentFormat !== "kn10-row-bilingual" || index.recordCount !== 25820)
  throw new Error("A 25 820 soros kétnyelvű KN10-forrás verziója vagy rekordszáma hibás.");
if (!index.source.languages?.includes("EN") || !index.source.languages?.includes("HU")
  || index.pairing?.matchedRows !== 25820
  || index.pairing?.explanationPairs !== 19538
  || index.pairing?.rowsWithoutExplanation !== 6282
  || index.pairing?.uniqueExplanationKeys !== 2447)
  throw new Error("A magyar–angol KN10-sorpárosítás metaadatai hibásak.");
if (index.records.length !== 25820 || index.noteCount !== 2447 || index.headingIds.length !== 1331)
  throw new Error("A KN10 sorok, magyarázatkulcsok vagy négyszámjegyű fejlécek száma hibás.");
if (index.coverage.totalKn8 !== 12792 || index.coverage.explainedKn8 !== 9148
  || index.coverage.missingKn8 !== 3644 || index.coverage.missingRows !== 6282)
  throw new Error("A KN10 magyarázat-lefedettségi összesítés hibás.");

const phone = findCnenEvidence("8517130000", index, 10);
if (!phone.some((item) => /telephone sets/i.test(item.excerpt) && /távbeszélő-készülék/i.test(item.excerptHu)))
  throw new Error("A 8517-es kétnyelvű telefonmagyarázat hiányzik.");
const cases = findCnenEvidence("4202000000", index, 10);
if (!cases.some((item) => /trunks|suitcases/i.test(item.excerpt) && /bőrönd|koffer/i.test(item.excerptHu)))
  throw new Error("A 4202-es kétnyelvű tartómagyarázat hiányzik.");
const animal = findCnenEvidence("0106190000", index, 10);
if (!animal.some((item) => /live mammals/i.test(item.excerpt) && /élő emlős/i.test(item.excerptHu)))
  throw new Error("A 010619 kétnyelvű élőállat-magyarázata hiányzik.");

const duplicateCode = Object.entries(index.exactLookup).find(([, ids]) => ids.length > 1);
if (!duplicateCode || duplicateCode[1].some((id) => !index.records[id]))
  throw new Error("A forrásban szereplő, azonos KN10-kódú hierarchiasorok nem maradtak meg.");
const noNote = index.records.find((record) => record.k == null);
if (!noNote || noNote.t !== "" || noNote.tHu !== "")
  throw new Error("A magyarázat nélküli KN10-sorok megőrzése hibás.");

console.log(`OK KN10 JSON: ${index.recordCount} sor, ${index.pairing.explanationPairs} kétnyelvű magyarázatos sor, ${index.coverage.missingRows} magyarázat nélküli sor`);
