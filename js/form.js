const form = document.getElementById("analysisForm");
const soruBolumleriEl = document.getElementById("questionSections");
const bolumNavEl = document.getElementById("sectionNav");
const kayitId = new URLSearchParams(window.location.search).get("id");
const mevcutKayit = kayitId ? kayitGetir(kayitId) : null;

function metniKoru(deger) {
    return String(deger ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function guvenliId(deger) {
    return String(deger).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function soruAlaniOlustur(soru, cevap) {
    const name = `cevap_${soru.id}`;

    if (soru.tip === "textarea") {
        return `<textarea class="input textarea" name="${name}" rows="4" ${soru.zorunlu ? "required" : ""}>${metniKoru(cevap)}</textarea>`;
    }

    if (soru.tip === "secim") {
        return `
            <select class="input" name="${name}" ${soru.zorunlu ? "required" : ""}>
                <option value="">Seçiniz</option>
                ${soru.secenekler.map((secenek) => `<option value="${metniKoru(secenek)}" ${cevap === secenek ? "selected" : ""}>${metniKoru(secenek)}</option>`).join("")}
            </select>
        `;
    }

    if (soru.tip === "liste") {
        const satirlar = Array.isArray(cevap) ? cevap : [];
        const satirMetni = satirlar.join("\n");
        return `<textarea class="input textarea" name="${name}" rows="4" placeholder="${metniKoru(soru.yerTutucu || "")}">${metniKoru(satirMetni)}</textarea>`;
    }

    return `<input class="input" name="${name}" value="${metniKoru(cevap)}" ${soru.zorunlu ? "required" : ""}>`;
}

function sorulariCiz() {
    const cevaplar = mevcutKayit?.cevaplar || {};

    bolumNavEl.innerHTML = IS_ANALIZI_SORULARI.map((bolum, index) => `
        <a href="#${guvenliId(bolum.id)}">${index + 1}. ${metniKoru(bolum.baslik)}</a>
    `).join("");

    soruBolumleriEl.innerHTML = IS_ANALIZI_SORULARI.map((bolum) => `
        <section class="panel" id="${guvenliId(bolum.id)}">
            <div class="panel-header">
                <h2>${metniKoru(bolum.baslik)}</h2>
            </div>
            <div class="question-stack">
                ${bolum.sorular.map((soru) => `
                    <label class="field">
                        <span>${metniKoru(soru.etiket)}${soru.zorunlu ? " *" : ""}</span>
                        ${soruAlaniOlustur(soru, cevaplar[soru.id])}
                    </label>
                `).join("")}
            </div>
        </section>
    `).join("");
}

function formuDoldur() {
    if (!mevcutKayit) {
        form.elements.tarih.value = new Date().toISOString().slice(0, 10);
        return;
    }

    document.getElementById("pageTitle").textContent = "Görüşmeyi Düzenle";
    form.elements.gorusulenAd.value = mevcutKayit.gorusulenAd || "";
    form.elements.pozisyon.value = mevcutKayit.pozisyon || "";
    form.elements.departman.value = mevcutKayit.departman || "";
    form.elements.tesis.value = mevcutKayit.tesis || "";
    form.elements.gorusmeci.value = mevcutKayit.gorusmeci || "";
    form.elements.tarih.value = mevcutKayit.tarih || "";
    form.elements.baslangic.value = mevcutKayit.baslangic || "";
    form.elements.bitis.value = mevcutKayit.bitis || "";
    form.elements.genelGozlemler.value = mevcutKayit.genelGozlemler || "";
}

function formVerisiniAl(durum) {
    const cevaplar = {};

    IS_ANALIZI_SORULARI.forEach((bolum) => {
        bolum.sorular.forEach((soru) => {
            const alan = form.elements[`cevap_${soru.id}`];
            if (!alan) return;
            if (soru.tip === "liste") {
                cevaplar[soru.id] = alan.value
                    .split("\n")
                    .map((satir) => satir.trim())
                    .filter(Boolean);
            } else {
                cevaplar[soru.id] = alan.value.trim();
            }
        });
    });

    return {
        id: kayitId || undefined,
        gorusulenAd: form.elements.gorusulenAd.value.trim(),
        pozisyon: form.elements.pozisyon.value.trim(),
        departman: form.elements.departman.value.trim(),
        tesis: form.elements.tesis.value.trim(),
        gorusmeci: form.elements.gorusmeci.value.trim(),
        tarih: form.elements.tarih.value,
        baslangic: form.elements.baslangic.value,
        bitis: form.elements.bitis.value,
        genelGozlemler: form.elements.genelGozlemler.value.trim(),
        durum,
        cevaplar
    };
}

function kaydet(durum) {
    const kayit = kayitKaydet(formVerisiniAl(durum));
    window.location.href = `form.html?id=${kayit.id}`;
}

document.getElementById("saveDraftButton").addEventListener("click", () => kaydet("taslak"));
document.getElementById("wordExportButton").addEventListener("click", () => {
    isAnaliziWordAktar(formVerisiniAl(mevcutKayit?.durum || "taslak"));
});

form.addEventListener("submit", (event) => {
    event.preventDefault();
    kaydet("tamamlandi");
});

sorulariCiz();
formuDoldur();
