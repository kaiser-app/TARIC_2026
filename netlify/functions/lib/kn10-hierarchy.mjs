// KN10 hierarchia-modul — a NAV KN10 vonalas bontásának rekonstrukciója.
//
// A megbeszélt szabályok:
//  1. Rendezés: VTSZ ↑, INDENT ↑, PRODUCT_LINE ↑ — így a sorok a NAV TARIC Web
//     vonalas nézetének sorrendjét adják.
//  2. Verem-bejárás: egy sor szülője az utolsó, nála kisebb strukturális
//     szintű sor. Az INDENT 0 kétféle sort takar: az árucsoport-sort
//     (XX00000000) és a 4 jegyű vámtarifaszám-sort — ezek külön strukturális
//     szintet kapnak, hogy a 4 jegyű sor az árucsoport gyereke legyen.
//  3. Egy VTSZ-hez több sor tartozhat (közbenső fejlécsorok, PRODUCT_LINE
//     10/20); a bevallható sor a PRODUCT_LINE 80.
//  4. "Más"-feloldás: a "Más" gyűjtősor jelentése a nevesített testvérek
//     tagadása — a feloldást a testvérek megnevezéséből generáljuk.
//  5. A "Más" ágat a besorolásnál mindig utolsóként kell mérlegelni.

const digits = (value) => String(value ?? "").replace(/\D/g, "");
const normalizeDescription = (value) => String(value ?? "")
  .toLocaleLowerCase("hu")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim();

const isChapterRow = (row) => row.code.slice(2) === "00000000" && Number(row.indent) === 0;
const structuralLevel = (row) => isChapterRow(row) ? -2 : Number(row.indent) === 0 ? -1 : Number(row.indent);
const isCurrentRow = (row) => row.validTo === null || row.validTo === undefined || String(row.validTo).trim() === "" || String(row.validTo).trim() === ",";
const isResidualDescription = (value) => /^m[áa]s(?:\s|$|[,;.])/i.test(String(value ?? "").trim()) || /^m[áa]sf[ée]le/i.test(String(value ?? "").trim());

export const displayCode = (code) => digits(code).padEnd(10, "0").replace(/(....)(..)(..)(..)/, "$1 $2 $3 $4").trim();
export const dashes = (node) => node.depth > 0 ? "─ ".repeat(node.depth).trim() : "";

export function buildKn10Hierarchy(nomenclature) {
  const rows = (nomenclature.rows || [])
    .filter((row) => digits(row.code).length === 10 && isCurrentRow(row))
    .slice()
    .sort((a, b) => a.code.localeCompare(b.code)
      || Number(a.indent) - Number(b.indent)
      || String(a.productLine).localeCompare(String(b.productLine)));

  const nodes = rows.map((row, order) => ({
    order,
    id: row.id ?? order,
    code: digits(row.code),
    indent: Number(row.indent) || 0,
    productLine: String(row.productLine || ""),
    description: String(row.description || "").trim(),
    level: structuralLevel(row),
    parent: null,
    children: [],
  }));

  const stack = [];
  for (const node of nodes) {
    while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop();
    node.parent = stack[stack.length - 1] || null;
    if (node.parent) node.parent.children.push(node);
    stack.push(node);
  }
  for (const node of nodes) {
    node.depth = node.level < 0 ? node.level + 2 : node.level + 1; // árucsoport 0, vtsz 1, indent n → n+1
    node.isChapter = node.level === -2;
    node.isHeading = node.level === -1;
    node.isDeclarableLine = node.productLine === "80";
    node.hasDeeperLines = node.children.length > 0;
  }

  const byCode = new Map();
  for (const node of nodes) {
    if (!byCode.has(node.code)) byCode.set(node.code, []);
    byCode.get(node.code).push(node);
  }

  const hierarchy = { nodes, byCode, dataDate: nomenclature.dataDate || null };

  hierarchy.leafFor = (code) => {
    const list = byCode.get(digits(code).padEnd(10, "0")) || [];
    return list.length ? list[list.length - 1] : null; // a legmélyebb (PL 80) sor a kód saját sora
  };

  // "Más"-feloldás: a gyűjtősor jelentése a nevesített testvérek tagadása.
  hierarchy.resolveResidual = (node) => {
    if (!node || !isResidualDescription(node.description) || !node.parent) return null;
    const named = node.parent.children
      .filter((sibling) => sibling !== node && !isResidualDescription(sibling.description))
      .map((sibling) => sibling.description)
      .filter(Boolean);
    if (!named.length) return null;
    const shown = named.slice(0, 4).map((text) => text.length > 60 ? `${text.slice(0, 57)}…` : text);
    const suffix = named.length > shown.length ? "…" : "";
    return `= nem: ${shown.join("; ")}${suffix}`;
  };

  // Teljes őslánc az árucsoporttól a kód saját soráig (a kód közbenső
  // fejlécsoraival együtt) — ebből lesz a breadcrumb és a vonalas útvonal.
  hierarchy.fullPath = (code) => {
    const leaf = hierarchy.leafFor(code);
    if (!leaf) return [];
    const chain = [];
    for (let node = leaf; node; node = node.parent) chain.push(node);
    return chain.reverse();
  };

  hierarchy.breadcrumb = (code) => hierarchy.fullPath(code).map((node) => ({
    code: node.code,
    displayCode: displayCode(node.code),
    depth: node.depth,
    productLine: node.productLine,
    description: node.description,
    residualResolution: hierarchy.resolveResidual(node),
    isChapter: node.isChapter,
    isHeading: node.isHeading,
  }));

  // Kontextusfa a részletpanelhez: a teljes őslánc + a kiválasztott sor
  // testvérei + közvetlen gyerekei, vonalas mélységgel.
  hierarchy.contextTree = (code) => {
    const leaf = hierarchy.leafFor(code);
    if (!leaf) return [];
    const path = hierarchy.fullPath(code);
    const inPath = new Set(path);
    const out = [];
    const push = (node, role) => out.push({
      code: node.code,
      displayCode: displayCode(node.code),
      depth: node.depth,
      dashes: dashes(node),
      productLine: node.productLine,
      description: node.description,
      residualResolution: hierarchy.resolveResidual(node),
      declarable: node.isDeclarableLine && !node.hasDeeperLines,
      role,
    });
    for (const node of path) {
      push(node, node === leaf ? "selected" : "ancestor");
      if (node.parent && node !== leaf) {
        // az ősök testvéreit nem soroljuk fel, csak az útvonalat — a fa így marad kompakt
        continue;
      }
    }
    if (leaf.parent) for (const sibling of leaf.parent.children) {
      if (sibling === leaf) continue;
      push(sibling, "sibling");
    }
    for (const child of leaf.children) push(child, "child");
    out.sort((a, b) => a.code.localeCompare(b.code) || a.depth - b.depth);
    // a kiválasztott ág útvonala mindig előrébb kerüljön az azonos kódú soroknál
    return out;
  };

  // A tarifáló ügynök útvonal-dúsítása: a [gyökér, levél] párt a 4 jegyű
  // vámtarifaszámtól induló TELJES lánccal váltja ki (árucsoport nélkül,
  // hogy a meglévő szerződés — minden path-sor a vtsz-prefixen belül — megmaradjon).
  hierarchy.classificationPath = (code) => hierarchy.fullPath(code)
    .filter((node) => !node.isChapter)
    .map((node) => ({
      code: node.code,
      line: node.depth - 1, // vtsz-fejléc = 0, ahogy a meglévő megjelenítés várja
      productLine: node.productLine,
      description: node.description,
      residualResolution: hierarchy.resolveResidual(node),
    }));

  hierarchy.residualNote = (code) => {
    const notes = hierarchy.fullPath(code)
      .map((node) => {
        const resolution = hierarchy.resolveResidual(node);
        return resolution ? `„Más” a(z) ${displayCode(node.code)} szinten ${resolution}` : null;
      })
      .filter(Boolean);
    return notes.length
      ? `${notes.join(" · ")} — a „Más” gyűjtőág csak a nevesített testvér-alszámok kizárása után alkalmazható (GRI 6).`
      : null;
  };

  return hierarchy;
}

let cachedHierarchy = null;
let cachedSource = null;
export function kn10HierarchyFor(nomenclature) {
  if (cachedHierarchy && cachedSource === nomenclature) return cachedHierarchy;
  cachedHierarchy = buildKn10Hierarchy(nomenclature);
  cachedSource = nomenclature;
  return cachedHierarchy;
}
