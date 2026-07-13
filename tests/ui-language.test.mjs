import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

if (!source.includes('{L("Tallózás","Browse")}'))
  throw new Error("A Tallózás/Browse menüfelirat nincs a forrásban.");

if (!source.includes('lang==="hu"?(cnenSelected.contentHu||cnenSelected.content):cnenSelected.content'))
  throw new Error("A HU nézet nem a magyar contentHu mezőt használja.");

if (!source.includes('{L("Magyar magyarázó szöveg","Explanatory note")}'))
  throw new Error("A magyarázó szöveg nyelvi címe hibás.");

console.log("OK UI nyelvváltás: HU contentHu, EN content");
