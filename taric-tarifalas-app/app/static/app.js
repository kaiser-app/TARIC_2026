function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function requestJson(url) {
  const response = await fetch(url);
  let payload = null;
  try {
    payload = await response.json();
  } catch (_error) {
    payload = null;
  }
  if (!response.ok) {
    const detail = payload?.detail;
    throw new Error(typeof detail === "string" ? detail : "A lekérdezés sikertelen.");
  }
  return payload;
}

async function loadOrszagok() {
  const select = document.getElementById("tarifalas-orszag");
  try {
    const data = await requestJson("/api/orszagok");
    for (const country of data.orszagok) {
      const option = document.createElement("option");
      option.value = country.ORSZAGKOD;
      option.textContent = `${country.ORSZAGNEV} (${country.ORSZAGKOD})`;
      select.appendChild(option);
    }
  } catch (error) {
    const option = document.createElement("option");
    option.disabled = true;
    option.textContent = `Az országlista nem tölthető be: ${error.message}`;
    select.appendChild(option);
  }
}

loadOrszagok();

document.getElementById("kereses-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");
  const query = document.getElementById("kereses-q").value.trim();
  const box = document.getElementById("kereses-eredmeny");
  box.innerHTML = "<p class='empty'>Keresés...</p>";
  button.disabled = true;

  try {
    const data = await requestJson(`/api/kereses?q=${encodeURIComponent(query)}`);
    if (!data.talalatok.length) {
      box.innerHTML = "<p class='empty'>Nincs találat.</p>";
      return;
    }

    let html = "<table><thead><tr><th>VTSZ</th><th>Megnevezés</th><th>ÁFA</th></tr></thead><tbody>";
    for (const row of data.talalatok) {
      html += `<tr><td><span class="vtsz-link" data-vtsz="${esc(row.VTSZ)}">${esc(row.VTSZ)}</span></td><td>${esc(row.MEGNEVEZES)}</td><td>${esc(row.AFA_KULCSOK)}</td></tr>`;
    }
    html += "</tbody></table>";
    box.innerHTML = html;

    box.querySelectorAll(".vtsz-link").forEach((element) => {
      element.addEventListener("click", () => {
        document.getElementById("tarifalas-vtsz").value = element.dataset.vtsz;
        document.getElementById("tarifalas-form").scrollIntoView({ behavior: "smooth" });
      });
    });
  } catch (error) {
    box.innerHTML = `<p class="error">${esc(error.message)}</p>`;
  } finally {
    button.disabled = false;
  }
});

document.getElementById("tarifalas-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");
  const vtsz = document.getElementById("tarifalas-vtsz").value.trim();
  const orszag = document.getElementById("tarifalas-orszag").value;
  const datum = document.getElementById("tarifalas-datum").value;
  const box = document.getElementById("tarifalas-eredmeny");
  box.innerHTML = "<p class='empty'>Lekérdezés...</p>";
  button.disabled = true;

  const params = new URLSearchParams({ vtsz });
  if (orszag) params.set("orszag", orszag);
  if (datum) params.set("datum", datum);

  try {
    const data = await requestJson(`/api/tarifalas?${params.toString()}`);
    renderTarifalas(data, box);
  } catch (error) {
    box.innerHTML = `<p class="error">${esc(error.message)}</p>`;
  } finally {
    button.disabled = false;
  }
});

function renderTarifalas(data, box) {
  let html = "";

  html += `<div class="section-title">Nómenklatúra (${esc(data.datum)} állapot szerint)</div>`;
  if (data.nomenklatura.length) {
    html += "<table><thead><tr><th>VTSZ</th><th>Megnevezés</th><th>ÁFA</th></tr></thead><tbody>";
    for (const item of data.nomenklatura) {
      html += `<tr><td>${esc(item.VTSZ)}</td><td>${esc(item.MEGNEVEZES)}</td><td>${esc(item.AFA_KULCSOK)}</td></tr>`;
    }
    html += "</tbody></table>";
  } else {
    html += "<p class='empty'>Nincs pontos VTSZ-találat a KN10 törzsben.</p>";
  }

  if (data.afa_kiegkod.length) {
    html += "<div class='section-title'>ÁFA kiegészítő kódok</div><table><thead><tr><th>Kód</th><th>Megnevezés</th></tr></thead><tbody>";
    for (const item of data.afa_kiegkod) {
      html += `<tr><td>${esc(item.KIEG_KOD)}</td><td>${esc(item.MEGNEVEZES)}</td></tr>`;
    }
    html += "</tbody></table>";
  }

  html += `<div class="section-title">Vámtétel${data.orszag ? ` — ${esc(data.orszag)}` : ""}</div>`;
  if (data.vamtetel.length) {
    html += "<table><thead><tr><th>VTSZ szint</th><th>Származás</th><th>Intézkedés</th><th>Vámtétel</th><th>Jogszabály</th><th>Érvényes</th></tr></thead><tbody>";
    for (const item of data.vamtetel) {
      const measure = item.INTEZKEDES_NEV
        ? esc(item.INTEZKEDES_NEV)
        : `<span class="badge">${esc(item.INTEZKEDES_TIPUS)}</span> ismeretlen kód`;
      const duty = item.VAMTETEL
        ? esc(item.VAMTETEL)
        : "(l. kiegészítő kód / feltétel)";
      html += `<tr><td>${esc(item.VTSZ)}</td><td>${esc(item.SZARMAZASI_HELY_NEV || item.SZARMAZASI_HELY)}</td><td>${measure}</td><td>${duty}</td><td>${esc(item.JOGSZABALY)}</td><td>${esc(item.ERVENYESSEG_KEZDETE)} – ${item.ERVENYESSEG_VEGE ? esc(item.ERVENYESSEG_VEGE) : "∞"}</td></tr>`;
    }
    html += "</tbody></table>";
  } else {
    html += "<p class='empty'>Nincs vámtétel-sor a megadott VTSZ / ország / dátum kombinációra.</p>";
  }

  html += "<div class='section-title'>Uniós import intézkedések</div>";
  if (data.import_intezkedes_eu.length) {
    html += "<table><thead><tr><th>VTSZ szint</th><th>Terület</th><th>Feltétel</th><th>Igazolás</th><th>Érvényes</th></tr></thead><tbody>";
    for (const item of data.import_intezkedes_eu) {
      html += `<tr><td>${esc(item.VTSZ)}</td><td>${esc(item.TERULET)}</td><td>${esc(item.FELTETEL_LEIRAS || item.FELTETEL_SORSZ)}</td><td>${esc(item.IGAZOLAS_NEV || item.IGAZOLAS_LEIR || item.IGAZOLAS_KOD)}</td><td>${esc(item.EKEZD)} – ${item.EVEGE ? esc(item.EVEGE) : "∞"}</td></tr>`;
    }
    html += "</tbody></table>";
  } else {
    html += "<p class='empty'>Nincs uniós import intézkedés a megadott VTSZ-re / dátumra.</p>";
  }

  html += "<div class='section-title'>Nemzeti (HU) import intézkedések</div>";
  if (data.import_intezkedes_hu.length) {
    html += "<table><thead><tr><th>VTSZ szint</th><th>Terület</th><th>Kiegészítő kód</th><th>Érvényes</th></tr></thead><tbody>";
    for (const item of data.import_intezkedes_hu) {
      html += `<tr><td>${esc(item.VTSZ)}</td><td>${esc(item.TERULET)}</td><td>${esc(item.KIEG_KOD)}</td><td>${esc(item.EKEZD)} – ${item.EVEGE ? esc(item.EVEGE) : "∞"}</td></tr>`;
    }
    html += "</tbody></table>";
  } else {
    html += "<p class='empty'>Nincs nemzeti import intézkedés a megadott VTSZ-re / dátumra.</p>";
  }

  box.innerHTML = html;
}
