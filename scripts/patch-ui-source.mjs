import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const appPath = resolve("src/App.jsx");
let source = await readFile(appPath, "utf8");

if (!source.includes('from "./cnen-hierarchy.js"')) {
  const importAnchor = 'import { AlertCircle, ExternalLink, FileText, LoaderCircle, Search, ShieldCheck } from "lucide-react";';
  if (!source.includes(importAnchor)) throw new Error("A lucide-react import nem található az App.jsx fájlban.");
  source = source.replace(importAnchor, `${importAnchor}\nimport { cnenHierarchyForCode } from "./cnen-hierarchy.js";`);
}
if (!source.includes('from "./taric-link.js"')) {
  const importAnchor = 'import { cnenHierarchyForCode } from "./cnen-hierarchy.js";';
  if (!source.includes(importAnchor)) throw new Error("A KN-hierarchia import nem található az App.jsx fájlban.");
  source = source.replace(importAnchor, `${importAnchor}\nimport { buildEuTaricUrl } from "./taric-link.js";`);
}

const replacements = [
  ['{L("Tartalom","Content")}', '{L("Tallózás","Browse")}'],
  ['<h4>{L("Eredeti angol magyarázó szöveg","Explanatory note")}</h4><p>{cnenSelected.content}</p>', '<h4>{L("Magyar magyarázó szöveg","Explanatory note")}</h4><p>{lang==="hu"?(cnenSelected.contentHu||cnenSelected.content):cnenSelected.content}</p>'],
  ['const clean = (value) => value.replace(/\\D/g, "").slice(0, 10);', 'const clean = (value) => String(value ?? "").replace(/\\D/g, "").slice(0, 10);'],
  ['<div className="code-card"><span>{t.code}</span><strong>{grouped(code)}</strong><small>HS / KN / TARIC</small></div>', '<label className="code-card"><span>{t.code}</span><input className="taric-code-input" inputMode="numeric" autoComplete="off" maxLength={10} value={code} onChange={(event)=>{setCode(clean(event.target.value));setResult(null);setMeasures(null);setError("");}} placeholder="0000000000" aria-label={t.code}/><small>{grouped(code)} · HS / KN / TARIC</small></label>'],
  ['if (normalizedInput) setCode("");', 'if (normalizedInput && clean(code).length < 4) setCode("");'],
  ['const classified = (product.trim() || inputText.trim()) ? await getJson("/api/tariff-agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: product.trim() || inputText.trim().split(/\\n+/)[0], description: normalizedInput, language: lang, confirmedFacts: factState }) }) : { status: "classified", code: clean(code), confidence: "megadott", path: [], reasoning: "Felhasználó által megadott TARIC-kód." };', 'const manualCode=clean(code);\n      const classified = manualCode.length>=4 ? { status: "classified", code: manualCode, confidence: L("megadott","provided"), path: [], reasoning: L("Felhasználó által megadott KN/TARIC-kód.","User-provided CN/TARIC code.") } : (product.trim() || inputText.trim()) ? await getJson("/api/tariff-agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: product.trim() || inputText.trim().split(/\\n+/)[0], description: normalizedInput, language: lang, confirmedFacts: factState }) }) : { status: "clarification", clarification: L("Legalább 4 számjegyű KN/TARIC-kód vagy termékleírás szükséges.","Enter at least a four-digit CN/TARIC code or a product description."), path: [] };'],
  ['disabled={loading || (!code && !product.trim() && !query.trim())}', 'disabled={loading || (clean(code).length<4 && !product.trim() && !query.trim())}'],
  ['onChange={(e) => {setProduct(e.target.value);setConfirmedFacts({});}}', 'onChange={(e) => {setProduct(e.target.value);setCode("");setResult(null);setMeasures(null);setConfirmedFacts({});}}'],
  ['onChange={(e) => {setQuery(e.target.value);setConfirmedFacts({});}}', 'onChange={(e) => {setQuery(e.target.value);setCode("");setResult(null);setMeasures(null);setConfirmedFacts({});}}'],
  ['<div className="links">{links.map((x) => <a href={x.href} target="_blank" rel="noreferrer" key={x.href}>{x.label}<ExternalLink size={15} /></a>)}</div>', '<div className="links">{links.map((x) => {const href=x.label==="EU TARIC"?buildEuTaricUrl({code,date:options.date,lang}):x.href;return <a href={href} target="_blank" rel="noreferrer" key={x.label}>{x.label}<ExternalLink size={15} /></a>;})}</div>'],
];

for (const [before, after] of replacements) {
  if (source.includes(after)) continue;
  if (!source.includes(before)) throw new Error(`A várt App.jsx részlet nem található: ${before.slice(0, 100)}`);
  source = source.replace(before, after);
}

const oldLoadCnenRecord = '  const loadCnenRecord=async(codeValue)=>{setCnenLoading(true);setCnenError("");try{const data=await getJson(`/api/cnen-content?code=${encodeURIComponent(codeValue)}`);setCnenSelected(data.record);}catch(error){setCnenSelected(null);setCnenError(error.message);}finally{setCnenLoading(false);}};\n';
const newLoadCnenRecord = `  const loadCnenRecord=async(codeValue)=>{\n    setCnenLoading(true);setCnenError("");\n    try{\n      const hierarchy=cnenHierarchyForCode(codeValue);\n      const [data,chapterData]=await Promise.all([\n        getJson(\`/api/cnen-content?code=\${encodeURIComponent(codeValue)}\`),\n        hierarchy.chapterCode?getJson(\`/api/nomenclature-tree?code=\${encodeURIComponent(hierarchy.chapterCode)}\`).catch(()=>({tree:[]})):Promise.resolve({tree:[]}),\n      ]);\n      const chapterRoot=(chapterData.tree||[]).find((row)=>clean(row?.code)===hierarchy.chapterCode.padEnd(10,"0"));\n      setCnenSelected({\n        ...data.record,\n        ...hierarchy,\n        chapterDescriptionHu:String(chapterRoot?.description||data.record?.chapterDescriptionHu||"").trim(),\n        chapterDescriptionEn:String(chapterRoot?.descriptionEn||chapterRoot?.description||data.record?.chapterDescriptionEn||data.record?.chapterDescriptionHu||"").trim(),\n      });\n    }catch(error){setCnenSelected(null);setCnenError(error.message);}\n    finally{setCnenLoading(false);}\n  };\n`;
if (source.includes(oldLoadCnenRecord)) source = source.replace(oldLoadCnenRecord, newLoadCnenRecord);
else if (!source.includes("cnenHierarchyForCode(codeValue)")) throw new Error("A KN-részlet betöltő függvénye nem található.");

const oldHelper = `  const applyCnenSelection=(record)=>{\n    const selectedCode=clean(record?.requestedCode||record?.code||record?.codes?.[0]||"");\n    const hungarianName=String(record?.headingHu||record?.heading||"").trim();\n    if(selectedCode)setCode(selectedCode);\n    if(hungarianName)setProduct(hungarianName);\n    setQuery("");\n    setConfirmedFacts({});\n    setResult(null);\n    setMeasures(null);\n    setError("");\n    setTopPanel(null);\n    requestAnimationFrame(()=>{\n      document.querySelector(".agent-panel")?.scrollIntoView({behavior:"smooth",block:"start"});\n      document.querySelector(".agent-panel input")?.focus();\n    });\n  };\n`;
const newHelper = `  const applyCnenSelection=async(record)=>{\n    const selectedPrefix=clean(record?.requestedCode||record?.code||record?.codes?.[0]||"");\n    let selectedCode=selectedPrefix;\n    let hungarianName=String(record?.headingHu||record?.heading||"").trim();\n    if(selectedPrefix){\n      try{\n        const taricData=await getJson(\`/api/taric-search?q=\${encodeURIComponent(selectedPrefix)}\`);\n        const candidates=(taricData.results||[]).filter((item)=>clean(item?.vtsz).startsWith(selectedPrefix));\n        const exactCandidate=candidates.find((item)=>clean(item?.vtsz)===selectedPrefix.padEnd(10,"0"));\n        const resolvedCandidate=exactCandidate||(candidates.length===1?candidates[0]:null);\n        if(resolvedCandidate){selectedCode=clean(resolvedCandidate.vtsz);hungarianName=String(resolvedCandidate.descriptionHu||hungarianName).trim();}\n      }catch{}\n    }\n    if(selectedCode)setCode(selectedCode);\n    if(hungarianName)setProduct(hungarianName);\n    setQuery("");setConfirmedFacts({});setResult(null);setMeasures(null);setError("");setTopPanel(null);\n    requestAnimationFrame(()=>{document.querySelector(".agent-panel")?.scrollIntoView({behavior:"smooth",block:"start"});document.querySelector(".agent-panel input")?.focus();});\n  };\n`;
if (source.includes(oldHelper)) source = source.replace(oldHelper, newHelper);
else if (!source.includes(newHelper)) {
  const anchor = '  const loadCnenSearch=async(searchValue=cnenQuery)=>{setCnenLoading(true);setCnenError("");try{const data=await getJson(`/api/cnen-content?q=${encodeURIComponent(searchValue)}&limit=50`);setCnenData(data);if(data.results?.length)await loadCnenRecord(data.results[0].code);else setCnenSelected(null);}catch(error){setCnenError(error.message);setCnenData(null);setCnenSelected(null);}finally{setCnenLoading(false);}};\n';
  if (!source.includes(anchor)) throw new Error("A CNEN kereső függvény nem található az App.jsx fájlban.");
  source = source.replace(anchor, `${anchor}${newHelper}`);
}

if (!source.includes('className="cnen-hierarchy"')) {
  const detailTitle = '<div className="cnen-detail-title"><code>{groupedCnen(cnenSelected.code)}</code><h3>{lang==="hu"&&cnenSelected.headingHu?cnenSelected.headingHu:cnenSelected.heading}</h3></div>';
  const hierarchy = `${detailTitle}<dl className="cnen-hierarchy">{cnenSelected.sectionCode&&<div><dt>{L("Áruosztály","Section")}</dt><dd><code>{cnenSelected.sectionCode}</code><span>{lang==="hu"?(cnenSelected.sectionDescriptionHu||cnenSelected.sectionDescriptionEn):(cnenSelected.sectionDescriptionEn||cnenSelected.sectionDescriptionHu)}</span></dd></div>}{cnenSelected.chapterCode&&<div><dt>{L("Árucsoport","Chapter")}</dt><dd><code>{cnenSelected.chapterCode}</code><span>{lang==="hu"?(cnenSelected.chapterDescriptionHu||cnenSelected.chapterDescriptionEn):(cnenSelected.chapterDescriptionEn||cnenSelected.chapterDescriptionHu)}</span></dd></div>}</dl>`;
  if (!source.includes(detailTitle)) throw new Error("A KN-részlet fejléc nem található az App.jsx fájlban.");
  source = source.replace(detailTitle, hierarchy);
}

if (!source.includes('className="cnen-use-code"')) {
  const childrenButton = '<button type="button" className="cnen-children" onClick={()=>{setCnenQuery(cnenSelected.code);loadCnenSearch(cnenSelected.code);}}>{L("Kód alatti megjegyzések tallózása","Browse notes below this code")}</button>';
  const actionButtons = '<div className="cnen-detail-actions"><button type="button" className="cnen-use-code" onClick={()=>applyCnenSelection(cnenSelected)}>{L("Kód és magyar megnevezés átvétele","Use code and Hungarian product name")}</button>' + childrenButton + '</div>';
  if (!source.includes(childrenButton)) throw new Error("A KN-részlet tallózógombja nem található az App.jsx fájlban.");
  source = source.replace(childrenButton, actionButtons);
}

const contentMarker = '    {topPanel==="content"&&<section className="top-drawer cnen-browser">';
const heroMarker = '    <section className="hero">';
const agentMarker = '    <section className="panel agent-panel">';
let contentIndex = source.indexOf(contentMarker), heroIndex = source.indexOf(heroMarker), agentIndex = source.indexOf(agentMarker);
if (contentIndex < 0 || heroIndex < 0 || agentIndex < 0) throw new Error("A Tallózás, a fejléc vagy a termékűrlap helye nem található.");
if (!(contentIndex > heroIndex && contentIndex < agentIndex)) {
  const integrationMarker = '\n    {topPanel==="integration"';
  const contentEnd = source.indexOf(integrationMarker, contentIndex);
  if (contentEnd < 0) throw new Error("A Tallózás blokk vége nem található.");
  const contentBlock = source.slice(contentIndex, contentEnd);
  source = source.slice(0, contentIndex) + source.slice(contentEnd);
  agentIndex = source.indexOf(agentMarker);
  if (agentIndex < 0) throw new Error("A termékűrlap helye nem található az áthelyezéshez.");
  source = source.slice(0, agentIndex) + contentBlock + "\n" + source.slice(agentIndex);
}

const gridIndex = source.indexOf('<section className="grid">'), firstResultIndex = source.indexOf('{error &&');
if (gridIndex !== -1 && firstResultIndex !== -1 && gridIndex < firstResultIndex) {
  const gridMatch = source.match(/\n    <section className="grid">.*?<\/section>\n/s);
  if (!gridMatch) throw new Error("Az alsó adatállapotblokk nem emelhető ki az App.jsx fájlból.");
  const gridBlock = gridMatch[0];source = source.replace(gridBlock, "\n");
  const footerMarker = "\n    <footer>";
  if (!source.includes(footerMarker)) throw new Error("A lábléc helye nem található az App.jsx fájlban.");
  source = source.replace(footerMarker, `${gridBlock}${footerMarker}`);
}

if (!source.includes("const startRefresh=async()=>")) {
  const refreshFunction = '  const loadRefreshInfo=async()=>{setRefreshLoading(true);setRefreshError("");try{setRefreshInfo(await getJson("/api/refresh-data"));}catch(error){setRefreshInfo(null);setRefreshError(error.message);}finally{setRefreshLoading(false);}};\n';
  if (!source.includes(refreshFunction)) throw new Error("A törzsadatcsomag-ellenőrző függvény nem található.");
  const startRefresh = '  const startRefresh=async()=>{setRefreshLoading(true);setRefreshError("");try{setRefreshInfo(await getJson("/api/refresh-data",{method:"POST",headers:{"content-type":"application/json","x-admin-token":adminToken},body:"{}"}));}catch(error){setRefreshError(error.message);}finally{setRefreshLoading(false);}};\n';
  source = source.replace(refreshFunction, `${refreshFunction}${startRefresh}`);
}

const refreshBlockStart = source.indexOf('    {topPanel==="refresh"&&<section className="top-drawer refresh-drawer">');
const refreshBlockEnd = source.indexOf('\n    <section className="hero">', refreshBlockStart);
if (refreshBlockStart < 0 || refreshBlockEnd < 0) throw new Error("A Frissítés panel nem található.");
const currentRefreshBlock = source.slice(refreshBlockStart, refreshBlockEnd);
if (!currentRefreshBlock.includes("startRefresh")) {
  const nextRefreshBlock = `    {topPanel==="refresh"&&<section className="top-drawer refresh-drawer">
      <h2>{L("Törzsadat-frissítés","Master data update")}</h2>
      <p>{L("A NAV/OpenKKK publikálási mappában elérhető legfrissebb törzsadat-csomagok. A kézi indítás ugyanazt az ellenőrzött GitHub Actions importfolyamatot futtatja, mint a napi automatikus frissítés.","Latest master data packages in the NAV/OpenKKK publication folders. Manual start runs the same validated GitHub Actions import pipeline as the daily update.")}</p>
      {refreshLoading&&<p className="cnen-loading"><LoaderCircle className="spin" size={17}/>{L("Frissítési művelet folyamatban…","Update operation in progress…")}</p>}
      {refreshError&&<p className="question">{refreshError}</p>}
      {refreshInfo?.packages?.length>0&&<div className="refresh-packages">{refreshInfo.packages.map((pkg)=><a className="refresh-package" key={pkg.kind} href={pkg.downloadUrl} target="_blank" rel="noreferrer" download><code>{pkg.kind.toUpperCase()}</code><span>{pkg.fileName}</span><em>{L("Adatnap","Data date")}: {pkg.dataDate}</em><ExternalLink size={15}/></a>)}</div>}
      {refreshInfo?.errors?.length>0&&<p className="question">{refreshInfo.errors.join(" · ")}</p>}
      {refreshInfo?.status==="started"&&<p className="refresh-success"><b>{L("A kézi törzsadat-frissítés elindult.","Manual master data update started.")}</b> {refreshInfo.actionsUrl&&<a href={refreshInfo.actionsUrl} target="_blank" rel="noreferrer">{L("Futás megnyitása a GitHub Actionsben","Open run in GitHub Actions")}<ExternalLink size={14}/></a>}</p>}
      {["ok","partial"].includes(refreshInfo?.status)&&<small>{L("Ellenőrizve","Checked")}: {new Date(refreshInfo.checkedAt).toLocaleString(lang==="hu"?"hu-HU":"en-GB")}</small>}
      <div className="admin-login refresh-actions">
        <input type="password" value={adminToken} onChange={(event)=>setAdminToken(event.target.value)} placeholder={L("Admin-token a kézi indításhoz","Admin token for manual start")}/>
        <button type="button" onClick={startRefresh} disabled={refreshLoading}>{L("Frissítés indítása","Start update")}</button>
        <button type="button" onClick={loadRefreshInfo} disabled={refreshLoading}>{L("Csomagok újraellenőrzése","Check packages again")}</button>
      </div>
      <small>{L("A szolgáltatáson az ADMIN_TOKEN (vagy REFRESH_ADMIN_TOKEN) és a GitHub Actions jogosultságú GITHUB_ACTIONS_TOKEN környezeti változó szükséges.","The service requires ADMIN_TOKEN (or REFRESH_ADMIN_TOKEN) and a GITHUB_ACTIONS_TOKEN with Actions permission.")}</small>
    </section>}`;
  source = source.slice(0, refreshBlockStart) + nextRefreshBlock + source.slice(refreshBlockEnd);
}

await writeFile(appPath, source, "utf8");
console.log("App.jsx nyelvi, KN-hierarchiai, dinamikus EU TARIC-link, tallózási, kézi kódbeviteli, eredményelrendezési és kézi törzsadat-frissítési javítások alkalmazva.");
