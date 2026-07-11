import { useMemo, useState } from "react";
import { ExternalLink, FileText, Search, ShieldCheck } from "lucide-react";

const SOURCE_LINKS = [
  { label: "EU TARIC", href: "https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=hu" },
  { label: "NAV TARIC Web", href: "https://kkk.nav.gov.hu/eles/1/taricweb/" }
];

function normalizeCode(value) {
  return value.replace(/\D/g, "").slice(0, 10);
}

function groupedCode(value) {
  const clean = normalizeCode(value).padEnd(10, "–");
  return `${clean.slice(0, 4)} ${clean.slice(4, 6)} ${clean.slice(6, 8)} ${clean.slice(8, 10)}`;
}

export default function App() {
  const [lang, setLang] = useState("hu");
  const [code, setCode] = useState("");
  const [query, setQuery] = useState("");
  const t = useMemo(() => lang === "hu" ? {
    eyebrow: "Ellenőrizhető tarifálási támogatás",
    title: "TARIC Tarifáló Ügynök",
    lead: "Áruosztályozás és vámteher-előkészítés hiteles forrásokra építve.",
    code: "TARIC-kód",
    product: "Áru megnevezése vagy leírása",
    placeholder: "pl. pamut férfi póló",
    search: "Ellenőrzés indítása",
    status: "Adatkapcsolat előkészítve",
    statusText: "A napi NAV/OpenKKK XML-adatok importja a következő mérföldkő. Addig az alkalmazás nem közöl ellenőrizetlen vámtételt.",
    sources: "Hivatalos források",
    report: "Jelentés",
    reportText: "A Word-jelentés csak hitelesített találat után válik elérhetővé.",
    codeHelp: "Legfeljebb 10 számjegy; HS / KN / TARIC csoportosításban.",
  } : {
    eyebrow: "Verifiable classification support",
    title: "TARIC Classification Agent",
    lead: "Commodity classification and duty preparation based on authoritative sources.",
    code: "TARIC code",
    product: "Product name or description",
    placeholder: "e.g. men's cotton T-shirt",
    search: "Start verification",
    status: "Data connection prepared",
    statusText: "Daily NAV/OpenKKK XML import is the next milestone. Until then, the app will not present unverified duty rates.",
    sources: "Official sources",
    report: "Report",
    reportText: "Word export becomes available only after a verified result.",
    codeHelp: "Up to 10 digits, grouped as HS / CN / TARIC.",
  };

  const submit = (event) => {
    event.preventDefault();
    document.getElementById("data-status")?.scrollIntoView({ behavior: "smooth" });
  };

  return <main>
    <nav>
      <div className="brand"><ShieldCheck size={22}/> TARIC 2026</div>
      <div className="language" aria-label="Nyelvválasztó">
        <button className={lang === "hu" ? "active" : ""} onClick={() => setLang("hu")}>HU</button>
        <button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>EN</button>
      </div>
    </nav>

    <section className="hero">
      <div>
        <p className="eyebrow">{t.eyebrow}</p>
        <h1>{t.title}</h1>
        <p className="lead">{t.lead}</p>
      </div>
      <div className="code-card">
        <span>{t.code}</span>
        <strong>{groupedCode(code)}</strong>
        <small>{t.codeHelp}</small>
      </div>
    </section>

    <section className="panel">
      <form onSubmit={submit}>
        <label>{t.code}
          <input inputMode="numeric" value={code} onChange={e => setCode(normalizeCode(e.target.value))} placeholder="0000000000" />
        </label>
        <label>{t.product}
          <textarea value={query} onChange={e => setQuery(e.target.value)} placeholder={t.placeholder} rows="4" />
        </label>
        <button className="primary" type="submit" disabled={!code && !query}><Search size={18}/>{t.search}</button>
      </form>
    </section>

    <section className="grid" id="data-status">
      <article className="notice">
        <ShieldCheck size={24}/>
        <div><h2>{t.status}</h2><p>{t.statusText}</p></div>
      </article>
      <article>
        <h2>{t.sources}</h2>
        <div className="links">{SOURCE_LINKS.map(source =>
          <a href={source.href} target="_blank" rel="noreferrer" key={source.href}>{source.label}<ExternalLink size={15}/></a>
        )}</div>
      </article>
      <article>
        <FileText size={24}/>
        <h2>{t.report}</h2>
        <p>{t.reportText}</p>
      </article>
    </section>
    <footer>Információs és döntéstámogató rendszer – a hivatalos hatósági ellenőrzést nem helyettesíti.</footer>
  </main>;
}
