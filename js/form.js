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
    if (soru.id === "gorevler") {
        Object.assign(satir, gorevDetayBos());
    }
    return satir;
}

// 2.1 görev satırına bağlı opsiyonel detay (tek yönlü oto-doldurma kaynağı).
// Çoklu mod: her görev satırında her gruptan istenildiği kadar bağlantı
// (sadece gelen / hem gelen hem giden / gelen+girdi+çıktı+giden vb. serbest).
// Gruplar birbirinden bağımsızdır, hepsi opsiyoneldir.
const GOREV_DETAY_ALANLARI = [
    "d_gelen_belge", "d_gelen_bolum", "d_gelen_siklik", "d_gelen_sure",
    "d_giden_belge", "d_giden_yer", "d_giden_siklik", "d_giden_sure",
    "d_girdi_tanim", "d_girdi_birim",
    "d_sistem_tanim",
    "d_cikti_tanim", "d_cikti_yer",
    "_oto_gelen_imza", "_oto_giden_imza", "_oto_girdi_imza", "_oto_sistem_imza", "_oto_cikti_imza"
];

function gorevDetayBos() {
    return { d_gelen: [], d_giden: [], d_girdi24: [], d_girdi27: [], d_sistem: [], d_cikti: [], d_kontrol_var: "", d_kontrol: [] };
}

// Tekli (eski) şemadan çokluya kayıp yaşatmadan geçir:
// d_gelen_belge doluysa tek elemanlık diziye çevrilir.
// Eski birleşik d_girdi (2.4+2.7'ye yazan) d_girdi24'e taşınır.
function gorevDetayNormalize(satir) {
    const s = { ...(satir || {}) };
    if (!Array.isArray(s.d_gelen)) s.d_gelen = [];
    if (!Array.isArray(s.d_giden)) s.d_giden = [];
    if (!Array.isArray(s.d_girdi24)) s.d_girdi24 = [];
    if (!Array.isArray(s.d_girdi27)) s.d_girdi27 = [];
    if (!Array.isArray(s.d_sistem)) s.d_sistem = [];
    if (!Array.isArray(s.d_cikti)) s.d_cikti = [];
    if (!Array.isArray(s.d_kontrol)) s.d_kontrol = [];
    if (typeof s.d_kontrol_var !== "string") s.d_kontrol_var = String(s.d_kontrol_var ?? "");
    // Ara sürüm uyumluluğu: d_girdi -> d_girdi24
    if (!s.d_girdi24.length && Array.isArray(s.d_girdi) && s.d_girdi.length) {
        s.d_girdi24 = s.d_girdi;
    }
    const temiz = (v) => String(v ?? "").trim();
    if (!s.d_gelen.length && (temiz(s.d_gelen_belge))) {
        s.d_gelen.push({
            belge: temiz(s.d_gelen_belge), bolum: temiz(s.d_gelen_bolum),
            siklik: temiz(s.d_gelen_siklik), sure: temiz(s.d_gelen_sure),
            _oto_imza: temiz(s._oto_gelen_imza)
        });
    }
    if (!s.d_giden.length && (temiz(s.d_giden_belge))) {
        s.d_giden.push({
            belge: temiz(s.d_giden_belge), yer: temiz(s.d_giden_yer),
            siklik: temiz(s.d_giden_siklik), sure: temiz(s.d_giden_sure),
            _oto_imza: temiz(s._oto_giden_imza)
        });
    }
    if (!s.d_girdi24.length && (temiz(s.d_girdi_tanim))) {
        s.d_girdi24.push({ tanim: temiz(s.d_girdi_tanim), birim: temiz(s.d_girdi_birim), _oto_imza: temiz(s._oto_girdi_imza) });
    }
    if (!s.d_cikti.length && (temiz(s.d_cikti_tanim))) {
        s.d_cikti.push({ tanim: temiz(s.d_cikti_tanim), yer: temiz(s.d_cikti_yer), _oto_imza: temiz(s._oto_cikti_imza) });
    }
    return s;
}

function gorevDetayDoluMu(satir) {
    const s = gorevDetayNormalize(satir);
    const grupDolu = (liste, anahtar) => Array.isArray(liste) && liste.some((o) => String(o?.[anahtar] ?? "").trim() !== "");
    return grupDolu(s.d_gelen, "belge") || grupDolu(s.d_giden, "belge")
        || grupDolu(s.d_girdi24, "tanim") || grupDolu(s.d_girdi27, "tanim")
        || grupDolu(s.d_sistem, "tanim") || grupDolu(s.d_cikti, "tanim")
        || String(s.d_kontrol_var || "").trim() !== "" || grupDolu(s.d_kontrol, "is") || grupDolu(s.d_kontrol, "amac");
}

function gorevDetaySayisi(satir) {
    const s = gorevDetayNormalize(satir);
    const say = (liste, anahtar) => Array.isArray(liste)
        ? liste.filter((o) => String(o?.[anahtar] ?? "").trim() !== "").length : 0;
    const sayKontrol = Array.isArray(s.d_kontrol)
        ? s.d_kontrol.filter((o) => String(o?.is ?? "").trim() !== "" || String(o?.amac ?? "").trim() !== "").length : 0;
    return say(s.d_gelen, "belge") + say(s.d_giden, "belge") + say(s.d_girdi24, "tanim") + say(s.d_girdi27, "tanim") + say(s.d_sistem, "tanim") + say(s.d_cikti, "tanim") + sayKontrol;
}

function guncelleGorevToggleSayisi(govde, anaIdx) {
    const detayTr = govde?.querySelector(`tr.gorev-detay-satir[data-ana-satir="${anaIdx}"]`);
    const anaTr = govde?.querySelector(`tr[data-satir="${anaIdx}"]:not(.gorev-detay-satir):not(.oneri-detay-satir)`);
    const toggle = anaTr?.querySelector("[data-gorev-detay-toggle]");
    if (!detayTr || !toggle) return;
    let n = 0;
    [["gelen", "belge"], ["giden", "belge"], ["girdi24", "tanim"], ["girdi27", "tanim"], ["sistem", "tanim"], ["cikti", "tanim"], ["kontrol", "is"]].forEach(([g, a]) => {
        detayTr.querySelectorAll(`[data-alt-grup="${g}"]`).forEach((el) => {
            const j = el.dataset.altJ;
            if ((detayTr.querySelector(`[name="cevap_gorevler_${anaIdx}_${g}_${j}_${a}"]`)?.value ?? "").trim()) { n++; return; }
            if (g === "kontrol" && (detayTr.querySelector(`[name="cevap_gorevler_${anaIdx}_${g}_${j}_amac"]`)?.value ?? "").trim()) n++;
        });
    });
    toggle.classList.toggle("detay-dolu", n > 0);
    toggle.textContent = n > 0 ? `🔗${n}` : "🔗";
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
        // Kayıtlı satır varsa aynen onlar; tablo boşsa başlangıç satırları.
        // (Eskiden minSatir kadar boş satır verinin altına ekleniyordu.)
        const minSatir = soru.sabit ? soru.satirSayisi : Math.max(soru.minSatir || 1, 1);
        const hedefSayi = soru.sabit ? minSatir : (satirlar.length ? satirlar.length : minSatir);
        const baslangic = [];
        for (let i = 0; i < hedefSayi; i++) {
            baslangic.push(satirlar[i] || bosSatir(soru));
        }
        const numarali = soru.id === "gorevler";
        const satirHtml = (satir, idx) => {
            const ana = `
            <tr data-satir="${idx}">
                ${numarali ? `<td class="row-no">${idx + 1}</td>` : ""}
                ${soru.sutunlar.map((sutun) => {
                    const alan = hucreAlaniOlustur(soru, sutun, satir[sutun.id], idx);
                    if (sutun.tip === "text" && genisleyebilirHucreMi(soru, sutun)) {
                        return `<td><div class="gorev-hucre hucre-genis">${alan}<button type="button" class="button ghost small gorev-toggle" data-satir-genislet title="Tam metni göster">▾</button></div></td>`;
                    }
                    if (sutun.tip === "text") {
                        return `<td>${alan}</td>`;
                    }
                    if (soru.id === "gorevler" && sutun.id === "sa") {
                        return `<td class="hucre-dar"><div class="hucre-sa">${alan}${saCipSatiri(satir[sutun.id])}</div></td>`;
                    }
                    const dar = sutun.tip === "onay" || sutun.tip === "secim" ? ' class="hucre-dar"' : "";
                    return `<td${dar}>${alan}</td>`;
                }).join("")}
                <td class="row-ops"><button type="button" class="button ghost small tasi-handle" draggable="true" data-satir-tasi="${soru.id}" title="Sürükleyerek sırala">⠿</button>${soru.id === "gorevler" ? (() => { const n = gorevDetaySayisi(satir); return `<button type="button" class="button ghost small" data-gorev-tasi="-1" ${idx === 0 ? "disabled" : ""} title="Görevi yukarı taşı">↑</button><button type="button" class="button ghost small" data-gorev-tasi="1" title="Görevi aşağı taşı">↓</button><button type="button" class="button ghost small ${n ? "detay-dolu" : ""}" data-gorev-detay-toggle="${idx}" title="Bağlı belge / girdi / çıktı ekle (çoklu)">🔗${n ? n : ""}</button>`; })() : `<button type="button" class="button ghost small satir-oneri-btn" data-satir-oneri="${soru.id}" title="Bu satır için öneri al">✨</button>`}${soru.sabit ? "" : `<button type="button" class="button danger small" data-satir-sil="${soru.id}">Sil</button>`}</td>
            </tr>`;
            if (soru.id !== "gorevler") return ana;
            return ana + gorevDetaySatirHtml(satir, idx);
        };
        return `
            <div class="table-wrap" data-tablo="${soru.id}">
                <table class="answer-table">
                    <thead><tr>
                        ${soru.id === "gorevler" ? `<th class="row-no-h">#</th>` : ""}
                        ${soru.sutunlar.map((s) => `<th>${metniKoru(s.baslik)}</th>`).join("")}
                        <th class="row-ops-h"></th>
                    </tr></thead>
                    <tbody>${baslangic.map(satirHtml).join("")}</tbody>
                </table>
                ${soru.sabit || soru.id === "gorevler" ? "" : `<button type="button" class="button secondary small" data-satir-ekle="${soru.id}">Satır Ekle</button>`}
            </div>${soru.id === "gorevler" ? `
            <div class="gorev-aracbar" data-gorev-aracbar>
                <div class="gorev-bilgi">
                    <span class="gorev-sayac" data-gorev-sayac>${baslangic.length ? `${baslangic.length} görev` : "0 görev"}</span>
                    <button type="button" class="button ghost small" data-gorev-detay-tumu title="Tüm görevlerin bağlantı detaylarını aç/kapat">Detaylar</button>
                </div>
                <div class="gorev-gezgin">
                    <button type="button" class="button secondary small" data-gorev-yeni>＋ Görev</button>
                </div>
            </div>
            <div class="gorev-altbar" data-gorev-altbar>
                <button type="button" class="button secondary" data-gorev-yeni>＋ Görev Ekle</button>
            </div>` : ""}`;
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
    // 2.1 tek sayfada: görev maddesi her zaman aşağı doğru büyüyen alan (sıkıştırma yok)
    if (soru.id === "gorevler" && sutun.id === "gorev") {
        const satirSayisi = metin.split("\n").reduce((t, s) => t + Math.max(1, Math.ceil(s.length / 50)), 0);
        const rows = Math.min(12, Math.max(1, satirSayisi + (metin ? 1 : 0)));
        return `<textarea class="input small-input gorev-buyuyen" name="${name}" rows="${rows}" title="${metniKoru(metin || sutun.baslik)}">${metniKoru(metin)}</textarea>`;
    }
    return `<input class="input small-input" name="${name}" value="${metniKoru(metin)}" title="${metniKoru(metin || sutun.baslik)}"${listeAttr}>`;
}

// Çoklu alt-satır: her grup içinde N tane. İsim şeması:
// cevap_gorevler_{idx}_{grup}_{j}_{alan}  (grup: gelen|giden|girdi24|girdi27|sistem|cikti)
function gorevAltSatirHtml(grup, idx, j, deger) {
    const d = deger || {};
    const inp = (alan, ph, liste) =>
        `<input class="input small-input" name="cevap_gorevler_${idx}_${grup}_${j}_${alan}" value="${metniKoru(d[alan] ?? "")}" placeholder="${metniKoru(ph)}"${liste ? ` list="${liste}"` : ""}>`;
    let ic = "";
    if (grup === "gelen") {
        ic = `${inp("belge", "Belge adı")}${inp("bolum", "Geldiği bölüm")}${inp("islem", "Yapılan işlem")}<div class="gorev-detay-ikili">${inp("siklik", "Sıklık", "siklikOnerileri")}${inp("sure", "Süre", "siklikOnerileri")}</div>`;
    } else if (grup === "giden") {
        ic = `${inp("belge", "Belge adı")}${inp("yer", "Gönderildiği yer / amaç")}<div class="gorev-detay-ikili">${inp("siklik", "Sıklık", "siklikOnerileri")}${inp("sure", "Süre", "siklikOnerileri")}</div>`;
    } else if (grup === "girdi24") {
        ic = `${inp("tanim", "Girdi tanımı")}${inp("birim", "Sağlayan birim / bölüm")}`;
    } else if (grup === "girdi27") {
        ic = `${inp("tanim", "Kullanılan girdi")}`;
    } else if (grup === "sistem") {
        ic = `${inp("tanim", "Sistem / araç adı (örn. ERP, Excel)")}`;
    } else if (grup === "kontrol") {
        ic = `${inp("is", "Yapılan iş")}${inp("amac", "Kontrol amacı")}<div class="gorev-detay-ikili">${inp("kontrol", "Kontrol")}${inp("paraf", "Paraf")}</div><div class="gorev-detay-ikili">${inp("imza", "İmza")}${inp("makam", "Makam onay")}</div>`;
    } else if (grup === "cikti") {
        ic = `${inp("tanim", "Çıktı tanımı")}${inp("yer", "Gittiği yer")}`;
    }
    return `<div class="gorev-alt" data-alt-grup="${grup}" data-alt-j="${j}">${ic}`
        + `<input type="hidden" name="cevap_gorevler_${idx}_${grup}_${j}__oto_imza" value="${metniKoru(d._oto_imza || "")}">`
        + `<button type="button" class="button danger small" data-gorev-alt-sil="${grup}:${idx}:${j}" title="Bu bağlantıyı sil">Sil</button></div>`;
}

// Kontrol grubu: önce "işiniz kontrol ediliyor mu?" sorusu, Evet ise mini tablo.
// Kaydedince Evet'li görevlerin satırları ana Kontrol tablosuna (3.6) eklenir.
function gorevKontrolGrupHtml(satir, idx) {
    const s = gorevDetayNormalize({ ...gorevDetayBos(), ...(satir || {}) });
    const secili = String(s.d_kontrol_var || "");
    const acik = secili === "Evet";
    const arr = Array.isArray(s.d_kontrol) ? s.d_kontrol : [];
    const ic = arr.length
        ? arr.map((o, j) => gorevAltSatirHtml("kontrol", idx, j, o)).join("")
        : `<p class="gorev-alt-bos" data-alt-bos="kontrol">Henüz yok — istersen ekle.</p>`;
    const secenek = (v) => `<option value="${v}"${secili === v ? " selected" : ""}>${v}</option>`;
    return `<fieldset data-alt-alan="kontrol"><legend data-alt-toggle="kontrol" title="Grubu daralt/genişlet"><span class="alt-ok" aria-hidden="true">▾</span>🔍 Kontrol → <em>Kontrol tablosu (3.6)</em></legend>`
        + `<label class="field kontrol-soru"><span>Yaptığınız iş kontrol ediliyor mu?</span>`
        + `<select class="input small-input" name="cevap_gorevler_${idx}_kontrolvar"><option value="">Seçiniz</option>${secenek("Evet")}${secenek("Hayır")}</select></label>`
        + `<div class="gorev-alt-liste" data-alt-liste="kontrol" data-kontrol-satirlar${acik ? "" : ' hidden style="display:none"'}>${ic}</div>`
        + `<div data-kontrol-ekle-sar${acik ? "" : ' hidden style="display:none"'}><button type="button" class="button secondary small" data-gorev-alt-ekle="kontrol:${idx}">＋ Ekle</button></div></fieldset>`;
}

function gorevAltGrupHtml(grup, baslik, hedef, liste, idx) {
    const arr = Array.isArray(liste) ? liste : [];
    const ic = arr.length
        ? arr.map((o, j) => gorevAltSatirHtml(grup, idx, j, o)).join("")
        : `<p class="gorev-alt-bos" data-alt-bos="${grup}">Henüz yok — istersen ekle.</p>`;
    return `<fieldset data-alt-alan="${grup}"><legend data-alt-toggle="${grup}" title="Grubu daralt/genişlet"><span class="alt-ok" aria-hidden="true">▾</span>${baslik} → <em>${hedef}</em></legend>`
        + `<div class="gorev-alt-liste" data-alt-liste="${grup}">${ic}</div>`
        + `<button type="button" class="button secondary small" data-gorev-alt-ekle="${grup}:${idx}">＋ Ekle</button></fieldset>`;
}

// Görev satırının altındaki açılır detay: 6 opsiyonel grup (çoklu).
// Kaydedince (taslak/tamamla/otomatik) dolu öğeler hedef bölüme yeni satır olarak eklenir.
function gorevDetaySatirHtml(satir, idx) {
    const s = gorevDetayNormalize({ ...gorevDetayBos(), ...(satir || {}) });
    const dolu = gorevDetayDoluMu(s);
    const sutunSayisi = 9; // # + 7 veri sütunu + işlemler
    return `
        <tr class="gorev-detay-satir${dolu ? "" : " detay-kapali"}" data-detay="gorevler" data-ana-satir="${idx}"${dolu ? "" : ' hidden style="display:none"'}>
            <td colspan="${sutunSayisi}">
                <div class="gorev-detay">
                    <p class="gorev-detay-not">Opsiyonel — her gruptan istediğin kadar ekle (sadece gelen / gelen+giden / hepsi…). Doldurdukların kaydedince diğer bölümlere <strong>yeni satır</strong> olarak eklenir.</p>
                    <div class="gorev-detay-grid">
                        ${gorevAltGrupHtml("gelen", "📥 Gelen belgeler ve sözlü talimatlar", "Gelen belgeler", s.d_gelen, idx)}
                        ${gorevAltGrupHtml("giden", "📤 Giden belgeler ve sözlü talimatlar", "Giden belgeler", s.d_giden, idx)}
                        ${gorevAltGrupHtml("girdi24", "🧾 Girdi 2.4 (birim / bölüm)", "2.4 girdiler", s.d_girdi24 ?? s.d_girdi, idx)}
                        ${gorevAltGrupHtml("girdi27", "🧪 Kullanılan girdi 2.7 (hammadde, bilgi…)", "2.7 girdiler", s.d_girdi27, idx)}
                        ${gorevAltGrupHtml("sistem", "💻 Sistem 2.6", "2.6 sistemler", s.d_sistem, idx)}
                        ${gorevAltGrupHtml("cikti", "📦 Çıktı 2.5", "2.5 çıktılar", s.d_cikti, idx)}
                        ${gorevKontrolGrupHtml(s, idx)}
                    </div>
                </div>
            </td>
        </tr>`;
}

// Detay TR içindeki çoklu grupları okur (kaydetme + kart görünümü ortak kullanır).
function gorevDetayOkuFromDom(detayTr, idx) {
    const out = { d_gelen: [], d_giden: [], d_girdi24: [], d_girdi27: [], d_sistem: [], d_cikti: [], d_kontrol_var: "", d_kontrol: [] };
    if (!detayTr) return out;
    const val = (name) => (detayTr.querySelector(`[name="${name}"]`)?.value ?? "").trim();
    out.d_kontrol_var = val(`cevap_gorevler_${idx}_kontrolvar`);
    ["gelen", "giden", "girdi24", "girdi27", "sistem", "cikti", "kontrol"].forEach((grup) => {
        const liste = detayTr.querySelector(`[data-alt-liste="${grup}"]`);
        if (!liste) return;
        liste.querySelectorAll('[data-alt-grup]').forEach((el) => {
            const j = el.dataset.altJ;
            const base = `cevap_gorevler_${idx}_${grup}_${j}_`;
            const imza = val(`cevap_gorevler_${idx}_${grup}_${j}__oto_imza`);
            const o = { _oto_imza: imza };
            if (grup === "gelen") {
                o.belge = val(base + "belge"); o.bolum = val(base + "bolum");
                o.islem = val(base + "islem");
                o.siklik = val(base + "siklik"); o.sure = val(base + "sure");
                if (o.belge) out.d_gelen.push(o);
            } else if (grup === "giden") {
                o.belge = val(base + "belge"); o.yer = val(base + "yer");
                o.siklik = val(base + "siklik"); o.sure = val(base + "sure");
                if (o.belge) out.d_giden.push(o);
            } else if (grup === "girdi24") {
                o.tanim = val(base + "tanim"); o.birim = val(base + "birim");
                if (o.tanim) out.d_girdi24.push(o);
            } else if (grup === "girdi27") {
                o.tanim = val(base + "tanim");
                if (o.tanim) out.d_girdi27.push(o);
            } else if (grup === "sistem") {
                o.tanim = val(base + "tanim");
                if (o.tanim) out.d_sistem.push(o);
            } else if (grup === "cikti") {
                o.tanim = val(base + "tanim"); o.yer = val(base + "yer");
                if (o.tanim) out.d_cikti.push(o);
            } else if (grup === "kontrol") {
                o.is = val(base + "is"); o.amac = val(base + "amac");
                o.kontrol = val(base + "kontrol"); o.paraf = val(base + "paraf");
                o.imza = val(base + "imza"); o.makam = val(base + "makam");
                if (o.is || o.amac) out.d_kontrol.push(o);
            }
        });
    });
    return out;
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

    soruBolumleriEl.innerHTML = `<div class="bolum-gezgin" data-bolum-gezgin>
            <button type="button" class="button ghost small" data-bolum-onceki>◀ Bölüm</button>
            <select class="input small-input" data-bolum-sec aria-label="Bölüme git">`
            + IS_ANALIZI_SORULARI.map((bolum, index) => `<option value="${bolum.id}">${index + 1}. ${metniKoru(bolum.baslik)}</option>`).join("")
            + `</select><button type="button" class="button ghost small" data-bolum-sonraki>Bölüm ▶</button>
            <button type="button" class="button secondary small" data-bolum-mod title="Tek bölüm / tüm bölümler görünümü">Tümü</button>
        </div>` + IS_ANALIZI_SORULARI.map((bolum, index) => `
        <section class="panel" id="${guvenliId(bolum.id)}" data-bolum="${bolum.id}">
            <div class="panel-header collapsible" data-toggle="${bolum.id}" role="button" tabindex="0" title="Bölümü aç/kapat">
                <h2>${index + 1}. ${metniKoru(bolum.baslik)}</h2>
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
    bolumGezginBagla();
}

function bolumGezginBagla() {
    const kok = soruBolumleriEl.querySelector("[data-bolum-gezgin]");
    if (!kok) return;
    const sec = kok.querySelector("[data-bolum-sec]");
    const modBtn = kok.querySelector("[data-bolum-mod]");
    const moduYansit = () => {
        if (modBtn) modBtn.textContent = bolumOdakModu ? "Tümü" : "Tek bölüm";
    };
    const git = (id, kaydir = true) => {
        const hedef = soruBolumleriEl.querySelector(`[data-bolum="${id}"]`);
        if (!hedef) return;
        sonBolum = id;
        if (sec) sec.value = id;
        bolumOdakUygula(id);
        hedef.classList.remove("collapsed");
        if (kaydir) hedef.scrollIntoView({ block: "start", behavior: "smooth" });
        otomatikKaydetZamanla();
    };
    moduYansit();
    if (sec && sonBolum) sec.value = sonBolum;
    kok.querySelector("[data-bolum-onceki]")?.addEventListener("click", () => {
        const ids = IS_ANALIZI_SORULARI.map((b) => b.id);
        const cur = sec?.value || sonBolum || ids[0];
        git(ids[Math.max(ids.indexOf(cur) - 1, 0)]);
    });
    kok.querySelector("[data-bolum-sonraki]")?.addEventListener("click", () => {
        const ids = IS_ANALIZI_SORULARI.map((b) => b.id);
        const cur = sec?.value || sonBolum || ids[0];
        git(ids[Math.min(ids.indexOf(cur) + 1, ids.length - 1)]);
    });
    sec?.addEventListener("change", () => git(sec.value));
    modBtn?.addEventListener("click", () => {
        bolumOdakModu = !bolumOdakModu;
        try { localStorage.setItem("bolum_gorunum", bolumOdakModu ? "tek" : "tum"); } catch (e) { /* yoksay */ }
        moduYansit();
        bolumOdakUygula(sec?.value || sonBolum);
    });
}

// Bölüm görünümü: varsayılan tek bölüm (odak), istek üzerine tümü.
// Gizlenen bölümler DOM'da kalır; okuma/kaydetme/Word etkilenmez.
let bolumOdakModu = true;
try {
    const b = localStorage.getItem("bolum_gorunum");
    if (b === "tum" || b === "tek") bolumOdakModu = (b === "tek");
} catch (e) { /* yoksay */ }

function bolumOdakUygula(aktifId) {
    const sec = soruBolumleriEl.querySelector("[data-bolum-sec]");
    const id = aktifId || sec?.value || sonBolum || IS_ANALIZI_SORULARI[0]?.id;
    soruBolumleriEl.querySelectorAll("[data-bolum]").forEach((section) => {
        const acik = !bolumOdakModu || section.dataset.bolum === id;
        section.hidden = !acik;
        section.style.display = acik ? "" : "none";
        if (acik) section.classList.remove("collapsed");
    });
    if (sec && id) sec.value = id;
    if (id) sonBolum = id;
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
    if (!govde) return [];
    const satirlar = [];
    // Detay satırlar (öneri kutuları + görev bağlantı detayları) atlanır;
    // isim eşleşmesi data-satir üzerinden yapılır.
    govde.querySelectorAll('tr[data-satir]:not(.oneri-detay-satir):not(.gorev-detay-satir)').forEach((tr, sira) => {
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
        if (soru.id === "gorevler") {
            const detayTr = govde.querySelector(`tr.gorev-detay-satir[data-ana-satir="${idx}"]`);
            Object.assign(satir, gorevDetayOkuFromDom(detayTr, idx));
        }
        const dolu = Object.values(satir).some((v) => Array.isArray(v) ? v.length : String(v ?? "").trim() !== "");
        if (dolu) satirlar.push(satir);
    });
    return satirlar;
}

// ===== GÖREV → DİĞER BÖLÜMLER OTO-DOLDURMA (tek yönlü, bir kez kopyala) =====
// Her görev detay grubu imzayla izlenir: aynı imza tekrar eklenmez,
// detay değişirse yeni satır eklenir (eski satır hedefte kalır, kayıp önlenir).
function detayImza(parcalar) {
    return parcalar.map((p) => String(p ?? "").trim()).join("|");
}

function hedefTabloyaSatirEkle(tabloId, degerler) {
    const soru = soruyuBul(tabloId);
    const govde = soruBolumleriEl.querySelector(`[data-tablo="${tabloId}"] tbody`);
    if (!soru || !govde) return;
    const numaralar = [...govde.querySelectorAll("tr[data-satir]")]
        .filter((tr) => !tr.classList.contains("oneri-detay-satir") && !tr.classList.contains("gorev-detay-satir"))
        .map((tr) => parseInt(tr.dataset.satir, 10) || 0);
    const idx = numaralar.length ? Math.max(...numaralar) + 1 : 0;
    const tr = document.createElement("tr");
    tr.dataset.satir = String(idx);
    tr.innerHTML = soru.sutunlar.map((sutun) => {
        const alan = hucreAlaniOlustur(soru, sutun, degerler[sutun.id] ?? "", idx);
        if (sutun.tip === "text") return `<td>${alan}</td>`;
        const dar = sutun.tip === "onay" || sutun.tip === "secim" ? ' class="hucre-dar"' : "";
        return `<td${dar}>${alan}</td>`;
    }).join("") +
        `<td class="row-ops"><button type="button" class="button ghost small tasi-handle" draggable="true" data-satir-tasi="${tabloId}" title="Sürükleyerek sırala">⠿</button><button type="button" class="button ghost small satir-oneri-btn" data-satir-oneri="${tabloId}" title="Bu satır için öneri al">✨</button><button type="button" class="button danger small" data-satir-sil="${tabloId}">Sil</button></td>`;
    govde.appendChild(tr);
}

function metinAlanaSatirEkle(alanAdi, satir) {
    const alan = form.elements[`cevap_${alanAdi}`];
    if (!alan || !satir) return;
    if (alan.value.includes(satir)) return;
    alan.value = alan.value.trim() ? alan.value.replace(/\s+$/, "") + "\n" + satir : satir;
    otomatikBuyut(alan);
}

// Liste tip alanlara (örn. sistemler) tek satır ekler; aynı satır tekrar eklenmez.
function listeAlanaSatirEkle(alanAdi, satir) {
    const alan = form.elements[`cevap_${alanAdi}`];
    if (!alan || !satir) return false;
    const temiz = String(satir).trim();
    if (!temiz) return false;
    const satirlar = alan.value.split("\n").map((s) => s.trim()).filter(Boolean);
    if (satirlar.some((s) => s.toLocaleLowerCase("tr-TR") === temiz.toLocaleLowerCase("tr-TR"))) return false;
    satirlar.push(temiz);
    alan.value = satirlar.join("\n");
    otomatikBuyut(alan);
    return true;
}

// Kaydetmeden hemen önce DOM üzerinden çalışır: hem veriye hem ekrana yansıtır.
// formVerisiniAl içinden çağrılır, dönüşte hedef tablolar okunur.
function otoBaglantilariAktar() {
    const govde = soruBolumleriEl.querySelector('[data-tablo="gorevler"] tbody');
    if (!govde) return { gelen: 0, giden: 0, girdi24: 0, girdi27: 0, sistem: 0, cikti: 0, kontrol: 0 };
    const sonuc = { gelen: 0, giden: 0, girdi24: 0, girdi27: 0, sistem: 0, cikti: 0, kontrol: 0 };
    govde.querySelectorAll('tr[data-satir]:not(.gorev-detay-satir):not(.oneri-detay-satir)').forEach((tr) => {
        const idx = tr.dataset.satir;
        const detayTr = govde.querySelector(`tr.gorev-detay-satir[data-ana-satir="${idx}"]`);
        if (!detayTr) return;
        const imzaYaz = (grup, j, imza) => {
            const gizli = detayTr.querySelector(`[name="cevap_gorevler_${idx}_${grup}_${j}__oto_imza"]`);
            if (gizli) gizli.value = imza;
        };
        // Gelen (çoklu)
        detayTr.querySelectorAll('[data-alt-grup="gelen"]').forEach((el) => {
            const j = el.dataset.altJ;
            const b = (a) => (detayTr.querySelector(`[name="cevap_gorevler_${idx}_gelen_${j}_${a}"]`)?.value ?? "").trim();
            if (!b("belge")) return;
            const imza = detayImza([b("belge"), b("bolum"), b("islem"), b("siklik"), b("sure")]);
            const eski = (detayTr.querySelector(`[name="cevap_gorevler_${idx}_gelen_${j}__oto_imza"]`)?.value ?? "");
            if (eski !== imza) {
                hedefTabloyaSatirEkle("gelen_belgeler", { belge: b("belge"), bolum: b("bolum"), islem: b("islem"), siklik: b("siklik"), sure: b("sure") });
                imzaYaz("gelen", j, imza);
                sonuc.gelen++;
            }
        });
        // Giden (çoklu)
        detayTr.querySelectorAll('[data-alt-grup="giden"]').forEach((el) => {
            const j = el.dataset.altJ;
            const b = (a) => (detayTr.querySelector(`[name="cevap_gorevler_${idx}_giden_${j}_${a}"]`)?.value ?? "").trim();
            if (!b("belge")) return;
            const imza = detayImza([b("belge"), b("yer"), b("siklik"), b("sure")]);
            const eski = (detayTr.querySelector(`[name="cevap_gorevler_${idx}_giden_${j}__oto_imza"]`)?.value ?? "");
            if (eski !== imza) {
                hedefTabloyaSatirEkle("giden_belgeler", { belge: b("belge"), yer_amac: b("yer"), siklik: b("siklik"), sure: b("sure") });
                imzaYaz("giden", j, imza);
                sonuc.giden++;
            }
        });
        // Girdi 2.4 (çoklu) -> girdiler_birimler
        detayTr.querySelectorAll('[data-alt-grup="girdi24"]').forEach((el) => {
            const j = el.dataset.altJ;
            const b = (a) => (detayTr.querySelector(`[name="cevap_gorevler_${idx}_girdi24_${j}_${a}"]`)?.value ?? "").trim();
            if (!b("tanim")) return;
            const imza = detayImza([b("tanim"), b("birim")]);
            const eski = (detayTr.querySelector(`[name="cevap_gorevler_${idx}_girdi24_${j}__oto_imza"]`)?.value ?? "");
            if (eski !== imza) {
                metinAlanaSatirEkle("girdiler_birimler", `- ${b("tanim")}${b("birim") ? ` (${b("birim")})` : ""}`);
                imzaYaz("girdi24", j, imza);
                sonuc.girdi24++;
            }
        });
        // Kullanılan girdi 2.7 (çoklu) -> kullanilan_girdiler
        detayTr.querySelectorAll('[data-alt-grup="girdi27"]').forEach((el) => {
            const j = el.dataset.altJ;
            const b = (a) => (detayTr.querySelector(`[name="cevap_gorevler_${idx}_girdi27_${j}_${a}"]`)?.value ?? "").trim();
            if (!b("tanim")) return;
            const imza = detayImza([b("tanim")]);
            const eski = (detayTr.querySelector(`[name="cevap_gorevler_${idx}_girdi27_${j}__oto_imza"]`)?.value ?? "");
            if (eski !== imza) {
                metinAlanaSatirEkle("kullanilan_girdiler", `- ${b("tanim")}`);
                imzaYaz("girdi27", j, imza);
                sonuc.girdi27++;
            }
        });
        // Sistem 2.6 (çoklu) -> sistemler (liste: her satır bir sistem)
        detayTr.querySelectorAll('[data-alt-grup="sistem"]').forEach((el) => {
            const j = el.dataset.altJ;
            const b = (a) => (detayTr.querySelector(`[name="cevap_gorevler_${idx}_sistem_${j}_${a}"]`)?.value ?? "").trim();
            if (!b("tanim")) return;
            const imza = detayImza([b("tanim")]);
            const eski = (detayTr.querySelector(`[name="cevap_gorevler_${idx}_sistem_${j}__oto_imza"]`)?.value ?? "");
            if (eski !== imza) {
                listeAlanaSatirEkle("sistemler", b("tanim"));
                imzaYaz("sistem", j, imza);
                sonuc.sistem++;
            }
        });
        // Çıktı (çoklu)
        detayTr.querySelectorAll('[data-alt-grup="cikti"]').forEach((el) => {
            const j = el.dataset.altJ;
            const b = (a) => (detayTr.querySelector(`[name="cevap_gorevler_${idx}_cikti_${j}_${a}"]`)?.value ?? "").trim();
            if (!b("tanim")) return;
            const imza = detayImza([b("tanim"), b("yer")]);
            const eski = (detayTr.querySelector(`[name="cevap_gorevler_${idx}_cikti_${j}__oto_imza"]`)?.value ?? "");
            if (eski !== imza) {
                metinAlanaSatirEkle("ciktilar", `- ${b("tanim")}${b("yer") ? ` → ${b("yer")}` : ""}`);
                imzaYaz("cikti", j, imza);
                sonuc.cikti++;
            }
        });
        // Kontrol (çoklu) — yalnızca "Evet" ise ana Kontrol tablosuna (3.6)
        if ((detayTr.querySelector(`[name="cevap_gorevler_${idx}_kontrolvar"]`)?.value ?? "") === "Evet") {
            detayTr.querySelectorAll('[data-alt-grup="kontrol"]').forEach((el) => {
                const j = el.dataset.altJ;
                const b = (a) => (detayTr.querySelector(`[name="cevap_gorevler_${idx}_kontrol_${j}_${a}"]`)?.value ?? "").trim();
                if (!b("is") && !b("amac")) return;
                const imza = detayImza([b("is"), b("amac"), b("kontrol"), b("paraf"), b("imza"), b("makam")]);
                const eski = (detayTr.querySelector(`[name="cevap_gorevler_${idx}_kontrol_${j}__oto_imza"]`)?.value ?? "");
                if (eski !== imza) {
                    hedefTabloyaSatirEkle("kontrol_tablosu", { is: b("is"), amac: b("amac"), kontrol: b("kontrol"), paraf: b("paraf"), imza: b("imza"), makam: b("makam") });
                    imzaYaz("kontrol", j, imza);
                    sonuc.kontrol++;
                }
            });
        }
        // 🔗 göstergesini güncelle (sayı ile)
        const toggle = tr.querySelector("[data-gorev-detay-toggle]");
        const n = detayTr.querySelectorAll('[data-alt-grup]').length
            ? [...detayTr.querySelectorAll('[data-alt-grup]')].filter((el) => {
                const g = el.dataset.altGrup, j = el.dataset.altJ;
                const ana = (g === "gelen" || g === "giden") ? "belge" : g === "kontrol" ? "is" : "tanim";
                if (g === "kontrol") {
                    return (detayTr.querySelector(`[name="cevap_gorevler_${idx}_${g}_${j}_is"]`)?.value ?? "").trim()
                        || (detayTr.querySelector(`[name="cevap_gorevler_${idx}_${g}_${j}_amac"]`)?.value ?? "").trim();
                }
                return (detayTr.querySelector(`[name="cevap_gorevler_${idx}_${g}_${j}_${ana}"]`)?.value ?? "").trim();
            }).length : 0;
        if (toggle) {
            toggle.classList.toggle("detay-dolu", n > 0);
            toggle.innerHTML = n > 0 ? `🔗${n}` : "🔗";
        }
    });
    return sonuc;
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

function digerYetkiPanelGuncelle() {
    kosulluPanelGuncelle('input[name="cevap_yetkiler"][value="y_diger"]', "y_diger_aciklama", "Kutuyu işaretleyin, yoksa Word'e boş çıkar");
}

function ortamDigerPanelGuncelle() {
    kosulluPanelGuncelle('input[name="cevap_ortamlar"][value="diger"]', "ortam_diger_aciklama", "Kutuyu işaretleyin, yoksa Word'e boş çıkar");
}

function faktorDigerPanelGuncelle() {
    kosulluPanelGuncelle('input[name="cevap_faktorler"][value="diger"]', "faktor_diger_aciklama", "Kutuyu işaretleyin, yoksa Word'e boş çıkar");
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
// S/A çipleri (2.1 tablosu): tıklayarak seçim; değerler Word'e aynen S/A gider
function saCipSatiri(deger) {
    return `<div class="cip-satir cip-satir-sa">${["S", "A"].map((v) => {
        const aktif = String(deger ?? "") === v ? " aktif" : "";
        const aciklama = v === "S" ? "Sürekli" : "Ara sıra";
        return `<button type="button" class="cip${aktif}" data-siklik-cip="sa:${v}" title="Tek tıkla seç: ${aciklama}">${v}</button>`;
    }).join("")}</div>`;
}

function gorevSatirlariOkuAktif() {
    const soru = soruyuBul("gorevler");
    return soru ? tabloSatirlariniOku(soru) : [];
}

// Boş satırlar okumada elenir; ekleme her zaman görünür artsın diye
// tablodaki mevcut satır sayısını verir.
function gorevDomSatirSayisi() {
    return soruBolumleriEl.querySelectorAll('[data-tablo="gorevler"] tbody tr[data-satir]:not(.gorev-detay-satir):not(.oneri-detay-satir)').length;
}

// Okunan veriyi DOM sayısına tamamlar (boş başlangıç satırları kaybolmasın).
function gorevVeriyiDomlaDengele(veriler) {
    const taban = Math.max(veriler.length, gorevDomSatirSayisi());
    while (veriler.length < taban) veriler.push(bosSatir(soruyuBul("gorevler")));
    return veriler;
}

// 2.1 tablosunu veriden yeniden çizer (tek görünüm: satırlar + detay satırları).
function gorevKonteynerleriYenidenCiz(veriler) {
    const soru = soruyuBul("gorevler");
    const govde = soruBolumleriEl.querySelector('[data-tablo="gorevler"] tbody');
    const liste = (Array.isArray(veriler) && veriler.length ? veriler : [bosSatir(soru)]).map((s) => gorevDetayNormalize({ ...gorevDetayBos(), ...s }));
    if (govde && soru) {
        govde.innerHTML = liste.map((s, i) => {
            const ana = `<tr data-satir="${i}"><td class="row-no">${i + 1}</td>`
                + soru.sutunlar.map((sutun) => {
                    const alan = hucreAlaniOlustur(soru, sutun, s[sutun.id], i);
                    if (sutun.tip === "text" && genisleyebilirHucreMi(soru, sutun)) {
                        return `<td><div class="gorev-hucre hucre-genis">${alan}<button type="button" class="button ghost small gorev-toggle" data-satir-genislet title="Tam metni göster">▾</button></div></td>`;
                    }
                    if (sutun.tip === "text") return `<td>${alan}</td>`;
                    if (sutun.id === "sa") {
                        return `<td class="hucre-dar"><div class="hucre-sa">${alan}${saCipSatiri(s[sutun.id])}</div></td>`;
                    }
                    const dar = sutun.tip === "onay" || sutun.tip === "secim" ? ' class="hucre-dar"' : "";
                    return `<td${dar}>${alan}</td>`;
                }).join("")
                + `<td class="row-ops"><button type="button" class="button ghost small tasi-handle" draggable="true" data-satir-tasi="gorevler" title="Sürükleyerek sırala">⠿</button>`
                + `<button type="button" class="button ghost small" data-gorev-tasi="-1" ${i === 0 ? "disabled" : ""} title="Görevi yukarı taşı">↑</button>`
                + `<button type="button" class="button ghost small" data-gorev-tasi="1" ${i === liste.length - 1 ? "disabled" : ""} title="Görevi aşağı taşı">↓</button>`
                + (() => { const n = gorevDetaySayisi(s); return `<button type="button" class="button ghost small ${n ? "detay-dolu" : ""}" data-gorev-detay-toggle="${i}" title="Bağlı belge / girdi / çıktı ekle (çoklu)">🔗${n ? n : ""}</button>`; })()
                + `<button type="button" class="button danger small" data-satir-sil="gorevler">Sil</button></td></tr>`;
            return ana + gorevDetaySatirHtml(s, i);
        }).join("");
    }
    guncelleGorevSayac(liste.length);
}

function gorevEkleVeOdakla() {
    const veriler = gorevVeriyiDomlaDengele(gorevSatirlariOkuAktif());
    veriler.push(bosSatir(soruyuBul("gorevler")));
    gorevKonteynerleriYenidenCiz(veriler);
    const govde = soruBolumleriEl.querySelector('[data-tablo="gorevler"] tbody');
    const sonSatir = govde?.querySelector('tr[data-satir]:not(.gorev-detay-satir):not(.oneri-detay-satir):last-of-type');
    if (sonSatir) sonSatir.scrollIntoView({ block: "center", behavior: "smooth" });
    const ilkAlan = govde?.querySelector(`tr[data-satir="${veriler.length - 1}"] input, tr[data-satir="${veriler.length - 1}"] textarea`);
    if (ilkAlan) setTimeout(() => ilkAlan.focus({ preventScroll: true }), 250);
    otomatikKaydetZamanla();
    ilerlemeHesapla();
}

function guncelleGorevSayac(toplam) {
    const el = soruBolumleriEl.querySelector("[data-gorev-sayac]");
    if (el) el.textContent = toplam ? `${toplam} görev` : "0 görev";
}

// Geriye uyumluluk: eski adla çağrılan yerler hucreToggle'a yönlenir.
function gorevSatirToggle(dugme) {
    hucreToggle(dugme);
}

// ===== SÜRÜKLE-BIRAK SATIR SIRALAMA =====
let suruklenenSatir = null;
// Sürüklerken imleç pencere kenarına yaklaşınca otomatik kaydır
// (çok maddeli listede en alttan en üste taşıma için).
let surukleIsaretY = null;
let surukleIsaretX = null;
let surukleKaydirAktif = false;

function kayanAtaBul(el) {
    let n = el ? el.parentElement : null;
    while (n && n !== document.body) {
        let st = null;
        try { st = getComputedStyle(n); } catch (e) { return null; }
        if ((st.overflowY === "auto" || st.overflowY === "scroll") && n.scrollHeight > n.clientHeight + 1) return n;
        n = n.parentElement;
    }
    return null;
}

function surukleKaydirmayiBaslat() {
    if (surukleKaydirAktif) return;
    surukleKaydirAktif = true;
    const adim = () => {
        if (!suruklenenSatir) { surukleKaydirAktif = false; surukleIsaretY = null; surukleIsaretX = null; return; }
        if (surukleIsaretY != null) {
            const BOLGE = 90;
            const h = window.innerHeight || document.documentElement.clientHeight || 600;
            let hiz = 0;
            if (surukleIsaretY < BOLGE) hiz = -Math.ceil(14 * (1 - surukleIsaretY / BOLGE)) - 2;
            else if (surukleIsaretY > h - BOLGE) hiz = Math.ceil(14 * (1 - (h - surukleIsaretY) / BOLGE)) + 2;
            if (hiz !== 0) {
                const kutu = suruklenenSatir.satir ? suruklenenSatir.satir.closest("[data-tablo]") : null;
                const kaydirilabilir = kutu ? kayanAtaBul(kutu) : null;
                if (kaydirilabilir) kaydirilabilir.scrollTop += hiz;
                else window.scrollBy(0, hiz);
                // Kaydırmada satırlar imlecin altından kayar: bırakma göstergesini tazele
                surukleHedefiIsaretle(surukleIsaretX, surukleIsaretY);
            }
        }
        requestAnimationFrame(adim);
    };
    requestAnimationFrame(adim);
}

// İmlecin altındaki satırı bulup bırakma göstergesini günceller.
// Kaydırma sırasında satırlar kaydığından her karede tazelenir;
// bırakma her zaman görünen hedefe yapılır.
function surukleHedefiIsaretle(clientX, clientY) {
    if (!suruklenenSatir || clientX == null || clientY == null) return;
    let el = null;
    try { el = document.elementFromPoint(clientX, clientY); } catch (e) { return; }
    surukleGostergeleriTemizle();
    let tr = el ? el.closest("tr") : null;
    if (!tr) return;
    const govde = soruBolumleriEl.querySelector(`[data-tablo="${suruklenenSatir.tablo}"] tbody`);
    if (!govde || !govde.contains(tr)) return;
    if (tr === suruklenenSatir.satir) return;
    if (tr.classList.contains("gorev-detay-satir") || tr.classList.contains("oneri-detay-satir")) {
        tr = tr.previousElementSibling;
        if (!tr || tr === suruklenenSatir.satir) return;
    }
    const rect = tr.getBoundingClientRect();
    const once = (clientY - rect.top) < rect.height / 2;
    tr.classList.toggle("birak-once", once);
    tr.classList.toggle("birak-sonra", !once);
    tr.dataset.birakYonu = once ? "once" : "sonra";
}

function tabloSatirlariniYenidenNumarala(tabloId) {
    const govde = soruBolumleriEl.querySelector(`[data-tablo="${tabloId}"] tbody`);
    if (!govde) return;
    const anaSatirlar = [...govde.querySelectorAll("tr[data-satir]")]
        .filter((tr) => !tr.classList.contains("oneri-detay-satir") && !tr.classList.contains("gorev-detay-satir"));
    anaSatirlar.forEach((tr, yeniIdx) => {
        const eski = tr.dataset.satir;
        tr.dataset.satir = String(yeniIdx);
        tr.querySelectorAll("[name]").forEach((alan) => {
            // Ana satır isimleri tek numaralıdır: cevap_{tablo}_{idx}_{sutun}
            alan.name = alan.name.replace(new RegExp(`^(cevap_${tabloId}_)(\\d+)(_.*)$`), `$1${yeniIdx}$3`);
        });
        if (tabloId === "gorevler" && eski !== String(yeniIdx)) {
            const detay = govde.querySelector(`tr.gorev-detay-satir[data-ana-satir="${eski}"]`);
            if (detay) {
                detay.dataset.anaSatir = String(yeniIdx);
                detay.querySelectorAll("[name]").forEach((alan) => {
                    // Detay isimleri: cevap_gorevler_{anaIdx}_{grup}_{j}_{alan} — sadece ana idx değişir
                    alan.name = alan.name.replace(/^(cevap_gorevler_)(\d+)(_.+)$/, `$1${yeniIdx}$3`);
                });
            }
        }
        const toggle = tr.querySelector("[data-gorev-detay-toggle]");
        if (toggle) toggle.dataset.gorevDetayToggle = String(yeniIdx);
    });
    // Detay satırları her zaman kendi ana satırının altında dursun (sürükle-bırak sonrası)
    anaSatirlar.forEach((tr) => {
        const detay = govde.querySelector(`tr.gorev-detay-satir[data-ana-satir="${tr.dataset.satir}"]`);
        if (detay && detay.previousElementSibling !== tr) tr.after(detay);
    });
    satirNumaralariniGuncelle(tabloId);
}

// Görünen satır numaraları (yalnızca numaralı tablolarda .row-no hücresi vardır).
function satirNumaralariniGuncelle(tabloId) {
    const govde = soruBolumleriEl.querySelector(`[data-tablo="${tabloId}"] tbody`);
    if (!govde) return;
    govde.querySelectorAll("tr[data-satir]:not(.oneri-detay-satir):not(.gorev-detay-satir)").forEach((tr, i) => {
        const no = tr.querySelector(":scope > td.row-no");
        if (no) no.textContent = String(i + 1);
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
    surukleKaydirmayiBaslat();
});

soruBolumleriEl.addEventListener("dragover", (event) => {
    if (!suruklenenSatir) return;
    surukleIsaretY = event.clientY;
    surukleIsaretX = event.clientX;
    const sarmal = event.target.closest("[data-tablo]");
    if (!sarmal || sarmal.dataset.tablo !== suruklenenSatir.tablo) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    surukleHedefiIsaretle(event.clientX, event.clientY);
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
    let tr = event.target.closest("tr");
    const sarmal = event.target.closest("[data-tablo]");
    if (!tr || !sarmal || sarmal.dataset.tablo !== suruklenenSatir.tablo) return;
    if (tr.classList.contains("gorev-detay-satir") || tr.classList.contains("oneri-detay-satir")) {
        tr = tr.previousElementSibling;
        if (!tr) return;
    }
    event.preventDefault();
    const kaynak = suruklenenSatir.satir;
    if (tr !== kaynak) {
        const kaynakDetay = sarmal.dataset.tablo === "gorevler"
            ? govdeDetayBul(sarmal.dataset.tablo, kaynak.dataset.satir)
            : null;
        if (tr.dataset.birakYonu === "sonra") {
            tr.after(kaynak);
            if (kaynakDetay) kaynak.after(kaynakDetay);
        } else {
            tr.before(kaynak);
            if (kaynakDetay) kaynak.after(kaynakDetay);
        }
        tabloSatirlariniYenidenNumarala(sarmal.dataset.tablo);
        otomatikKaydetZamanla();
        ilerlemeHesapla();
    }
    surukleGostergeleriTemizle();
});

function govdeDetayBul(tabloId, anaSatir) {
    const govde = soruBolumleriEl.querySelector(`[data-tablo="${tabloId}"] tbody`);
    return govde?.querySelector(`tr.gorev-detay-satir[data-ana-satir="${anaSatir}"]`) || null;
}

soruBolumleriEl.addEventListener("dragend", () => {
    if (suruklenenSatir) suruklenenSatir.satir.classList.remove("surukleniyor");
    surukleGostergeleriTemizle();
    suruklenenSatir = null;
});

// Satırların dışında da imleç konumu tazelensin (kenar kaydırması kesilmesin);
// görev sürüklenirken bırakma her yerde güvenilir ateşlensin.
document.addEventListener("dragover", (event) => {
    if (!suruklenenSatir) return;
    surukleIsaretY = event.clientY;
    surukleIsaretX = event.clientX;
    event.preventDefault();
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
    // Kaydetmeden önce görev detaylarındaki bağlantıları hedef bölümlere ekle
    // (tek yönlü, imza ile tekrar önlenir; hedefte elle yazılan korunur).
    try { otoBaglantilariAktar(); } catch (error) { console.error("Oto bağlantı aktarımı", error); }
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
    try {
        tekKayitDisaAktar(simdiKaydet());
    } catch (error) {
        console.error("JSON aktarımı başarısız", error);
    }
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
    const detayToggle = event.target.closest("[data-gorev-detay-toggle]");
    if (detayToggle) {
        const anaIdx = detayToggle.dataset.gorevDetayToggle;
        const govde = detayToggle.closest("tbody");
        const detayTr = govde?.querySelector(`tr.gorev-detay-satir[data-ana-satir="${anaIdx}"]`);
        if (detayTr) {
            const gizli = detayTr.style.display === "none" || detayTr.hasAttribute("hidden");
            if (gizli) {
                detayTr.hidden = false;
                detayTr.style.display = "";
                detayTr.classList.remove("detay-kapali");
            } else {
                detayTr.hidden = true;
                detayTr.style.display = "none";
                detayTr.classList.add("detay-kapali");
            }
        }
        return;
    }
    // Detay grup başlığı: ilgili fieldset'i daralt/genişlet (sadece o grup etkilenir)
    const altToggle = event.target.closest("[data-alt-toggle]");
    if (altToggle) {
        const alan = altToggle.closest("fieldset[data-alt-alan]");
        if (alan) {
            const kapali = alan.classList.toggle("kapali");
            altToggle.title = kapali ? "Grubu genişlet" : "Grubu daralt";
        }
        return;
    }
    const altEkle = event.target.closest("[data-gorev-alt-ekle]");
    if (altEkle) {
        const [grup, anaIdx] = (altEkle.dataset.gorevAltEkle || "").split(":");
        const detayKok = altEkle.closest("tr.gorev-detay-satir");
        const liste = detayKok?.querySelector(`[data-alt-liste="${grup}"]`);
        if (detayKok && liste) {
            const mevcut = [...liste.querySelectorAll("[data-alt-j]")].map((el) => parseInt(el.dataset.altJ, 10) || 0);
            const j = mevcut.length ? Math.max(...mevcut) + 1 : 0;
            const tmp = document.createElement("div");
            tmp.innerHTML = gorevAltSatirHtml(grup, anaIdx, j, {});
            const el = tmp.firstElementChild;
            const bos = liste.querySelector('[data-alt-bos]');
            if (bos) bos.remove();
            if (el) {
                liste.appendChild(el);
                el.querySelector("input")?.focus();
            }
            const govde = altEkle.closest("tbody");
            if (govde) guncelleGorevToggleSayisi(govde, anaIdx);
            otomatikKaydetZamanla();
            ilerlemeHesapla();
        }
        return;
    }
    const altSil = event.target.closest("[data-gorev-alt-sil]");
    if (altSil) {
        const [grup, anaIdx] = (altSil.dataset.gorevAltSil || "").split(":");
        const detayKok = altSil.closest("tr.gorev-detay-satir");
        if (!confirm("Bu bağlantı silinsin mi? (Hedef bölüme eklenen satır kalır)")) return;
        const el = altSil.closest("[data-alt-grup]");
        if (el) el.remove();
        const liste = detayKok?.querySelector(`[data-alt-liste="${grup}"]`);
        if (liste && !liste.querySelector("[data-alt-grup]")) {
            liste.innerHTML = `<p class="gorev-alt-bos" data-alt-bos="${grup}">Henüz yok — istersen ekle.</p>`;
        }
        const govdeSil = altSil.closest("tbody");
        if (govdeSil) guncelleGorevToggleSayisi(govdeSil, anaIdx);
        otomatikKaydetZamanla();
        ilerlemeHesapla();
        return;
    }
    if (event.target.closest("[data-gorev-yeni]")) {
        gorevEkleVeOdakla();
        return;
    }
    // Tüm detaylar: açık detay varsa hepsini kapat, yoksa hepsini aç
    const detayTumu = event.target.closest("[data-gorev-detay-tumu]");
    if (detayTumu) {
        const govde = soruBolumleriEl.querySelector('[data-tablo="gorevler"] tbody');
        const detaylar = govde ? [...govde.querySelectorAll("tr.gorev-detay-satir")] : [];
        if (!detaylar.length) return;
        const acikVar = detaylar.some((d) => !d.hidden && d.style.display !== "none");
        detaylar.forEach((d) => {
            d.hidden = acikVar;
            d.style.display = acikVar ? "none" : "";
            d.classList.toggle("detay-kapali", acikVar);
        });
        detayTumu.textContent = acikVar ? "Detaylar" : "Detayları Kapat";
        detayTumu.title = acikVar ? "Tüm görevlerin bağlantı detaylarını aç" : "Tüm görevlerin bağlantı detaylarını kapat";
        return;
    }
    // Satır taşıma (tabloda ↑ ↓): veri sırasını değiştirip yeniden çiz
    const satirTasi = event.target.closest("[data-gorev-tasi]");
    if (satirTasi) {
        const satirEl = satirTasi.closest("tr[data-satir]");
        const idx = satirEl ? parseInt(satirEl.dataset.satir, 10) || 0 : 0;
        const hedef = idx + (parseInt(satirTasi.dataset.gorevTasi, 10) || 0);
        const veriler = gorevVeriyiDomlaDengele(gorevSatirlariOkuAktif());
        if (hedef < 0 || hedef >= veriler.length) return;
        const tmp = veriler[idx]; veriler[idx] = veriler[hedef]; veriler[hedef] = tmp;
        gorevKonteynerleriYenidenCiz(veriler);
        const hedefSatir = soruBolumleriEl.querySelector(`[data-tablo="gorevler"] tbody tr[data-satir="${hedef}"]:not(.gorev-detay-satir):not(.oneri-detay-satir)`);
        hedefSatir?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        otomatikKaydetZamanla();
        ilerlemeHesapla();
        return;
    }
    // S/A çipi: tek tıkla değeri yaz (değerler Word'e aynen S/A gider)
    const cip = event.target.closest("[data-siklik-cip]");
    if (cip) {
        const parca = (cip.dataset.siklikCip || "").split(":");
        const sutunId = parca[0];
        const deger = parca.slice(1).join(":");
        const kok = cip.closest("tr[data-satir]");
        const satirIdx = kok?.dataset.satir;
        const girdi = kok?.querySelector(`[name="cevap_gorevler_${satirIdx}_${sutunId}"]`);
        if (girdi) {
            girdi.value = deger;
            girdi.dispatchEvent(new Event("input", { bubbles: true }));
            girdi.dispatchEvent(new Event("change", { bubbles: true }));
            kok.querySelectorAll("[data-siklik-cip]").forEach((b) => {
                const p = (b.dataset.siklikCip || "").split(":");
                b.classList.toggle("aktif", p[0] === sutunId && p.slice(1).join(":") === deger);
            });
            girdi.focus();
        }
        return;
    }
    const ekleId = event.target.dataset?.satirEkle;
    const silId = event.target.dataset?.satirSil;
    const soru = soruyuBul(ekleId || silId);
    if (!soru) return;
    const govde = soruBolumleriEl.querySelector(`[data-tablo="${soru.id}"] tbody`);
    if (ekleId) {
        // Detay satırlar sayılmaz; çakışmayı önlemek için en büyük numaranın biri üstü.
        const numaralar = [...govde.querySelectorAll('tr[data-satir]:not(.gorev-detay-satir):not(.oneri-detay-satir)')].map((tr) => parseInt(tr.dataset.satir, 10) || 0);
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
            `<td class="row-ops"><button type="button" class="button ghost small tasi-handle" draggable="true" data-satir-tasi="${soru.id}" title="Sürükleyerek sırala">⠿</button>${soru.id === "gorevler" ? `<button type="button" class="button ghost small" data-gorev-detay-toggle="${idx}" title="Bağlı belge / girdi / çıktı ekle">🔗</button>` : `<button type="button" class="button ghost small satir-oneri-btn" data-satir-oneri="${soru.id}" title="Bu satır için öneri al">✨</button>`}${soru.sabit ? "" : `<button type="button" class="button danger small" data-satir-sil="${soru.id}">Sil</button>`}</td>`;
        if (soru.id === "gorevler") {
            tr.insertAdjacentHTML("afterbegin", `<td class="row-no"></td>`);
        }
        govde.appendChild(tr);
        if (soru.id === "gorevler") {
            const tmp = document.createElement("tbody");
            tmp.innerHTML = gorevDetaySatirHtml(gorevDetayBos(), idx).trim();
            const detayTr = tmp.firstElementChild;
            if (detayTr) tr.after(detayTr);
        }
        satirNumaralariniGuncelle(soru.id);
        otomatikKaydetZamanla();
        ilerlemeHesapla();
    } else if (silId) {
        if (!confirm("Bu satır silinsin mi?")) return;
        const silinecek = event.target.closest("tr");
        const anaIdx = silinecek?.dataset?.satir;
        const govdeSil = silinecek?.closest("tbody");
        const gorevDetay = (silinecek && !silinecek.classList.contains("gorev-detay-satir") && anaIdx != null)
            ? govdeSil?.querySelector(`tr.gorev-detay-satir[data-ana-satir="${anaIdx}"]`)
            : null;
        const altDetay = silinecek && silinecek.nextElementSibling;
        if (silinecek) silinecek.remove();
        if (gorevDetay) gorevDetay.remove();
        if (altDetay && altDetay.classList && altDetay.classList.contains("oneri-detay-satir")) altDetay.remove();
        // Hedef bölüme kopyalanmış satırlar bilerek silinmez (kayıp önleme).
        if (silId) tabloSatirlariniYenidenNumarala(silId);
        else satirNumaralariniGuncelle(soru.id);
        otomatikKaydetZamanla();
        ilerlemeHesapla();
    }
});

bolumNavEl.addEventListener("click", (event) => {
    if (event.target.closest("#expandAll")) {
        bolumOdakModu = false;
        try { localStorage.setItem("bolum_gorunum", "tum"); } catch (e) { /* yoksay */ }
        const modBtn = soruBolumleriEl.querySelector("[data-bolum-mod]");
        if (modBtn) modBtn.textContent = "Tek bölüm";
        IS_ANALIZI_SORULARI.forEach((b) => bolumuAcKapat(b.id, true));
        bolumOdakUygula(sonBolum);
        // Tümü modunda gizleme kalkar:
        soruBolumleriEl.querySelectorAll("[data-bolum]").forEach((s) => { s.hidden = false; s.style.display = ""; });
        return;
    }
    if (event.target.closest("#collapseAll")) {
        IS_ANALIZI_SORULARI.forEach((b) => bolumuAcKapat(b.id, false));
        return;
    }
    const link = event.target.closest("[data-navlink]");
    if (link) {
        if (!bolumOdakModu) {
            bolumOdakModu = true;
            try { localStorage.setItem("bolum_gorunum", "tek"); } catch (e) { /* yoksay */ }
            const modBtn = soruBolumleriEl.querySelector("[data-bolum-mod]");
            if (modBtn) modBtn.textContent = "Tümü";
        }
        sonBolum = link.dataset.navlink;
        otomatikKaydetZamanla();
        bolumOdakUygula(link.dataset.navlink);
        const hedef = soruBolumleriEl.querySelector(`[data-bolum="${link.dataset.navlink}"]`);
        if (hedef) hedef.scrollIntoView({ block: "start", behavior: "smooth" });
    }
});

soruBolumleriEl.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && event.target.matches?.("[data-toggle]")) {
        event.preventDefault();
        event.target.closest("[data-bolum]")?.classList.toggle("collapsed");
    }
});
// Görev alanlarında Enter: formu submit etmeden (yanlışlıkla Tamamla'yı önler)
// sıradaki alana geç, satırın son alanındaysa yeni görev aç
soruBolumleriEl.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    const hedef = event.target;
    if (!hedef || hedef.tagName !== "INPUT") return;
    if (hedef.type === "checkbox" || hedef.type === "hidden") return;
    const satir = hedef.closest('tr[data-satir]');
    if (!satir) return;
    event.preventDefault();
    const alanlar = [...satir.querySelectorAll("input.input")].filter((el) =>
        el.type !== "checkbox" && el.type !== "hidden" && !el.disabled && el.offsetParent !== null);
    const i = alanlar.indexOf(hedef);
    if (i >= 0 && i < alanlar.length - 1) {
        alanlar[i + 1].focus();
        try { alanlar[i + 1].select(); } catch (e) { /* yoksay */ }
    } else if (!satir.classList.contains("gorev-detay-satir") && !satir.classList.contains("oneri-detay-satir")) {
        gorevEkleVeOdakla();
    }
});
let ilerlemeZamanlayici = null;
form.addEventListener("input", (event) => {
    // Görev detayına yazılınca 🔗 sayacını canlı güncelle (kaydetmeden önce ipucu)
    const detayAlani = event.target.name?.match?.(/^cevap_gorevler_(\d+)_(gelen|giden|girdi24|girdi27|sistem|cikti|kontrol)_\d+_(belge|tanim|is|amac)$/);
    if (detayAlani) {
        const govde = event.target.closest("tbody");
        if (govde) guncelleGorevToggleSayisi(govde, detayAlani[1]);
    }
    // S/A alanına yazılınca/seçilince çip işaretini eşitle
    const cipAlani = (event.target.name || "").match(/^cevap_gorevler_(\d+)_(sa)$/);
    if (cipAlani) {
        const kok = event.target.closest("tr[data-satir]");
        const deger = (event.target.value || "").trim();
        kok?.querySelectorAll("[data-siklik-cip]").forEach((b) => {
            const p = (b.dataset.siklikCip || "").split(":");
            b.classList.toggle("aktif", p[0] === cipAlani[2] && p.slice(1).join(":") === deger && deger !== "");
        });
    }
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
    // Görev kontrol sorusu: Evet ise mini tablo + Ekle açılır, değilse gizlenir (veri korunur)
    const kontrolSecim = (event.target.name || "").match(/^cevap_gorevler_(\d+)_kontrolvar$/);
    if (kontrolSecim) {
        const kok = event.target.closest("tr.gorev-detay-satir");
        const acik = event.target.value === "Evet";
        kok?.querySelector("[data-kontrol-satirlar]")?.toggleAttribute("hidden", !acik);
        const liste = kok?.querySelector("[data-kontrol-satirlar]");
        if (liste) liste.style.display = acik ? "" : "none";
        const sar = kok?.querySelector("[data-kontrol-ekle-sar]");
        if (sar) { sar.toggleAttribute("hidden", !acik); sar.style.display = acik ? "" : "none"; }
    }
    if (event.target.name === "cevap_yetkiler" && event.target.value === "y_diger") {
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
        kaydiYazVeYansit("Taslak otomatik kaydedildi");
    } catch (error) {
        console.error("Otomatik kayıt başarısız", error);
    }
}

// Sağ üst Kaydet: beklemeden hemen kalıcı kayda yazar (sayfadan ayrılmadan).
function simdiKaydet() {
    clearTimeout(otomatikZamanlayici);
    const kayit = kaydiYazVeYansit("Kaydedildi");
    ilerlemeHesapla();
    return kayit;
}

function kaydiYazVeYansit(durumNotu) {
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
        kayitDurumuEl.textContent = `${durumNotu} • ${tarihSaatFormatla(kayit.guncellenmeTarihi)}`;
    }
    return kayit;
}

document.getElementById("hizliKaydetBtn").addEventListener("click", () => {
    try {
        simdiKaydet();
    } catch (error) {
        console.error("Kayıt başarısız", error);
        alert("Kaydedilemedi: " + (error.message || error));
    }
});

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
    // Odak mantığı açılış akışına taşındı (aşağıdaki boot bölümü); bu fonksiyon
    // geriye uyumluluk için duruyor.
    const hedefId = (sonBolum && bolumEksikMi(sonBolum)) ? sonBolum : ilkEksikBolum();
    if (!hedefId) return;
    bolumOdakUygula(hedefId);
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
    const hedefId = (sonBolum && bolumEksikMi(sonBolum)) ? sonBolum : ilkEksikBolum();
    if (hedefId) {
        sonBolum = hedefId;
        bolumOdakUygula(hedefId);
        const section = soruBolumleriEl.querySelector(`[data-bolum="${hedefId}"]`);
        if (section) {
            section.classList.remove("collapsed");
            section.scrollIntoView({ block: "start" });
            section.classList.add("flash");
            setTimeout(() => section.classList.remove("flash"), 1800);
        }
    } else {
        bolumOdakUygula(sonBolum || IS_ANALIZI_SORULARI[0]?.id);
    }
} else if (sonBolum) {
    const section = soruBolumleriEl.querySelector(`[data-bolum="${sonBolum}"]`);
    if (section) section.classList.remove("collapsed");
    // Varsayılan tek bölüm odağı (kaldığı yer)
    bolumOdakUygula(sonBolum);
} else {
    // Yeni form: ilk bölüm odağı
    bolumOdakUygula(IS_ANALIZI_SORULARI[0]?.id);
}
