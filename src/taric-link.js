const BASE_URL = "https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp";

const digits = (value, limit) => String(value ?? "").replace(/\D/g, "").slice(0, limit);

export function buildEuTaricUrl({ code, date, lang = "hu" } = {}) {
  const taric = digits(code, 10);
  const simDate = digits(date, 8);
  const params = new URLSearchParams();
  params.set("Lang", String(lang).toLowerCase() === "en" ? "en" : "hu");
  if (taric.length === 10) params.set("Taric", taric);
  if (/^\d{8}$/.test(simDate)) params.set("SimDate", simDate);
  return `${BASE_URL}?${params.toString()}`;
}

export { BASE_URL as EU_TARIC_CONSULTATION_URL };
