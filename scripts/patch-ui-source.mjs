import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const appPath = resolve("src/App.jsx");
let source = await readFile(appPath, "utf8");

const replacements = [
  [
    '{L("Tartalom","Content")}',
    '{L("Tallózás","Browse")}',
  ],
  [
    '<h4>{L("Eredeti angol magyarázó szöveg","Explanatory note")}</h4><p>{cnenSelected.content}</p>',
    '<h4>{L("Magyar magyarázó szöveg","Explanatory note")}</h4><p>{lang==="hu"?(cnenSelected.contentHu||cnenSelected.content):cnenSelected.content}</p>',
  ],
  [
    'const clean = (value) => value.replace(/\\D/g, "").slice(0, 10);',
    'const clean = (value) => String(value ?? "").replace(/\\D/g, "").slice(0, 10);',
  ],
  [
    '<div className="code-card"><span>{t.code}</span><strong>{grouped(code)}</strong><small>HS / KN / TARIC</small></div>',
    '<label className="code-card"><span>{t.code}</span><input className="taric-code-input" inputMode="numeric" autoComplete="off" maxLength={10} value={code} onChange={(event)=>{setCode(clean(event.target.value));setResult(null);setMeasures(null);setError("");}} placeholder="0000000000" aria-label={t.code}/><small>{grouped(code)} · HS / KN / TARIC</small></label>',
  ],
  [
    'if (normalizedInput) setCode("");',
    'if (normalizedInput && clean(code).length < 4) setCode("");',
  ],
  [
    'const classified = (product.trim() || inputText.trim()) ? await getJson("/api/tariff-agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: product.trim() || inputText.trim().split(/\\n+/)[0], description: normalizedInput, language: lang, confirmedFacts: factState }) }) : { status: "classified", code: clean(code), confidence: "megadott", path: [], reasoning: "Felhasználó által megadott TARIC-kód." };',
    'const manualCode=clean(code);\n      const classified = manualCode.length>=4 ? { status: "classified", code: manualCode, confidence: L("megadott","provided"), path: [], reasoning: L("Felhasználó által megadott KN/TARIC-kód.","User-provided CN/TARIC code.") } : (product.trim() || inputText.trim()) ? await getJson("/api/tariff-agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: product.trim() || inputText.trim().split(/\\n+/)[0], description: normalizedInput, language: lang, confirmedFacts: factState }) }) : { status: "clarification", clarification: L("Legalább 4 számjegyű KN/TARIC-kód vagy termékleírás szükséges.","Enter at least a four-digit CN/TARIC code or a product description."), path: [] };',
  ],
  [
    'disabled={loading || (!code && !product.trim() && !query.trim())}',
    'disabled={loading || (clean(code).length<4 && !product.trim() && !query.trim())}',
  ],
  [
    'onChange={(e) => {setProduct(e.target.value);setConfirmedFacts({});}}',
    'onChange={(e) => {setProduct(e.target.value);setCode("");setResult(null);setMeasures(null);setConfirmedFacts({});}}',
  ],
  [
    'onChange={(e) => {setQuery(e.target.value);setConfirmedFacts({});}}',
    'onChange={(e) => {setQuery(e.target.value);setCode("");setResult(null);setMeasures(null);setConfirmedFacts({});}}',
  ],
];

for (const [before, after] of replacements) {
  if (source.includes(after)) continue;
  if (!source.includes(before)) {
    throw new Error(`A várt App.jsx részlet nem található: ${before.slice(0, 100)}`);
  }
  source = source.replace(before, after);
}

const oldHelper = `  const applyCnenSelection=(record)=>{\n    const selectedCode=clean(record?.requestedCode||record?.code||record?.codes?.[0]||"");\n    const hungarianName=String(record?.headingHu||record?.heading||"").trim();\n    if(selectedCode)setCode(selectedCode);\n    if(hungarianName)setProduct(hungarianName);\n    setQuery("");\n    setConfirmedFacts({});\n    setResult(null);\n    setMeasures(null);\n    setError("");\n    setTopPanel(null);\n    requestAnimationFrame(()=>{\n      document.querySelector(".agent-panel")?.scrollIntoView({behavior:"smooth",block:"start"});\n      document.querySelector(".agent-panel input")?.focus();\n    });\n  };\n`;
const newHelper = `  const applyCnenSelection=async(record)=>{\n    const selectedPrefix=clean(record?.requestedCode||record?.code||record?.codes?.[0]||"");\n    let selectedCode=selectedPrefix;\n    let hungarianName=String(record?.headingHu||record?.heading||"").trim();\n    if(selectedPrefix){\n      try{\n        const taricData=await getJson(\`/api/taric-search?q=\${encodeURIComponent(selectedPrefix)}\`);\n        const candidates=(taricData.results||[]).filter((item)=>clean(item?.vtsz).startsWith(selectedPrefix));\n        const exactCandidate=candidates.find((item)=>clean(item?.vtsz)===selectedPrefix.padEnd(10,"0"));\n        const resolvedCandidate=exactCandidate||(candidates.length===1?candidates[0]:null);\n        if(resolvedCandidate){\n          selectedCode=clean(resolvedCandidate.vtsz);\n          hungarianName=String(resolvedCandidate.descriptionHu||hungarianName).trim();\n        }\n      }catch{}\n    }\n    if(selectedCode)setCode(selectedCode);\n    if(hungarianName)setProduct(hungarianName);\n    setQuery("");\n    setConfirmedFacts({});\n    setResult(null);\n    setMeasures(null);\n    setError("");\n    setTopPanel(null);\n    requestAnimationFrame(()=>{\n      document.querySelector(".agent-panel")?.scrollIntoView({behavior:"smooth",block:"start"});\n      document.querySelector(".agent-panel input")?.focus();\n    });\n  };\n`;

if (source.includes(oldHelper)) {
  source = source.replace(oldHelper, newHelper);
} else if (!source.includes(newHelper)) {
  const anchor = '  const loadCnenSearch=async(searchValue=cnenQuery)=>{setCnenLoading(true);setCnenError("");try{const data=await getJson(`/api/cnen-content?q=${encodeURIComponent(searchValue)}&limit=50`);setCnenData(data);if(data.results?.length)await loadCnenRecord(data.results[0].code);else setCnenSelected(null);}catch(error){setCnenError(error.message);setCnenData(null);setCnenSelected(null);}finally{setCnenLoading(false);}};\n';
  if (!source.includes(anchor)) throw new Error("A CNEN kereső függvény nem található az App.jsx fájlban.");
  source = source.replace(anchor, `${anchor}${newHelper}`);
}

if (!source.includes('className="cnen-use-code"')) {
  const childrenButton = '<button type="button" className="cnen-children" onClick={()=>{setCnenQuery(cnenSelected.code);loadCnenSearch(cnenSelected.code);}}>{L("Kód alatti megjegyzések tallózása","Browse notes below this code")}</button>';
  const actionButtons = '<div className="cnen-detail-actions"><button type="button" className="cnen-use-code" onClick={()=>applyCnenSelection(cnenSelected)}>{L("Kód és magyar megnevezés átvétele","Use code and Hungarian product name")}</button>' + childrenButton + '</div>';
  if (!source.includes(childrenButton)) throw new Error("A KN-részlet tallózógombja nem található az App.jsx fájlban.");
  source = source.replace(childrenButton, actionButtons);
}

const gridIndex = source.indexOf('<section className="grid">');
const firstResultIndex = source.indexOf('{error &&');
if (gridIndex !== -1 && firstResultIndex !== -1 && gridIndex < firstResultIndex) {
  const gridMatch = source.match(/\n    <section className="grid">.*?<\/section>\n/s);
  if (!gridMatch) throw new Error("Az alsó adatállapotblokk nem emelhető ki az App.jsx fájlból.");
  const gridBlock = gridMatch[0];
  source = source.replace(gridBlock, "\n");
  const footerMarker = "\n    <footer>";
  if (!source.includes(footerMarker)) throw new Error("A lábléc helye nem található az App.jsx fájlban.");
  source = source.replace(footerMarker, `${gridBlock}${footerMarker}`);
}

await writeFile(appPath, source, "utf8");
console.log("App.jsx nyelvi, tallózási, kézi kódbeviteli és eredményelrendezési javítások alkalmazva.");
