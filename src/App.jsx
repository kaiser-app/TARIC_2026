import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, ExternalLink, FileText, LoaderCircle, Search, ShieldCheck } from "lucide-react";

const links = [
  { label: "EU TARIC", href: "https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=hu" },
  { label: "NAV TARIC Web", href: "https://kkk.nav.gov.hu/eles/1/taricweb/" },
];
const clean = (value) => value.replace(/\D/g, "").slice(0, 10);
const grouped = (value) => { const c = clean(value).padEnd(10, "–"); return `${c.slice(0, 4)} ${c.slice(4, 6)} ${c.slice(6, 8)} ${c.slice(8, 10)}`; };
async function getJson(url, options) { const r = await fetch(url, options); const p = await r.json().catch(() => ({})); if (!r.ok) throw new Error(p.error || p.message || `HTTP ${r.status}`); return p; }

export default function App() {
  const [lang, setLang] = useState("hu"), [code, setCode] = useState(""), [product, setProduct] = useState(""), [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false), [error, setError] = useState(""), [result, setResult] = useState(null), [measures, setMeasures] = useState(null);
  const [showOptions, setShowOptions] = useState(false);
  const [options, setOptions] = useState({ traffic: "b2b", date: new Date().toISOString().slice(0, 10), value: "100000", quantity: "1", unit: "db", origin: "", direction: "import", dispatch: "", destination: "Magyarország", ecb: "354.13", lineCount: "1" });
  const [health, setHealth] = useState(null);
  useEffect(() => { getJson("/api/health").then(setHealth).catch(() => setHealth(null)); }, []);
  const t = useMemo(() => lang === "hu" ? {
    eye: "Ellenőrizhető tarifálási támogatás", title: "TARIC Tarifáló Ügynök", lead: "Áruosztályozás és vámteher-előkészítés hiteles forrásokra építve.", code: "TARIC-kód", product: "Áru megnevezése vagy leírása", placeholder: "pl. pamut póló, 100% pamut, kötött", search: "Ellenőrzés indítása", status: "NAV-adatkapcsolat aktív", text: "A besorolás az aktuálisan betöltött NAV/OpenKKK nómenklatúrára és intézkedésállományra támaszkodik.", sources: "Hivatalos források", report: "Adatállapot", result: "Tarifálási eredmény", clarification: "Pontosítás szükséges", measures: "Kapcsolódó intézkedések", none: "Nincs megjeleníthető intézkedés."
  } : {
    eye: "Verifiable classification support", title: "TARIC Classification Agent", lead: "Commodity classification and duty preparation based on authoritative sources.", code: "TARIC code", product: "Product name or description", placeholder: "e.g. 100% cotton knitted T-shirt", search: "Start verification", status: "NAV data connection active", text: "Classification uses the NAV/OpenKKK nomenclature and measures snapshot dated 11 July 2026.", sources: "Official sources", report: "Data status", result: "Classification result", clarification: "Clarification required", measures: "Related measures", none: "No measure to display."
  }, [lang]);

  const optionText = () => `forgalom: ${options.traffic.toUpperCase()}, vámérték: ${options.value} Ft, mennyiség: ${options.quantity} ${options.unit}, származás: ${options.origin || "harmadik ország / nincs megadva"}, irány: ${options.direction}, dátum: ${options.date}`;
  const runClassification = async (inputText = query) => {
    const normalizedInput = [product.trim(), inputText.trim(), optionText()].filter(Boolean).join(", ");
    setLoading(true); setError(""); setResult(null); setMeasures(null);
    if (normalizedInput) setCode("");
    try {
      const classified = (product.trim() || inputText.trim()) ? await getJson("/api/tariff-agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: product.trim() || inputText.trim().split(/\n+/)[0], description: normalizedInput }) }) : { status: "classified", code: clean(code), confidence: "megadott", path: [], reasoning: "Felhasználó által megadott TARIC-kód." };
      setResult(classified);
      if (!classified.code) setCode("");
      if (classified.code) {
        setCode(clean(classified.code));
        const params=new URLSearchParams({code:clean(classified.code),direction:options.direction==="mindkettő"?"all":options.direction,origin:options.origin.trim().toUpperCase(),valueHuf:options.value,ecbRate:options.ecb,traffic:options.traffic});
        setMeasures(await getJson(`/api/measures?${params}`));
      }
    } catch (err) { setError(err.message || "A lekérdezés sikertelen."); }
    finally { setLoading(false); }
  };
  const submit = (event) => { event.preventDefault(); runClassification(); };
  const chooseClarification = (option) => {
    const next = `${query.trim()}${query.trim() ? ", " : ""}${option.appendText}`;
    setQuery(next);
    runClassification(next);
  };

  return <main>
    <nav><div className="brand"><ShieldCheck />TARIC 2026</div><div className="language"><button className={lang === "hu" ? "active" : ""} onClick={() => setLang("hu")}>HU</button><button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>EN</button></div></nav>
    <section className="hero"><div><p className="eyebrow">{t.eye}</p><h1>{t.title}</h1><p className="lead">{t.lead}</p></div><div className="code-card"><span>{t.code}</span><strong>{grouped(code)}</strong><small>HS / KN / TARIC</small></div></section>
    <section className="panel agent-panel"><form className="agent-form" onSubmit={submit}>
      <label>Termék neve *<input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="pl. lítium-ion akkumulátoros csavarbehajtó" /></label>
      <label>Rövid leírás<textarea value={query} onChange={(e) => setQuery(e.target.value)} placeholder="anyag, funkció, feldolgozottság, kiszerelés — minél pontosabb, annál biztosabb a besorolás" rows="4" /></label>
      <div><span className="field-label">Forgalom típusa</span><div className="traffic-toggle"><button type="button" className={options.traffic === "b2b" ? "selected" : ""} onClick={() => setOptions({ ...options, traffic: "b2b" })}>B2B — vállalkozások közötti</button><button type="button" className={options.traffic === "b2c" ? "selected" : ""} onClick={() => setOptions({ ...options, traffic: "b2c" })}>B2C — végfelhasználónak</button></div></div>
      <button type="button" className="options-toggle" onClick={() => setShowOptions(!showOptions)}>{showOptions ? "▾ Opcionális adatok elrejtése" : "▸ Opcionális adatok megjelenítése"}</button>
      {showOptions && <div className="optional-grid">
        <label>Dátum<input type="date" value={options.date} onChange={(e) => setOptions({ ...options, date: e.target.value })} /></label>
        <label>Vámérték (Ft)<input inputMode="numeric" value={options.value} onChange={(e) => setOptions({ ...options, value: e.target.value.replace(/\D/g, "") })} /></label>
        <label>Mennyiség<input inputMode="decimal" value={options.quantity} onChange={(e) => setOptions({ ...options, quantity: e.target.value })} /></label>
        <label>Egység<input value={options.unit} onChange={(e) => setOptions({ ...options, unit: e.target.value })} /></label>
        <label>Származási ország<input value={options.origin} onChange={(e) => setOptions({ ...options, origin: e.target.value })} placeholder="üresen: 3. országos" /></label>
        <label>Irány<select value={options.direction} onChange={(e) => setOptions({ ...options, direction: e.target.value })}><option value="import">Import</option><option value="export">Export</option><option value="mindkettő">Import és export</option></select></label>
        <label>Indító ország<input value={options.dispatch} onChange={(e) => setOptions({ ...options, dispatch: e.target.value })} /></label>
        <label>Rendeltetési ország<input value={options.destination} onChange={(e) => setOptions({ ...options, destination: e.target.value })} /></label>
        <label>ECB vámárfolyam (Ft/EUR)<input value={options.ecb} onChange={(e) => setOptions({ ...options, ecb: e.target.value })} /></label>
        <label>Csomag tételsorainak száma<input inputMode="numeric" value={options.lineCount} onChange={(e) => setOptions({ ...options, lineCount: e.target.value.replace(/\D/g, "") })} /></label>
      </div>}
      <p className="defaults-note">Alapértelmezés: mai dátum · 100 000 Ft vámérték · 1 db · B2B · harmadik országos vámtétel.</p>
      <button className="primary agent-submit" disabled={loading || (!code && !product.trim() && !query.trim())}>{loading ? <LoaderCircle className="spin" size={18} /> : <Search size={18} />}Betarifálás indítása</button>
    </form></section>
    <section className="grid"><article className="notice"><ShieldCheck /><div><h2>{t.status}</h2><p>{t.text}</p><p><b>Adatnap: {health?.dataVersion || "betöltés…"}</b></p></div></article><article><h2>{t.sources}</h2><div className="links">{links.map((x) => <a href={x.href} target="_blank" rel="noreferrer" key={x.href}>{x.label}<ExternalLink size={15} /></a>)}</div></article><article><FileText /><h2>{t.report}</h2><p>{Number(health?.nomenclatureRows || 0).toLocaleString("hu-HU")} nómenklatúra-sor · {Number(health?.measures || 0).toLocaleString("hu-HU")} intézkedés · 92 AIS ellenőrzési szabály</p></article></section>
    {error && <section className="result error"><AlertCircle /><div><h2>Hiba</h2><p>{error}</p></div></section>}
    {result && <section className={`result ${result.status === "clarification" ? "needs-input" : ""}`}><h2>{result.status === "clarification" ? t.clarification : t.result}</h2>{result.code && <div className="result-code">{grouped(result.code)} <span>{result.confidence}</span></div>}{result.clarification && <p className="question">{result.clarification}</p>}{!!result.clarificationOptions?.length && <div className="clarification-options">{result.clarificationOptions.map((option) => <button type="button" key={option.id} disabled={loading} onClick={() => chooseClarification(option)}>{option.label}</button>)}</div>}{result.reasoning && <p>{result.reasoning}</p>}{!!result.path?.length && <ol className="path">{result.path.map((row, i) => <li key={`${row.code}-${row.line}-${i}`} style={{ marginLeft: `${Math.max(0, Number(row.line || 0)) * 18}px` }}><code>{grouped(row.code)}</code><span>{row.description}</span></li>)}</ol>}{result.dataDate && <small>Adatnap: {result.dataDate}</small>}</section>}
    {measures && <section className="result"><h2>{t.measures} <span className="count">{measures.count}</span></h2>{measures.valueCheck && <p className="measure-context">Származás: <b>{measures.origin||"nincs megadva"}</b> · Vámérték: <b>{measures.valueCheck.valueHuf?.toLocaleString("hu-HU")||"—"} Ft</b> ({measures.valueCheck.valueEur??"—"} EUR) · Kisértékű: <b>{measures.valueCheck.lowValueEligible?"igen":"nem"}</b></p>}{measures.measures?.length ? <div className="measure-list">{measures.measures.slice(0, 30).map((item, i) => <div className="measure" key={`${item.type}-${item.area}-${item.additionalCode}-${item.certificate}-${i}`}><b>{item.type || "—"}</b><span>{item.area || "Erga omnes"}</span><span>{item.description || item.certificate || "Kapcsolódó TARIC-intézkedés"}</span>{item.additionalCode && <code>{item.additionalCode}</code>}</div>)}</div> : <p>{t.none}</p>}{measures.truncated && <small>Az első 30 tétel látható; a teljes találati lista {measures.count} elem.</small>}</section>}
    <footer>Információs és döntéstámogató rendszer – a hivatalos hatósági ellenőrzést nem helyettesíti.</footer>
  </main>;
}
