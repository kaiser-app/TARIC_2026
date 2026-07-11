import { readFile } from "node:fs/promises";

const SYN = {
  "póló":"t ing trikó","tshirt":"t ing","t-shirt":"t ing","telefon":"távbeszélő okostelefon",
  "laptop":"hordozható automatikus adatfeldolgozó gép","notebook":"hordozható automatikus adatfeldolgozó gép",
  "cipő":"lábbeli","fülhallgató":"fejhallgató","töltő":"áramátalakító statikus",
  "telefontok":"műanyag áru tok tartó bőr textil","tok":"műanyag áru tok tartó bőr textil",
  "tartó":"műanyag áru tok tartó","tasak":"tok tartó bőr textil","huzat":"műanyag áru tok",
  "táska":"bőrönd koffer táska tok"
};
const norm = s => String(s || "").toLocaleLowerCase("hu").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const wordsFor = query => {
  const raw = query.toLocaleLowerCase("hu");
  const tokens = raw.split(/[^a-zá-ű0-9]+/i).filter(Boolean);
  const expanded = tokens.flatMap(token => [token, ...(SYN[token] || "").split(" ")]);
  return [...new Set(expanded.map(norm).filter(word => word.length > 2))];
};
const headers = {"content-type":"application/json; charset=utf-8","cache-control":"public, max-age=300"};

export default async request => {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim();
  if (!query) return new Response(JSON.stringify({error:"A terméknév vagy leírás kötelező."}),{status:400,headers});
  const dataset = JSON.parse(await readFile(new URL("../../data/generated/taric-index.json",import.meta.url),"utf8"));
  const words = wordsFor(query);
  const scored = [];
  for (const row of dataset.records) {
    if (!row.descriptionHu) continue;
    const description = norm(row.descriptionHu);
    let score = 0, matched = 0;
    for (const word of words) {
      if (description.includes(word)) { score += word.length + (description.startsWith(word) ? 4 : 0); matched++; }
    }
    if (score) scored.push({...row,score,matched});
  }
  scored.sort((a,b)=>b.score-a.score || b.matched-a.matched || a.vtsz.localeCompare(b.vtsz));
  const candidates = scored.slice(0,20);
  const top = candidates[0];
  const second = candidates[1];
  const confidence = !top ? "nincs" : top.matched >= 2 && (!second || top.score >= second.score * 1.35) ? "közepes" : "alacsony";
  return new Response(JSON.stringify({
    status:"ok",dataDate:dataset.dataDate,recordCount:dataset.recordCount,query,
    confidence,
    warning:"A találatok nómenklatúra-jelöltek, nem automatikus végleges tarifális döntések. Az anyag, funkció és feldolgozottság pontosítása szükséges lehet.",
    candidates
  }),{headers});
};
