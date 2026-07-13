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
];

for (const [before, after] of replacements) {
  if (source.includes(after)) continue;
  if (!source.includes(before)) {
    throw new Error(`A várt App.jsx részlet nem található: ${before.slice(0, 100)}`);
  }
  source = source.replace(before, after);
}

if (!source.includes("const applyCnenSelection=")) {
  const anchor = '  const loadCnenSearch=async(searchValue=cnenQuery)=>{setCnenLoading(true);setCnenError("");try{const data=await getJson(`/api/cnen-content?q=${encodeURIComponent(searchValue)}&limit=50`);setCnenData(data);if(data.results?.length)await loadCnenRecord(data.results[0].code);else setCnenSelected(null);}catch(error){setCnenError(error.message);setCnenData(null);setCnenSelected(null);}finally{setCnenLoading(false);}};\n';
  const helper = `  const applyCnenSelection=(record)=>{\n    const selectedCode=clean(record?.requestedCode||record?.code||record?.codes?.[0]||"");\n    const hungarianName=String(record?.headingHu||record?.heading||"").trim();\n    if(selectedCode)setCode(selectedCode);\n    if(hungarianName)setProduct(hungarianName);\n    setQuery("");\n    setConfirmedFacts({});\n    setResult(null);\n    setMeasures(null);\n    setError("");\n    setTopPanel(null);\n    requestAnimationFrame(()=>{\n      document.querySelector(".agent-panel")?.scrollIntoView({behavior:"smooth",block:"start"});\n      document.querySelector(".agent-panel input")?.focus();\n    });\n  };\n`;
  if (!source.includes(anchor)) throw new Error("A CNEN kereső függvény nem található az App.jsx fájlban.");
  source = source.replace(anchor, `${anchor}${helper}`);
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
console.log("App.jsx nyelvi, tallózási és eredményelrendezési javítások alkalmazva.");
