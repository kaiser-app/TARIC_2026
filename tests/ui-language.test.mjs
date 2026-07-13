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

if (!source.includes("const applyCnenSelection=")
  || !source.includes("setProduct(hungarianName)")
  || !source.includes("setCode(selectedCode)")
  || !source.includes('className="cnen-use-code"'))
  throw new Error("A Tallózásból történő kód- és magyar megnevezésátvétel hiányzik.");

const resultIndex = source.indexOf('{result &&');
const gridIndex = source.indexOf('<section className="grid">');
if (resultIndex < 0 || gridIndex < resultIndex)
  throw new Error("Az alsó adatállapotblokkoknak az eredményblokkok után kell megjelenniük.");

if (!mainSource.includes('import "./ui-fixes.css"'))
  throw new Error("Az UI javításokat tartalmazó stíluslap nincs betöltve.");

if (!uiCss.includes("--content-block-gap:18px")
  || !uiCss.includes(".cnen-browser{height:650px")
  || !uiCss.includes("overflow-y:scroll")
  || !uiCss.includes("scrollbar-gutter:stable"))
  throw new Error("A fix Tallózás-panel vagy az egységes térköz stílusai hiányoznak.");

console.log("OK UI: HU tartalom, egységes térköz, fix Tallózás-panel és kódátvétel");
