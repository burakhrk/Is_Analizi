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
                ${soru.sutunlar.map((sutun) => {
                    const alan = hucreAlaniOlustur(soru, sutun, satir[sutun.id], idx);
                    if (sutun.tip === "text" && genisleyebilirHucreMi(soru, sutun)) {
                        return `<td><div class="gorev-hucre hucre-genis">${alan}<button type="button" class="button ghost small gorev-toggle" data-satir-genislet title="Tam metni göster">▾</button></div></td>`;
                    }
                    if (sutun.tip === "text") {
                        return `<td>${alan}</td>`;
                    }
                    const dar = sutun.tip === "onay" || sutun.tip === "secim" ? ' class="hucre-dar"' : "";
                    return `<td${dar}>${alan}</td>`;
                }).join("")}
                <td class="row-ops"><button type="button" class="button ghost small tasi-handle" draggable="true" data-satir-tasi="${soru.id}" title="Sürükleyerek sırala">⠿</button><button type="button" class="button ghost small satir-oneri-btn" data-satir-oneri="${soru.id}" title="Bu satır için öneri al">✨</button>${soru.sabit ? "" : `<button type="button" class="button danger small" data-satir-sil="${soru.id}">Sil</button>`}</td>
            </tr>`;
        return `
            <div class="table-wrap" data-tablo="${soru.id}">
                <table class="answer-table">
                    <thead><tr>
                        ${soru.sutunlar.map((s) => `<th>${metniKoru(s.baslik)}</th>`).join("")}
                        <th class="row-ops-h"></th>
                    </tr></thead>
                    <tbody>${baslangic.map(satirHtml).join("")}</tbody>
                </table>
                ${soru.sabit ? "" : `<button type="button" class="button secondary small" data-satir-ekle="${soru.id}">Satır Ekle</button>`}
            </div>`;
    }

    // Tek satırlık metin alanları da içerik uzadıkça aşağı büyür (textarea rows=1 + otomatik boy).
    // imza_tarih takvim (flatpickr) kullandığı için input kalır.
    if (soru.id === "imza_tarih") {
        return `<input class="input" name="${name}" value="${metniKoru(cevap)}">`;
    }
    return `<textarea class="input tek-satir" name="${name}" rows="1" ${soru.zorunlu ? "required" : ""}>${metniKoru(cevap)}</textarea>`;
}

function hucreAlaniOlustur(soru, sutun, deger, idx) {
    const name = `cevap_${soru.id}_${idx}_${sutun.id}`;
    if (sutun.tip === "secim") {
        const ekSinif = sutun.id === "sa" ? " sa-select" : "";
        return `<select class="input small-input${ekSinif}" name="${name}" title="${metniKoru(sutun.baslik)}: ${metniKoru(deger ?? "")}">
            <option value="">-</option>
            ${sutun.secenekler.map((s) => `<option value="${metniKoru(s)}" ${deger === s ? "selected" : ""}>${metniKoru(s)}</option>`).join("")}
        </select>`;
    }
    if (sutun.tip === "onay") {
        const secili = Array.isArray(deger) ? deger.includes("X") : deger === "X";
        return `<input type="checkbox" class="cell-check" name="${name}" value="X" ${secili ? "checked" : ""} title="${metniKoru(sutun.baslik)}">`;
    }
    // Sıklık sütunlarında yazmayı hızlandıran öneri listesi (değer serbest, Word'e aynen gider)
    const siklikSutunlari = ["gunluk", "belirli", "duzensiz", "siklik", "sure"];
    const listeAttr = siklikSutunlari.includes(sutun.id) ? ' list="siklikOnerileri"' : "";
    const metin = String(deger ?? "");
    return `<input class="input small-input" name="${name}" value="${metniKoru(metin)}" title="${metniKoru(metin || sutun.baslik)}"${listeAttr}>`;
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
    // Detay satırlar (öneri kutuları) atlanır; isim eşleşmesi data-satir üzerinden yapılır.
    govde.querySelectorAll("tr:not(.oneri-detay-satir)").forEach((tr, sira) => {
        const idx = tr.dataset.satir != null && tr.dataset.satir !== "" ? parseInt(tr.dataset.satir, 10) : sira;
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

// Checkbox işaretli değilse detay soruyu gizlemek yerine soluk + pasif göster.
// Gerekçe: kullanıcı detayın nerede olduğunu kaybetmesin, Word'e boş
// çıkacağı bilgisi görünsün. Word tarafı değişmez (word-export boş çıkarır).
const KOSUL_PASIF_NOTU = "İşaretlenmediği için Word'e boş çıkacak";
function kosulluPanelGuncelle(kutuSecici, soruId, notMetni, kilitle = true) {
    const kutu = form.querySelector(kutuSecici);
    const detay = soruBolumleriEl.querySelector(`[data-soru="${soruId}"]`);
    if (!detay) return;
    const acik = !!(kutu && kutu.checked);
    detay.classList.toggle("kosul-pasif", !acik);
    if (kilitle) {
        detay.querySelectorAll("input, select, textarea").forEach((alan) => {
            alan.disabled = !acik;
        });
    } else {
        detay.querySelectorAll("input, select, textarea").forEach((alan) => {
            alan.disabled = false;
        });
    }
    let not = detay.querySelector(".kosul-notu");
    if (!acik) {
        if (!not) {
            not = document.createElement("p");
            not.className = "kosul-notu";
            detay.appendChild(not);
        }
        not.textContent = notMetni || KOSUL_PASIF_NOTU;
    } else if (not) {
        not.remove();
    }
}

function fazlaMesaiPanelGuncelle() {
    kosulluPanelGuncelle('input[name="cevap_fazla_mesai_var"][value="evet"]', "fazla_mesai");
}

function nobetPanelGuncelle() {
    kosulluPanelGuncelle('input[name="cevap_nobet_var"][value="evet"]', "nobet");
}

function digerYetkiPanelGuncelle() {
    kosulluPanelGuncelle('input[name="cevap_yetkiler"][value="y_diger"]', "y_diger_aciklama", "Kutuyu işaretleyin, yoksa Word'e boş çıkar", false);
}

function ortamDigerPanelGuncelle() {
    kosulluPanelGuncelle('input[name="cevap_ortamlar"][value="diger"]', "ortam_diger_aciklama", "Kutuyu işaretleyin, yoksa Word'e boş çıkar", false);
}

function faktorDigerPanelGuncelle() {
    kosulluPanelGuncelle('input[name="cevap_faktorler"][value="diger"]', "faktor_diger_aciklama", "Kutuyu işaretleyin, yoksa Word'e boş çıkar", false);
}

const RISK_ESLESME = [
    { varId: null, alanlar: ["risk_kaza_siddet", "risk_kaza_siklik"] },
    { varId: "risk_trafik_var", alanlar: ["risk_trafik_siddet", "risk_trafik_siklik"] },
    { varId: "risk_meslek_var", alanlar: ["risk_meslek_siddet", "risk_meslek_siklik"] }
];

function riskVarMi(varId) {
    if (!varId) return true;
    const kutu = form.querySelector(`input[name="cevap_${varId}"][value="X"]`);
    return !!(kutu && kutu.checked);
}

// "Var" işaretli değilse şiddet/sıklık pasif olur (seçmeye gerek yok).
function riskPanelleriGuncelle() {
    RISK_ESLESME.forEach(({ varId, alanlar }) => {
        const pasif = !riskVarMi(varId);
        alanlar.forEach((soruId) => {
            const detay = soruBolumleriEl.querySelector(`[data-soru="${soruId}"]`);
            if (!detay) return;
            detay.classList.toggle("kosul-pasif", pasif);
            detay.querySelectorAll("input, select, textarea").forEach((alan) => {
                alan.disabled = pasif;
            });
            let not = detay.querySelector(".kosul-notu");
            if (pasif) {
                if (!not) {
                    not = document.createElement("p");
                    not.className = "kosul-notu";
                    detay.appendChild(not);
                }
                not.textContent = "Risk yok — seçmeye gerek yok";
            } else if (not) {
                not.remove();
            }
        });
    });
}

function kosulluPanelleriGuncelle() {
    fazlaMesaiPanelGuncelle();
    nobetPanelGuncelle();
    digerYetkiPanelGuncelle();
    ortamDigerPanelGuncelle();
    faktorDigerPanelGuncelle();
    riskPanelleriGuncelle();
}

// Tablo metin hücresini genişlet/daralt (sadece o hücre etkilenir).
// Tüm tablolardaki tip:"text" hücrelerinde çalışır; input <-> textarea değişir.
function hucreToggle(dugme) {
    const hucre = dugme.closest("td");
    if (!hucre) return;
    const alan = hucre.querySelector("input.input, textarea.input");
    if (!alan) return;
    const genis = hucre.classList.toggle("hucre-acik");
    const satir = dugme.closest("tr");
    if (satir) satir.classList.toggle("satir-genis", !!hucre.parentElement?.querySelector(".hucre-acik"));
    dugme.textContent = genis ? "▴" : "▾";
    dugme.title = genis ? "Hücreyi daralt" : "Tam metni göster";
    if (alan.tagName === "INPUT" && genis) {
        const ta = document.createElement("textarea");
        ta.className = alan.className + " gorev-genis";
        ta.name = alan.name;
        ta.value = alan.value;
        // İçerik boyuna göre satır sayısı (çok uzun maddeler daracık kalmasın)
        const satirSayisi = alan.value.split("\n").reduce((t, s) => t + Math.max(1, Math.ceil(s.length / 50)), 0);
        ta.rows = Math.min(20, Math.max(6, satirSayisi + 1));
        alan.replaceWith(ta);
        ta.focus();
        otomatikBuyut(ta);
    } else if (alan.tagName === "TEXTAREA" && !genis) {
        const inp = document.createElement("input");
        inp.className = alan.className.replace(" gorev-genis", "");
        inp.name = alan.name;
        inp.value = alan.value;
        alan.replaceWith(inp);
    }
}

// Yazdıkça büyüyen metin alanı: içerik sığana kadar uzar, çok uzunsa kaydırır.
function otomatikBuyut(alan) {
    if (!alan || alan.tagName !== "TEXTAREA") return;
    const azami = 520;
    alan.style.height = "auto";
    alan.style.height = Math.min(alan.scrollHeight, azami) + "px";
    alan.style.overflowY = alan.scrollHeight > azami ? "auto" : "hidden";
}

// Büyük genişleme yalnızca Görev/Sorumluluk sütununda (dar sütunlar tek satır kalır).
function genisleyebilirHucreMi(soru, sutun) {
    return soru && soru.id === "gorevler" && sutun && sutun.id === "gorev";
}

// Geriye uyumluluk: eski adla çağrılan yerler hucreToggle'a yönlenir.
function gorevSatirToggle(dugme) {
    hucreToggle(dugme);
}

// ===== SÜRÜKLE-BIRAK SATIR SIRALAMA =====
let suruklenenSatir = null;

function tabloSatirlariniYenidenNumarala(tabloId) {
    const govde = soruBolumleriEl.querySelector(`[data-tablo="${tabloId}"] tbody`);
    if (!govde) return;
    govde.querySelectorAll("tr:not(.oneri-detay-satir)").forEach((tr, yeniIdx) => {
        tr.dataset.satir = String(yeniIdx);
        tr.querySelectorAll("[name]").forEach((alan) => {
            alan.name = alan.name.replace(/^(cevap_.+_)(\d+)(_.+)$/, `$1${yeniIdx}$3`);
        });
    });
}

function surukleGostergeleriTemizle() {
    soruBolumleriEl.querySelectorAll(".birak-once,.birak-sonra").forEach((el) => {
        el.classList.remove("birak-once", "birak-sonra");
        delete el.dataset.birakYonu;
    });
}

soruBolumleriEl.addEventListener("dragstart", (event) => {
    const tutamac = event.target.closest("[data-satir-tasi]");
    if (!tutamac) return;
    const tr = tutamac.closest("tr");
    const sarmal = tutamac.closest("[data-tablo]");
    if (!tr || !sarmal) return;
    suruklenenSatir = { tablo: sarmal.dataset.tablo, satir: tr };
    event.dataTransfer.effectAllowed = "move";
    try { event.dataTransfer.setData("text/plain", sarmal.dataset.tablo); } catch (e) { /* yoksay */ }
    setTimeout(() => tr.classList.add("surukleniyor"), 0);
});

soruBolumleriEl.addEventListener("dragover", (event) => {
    if (!suruklenenSatir) return;
    const tr = event.target.closest("tr");
    const sarmal = event.target.closest("[data-tablo]");
    if (!tr || !sarmal || sarmal.dataset.tablo !== suruklenenSatir.tablo || tr === suruklenenSatir.satir) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = tr.getBoundingClientRect();
    const once = (event.clientY - rect.top) < rect.height / 2;
    tr.classList.toggle("birak-once", once);
    tr.classList.toggle("birak-sonra", !once);
    tr.dataset.birakYonu = once ? "once" : "sonra";
});

soruBolumleriEl.addEventListener("dragleave", (event) => {
    const tr = event.target.closest("tr");
    if (tr && tr !== suruklenenSatir?.satir) {
        tr.classList.remove("birak-once", "birak-sonra");
        delete tr.dataset.birakYonu;
    }
});

soruBolumleriEl.addEventListener("drop", (event) => {
    if (!suruklenenSatir) return;
    const tr = event.target.closest("tr");
    const sarmal = event.target.closest("[data-tablo]");
    if (!tr || !sarmal || sarmal.dataset.tablo !== suruklenenSatir.tablo) return;
    event.preventDefault();
    const kaynak = suruklenenSatir.satir;
    if (tr !== kaynak) {
        if (tr.dataset.birakYonu === "sonra") {
            tr.after(kaynak);
        } else {
            tr.before(kaynak);
        }
        tabloSatirlariniYenidenNumarala(sarmal.dataset.tablo);
        otomatikKaydetZamanla();
        ilerlemeHesapla();
    }
    surukleGostergeleriTemizle();
});

soruBolumleriEl.addEventListener("dragend", () => {
    if (suruklenenSatir) suruklenenSatir.satir.classList.remove("surukleniyor");
    surukleGostergeleriTemizle();
    suruklenenSatir = null;
});

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
    const uyarilar = wordOnKontrolUyarilari(kayit);
    if (uyarilar.length && !confirm("Word öncesi kontrol:\n• " + uyarilar.join("\n• ") + "\n\nYine de Word'e aktarılsın mı?")) {
        return;
    }
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

soruBolumleriEl.addEventListener("dblclick", (event) => {
    // Hücreye çift tık = tam metni aç/kapat (uzun görev metinleri için)
    const alan = event.target.closest?.("td")?.querySelector("[data-satir-genislet]");
    if (alan && (event.target.matches("input.input, textarea.input") || event.target.closest("td"))) {
        hucreToggle(alan);
    }
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
    const genisletBtn = event.target.closest("[data-satir-genislet]");
    if (genisletBtn) {
        gorevSatirToggle(genisletBtn);
        return;
    }
    const ekleId = event.target.dataset?.satirEkle;
    const silId = event.target.dataset?.satirSil;
    const soru = soruyuBul(ekleId || silId);
    if (!soru) return;
    const govde = soruBolumleriEl.querySelector(`[data-tablo="${soru.id}"] tbody`);
    if (ekleId) {
        // Detay satırlar sayılmaz; çakışmayı önlemek için en büyük numaranın biri üstü.
        const numaralar = [...govde.querySelectorAll("tr[data-satir]")].map((tr) => parseInt(tr.dataset.satir, 10) || 0);
        const idx = numaralar.length ? Math.max(...numaralar) + 1 : 0;
        const tr = document.createElement("tr");
        tr.dataset.satir = String(idx);
        tr.innerHTML = soru.sutunlar.map((sutun) => {
            const alan = hucreAlaniOlustur(soru, sutun, sutun.tip === "onay" ? [] : "", idx);
            if (sutun.tip === "text" && genisleyebilirHucreMi(soru, sutun)) {
                return `<td><div class="gorev-hucre hucre-genis">${alan}<button type="button" class="button ghost small gorev-toggle" data-satir-genislet title="Tam metni göster">▾</button></div></td>`;
            }
            if (sutun.tip === "text") {
                return `<td>${alan}</td>`;
            }
            const dar = sutun.tip === "onay" || sutun.tip === "secim" ? ' class="hucre-dar"' : "";
            return `<td${dar}>${alan}</td>`;
        }).join("") +
            `<td class="row-ops"><button type="button" class="button ghost small tasi-handle" draggable="true" data-satir-tasi="${soru.id}" title="Sürükleyerek sırala">⠿</button><button type="button" class="button ghost small satir-oneri-btn" data-satir-oneri="${soru.id}" title="Bu satır için öneri al">✨</button>${soru.sabit ? "" : `<button type="button" class="button danger small" data-satir-sil="${soru.id}">Sil</button>`}</td>`;
        govde.appendChild(tr);
        otomatikKaydetZamanla();
        ilerlemeHesapla();
    } else if (silId) {
        if (!confirm("Bu satır silinsin mi?")) return;
        const silinecek = event.target.closest("tr");
        const altDetay = silinecek && silinecek.nextElementSibling;
        if (silinecek) silinecek.remove();
        if (altDetay && altDetay.classList && altDetay.classList.contains("oneri-detay-satir")) altDetay.remove();
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
    const digerEsleme = {
        cevap_y_diger_aciklama: ['input[name="cevap_yetkiler"][value="y_diger"]', digerYetkiPanelGuncelle],
        cevap_ortam_diger_aciklama: ['input[name="cevap_ortamlar"][value="diger"]', ortamDigerPanelGuncelle],
        cevap_faktor_diger_aciklama: ['input[name="cevap_faktorler"][value="diger"]', faktorDigerPanelGuncelle]
    };
    const eslesme = digerEsleme[event.target.name];
    if (eslesme && event.target.value.trim()) {
        const kutu = form.querySelector(eslesme[0]);
        if (kutu && !kutu.checked) {
            kutu.checked = true;
            eslesme[1]();
        }
    }
    bolumdakiSonBolumuGuncelle(event.target);
    otomatikKaydetZamanla();
    clearTimeout(ilerlemeZamanlayici);
    ilerlemeZamanlayici = setTimeout(ilerlemeHesapla, 150);
});
// Yazdıkça büyüsün: metin alanları içeriğe göre uzar (tabloda yalnızca Görev sütunu)
form.addEventListener("input", (event) => {
    const alan = event.target && event.target.closest ? event.target.closest("textarea.input") : null;
    if (!alan) return;
    if (alan.closest("[data-tablo]") && !/_gorev$/.test(alan.name || "")) return;
    otomatikBuyut(alan);
});
form.addEventListener("change", (event) => {
    bolumdakiSonBolumuGuncelle(event.target);
    if (event.target.name === "cevap_fazla_mesai_var") {
        fazlaMesaiPanelGuncelle();
    } else if (event.target.name === "cevap_nobet_var") {
        nobetPanelGuncelle();
    } else if (event.target.name === "cevap_yetkiler" && event.target.value === "y_diger") {
        digerYetkiPanelGuncelle();
    } else if (event.target.name === "cevap_ortamlar" && event.target.value === "diger") {
        ortamDigerPanelGuncelle();
    } else if (event.target.name === "cevap_faktorler" && event.target.value === "diger") {
        faktorDigerPanelGuncelle();
    }
    // Risk: şiddet/sıklık seçimi "Var" kutusunu, kutu da seçimleri senkronlar.
    const riskSecim = (event.target.name || "").match(/^cevap_(risk_(?:kaza|trafik|meslek))_(siddet|siklik)$/);
    if (riskSecim) {
        const varKutu = form.querySelector(`input[name="cevap_${riskSecim[1]}_var"][value="X"]`);
        if (varKutu) {
            if (event.target.value === "Yok") varKutu.checked = false;
            else if (event.target.value) varKutu.checked = true;
        }
        riskPanelleriGuncelle();
    } else if (/^cevap_risk_(?:trafik|meslek)_var$/.test(event.target.name || "")) {
        riskPanelleriGuncelle();
    }
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
kosulluPanelleriGuncelle();
ilerlemeHesapla();
// Kayıtlı uzun metinler ilk açılışta da tam sığsın
soruBolumleriEl.querySelectorAll("textarea.input").forEach(otomatikBuyut);
if (devamModu) {
    devamBolumuneGit();
} else if (sonBolum) {
    const section = soruBolumleriEl.querySelector(`[data-bolum="${sonBolum}"]`);
    if (section) section.classList.remove("collapsed");
}
