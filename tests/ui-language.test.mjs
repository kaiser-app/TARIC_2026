import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const mainSource = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
const uiCss = await readFile(new URL("../src/ui-fixes.css", import.meta.url), "utf8");

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

const heroIndex = source.indexOf('<section className="hero">');
const cnenIndex = source.indexOf('{topPanel==="content"&&<section className="top-drawer cnen-browser">');
const agentIndex = source.indexOf('<section className="panel agent-panel">');
if (heroIndex < 0 || cnenIndex < heroIndex || agentIndex < cnenIndex)
  throw new Error("A Tallózás blokknak a fejléc után, közvetlenül a termékűrlap előtt kell megjelennie.");

const resultIndex = source.indexOf('{result &&');
const gridIndex = source.indexOf('<section className="grid">');
if (resultIndex < 0 || gridIndex < resultIndex)
  throw new Error("Az alsó adatállapotblokkoknak az eredményblokkok után kell megjelenniük.");

if (!mainSource.includes('import "./ui-fixes.css"'))
  throw new Error("Az UI javításokat tartalmazó stíluslap nincs betöltve.");

if (!uiCss.includes("--content-block-gap:18px")
  || !uiCss.includes("main{display:flex;flex-direction:column}")
  || !uiCss.includes("main>.hero{order:2}")
  || !uiCss.includes("main>.cnen-browser{order:3}")
  || !uiCss.includes("main>.agent-panel{order:4}")
  || !uiCss.includes("main>.cnen-browser{margin:0 0 var(--content-block-gap)")
  || !uiCss.includes(".cnen-browser{height:650px")
  || !uiCss.includes("overflow-y:scroll")
  || !uiCss.includes("scrollbar-gutter:stable")
  || !uiCss.includes(".taric-code-input"))
  throw new Error("A blokkcsere, a Tallózás fix mérete, egységes térköze vagy a szerkeszthető TARIC-mező stílusa hiányzik.");

console.log("OK UI: fejléc, Tallózás és termékűrlap kényszerített sorrendben; egységes térköz, HU tartalom, KN/TARIC-kódátvétel és kézi kódbevitel");