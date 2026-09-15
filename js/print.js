// Yazdırma görünümü: kayıt verisini form bölümleriyle birlikte sade HTML'e
// çevirir; tarayıcının "PDF olarak kaydet" hedefiyle PDF alınır.
function printMetni(deger) {
    return String(deger ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function printOnayEtiketleri(soru) {
    return (soru.secenekler || []).map((s) => typeof s === "string"
        ? { deger: s, etiket: s }
        : s);
}

function printCevapHtml(soru, cevap) {
    if (soru.tip === "liste") {
        const satirlar = Array.isArray(cevap) ? cevap : [];
        if (!satirlar.length) return `<p class="pv-empty">-</p>`;
        return `<ul class="pv-list">${satirlar.map((s) => `<li>${printMetni(s)}</li>`).join("")}</ul>`;
    }
    if (soru.tip === "onay") {
        const secili = Array.isArray(cevap) ? cevap : [];
        const etiketler = printOnayEtiketleri(soru)
            .filter((s) => secili.includes(s.deger))
            .map((s) => s.etiket);
        if (!etiketler.length) return `<p class="pv-empty">-</p>`;
        return `<p>${printMetni(etiketler.join("; "))}</p>`;
    }
    if (soru.tip === "tablo") {
        const satirlar = Array.isArray(cevap) ? cevap : [];
        if (!satirlar.length) return `<p class="pv-empty">-</p>`;
        const hucre = (sutun, v) => {
            const deger = sutun.tip === "onay"
                ? ((Array.isArray(v) ? v.includes("X") : v === "X") ? "X" : "")
                : String(v ?? "");
            return `<td>${printMetni(deger)}</td>`;
        };
        return `<table class="pv-table"><thead><tr>` +
            soru.sutunlar.map((s) => `<th>${printMetni(s.baslik)}</th>`).join("") +
            `</tr></thead><tbody>` +
            satirlar.map((satir) => `<tr>${soru.sutunlar.map((s) => hucre(s, satir[s.id])).join("")}</tr>`).join("") +
            `</tbody></table>`;
    }
    const metin = String(cevap ?? "").trim();
    if (!metin) return `<p class="pv-empty">-</p>`;
    return `<p>${printMetni(metin)}</p>`;
}

function kayitYazdir(kayit) {
    const c = varsayilanlariUygula(kayit.cevaplar || {});
    const kok = document.getElementById("printRoot");
    if (!kok) {
        alert("Yazdırma alanı bulunamadı.");
        return;
    }
    const baslik = c.personel_ismi || "İsimsiz Kayıt";
    kok.innerHTML = `
        <h1>İş / Görev Analizi</h1>
        <p class="pv-meta">${printMetni(baslik)} · ${printMetni(c.unvan_pozisyon || "")} · Form Tarihi: ${printMetni(tarihFormatlaTR(kayit.form_tarihi))}</p>
        ${IS_ANALIZI_SORULARI.map((bolum, i) => `
            <h2>${i + 1}. ${printMetni(bolum.baslik)}</h2>
            ${bolum.sorular.map((soru) => `
                <div class="pv-item">
                    <h3>${printMetni(soru.etiket)}</h3>
                    ${printCevapHtml(soru, c[soru.id])}
                </div>`).join("")}
        `).join("")}`;
    document.title = kayitDosyaAdi(kayit).replace(/\.json$/, "");
    window.print();
}
