import { useMemo, useState } from "react";
import { Check, Clipboard, ExternalLink, RotateCcw, Sparkles } from "lucide-react";
import "./ai-provider-panel.css";

const PROVIDERS = {
  claude: { label: "Claude - Ügynök", url: "https://claude.ai/new", actionHu: "Claude megnyitása", actionEn: "Open Claude" },
  chatgpt: { label: "ChatGpt - GPT", url: "https://chatgpt.com/", actionHu: "ChatGPT megnyitása", actionEn: "Open ChatGPT" },
  gemini: { label: "Gemini - Gem", url: "https://gemini.google.com/app", actionHu: "Gemini megnyitása", actionEn: "Open Gemini" },
};

const cleanCode = (value) => String(value ?? "").replace(/\D/g, "").slice(0, 10);
const todayIso = () => new Date().toISOString().slice(0, 10);

function parseJson(text) {
  let source = String(text || "").replace(/```json|```/gi, "").trim();
  const start = source.indexOf("{");
  if (start < 0) return null;
  source = source.slice(start).replace(/[\u0000-\u0008\u000B-\u001F]/g, " ");
  try { return JSON.parse(source); } catch {}
  let inString = false;
  let escaped = false;
  const stack = [];
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) { escaped = false; continue; }
    if (character === "\\") { escaped = true; continue; }
    if (character === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (character === "{" || character === "[") stack.push(character);
    if (character === "}" || character === "]") {
      stack.pop();
      if (!stack.length) {
        try { return JSON.parse(source.slice(0, index + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

function buildPrompt({ product, description, date, origin, direction, value, quantity, language }) {
  const responseLanguage = language === "en" ? "English" : "magyar";
  return `Vámtarifa-szakértőként sorold be az alábbi terméket az EU hatályos KN/TARIC nómenklatúrája és a GRI 1–6 szabályok alapján.

Termék: ${product || "nincs megadva"}
Leírás: ${description || "nincs megadva"}
Vámkezelés dátuma: ${date || todayIso()}
Származási ország: ${origin || "nincs megadva"}
Irány: ${direction}
Vámérték: ${value || "100000"} HUF
Mennyiség: ${quantity || "1"} db

A terméket objektív jellemzői, funkciója, anyaga, feldolgozottsága és kiszerelése alapján vizsgáld. Ne találj ki hiányzó adatot. Ha a 10 számjegyű végkódhoz döntő tulajdonság hiányzik, adj célzott pontosító kérdést és legfeljebb öt válaszlehetőséget. A megadott adatot ne kérdezd meg újra.

A besorolás után ellenőrizd a kódot a vámkezelés dátumára, és jelezd, ha a KN Magyarázó Megjegyzések befoglalása vagy kizárása érinti az eredményt.

Válaszolj kizárólag érvényes JSON-nal, markdown nélkül, ${responseLanguage} nyelven:
{
  "status": "classified vagy clarification",
  "code": "10 számjegyű TARIC-kód vagy null",
  "productName": "hivatalos vagy pontosított árumegnevezés",
  "confidence": "magas, közepes vagy alacsony",
  "reasoning": "tömör GRI-indoklás",
  "clarification": "célzott kérdés vagy null",
  "clarificationOptions": ["válaszlehetőség"],
  "alternativeCode": "másik lehetséges kód vagy null",
  "warning": "korlátozás vagy ellenőrzési megjegyzés vagy null"
}`;
}

export default function AiProviderPanel({ lang = "hu", initialProduct = "", initialDescription = "", initialDate = "", initialOrigin = "", initialDirection = "import", onApply, onClose }) {
  const L = (hu, en) => lang === "en" ? en : hu;
  const [provider, setProvider] = useState("claude");
  const [product, setProduct] = useState(initialProduct);
  const [description, setDescription] = useState(initialDescription);
  const [date, setDate] = useState(initialDate || todayIso());
  const [origin, setOrigin] = useState(initialOrigin || "CN");
  const [direction, setDirection] = useState(initialDirection || "import");
  const [value, setValue] = useState("100000");
  const [quantity, setQuantity] = useState("1");
  const [responseText, setResponseText] = useState("");
  const [copyState, setCopyState] = useState("");
  const parsed = useMemo(() => parseJson(responseText), [responseText]);
  const prompt = useMemo(() => buildPrompt({ product, description, date, origin, direction, value, quantity, language: lang }), [product, description, date, origin, direction, value, quantity, lang]);
  const selected = PROVIDERS[provider];

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyState("copied");
      window.setTimeout(() => setCopyState(""), 1800);
    } catch {
      setCopyState("failed");
    }
  };

  const openProvider = async () => {
    await copyPrompt();
    window.open(selected.url, "_blank", "noopener,noreferrer");
  };

  const applyResult = () => {
    const resultCode = cleanCode(parsed?.code || parsed?.kod);
    const resultName = String(parsed?.productName || parsed?.megnevezes || product || "").trim();
    if (!resultCode && !resultName) return;
    onApply?.({ code: resultCode, product: resultName, result: parsed });
  };

  return <section className="ai-provider-panel" aria-label={L("AI tarifálópanel", "AI classification panel")}>
    <div className="ai-provider-tabs" role="tablist" aria-label={L("AI szolgáltató", "AI provider")}>
      {Object.entries(PROVIDERS).map(([key, item]) => <button key={key} type="button" role="tab" aria-selected={provider === key} className={provider === key ? "active" : ""} onClick={() => setProvider(key)}>{item.label}</button>)}
      <button type="button" className="ai-panel-close" onClick={onClose} aria-label={L("AI panel bezárása", "Close AI panel")}>×</button>
    </div>

    <div className="ai-provider-body">
      <div className="ai-provider-intro">
        <div><Sparkles size={20}/><div><h2>{selected.label}</h2><p>{provider === "claude" ? L("A csatolt Claude-ügynök API nélküli, saját fiókos változata.", "API-free version of the supplied Claude agent using the user's own account.") : L("A prompt a kiválasztott szolgáltatóban, saját bejelentkezéssel használható.", "Use the prompt in the selected provider with your own signed-in account.")}</p></div></div>
        <span>{L("Nincs API-kulcs · nincs központi AI-költség", "No API key · no central AI cost")}</span>
      </div>

      <div className="ai-provider-grid">
        <div className="ai-agent-form">
          <label>{L("Termék neve", "Product name")}<input value={product} onChange={(event) => setProduct(event.target.value)} placeholder={L("pl. szilikon telefontok", "e.g. silicone phone case")}/></label>
          <label>{L("Leírás", "Description")}<textarea rows="4" value={description} onChange={(event) => setDescription(event.target.value)} placeholder={L("anyag, funkció, kialakítás, feldolgozottság", "material, function, construction, processing")}/></label>
          <div className="ai-agent-options">
            <label>{L("Dátum", "Date")}<input type="date" value={date} onChange={(event) => setDate(event.target.value)}/></label>
            <label>{L("Származás", "Origin")}<input value={origin} onChange={(event) => setOrigin(event.target.value.toUpperCase())} maxLength="2"/></label>
            <label>{L("Irány", "Direction")}<select value={direction} onChange={(event) => setDirection(event.target.value)}><option value="import">Import</option><option value="export">Export</option><option value="mindkettő">{L("Mindkettő", "Both")}</option></select></label>
            <label>{L("Vámérték (Ft)", "Customs value (HUF)")}<input inputMode="numeric" value={value} onChange={(event) => setValue(event.target.value.replace(/\D/g, ""))}/></label>
            <label>{L("Mennyiség", "Quantity")}<input inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)}/></label>
          </div>
          <label>{L("Előkészített prompt", "Prepared prompt")}<textarea className="ai-prompt" readOnly rows="10" value={prompt}/></label>
          <div className="ai-provider-actions">
            <button type="button" onClick={copyPrompt}>{copyState === "copied" ? <Check size={17}/> : <Clipboard size={17}/>} {copyState === "copied" ? L("Prompt kimásolva", "Prompt copied") : L("Prompt másolása", "Copy prompt")}</button>
            <button type="button" className="primary" onClick={openProvider}><ExternalLink size={17}/>{lang === "en" ? selected.actionEn : selected.actionHu}</button>
          </div>
          {copyState === "failed" && <p className="ai-provider-warning">{L("A böngésző nem engedte a vágólap használatát. Jelöld ki és másold ki kézzel a promptot.", "The browser blocked clipboard access. Select and copy the prompt manually.")}</p>}
        </div>

        <div className="ai-response-panel">
          <div className="ai-response-heading"><div><h3>{L("AI-válasz visszaillesztése", "Paste AI response")}</h3><p>{L("A szolgáltató JSON-válaszát illeszd ide.", "Paste the provider's JSON response here.")}</p></div><button type="button" onClick={() => setResponseText("")}><RotateCcw size={15}/>{L("Törlés", "Clear")}</button></div>
          <textarea rows="16" value={responseText} onChange={(event) => setResponseText(event.target.value)} placeholder='{"status":"classified","code":"0101900000",...}'/>
          {responseText && !parsed && <p className="ai-provider-warning">{L("A válasz még nem értelmezhető JSON-ként.", "The response is not valid JSON yet.")}</p>}
          {parsed && <div className="ai-parsed-result">
            <span>{L("Értelmezett eredmény", "Parsed result")}</span>
            <strong>{cleanCode(parsed.code || parsed.kod) || "—"}</strong>
            <p>{parsed.productName || parsed.megnevezes || ""}</p>
            {(parsed.reasoning || parsed.indoklas) && <small>{parsed.reasoning || parsed.indoklas}</small>}
            <button type="button" className="primary" onClick={applyResult}>{L("Kód és megnevezés átvétele", "Use code and product name")}</button>
          </div>}
        </div>
      </div>
    </div>
  </section>;
}
