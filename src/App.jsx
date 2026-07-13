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
  const [loading, setLoading] = useState(false), [progressStage, setProgressStage] = useState(null), [error, setError] = useState(""), [result, setResult] = useState(null), [measures, setMeasures] = useState(null);
  const [showOptions, setShowOptions] = useState(false);
  const [topPanel,setTopPanel]=useState(null),[adminToken,setAdminToken]=useState(""),[adminData,setAdminData]=useState(null),[adminError,setAdminError]=useState("");
  const [options, setOptions] = useState({ traffic: "b2b", date: new Date().toISOString().slice(0, 10), value: "100000", quantity: "1", unit: "db", additions: "0", origin: "CN", direction: "import", dispatch: "", destination: "Magyarország", ecb: "354.13", lineCount: "1" });
  const [health, setHealth] = useState(null);
  const L=(hu,en)=>lang==="hu"?hu:en;
  useEffect(() => { getJson("/api/health").then(setHealth).catch(() => setHealth(null)); }, []);
  const t = useMemo(() => lang === "hu" ? {
    eye: "Ellenőrizhető tarifálási támogatás", title: "TARIC – Tarifáló Ügynök", lead: "Áruosztályozás és vámteher-előkészítés hiteles forrásokra építve.", code: "TARIC-kód", product: "Áru megnevezése vagy leírása", placeholder: "pl. pamut póló, 100% pamut, kötött", search: "Ellenőrzés indítása", status: "NAV-adatkapcsolat aktív", text: "A besorolás az aktuálisan betöltött NAV/OpenKKK nómenklatúrára és intézkedésállományra támaszkodik.", sources: "Hivatalos források", report: "Adatállapot", result: "Tarifálási eredmény", clarification: "Pontosítás szükséges", measures: "Kapcsolódó intézkedések", none: "Nincs megjeleníthető intézkedés."
  } : {
    eye: "Verifiable classification support", title: "TARIC – Classification Agent", lead: "Commodity classification and duty preparation based on authoritative sources.", code: "TARIC code", product: "Product name or description", placeholder: "e.g. 100% cotton knitted T-shirt", search: "Start verification", status: "NAV data connection active", text: "Classification uses the currently loaded NAV/OpenKKK nomenclature and measures dataset.", sources: "Official sources", report: "Data status", result: "Classification result", clarification: "Clarification required", measures: "Related measures", none: "No measure to display."
  }, [lang]);

  const optionText = () => `forgalom: ${options.traffic.toUpperCase()}, vámérték: ${Number(options.value)||100000} Ft, mennyiség: ${Number(options.quantity)||1} ${options.unit||"db"}, származás: ${options.origin || "harmadik ország / nincs megadva"}, irány: ${options.direction}, dátum: ${options.date}`;
  const progressLabel = progressStage === "classification"
    ? L("Betarifálás folyamatban…", "Classification in progress…")
    : progressStage === "calculation"
      ? L("Közteher-kalkuláció folyamatban…", "Duty calculation in progress…")
      : progressStage === "measures"
        ? L("Kapcsolódó intézkedések feldolgozása…", "Processing related measures…")
        : L("Betarifálás indítása", "Start classification");
  const runClassification = async (inputText = query) => {
    const normalizedInput = [product.trim(), inputText.trim(), optionText()].filter(Boolean).join(", ");
    setLoading(true); setProgressStage("classification"); setError(""); setResult(null); setMeasures(null);
    if (normalizedInput) setCode("");
    try {
      const classified = (product.trim() || inputText.trim()) ? await getJson("/api/tariff-agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: product.trim() || inputText.trim().split(/\n+/)[0], description: normalizedInput }) }) : { status: "classified", code: clean(code), confidence: "megadott", path: [], reasoning: "Felhasználó által megadott TARIC-kód." };
      setResult(classified);
      if (!classified.code) setCode("");
      if (classified.code) {
        setCode(clean(classified.code));
        const params=new URLSearchParams({code:clean(classified.code),direction:options.direction==="mindkettő"?"all":options.direction,origin:options.origin.trim().toUpperCase()||"CN",valueHuf:String(Number(options.value)||100000),ecbRate:options.ecb||"354.13",traffic:options.traffic});
        setProgressStage("calculation");
        const measureData = await getJson(`/api/measures?${params}`);
        setMeasures(measureData);
        setProgressStage("measures");
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } catch (err) { setError(err.message || "A lekérdezés sikertelen."); }
    finally { setLoading(false); setProgressStage(null); }
  };
  const submit = (event) => { event.preventDefault(); runClassification(); };
  const chooseClarification = (option) => {
    const next = `${query.trim()}${query.trim() ? ", " : ""}${option.appendText}`;
    setQuery(next);
    runClassification(next);
  };
  const loadAdmin=async()=>{setAdminError("");try{setAdminData(await getJson("/api/v1/admin/metrics",{headers:{"x-admin-token":adminToken}}));}catch(error){setAdminError(error.message);}};
  const calculation = useMemo(() => {
    if (!measures?.groups?.length) return null;
    const invoiceValue = Number(options.value) || 100000;
    const additions = Number(options.additions) || 0;
    const customsBase = Math.round(invoiceValue + additions);
    const quantity = Number(options.quantity) || 1;
    const lineCount = Math.max(1, Number(options.lineCount) || 1);
    const ecb = Number(String(options.ecb || "354.13").replace(",", ".")) || 354.13;
    const rateOf = (group) => Number(group?.rates?.find((rate) => rate.value !== "")?.value || 0);
    const lowValue = measures.groups.find((group) => group.type === "107" && group.applicable !== false);
    const thirdCountry = measures.groups.find((group) => group.type === "103");
    const dutyRate = rateOf(thirdCountry);
    const duty = lowValue ? Math.round(3 * ecb * lineCount) : Math.round(customsBase * dutyRate / 100);
    const vatGroup = measures.groups.find((group) => group.type === "AAF" && group.additionalCodes?.includes("X6XX"));
    const vatRate = rateOf(vatGroup) || 27;
    const vatBase = customsBase + duty;
    const vat = Math.round(vatBase * vatRate / 100);
    return { invoiceValue, additions, customsBase, quantity, lineCount, ecb, dutyRate, duty, vatRate, vatBase, vat, total: duty + vat, lowValue: !!lowValue };
  }, [measures, options]);
  const displayedMeasureGroups = useMemo(() => {
    const groups = measures?.groups || [];
    const aafGroups = groups.filter((group) => group.type === "AAF");
    if (aafGroups.length < 2) return groups;
    const firstAafIndex = groups.findIndex((group) => group.type === "AAF");
    const combinedAaf = {
      ...aafGroups[0],
      variants: aafGroups,
      conditionCount: aafGroups.reduce((sum, group) => sum + Number(group.conditionCount || 0), 0),
      additionalCodes: [...new Set(aafGroups.flatMap((group) => group.additionalCodes || []))],
    };
    return groups.flatMap((group, index) => {
      if (group.type !== "AAF") return [group];
      return index === firstAafIndex ? [combinedAaf] : [];
    });
  }, [measures]);

  return <main>
    <nav><div className="brand"><ShieldCheck />TARIC 2026</div><div className="nav-actions"><button onClick={()=>setTopPanel(topPanel==="integration"?null:"integration")}>{L("Integráció","Integration")}</button><button onClick={()=>setTopPanel(topPanel==="settings"?null:"settings")}>{L("Beállítások","Settings")}</button><div className="language"><button className={lang === "hu" ? "active" : ""} onClick={() => setLang("hu")}>HU</button><button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>EN</button></div></div></nav>
    {topPanel==="integration"&&<section className="top-drawer"><h2>Integrációs interfész</h2><p>A verziózott REST API segítségével külső vámkezelő, ERP- és webáruházi rendszerek kapcsolódhatnak a TARIC szolgáltatáshoz.</p><div className="integration-links"><a href="/api/v1/openapi.json" target="_blank" rel="noreferrer">OpenAPI-specifikáció megnyitása</a><a href="/api/v1/openapi.json" download="taric-2026-openapi.json">OpenAPI JSON letöltése</a></div><pre>{`POST /api/v1/classify-and-calculate\nX-API-Key: <kulcs>\nContent-Type: application/json\n\n{\n  "customsDate": "2026-07-18",\n  "product": { "name": "vadászkés", "quantity": 1, "unit": "db" },\n  "trade": { "originCountry": "CN", "invoiceValue": 100000, "currency": "HUF" }\n}`}</pre></section>}
    {topPanel==="settings"&&<section className="top-drawer"><h2>API-beállítások és Render-használat</h2><div className="admin-login"><input type="password" value={adminToken} onChange={e=>setAdminToken(e.target.value)} placeholder="Admin-token"/><button onClick={loadAdmin}>Adatok betöltése</button></div>{adminError&&<p className="question">{adminError}</p>}{adminData&&<><div className="metrics-grid"><article><b>{adminData.usage.requests.toLocaleString("hu-HU")}</b><span>API-kérés</span></article><article><b>{adminData.render.estimatedBandwidthGb} GB</b><span>Becsült API-válaszforgalom / 5 GB</span></article><article><b>{adminData.usage.rateLimited}</b><span>Korlátozott kérés</span></article><article><b>{Math.floor(adminData.uptimeSeconds/60)} perc</b><span>Futásidő</span></article></div><h3>Aktív limitek</h3><p>{adminData.limits.perMinute}/perc · {adminData.limits.perDay}/nap · {adminData.limits.perMonth}/hó · {adminData.limits.maxConcurrent} párhuzamos kérés · {(adminData.limits.maxRequestBytes/1024).toFixed(0)} KB kérésméret</p><small>A tartós limiteket a Render környezeti változóiban kell rögzíteni; a következő verzióban innen is módosíthatók lesznek.</small></>}</section>}
    <section className="hero"><div><p className="eyebrow">{t.eye}</p><h1>{t.title}</h1><p className="lead">{t.lead}</p></div><div className="code-card"><span>{t.code}</span><strong>{grouped(code)}</strong><small>HS / KN / TARIC</small></div></section>
    <section className="panel agent-panel"><form className="agent-form" onSubmit={submit}>
      <label>{L("Termék neve *","Product name *")}<input value={product} onChange={(e) => setProduct(e.target.value)} placeholder={L("pl. lítium-ion akkumulátoros csavarbehajtó","e.g. lithium-ion cordless screwdriver")} /></label>
      <label>{L("Rövid leírás","Short description")}<textarea value={query} onChange={(e) => setQuery(e.target.value)} onInput={(e)=>{e.currentTarget.style.height="auto";e.currentTarget.style.height=`${Math.min(e.currentTarget.scrollHeight,180)}px`;}} placeholder={L("anyag, funkció, feldolgozottság, kiszerelés — minél pontosabb, annál biztosabb a besorolás","material, function, processing and packaging — more detail improves classification")} rows="1" /></label>
      <div><span className="field-label">{L("Forgalom típusa","Transaction type")}</span><div className="traffic-toggle"><button type="button" className={options.traffic === "b2b" ? "selected" : ""} onClick={() => setOptions({ ...options, traffic: "b2b" })}>{L("B2B — vállalkozások közötti","B2B — business to business")}</button><button type="button" className={options.traffic === "b2c" ? "selected" : ""} onClick={() => setOptions({ ...options, traffic: "b2c" })}>{L("B2C — végfelhasználónak","B2C — to end customer")}</button></div></div>
      <button type="button" className="options-toggle" onClick={() => setShowOptions(!showOptions)}>{showOptions ? L("▾ Opcionális adatok elrejtése","▾ Hide optional data") : L("▸ Opcionális adatok megjelenítése","▸ Show optional data")}</button>
      {showOptions && <div className="optional-grid">
        <label>Dátum<input type="date" value={options.date} onChange={(e) => setOptions({ ...options, date: e.target.value })} /></label>
        <label>Vámérték (Ft)<input inputMode="numeric" value={options.value} onChange={(e) => setOptions({ ...options, value: e.target.value.replace(/\D/g, "") })} /></label>
        <label>Mennyiség<input inputMode="decimal" value={options.quantity} onChange={(e) => setOptions({ ...options, quantity: e.target.value })} /></label>
        <label>Egység<input value={options.unit} onChange={(e) => setOptions({ ...options, unit: e.target.value })} /></label>
        <label>Vámértéknövelő tényezők (Ft)<input inputMode="numeric" value={options.additions} onChange={(e) => setOptions({ ...options, additions: e.target.value.replace(/[^\d-]/g, "") })} /></label>
        <label>Származási ország<input value={options.origin} onChange={(e) => setOptions({ ...options, origin: e.target.value })} placeholder="üresen: CN (Kína)" /></label>
        <label>Irány<select value={options.direction} onChange={(e) => setOptions({ ...options, direction: e.target.value })}><option value="import">Import</option><option value="export">Export</option><option value="mindkettő">Import és export</option></select></label>
        <label>Indító ország<input value={options.dispatch} onChange={(e) => setOptions({ ...options, dispatch: e.target.value })} /></label>
        <label>Rendeltetési ország<input value={options.destination} onChange={(e) => setOptions({ ...options, destination: e.target.value })} /></label>
        <label>ECB vámárfolyam (Ft/EUR)<input value={options.ecb} onChange={(e) => setOptions({ ...options, ecb: e.target.value })} /></label>
        <label>Csomag tételsorainak száma<input inputMode="numeric" value={options.lineCount} onChange={(e) => setOptions({ ...options, lineCount: e.target.value.replace(/\D/g, "") })} /></label>
      </div>}
      <p className="defaults-note">{L("Alapértelmezés: mai dátum · 100 000 Ft vámérték · 1 db · B2B · CN (Kína) · harmadik országos vámtétel.","Defaults: today · HUF 100,000 customs value · 1 unit · B2B · CN (China) · third-country duty.")}</p>
      <button className="primary agent-submit" disabled={loading || (!code && !product.trim() && !query.trim())}>{loading ? <LoaderCircle className="spin" size={18} /> : <Search size={18} />}{progressLabel}</button>
    </form></section>
    <section className="grid"><article className="notice"><ShieldCheck /><div><h2>{t.status}</h2><p>{t.text}</p><p><b>{L("Adatnap","Data date")}: {health?.dataVersion || L("betöltés…","loading…")}</b></p></div></article><article><h2>{t.sources}</h2><div className="links">{links.map((x) => <a href={x.href} target="_blank" rel="noreferrer" key={x.href}>{x.label}<ExternalLink size={15} /></a>)}</div></article><article><FileText /><h2>{t.report}</h2><p>{Number(health?.nomenclatureRows || 0).toLocaleString(lang==="hu"?"hu-HU":"en-GB")} {L("nómenklatúra-sor","nomenclature rows")} · {Number(health?.measures || 0).toLocaleString(lang==="hu"?"hu-HU":"en-GB")} {L("intézkedés","measures")} · 92 {L("AIS ellenőrzési szabály","AIS validation rules")}</p></article></section>
    {error && <section className="result error"><AlertCircle /><div><h2>Hiba</h2><p>{error}</p></div></section>}
    {result && <details className={`result collapsible-result ${result.status === "clarification" ? "needs-input" : ""}`}><summary>{result.status === "clarification" ? t.clarification : t.result}{result.code&&<span className="summary-code">{grouped(result.code)}</span>}</summary><div className="collapsible-body">{result.code && <div className="result-code">{grouped(result.code)} <span>{result.confidence}</span></div>}{result.clarification && <p className="question">{result.clarification}</p>}{!!result.clarificationOptions?.length && <div className="clarification-options">{result.clarificationOptions.map((option) => <button type="button" key={option.id} disabled={loading} onClick={() => chooseClarification(option)}>{option.label}</button>)}</div>}{result.reasoning && <p>{result.reasoning}</p>}{!!result.path?.length && <ol className="path">{result.path.map((row, i) => <li key={`${row.code}-${row.line}-${i}`} style={{ marginLeft: `${Math.max(0, Number(row.line || 0)) * 18}px` }}><code>{grouped(row.code)}</code><span>{row.description}</span></li>)}</ol>}{result.dataDate && <small>Adatnap: {result.dataDate}</small>}</div></details>}
    {calculation&&<details className="result calculation calculation-card"><summary>Közteher-kalkuláció</summary><div className="calculation-body"><p className="calculation-note">{calculation.lowValue?"A 107-es kisértékű vám alkalmazásával számolva.":`Külön preferenciális adat hiányában a 103-as harmadik országos vámtétellel (${calculation.dutyRate}%) számolva.`} Származás: CN (Kína). Hiányzó adatok alapértékei: 100 000 Ft számlaérték, 1 db, 0 Ft vámértéknövelő tényező.</p><dl><div><dt>Számlaérték</dt><dd>{calculation.invoiceValue.toLocaleString("hu-HU")} Ft</dd></div><div><dt>Vámértéknövelő tényező</dt><dd>{calculation.additions.toLocaleString("hu-HU")} Ft</dd></div><div><dt>Vámalap</dt><dd>{calculation.customsBase.toLocaleString("hu-HU")} Ft</dd></div><div><dt>Vám</dt><dd>{calculation.duty.toLocaleString("hu-HU")} Ft</dd></div><div><dt>Áfaalap</dt><dd>{calculation.vatBase.toLocaleString("hu-HU")} Ft</dd></div><div><dt>ÁFA ({calculation.vatRate}%)</dt><dd>{calculation.vat.toLocaleString("hu-HU")} Ft</dd></div><div className="calculation-total"><dt>Összes közteher</dt><dd>{calculation.total.toLocaleString("hu-HU")} Ft</dd></div></dl></div></details>}
    {measures && <details className="result collapsible-result"><summary>{t.measures} <span className="count">{displayedMeasureGroups.length}</span></summary><div className="collapsible-body">{measures.valueCheck && <p className="measure-context">Származás: <b>{measures.origin||"CN"}</b> · Vámérték: <b>{measures.valueCheck.valueHuf?.toLocaleString("hu-HU")||"—"} Ft</b> ({measures.valueCheck.valueEur??"—"} EUR) · Kisértékű: <b>{measures.valueCheck.lowValueEligible?"igen":"nem"}</b></p>}{displayedMeasureGroups.length ? <div className="measure-groups">{displayedMeasureGroups.map((group,i)=><details className="measure-group" key={`${group.type}-${group.area}-${group.additionalCode}-${i}`}><summary><b>{group.type}</b><span>{group.label}</span><em>{group.area||"Erga omnes"}</em><div className="measure-badges">{group.variants?.length>1&&<small>{group.variants.length} {L("verzió","versions")}</small>}{group.conditionCount>0&&<small>{group.conditionCount} feltétel</small>}</div></summary>{group.variants?.length>1?<div className="variant-list">{group.variants.map((variant,j)=><div key={`${variant.area}-${variant.additionalCode}-${j}`}><code>{variant.additionalCodes?.join(", ")||variant.additionalCode||"—"}</code><span>{L("Kiegészítő kód","Additional code")}</span><em>{variant.rates?.map((rate)=>rate.expression||rate.value).filter(Boolean).join(", ")||variant.area||"Erga omnes"}</em>{variant.conditions?.length>0&&<div className="variant-conditions">{variant.conditions.map((condition,k)=><small key={`${condition.certificate}-${k}`}>{condition.certificate||"—"}: {condition.description||"Feltételhez kötött intézkedés"}</small>)}</div>}</div>)}</div>:group.conditions.length>0?<div className="condition-list">{group.conditions.map((condition,j)=><div key={`${condition.certificate}-${j}`}><code>{condition.certificate||"—"}</code><span>{condition.description||"Feltételhez kötött intézkedés"}</span></div>)}</div>:<p>Nincs külön igazolási feltétel.</p>}</details>)}</div> : <p>{t.none}</p>}{measures.rawConditionCount>measures.count&&<small>{measures.rawConditionCount} technikai feltételsor {measures.count} intézkedéscsoportba rendezve.</small>}</div></details>}
    <footer>Információs és döntéstámogató rendszer – a hivatalos hatósági ellenőrzést nem helyettesíti.</footer>
  </main>;
}
