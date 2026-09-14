function wordMetniKoru(deger) {
    return String(deger ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function cevapHtml(cevap) {
    if (Array.isArray(cevap)) {
        if (cevap.length === 0) return "<p class=\"empty\">Cevap girilmedi.</p>";
        return `<ul>${cevap.map((satir) => `<li>${wordMetniKoru(satir)}</li>`).join("")}</ul>`;
    }

    if (!cevap) return "<p class=\"empty\">Cevap girilmedi.</p>";
    return `<p>${wordMetniKoru(cevap).replaceAll("\n", "<br>")}</p>`;
}

function dosyaAdiOlustur(kayit) {
    const ad = (kayit.gorusulenAd || "is-analizi")
        .toLocaleLowerCase("tr-TR")
        .replaceAll("ı", "i")
        .replaceAll("ğ", "g")
        .replaceAll("ü", "u")
        .replaceAll("ş", "s")
        .replaceAll("ö", "o")
        .replaceAll("ç", "c")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    return `${ad || "is-analizi"}-${new Date().toISOString().slice(0, 10)}.doc`;
}

function isAnaliziWordHtmlOlustur(kayit) {
    const cevaplar = kayit.cevaplar || {};

    const bolumler = IS_ANALIZI_SORULARI.map((bolum, index) => `
        <h2>${index + 1}. ${wordMetniKoru(bolum.baslik)}</h2>
        ${bolum.sorular.map((soru) => `
            <div class="question">
                <h3>${wordMetniKoru(soru.etiket)}</h3>
                ${cevapHtml(cevaplar[soru.id])}
            </div>
        `).join("")}
    `).join("");

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>İş Analizi Formu</title>
    <style>
        @page { margin: 2cm; }
        body { font-family: Arial, sans-serif; color: #111827; font-size: 11pt; line-height: 1.45; }
        h1 { font-size: 20pt; margin: 0 0 6pt; text-align: center; }
        h2 { font-size: 14pt; margin: 18pt 0 8pt; padding: 6pt 0; border-bottom: 1pt solid #9ca3af; }
        h3 { font-size: 10.5pt; margin: 0 0 4pt; }
        p { margin: 0 0 8pt; }
        ul { margin-top: 0; }
        .subtitle { text-align: center; color: #4b5563; margin-bottom: 18pt; }
        .meta { width: 100%; border-collapse: collapse; margin-bottom: 18pt; }
        .meta td { border: 1pt solid #d1d5db; padding: 6pt; vertical-align: top; }
        .meta .label { width: 28%; background: #f3f4f6; font-weight: bold; }
        .question { margin-bottom: 10pt; }
        .empty { color: #6b7280; font-style: italic; }
    </style>
</head>
<body>
    <h1>KILIÇ HOLDİNG İŞ / GÖREV ANALİZİ</h1>
    <p class="subtitle">Doldurulmuş İş Analizi Soru Formu</p>

    <table class="meta">
        <tr><td class="label">Personel İsmi</td><td>${wordMetniKoru(kayit.gorusulenAd)}</td></tr>
        <tr><td class="label">Ünvanı / Pozisyonu</td><td>${wordMetniKoru(kayit.pozisyon)}</td></tr>
        <tr><td class="label">Departman</td><td>${wordMetniKoru(kayit.departman)}</td></tr>
        <tr><td class="label">Tesis / Lokasyon</td><td>${wordMetniKoru(kayit.tesis)}</td></tr>
        <tr><td class="label">Görüşmeci</td><td>${wordMetniKoru(kayit.gorusmeci)}</td></tr>
        <tr><td class="label">Form Doldurulma Tarihi</td><td>${wordMetniKoru(kayit.tarih)}</td></tr>
        <tr><td class="label">Görüşme Saati</td><td>${wordMetniKoru([kayit.baslangic, kayit.bitis].filter(Boolean).join(" - "))}</td></tr>
        <tr><td class="label">Durum</td><td>${kayit.durum === "tamamlandi" ? "Tamamlandı" : "Taslak"}</td></tr>
    </table>

    ${bolumler}

    <h2>Genel Gözlemler</h2>
    ${cevapHtml(kayit.genelGozlemler)}
</body>
</html>`;
}

function isAnaliziWordAktar(kayit) {
    const html = isAnaliziWordHtmlOlustur(kayit);
    const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = dosyaAdiOlustur(kayit);
    link.click();
    URL.revokeObjectURL(link.href);
}
