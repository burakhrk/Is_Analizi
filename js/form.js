const form = document.getElementById("analysisForm");
const soruBolumleriEl = document.getElementById("questionSections");
const bolumNavEl = document.getElementById("sectionNav");
const kayitDurumuEl = document.getElementById("kayitDurumu");
const sorgu = new URLSearchParams(window.location.search);
let kayitId = sorgu.get("id");
const devamModu = sorgu.get("devam") === "1";
let mevcutKayit = kayitId ? kayitGetir(kayitId) : null;
let sonBolum = (mevcutKayit && mevcutKayit.sonBolum) || null;
const OTOMATIK_KAYIT_GECIKME = 1500;
let otomatikZamanlayici = null;

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

function onaySecenekleri(soru) {
    return (soru.secenekler || []).map((s) => typeof s === "string" ? { deger: s, etiket: s } : s);
}

function bosSatir(soru) {
    const satir = {};
    soru.sutunlar.forEach((sutun) => {
        satir[sutun.id] = sutun.tip === "onay" ? [] : "";
    });
    return satir;
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
        return `<textarea class="input textarea" name="${name}" rows="4" placeholder="${metniKoru(soru.yerTutucu || "Her satıra bir madde yazınız")}">` +
            `${metniKoru(satirlar.join("\n"))}</textarea>`;
    }

    if (soru.tip === "onay") {
        const secili = Array.isArray(cevap) ? cevap : [];
        return `<div class="check-list">` + onaySecenekleri(soru).map((s) => `
            <label class="check-item">
                <input type="checkbox" name="${name}" value="${metniKoru(s.deger)}" ${secili.includes(s.deger) ? "checked" : ""}>
                <span>${metniKoru(s.etiket)}</span>
            </label>`).join("") + `</div>`;
    }

    if (soru.tip === "tablo") {
        const satirlar = Array.isArray(cevap) && cevap.length ? cevap : [];
        const minSatir = soru.sabit ? soru.satirSayisi : Math.max(soru.minSatir || 1, satirlar.length, 1);
        const baslangic = [];
        for (let i = 0; i < Math.max(minSatir, satirlar.length); i++) {
            baslangic.push(satirlar[i] || bosSatir(soru));
        }
        const satirHtml = (satir, idx) => `
            <tr data-satir="${idx}">
                ${soru.sutunlar.map((sutun) => `<td>${hucreAlaniOlustur(soru, sutun, satir[sutun.id], idx)}</td>`).join("")}
                ${soru.sabit ? "" : `<td class="row-ops"><button type="button" class="button danger small" data-satir-sil="${soru.id}">Sil</button></td>`}
            </tr>`;
        return `
            <div class="table-wrap" data-tablo="${soru.id}">
                <table class="answer-table">
                    <thead><tr>
                        ${soru.sutunlar.map((s) => `<th>${metniKoru(s.baslik)}</th>`).join("")}
                        ${soru.sabit ? "" : "<th></th>"}
                    </tr></thead>
                    <tbody>${baslangic.map(satirHtml).join("")}</tbody>
                </table>
                ${soru.sabit ? "" : `<button type="button" class="button secondary small" data-satir-ekle="${soru.id}">Satır Ekle</button>`}
            </div>`;
    }

    return `<input class="input" name="${name}" value="${metniKoru(cevap)}" ${soru.zorunlu ? "required" : ""}>`;
}

function hucreAlaniOlustur(soru, sutun, deger, idx) {
    const name = `cevap_${soru.id}_${idx}_${sutun.id}`;
    if (sutun.tip === "secim") {
        return `<select class="input small-input" name="${name}">
            <option value="">-</option>
            ${sutun.secenekler.map((s) => `<option value="${metniKoru(s)}" ${deger === s ? "selected" : ""}>${metniKoru(s)}</option>`).join("")}
        </select>`;
    }
    if (sutun.tip === "onay") {
        const secili = Array.isArray(deger) ? deger.includes("X") : deger === "X";
        return `<input type="checkbox" class="cell-check" name="${name}" value="X" ${secili ? "checked" : ""}>`;
    }
    return `<input class="input small-input" name="${name}" value="${metniKoru(deger ?? "")}">`;
}

function sorulariCiz() {
    const cevaplar = mevcutKayit?.cevaplar || {};

    bolumNavEl.innerHTML = `
        <div class="nav-actions">
            <button type="button" class="button ghost small" id="expandAll">Tümü Aç</button>
            <button type="button" class="button ghost small" id="collapseAll">Tümü Kapat</button>
        </div>
        <div id="sectionLinks">` + IS_ANALIZI_SORULARI.map((bolum, index) => `
            <a href="#${guvenliId(bolum.id)}" data-navlink="${bolum.id}">${index + 1}. ${metniKoru(bolum.baslik)} <span class="nav-badge" data-navbadge="${bolum.id}"></span></a>
        `).join("") + `</div>`;

    soruBolumleriEl.innerHTML = IS_ANALIZI_SORULARI.map((bolum) => `
        <section class="panel" id="${guvenliId(bolum.id)}" data-bolum="${bolum.id}">
            <div class="panel-header collapsible" data-toggle="${bolum.id}" role="button" tabindex="0" title="Bölümü aç/kapat">
                <h2>${metniKoru(bolum.baslik)}</h2>
                <span class="badge" data-badge="${bolum.id}"></span>
                <span class="chev" aria-hidden="true">▾</span>
            </div>
            <div class="question-stack">
                ${bolum.sorular.map((soru) => `
                    <label class="field" data-soru="${soru.id}">
                        <span>${metniKoru(soru.etiket)}${soru.zorunlu ? " *" : ""}</span>
                        ${soruAlaniOlustur(soru, cevaplar[soru.id])}
                    </label>
                `).join("")}
            </div>
        </section>
    `).join("");
}

function soruyuBul(id) {
    for (const bolum of IS_ANALIZI_SORULARI) {
        for (const soru of bolum.sorular) {
            if (soru.id === id) return soru;
        }
    }
    return null;
}

function tabloSatirlariniOku(soru) {
    const govde = soruBolumleriEl.querySelector(`[data-tablo="${soru.id}"] tbody`);
    const satirlar = [];
    govde.querySelectorAll("tr").forEach((tr, idx) => {
        const satir = {};
        soru.sutunlar.forEach((sutun) => {
            const alan = tr.querySelector(`[name="cevap_${soru.id}_${idx}_${sutun.id}"]`);
            if (!alan) return;
            if (sutun.tip === "onay") {
                satir[sutun.id] = alan.checked ? ["X"] : [];
            } else {
                satir[sutun.id] = alan.value.trim();
            }
        });
        const dolu = Object.values(satir).some((v) => Array.isArray(v) ? v.length : v);
        if (dolu) satirlar.push(satir);
    });
    return satirlar;
}

function cevapOku(soru) {
    if (soru.tip === "tablo") return tabloSatirlariniOku(soru);
    if (soru.tip === "onay") {
        return [...form.querySelectorAll(`input[name="cevap_${soru.id}"]:checked`)].map((el) => el.value);
    }
    const alan = form.elements[`cevap_${soru.id}`];
    if (!alan) return soru.tip === "liste" ? [] : "";
    if (soru.tip === "liste") {
        return alan.value.split("\n").map((s) => s.trim()).filter(Boolean);
    }
    return alan.value.trim();
}

function soruYanitlandiMi(soru, cevap) {
    if (cevap == null) return false;
    if (Array.isArray(cevap)) return cevap.length > 0;
    return String(cevap).trim() !== "";
}

function ilerlemeHesapla() {
    let toplam = 0, yanitlanan = 0;
    IS_ANALIZI_SORULARI.forEach((bolum) => {
        let bToplam = 0, bYanit = 0;
        bolum.sorular.forEach((soru) => {
            bToplam++; toplam++;
            if (soruYanitlandiMi(soru, cevapOku(soru))) { bYanit++; yanitlanan++; }
        });
        const badge = soruBolumleriEl.querySelector(`[data-badge="${bolum.id}"]`);
        if (badge) {
            badge.textContent = `${bYanit}/${bToplam}`;
            badge.classList.toggle("done", bYanit === bToplam);
        }
        const navBadge = bolumNavEl.querySelector(`[data-navbadge="${bolum.id}"]`);
        if (navBadge) {
            navBadge.textContent = `${bYanit}/${bToplam}`;
            navBadge.classList.toggle("done", bYanit === bToplam);
        }
    });
    const fill = document.getElementById("progressFill");
    const text = document.getElementById("progressText");
    const yuzde = toplam ? Math.round((yanitlanan / toplam) * 100) : 0;
    if (fill) fill.style.width = `${yuzde}%`;
    if (text) text.textContent = `${yanitlanan}/${toplam} soru • %${yuzde}`;
}

function bolumuAcKapat(bolumId, acik) {
    const section = soruBolumleriEl.querySelector(`[data-bolum="${bolumId}"]`);
    if (!section) return;
    section.classList.toggle("collapsed", !acik);
}

function formuDoldur() {
    if (!mevcutKayit) {
        form.elements.form_tarihi.value = new Date().toISOString().slice(0, 10);
        if (kayitDurumuEl) kayitDurumuEl.textContent = "Henüz kaydedilmedi";
        return;
    }
    document.getElementById("pageTitle").textContent = "Görüşmeyi Düzenle";
    form.elements.form_tarihi.value = mevcutKayit.form_tarihi || "";
    if (mevcutKayit.guncellenmeTarihi && kayitDurumuEl) {
        kayitDurumuEl.textContent = `Son kayıt: ${tarihSaatFormatla(mevcutKayit.guncellenmeTarihi)}`;
    }
}

function formVerisiniAl(durum) {
    const cevaplar = {};

    IS_ANALIZI_SORULARI.forEach((bolum) => {
        bolum.sorular.forEach((soru) => {
            cevaplar[soru.id] = cevapOku(soru);
        });
    });

    return {
        id: kayitId || undefined,
        form_tarihi: form.elements.form_tarihi.value,
        durum,
        sonBolum,
        cevaplar
    };
}

function kaydet(durum) {
    const kayit = kayitKaydet(formVerisiniAl(durum));
    window.location.href = `form.html?id=${kayit.id}`;
}

document.getElementById("saveDraftButton").addEventListener("click", () => kaydet("taslak"));

document.getElementById("wordExportButton").addEventListener("click", async () => {
    const kayit = formVerisiniAl(mevcutKayit?.durum || "taslak");
    try {
        await isAnaliziWordAktar(kayit);
    } catch (error) {
        alert("Word oluşturulamadı: " + error.message);
    }
});

document.getElementById("jsonExportButton").addEventListener("click", () => {
    tekKayitDisaAktar(formVerisiniAl(mevcutKayit?.durum || "taslak"));
});

document.getElementById("pdfExportButton").addEventListener("click", () => {
    kayitYazdir(formVerisiniAl(mevcutKayit?.durum || "taslak"));
});

form.addEventListener("submit", (event) => {
    event.preventDefault();
    kaydet("tamamlandi");
});

soruBolumleriEl.addEventListener("click", (event) => {
    const toggleEl = event.target.closest("[data-toggle]");
    if (toggleEl) {
        const section = toggleEl.closest("[data-bolum]");
        if (section) {
            section.classList.toggle("collapsed");
            sonBolum = section.dataset.bolum;
            otomatikKaydetZamanla();
        }
        return;
    }
    const ekleId = event.target.dataset?.satirEkle;
    const silId = event.target.dataset?.satirSil;
    const soru = soruyuBul(ekleId || silId);
    if (!soru) return;
    const govde = soruBolumleriEl.querySelector(`[data-tablo="${soru.id}"] tbody`);
    if (ekleId) {
        const idx = govde.rows.length;
        const tr = document.createElement("tr");
        tr.dataset.satir = String(idx);
        tr.innerHTML = soru.sutunlar.map((sutun) => `<td>${hucreAlaniOlustur(soru, sutun, sutun.tip === "onay" ? [] : "", idx)}</td>`).join("") +
            `<td class="row-ops"><button type="button" class="button danger small" data-satir-sil="${soru.id}">Sil</button></td>`;
        govde.appendChild(tr);
        otomatikKaydetZamanla();
        ilerlemeHesapla();
    } else if (silId) {
        event.target.closest("tr")?.remove();
        otomatikKaydetZamanla();
        ilerlemeHesapla();
    }
});

bolumNavEl.addEventListener("click", (event) => {
    if (event.target.closest("#expandAll")) {
        IS_ANALIZI_SORULARI.forEach((b) => bolumuAcKapat(b.id, true));
        return;
    }
    if (event.target.closest("#collapseAll")) {
        IS_ANALIZI_SORULARI.forEach((b) => bolumuAcKapat(b.id, false));
        return;
    }
    const link = event.target.closest("[data-navlink]");
    if (link) {
        sonBolum = link.dataset.navlink;
        otomatikKaydetZamanla();
        bolumuAcKapat(link.dataset.navlink, true);
    }
});

soruBolumleriEl.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && event.target.matches?.("[data-toggle]")) {
        event.preventDefault();
        event.target.closest("[data-bolum]")?.classList.toggle("collapsed");
    }
});
let ilerlemeZamanlayici = null;
form.addEventListener("input", (event) => {
    // "Diğer" açıklamasına yazılınca kutuyu otomatik işaretle (entegre davranış)
    if (event.target.name === "cevap_y_diger_aciklama" && event.target.value.trim()) {
        const kutu = form.querySelector('input[name="cevap_yetkiler"][value="y_diger"]');
        if (kutu) kutu.checked = true;
    }
    bolumdakiSonBolumuGuncelle(event.target);
    otomatikKaydetZamanla();
    clearTimeout(ilerlemeZamanlayici);
    ilerlemeZamanlayici = setTimeout(ilerlemeHesapla, 150);
});
form.addEventListener("change", (event) => {
    bolumdakiSonBolumuGuncelle(event.target);
    otomatikKaydetZamanla();
    ilerlemeHesapla();
});
window.addEventListener("pagehide", () => {
    try { otomatikKaydet(); } catch (error) { /* yoksay */ }
});

function bolumdakiSonBolumuGuncelle(kaynak) {
    const bolum = kaynak?.closest?.("[data-bolum]");
    if (bolum) sonBolum = bolum.dataset.bolum;
}

function otomatikKaydetZamanla() {
    clearTimeout(otomatikZamanlayici);
    otomatikZamanlayici = setTimeout(otomatikKaydet, OTOMATIK_KAYIT_GECIKME);
}

function otomatikKaydet() {
    clearTimeout(otomatikZamanlayici);
    try {
        const kayit = kayitKaydet(formVerisiniAl(mevcutKayit?.durum || "taslak"));
        if (!kayitId) {
            kayitId = kayit.id;
            try {
                history.replaceState(null, "", `form.html?id=${kayit.id}${devamModu ? "&devam=1" : ""}`);
            } catch (error) {
                console.error("Adres güncellenemedi", error);
            }
        }
        mevcutKayit = kayitGetir(kayit.id);
        if (kayitDurumuEl) {
            kayitDurumuEl.textContent = `Taslak otomatik kaydedildi • ${tarihSaatFormatla(kayit.guncellenmeTarihi)}`;
        }
    } catch (error) {
        console.error("Otomatik kayıt başarısız", error);
    }
}

function bolumEksikMi(bolumId) {
    const bolum = IS_ANALIZI_SORULARI.find((b) => b.id === bolumId);
    if (!bolum) return false;
    return bolum.sorular.some((soru) => !soruYanitlandiMi(soru, cevapOku(soru)));
}

function ilkEksikBolum() {
    const eksik = IS_ANALIZI_SORULARI.find((bolum) => bolumEksikMi(bolum.id));
    return eksik ? eksik.id : null;
}

function devamBolumuneGit() {
    const hedefId = (sonBolum && bolumEksikMi(sonBolum)) ? sonBolum : ilkEksikBolum();
    if (!hedefId) return;
    const section = soruBolumleriEl.querySelector(`[data-bolum="${hedefId}"]`);
    if (!section) return;
    section.classList.remove("collapsed");
    section.scrollIntoView({ block: "start" });
    section.classList.add("flash");
    setTimeout(() => section.classList.remove("flash"), 1800);
}

sorulariCiz();
formuDoldur();
ilerlemeHesapla();
if (devamModu) {
    devamBolumuneGit();
} else if (sonBolum) {
    const section = soruBolumleriEl.querySelector(`[data-bolum="${sonBolum}"]`);
    if (section) section.classList.remove("collapsed");
}
