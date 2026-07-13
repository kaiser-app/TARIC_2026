import { readFile } from "node:fs/promises";
import { cnenHierarchyForCode } from "../src/cnen-hierarchy.js";

const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const mainSource = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
const uiCss = await readFile(new URL("../src/ui-fixes.css", import.meta.url), "utf8");
const aiSource = await readFile(new URL("../src/AiProviderPanel.jsx", import.meta.url), "utf8");
const aiCss = await readFile(new URL("../src/ai-provider-panel.css", import.meta.url), "utf8");

if (!source.includes('{L("Tallózás","Browse")}'))
  throw new Error("A Tallózás/Browse menüfelirat nincs a forrásban.");

if (!source.includes('lang==="hu"?(cnenSelected.contentHu||cnenSelected.content):cnenSelected.content'))
  throw new Error("A HU nézet nem a magyar contentHu mezőt használja.");

if (!source.includes('{L("Magyar magyarázó szöveg","Explanatory note")}'))
  throw new Error("A magyarázó szöveg nyelvi címe hibás.");

if (!source.includes("const applyCnenSelection=async(record)")
  || !source.includes("setProduct(hungarianName)")
  || !source.includes("setCode(selectedCode)")
  || !source.includes('/api/taric-search?q=')
  || !source.includes('selectedPrefix.padEnd(10,"0")')
  || !source.includes('String(value ?? "")')
  || !source.includes('className="cnen-use-code"'))
  throw new Error("A Tallózásból történő KN/TARIC-kód- és magyar megnevezésátvétel hiányzik.");

if (!source.includes('className="taric-code-input"')
  || !source.includes('value={code}')
  || !source.includes('setCode(clean(event.target.value))')
  || !source.includes('manualCode.length>=4')
  || !source.includes('Felhasználó által megadott KN/TARIC-kód.')
  || !source.includes('clean(code).length<4'))
  throw new Error("A TARIC-kód mező kézi szerkesztése vagy elsődleges feldolgozása hiányzik.");

if (!source.includes('topPanel==="ai"?"active":""')
  || !source.includes('topPanel==="ai"&&<AiProviderPanel')
  || !source.includes('const applyAiSelection=')
  || !source.includes('initialProduct={product}')
  || !source.includes('onApply={applyAiSelection}'))
  throw new Error("Az AI gomb, a lenyíló szolgáltatópanel vagy a fő tarifálóba történő visszaadás hiányzik.");

const aiMenuButton = '<button className={topPanel==="ai"?"active":""} onClick={()=>setTopPanel(topPanel==="ai"?null:"ai")}>AI</button>';
const browseMenuButton = '<button className={topPanel==="content"?"active":""} onClick={()=>setTopPanel(topPanel==="content"?null:"content")}>{L("Tallózás","Browse")}</button>';
const aiMenuIndex = source.indexOf(aiMenuButton);
const browseMenuIndex = source.indexOf(browseMenuButton);
if (aiMenuIndex < 0 || browseMenuIndex < 0 || aiMenuIndex > browseMenuIndex)
  throw new Error("Az AI menüpontnak közvetlenül a Tallózás bal oldalán kell megjelennie.");

for (const label of ["Claude - Ügynök", "ChatGpt - GPT", "Gemini - Gem"])
  if (!aiSource.includes(label)) throw new Error(`Hiányzó AI szolgáltatófül: ${label}`);
if (!aiSource.includes('https://claude.ai/new')
  || !aiSource.includes('https://chatgpt.com/g/g-6a448bbbcbe88191a3d8d464c0bb50a9-taric-vamtarifa-tanacsado-hu')
  || !aiSource.includes('https://gemini.google.com/gem/1PRkJ8drjNSXEtwpTxiMcwGXrpyjeUXsx?usp=sharing')
  || !aiSource.includes('navigator.clipboard.writeText(prompt)')
  || !aiSource.includes('window.open(selected.url')
  || aiSource.includes('api.anthropic.com')
  || aiSource.includes('x-api-key'))
  throw new Error("Az AI panel nem a kijelölt Claude-, ChatGPT- és Gemini-célokat vagy API nélküli promptátadást használja.");
if (!aiSource.includes('AI-válasz visszaillesztése')
  || !aiSource.includes('Kód és megnevezés átvétele')
  || !aiSource.includes('parseJson(responseText)'))
  throw new Error("A külső AI-válasz visszaillesztése vagy feldolgozása hiányzik.");

const phoneHierarchy = cnenHierarchyForCode("8517130000");
if (phoneHierarchy.sectionCode !== "XVI" || phoneHierarchy.chapterCode !== "85"
  || !phoneHierarchy.sectionDescriptionHu.includes("Gépek")
  || !phoneHierarchy.sectionDescriptionEn.includes("Machinery"))
  throw new Error("A 8517 kód áruosztály-hierarchiája hibás.");
if (!source.includes('className="cnen-hierarchy"')
  || !source.includes('{L("Áruosztály","Section")}')
  || !source.includes('{L("Árucsoport","Chapter")}')
  || !source.includes('/api/nomenclature-tree?code=')
  || !source.includes('chapterDescriptionHu'))
  throw new Error("A KN-részletezőből hiányzik az áruosztály és az árucsoport megnevezése.");

const heroIndex = source.indexOf('<section className="hero">');
const cnenIndex = source.indexOf('{topPanel==="content"&&<section className="top-drawer cnen-browser">');
const aiIndex = source.indexOf('{topPanel==="ai"&&<AiProviderPanel');
const agentIndex = source.indexOf('<section className="panel agent-panel">');
if (heroIndex < 0 || cnenIndex < heroIndex || aiIndex < heroIndex || agentIndex < cnenIndex || agentIndex < aiIndex)
  throw new Error("A Tallózás és az AI panel blokkjának a fejléc után, a termékűrlap előtt kell megjelennie.");

const resultIndex = source.indexOf('{result &&');
const gridIndex = source.indexOf('<section className="grid">');
if (resultIndex < 0 || gridIndex < resultIndex)
  throw new Error("Az alsó adatállapotblokkoknak az eredményblokkok után kell megjelenniük.");

if (!mainSource.includes('import "./ui-fixes.css"'))
  throw new Error("Az UI javításokat tartalmazó stíluslap nincs betöltve.");

if (!uiCss.includes("--content-block-gap:18px")
  || !uiCss.includes("main{display:flex;flex-direction:column}")
  || !uiCss.includes("main>.hero{order:2}")
  || !uiCss.includes("main>.cnen-browser,main>.ai-provider-panel{order:3}")
  || !uiCss.includes("main>.agent-panel{order:4}")
  || !uiCss.includes("main>.cnen-browser,main>.ai-provider-panel{margin:0 0 var(--content-block-gap)")
  || !uiCss.includes(".cnen-browser{height:650px")
  || !uiCss.includes("overflow-y:scroll")
  || !uiCss.includes("scrollbar-gutter:stable")
  || !uiCss.includes(".taric-code-input")
  || !uiCss.includes(".cnen-hierarchy")
  || !aiCss.includes(".ai-provider-tabs")
  || !aiCss.includes(".ai-provider-grid"))
  throw new Error("A Tallózás, az AI panel, a hierarchia, az egységes térköz vagy a szerkeszthető TARIC-mező stílusa hiányzik.");

console.log("OK UI: AI a Tallózás bal oldalán; egyedi ChatGPT és Gemini célok; API nélküli Claude/ChatGPT/Gemini átadás, HU/EN tartalom és KN/TARIC-kódátvétel");
