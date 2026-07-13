import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

const aiButton = '<button className={topPanel==="ai"?"active":""} onClick={()=>setTopPanel(topPanel==="ai"?null:"ai")}>AI</button>';
const browseButton = '<button className={topPanel==="content"?"active":""} onClick={()=>setTopPanel(topPanel==="content"?null:"content")}>{L("Tallózás","Browse")}</button>';
const integrationButton = '<button onClick={()=>setTopPanel(topPanel==="integration"?null:"integration")}>{L("Integráció","Integration")}</button>';

const count = (needle) => source.split(needle).length - 1;
if (count(aiButton) !== 1) throw new Error(`Az AI menüpont példányszáma hibás: ${count(aiButton)}`);
if (count(browseButton) !== 1) throw new Error(`A Tallózás menüpont példányszáma hibás: ${count(browseButton)}`);

const aiIndex = source.indexOf(aiButton);
const browseIndex = source.indexOf(browseButton);
const integrationIndex = source.indexOf(integrationButton);
if (!(aiIndex >= 0 && aiIndex < browseIndex && browseIndex < integrationIndex)) {
  throw new Error("A menüsorrend nem AI | Tallózás | Integráció.");
}

console.log("OK menüsor: AI | Tallózás | Integráció | Beállítások, duplikáció nélkül");
