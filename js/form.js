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
                    const dar = sutun.tip === "onay" || sutun.tip === "secim" ? ' class="hucre-dar"' : "";
                    return `<td${dar}>${alan}</td>`;
                }).join("")}
                <td class="row-ops"><button type="button" class="button ghost small tasi-handle" draggable="true" data-satir-tasi="${soru.id}" title="Sürükleyerek sırala">⠿</button>${soru.id === "gorevler" ? (() => { const n = gorevDetaySayisi(satir); return `<button type="button" class="button ghost small ${n ? "detay-dolu" : ""}" data-gorev-detay-toggle="${idx}" title="Bağlı belge / girdi / çıktı ekle (çoklu)">🔗${n ? n : ""}</button>`; })() : `<button type="button" class="button ghost small satir-oneri-btn" data-satir-oneri="${soru.id}" title="Bu satır için öneri al">✨</button>`}${soru.sabit ? "" : `<button type="button" class="button danger small" data-satir-sil="${soru.id}">Sil</button>`}</td>
            </tr>`;
            if (soru.id !== "gorevler") return ana;
            return ana + gorevDetaySatirHtml(satir, idx);
        };
        return `
            <div class="table-wrap" data-tablo="${soru.id}"${soru.id === "gorevler" && gorevKartModu ? ' hidden style="display:none"' : ""}>
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
            <div class="gorev-aracbar${gorevKartModu ? "" : " tablo-modu"}" data-gorev-aracbar>
                <div class="gorev-gorunum" role="tablist" aria-label="Görev görünümü">
                    <button type="button" class="button small ${gorevKartModu ? "primary" : "secondary"}" data-gorev-mod="kart">Kart</button>
                    <button type="button" class="button small ${gorevKartModu ? "secondary" : "primary"}" data-gorev-mod="tablo">Tablo</button>
                    <button type="button" class="button small ${gorevKompakt ? "primary" : "ghost"}" data-gorev-kompakt title="Yoğun liste: sadece görev adları (üzerine gelince tamamı görünür)">${gorevKompakt ? "Geniş" : "Kompakt"}</button>
                </div>
                <div class="gorev-gezgin">
                    <button type="button" class="button ghost small" data-gorev-onceki>◀ Önceki</button>
                    <span class="gorev-sayac" data-gorev-sayac>${baslangic.length ? `1/${baslangic.length}` : "0/0"}</span>
                    <button type="button" class="button ghost small" data-gorev-sonraki>Sonraki ▶</button>
                    <button type="button" class="button ghost small" data-gorev-hepsi title="Tüm görev kartlarını daralt">Tümünü Daralt</button>
                    <button type="button" class="button secondary small" data-gorev-yeni>＋ Görev</button>
                </div>
            </div>
            <div class="gorev-kartlar${gorevKompakt ? " gorev-kompakt" : ""}" data-gorev-kartlar${gorevKartModu ? "" : ' hidden style="display:none"'}>${baslangic.map((s, i) => gorevKartHtml(s, i, baslangic.length)).join("")}</div>
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
    // Uzun görev maddesi tek satıra sığmaz: doğrudan geniş metin alanı çiz (tam okunurluk)
    if (soru.id === "gorevler" && sutun.id === "gorev" && metin.length > 60) {
        const satirSayisi = metin.split("\n").reduce((t, s) => t + Math.max(1, Math.ceil(s.length / 50)), 0);
        const rows = Math.min(12, Math.max(3, satirSayisi + 1));
        return `<textarea class="input small-input gorev-genis" name="${name}" rows="${rows}" title="${metniKoru(metin)}">${metniKoru(metin)}</textarea>`;
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
    if (soru.id === "gorevler" && gorevKartModu) return gorevKartVerisiniOku();
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
    if (gorevKartModu) return otoBaglantilariAktarKart();
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

function otoBaglantilariAktarKart() {
    const kartKok = soruBolumleriEl.querySelector("[data-gorev-kartlar]");
    if (!kartKok) return { gelen: 0, giden: 0, girdi24: 0, girdi27: 0, sistem: 0, cikti: 0, kontrol: 0 };
    const sonuc = { gelen: 0, giden: 0, girdi24: 0, girdi27: 0, sistem: 0, cikti: 0, kontrol: 0 };
    kartKok.querySelectorAll("[data-kart-idx]").forEach((kart) => {
        const idx = kart.dataset.kartIdx;
        const detayKok = kart.querySelector(`[data-kart-detay="${idx}"]`);
        if (!detayKok) return;
        const imzaYaz = (grup, j, imza) => {
            const gizli = detayKok.querySelector(`[name="cevap_gorevler_${idx}_${grup}_${j}__oto_imza"]`);
            if (gizli) gizli.value = imza;
        };
        const grupla = (grup, alanlar, hedef) => {
            detayKok.querySelectorAll(`[data-alt-grup="${grup}"]`).forEach((el) => {
                const j = el.dataset.altJ;
                const b = (a) => (detayKok.querySelector(`[name="cevap_gorevler_${idx}_${grup}_${j}_${a}"]`)?.value ?? "").trim();
                const ana = grup === "gelen" || grup === "giden" ? b("belge") : grup === "kontrol" ? (b("is") || b("amac")) : b("tanim");
                if (!ana) return;
                const imza = detayImza(alanlar.map(b));
                const eski = (detayKok.querySelector(`[name="cevap_gorevler_${idx}_${grup}_${j}__oto_imza"]`)?.value ?? "");
                if (eski === imza) return;
                if (grup === "gelen") {
                hedefTabloyaSatirEkle("gelen_belgeler", { belge: b("belge"), bolum: b("bolum"), islem: b("islem"), siklik: b("siklik"), sure: b("sure") });
                    sonuc.gelen++;
                } else if (grup === "giden") {
                    hedefTabloyaSatirEkle("giden_belgeler", { belge: b("belge"), yer_amac: b("yer"), siklik: b("siklik"), sure: b("sure") });
                    sonuc.giden++;
                } else if (grup === "girdi24") {
                metinAlanaSatirEkle("girdiler_birimler", `- ${b("tanim")}${b("birim") ? ` (${b("birim")})` : ""}`);
                    sonuc.girdi24++;
                } else if (grup === "girdi27") {
                    metinAlanaSatirEkle("kullanilan_girdiler", `- ${b("tanim")}`);
                    sonuc.girdi27++;
                } else if (grup === "sistem") {
                    listeAlanaSatirEkle("sistemler", b("tanim"));
                    sonuc.sistem++;
                } else if (grup === "kontrol") {
                    // Yalnızca "Evet" ise: satır ana Kontrol tablosuna (3.6) yazılır
                    if ((detayKok.querySelector(`[name="cevap_gorevler_${idx}_kontrolvar"]`)?.value ?? "") !== "Evet") return;
                    if (!b("is") && !b("amac")) return;
                    hedefTabloyaSatirEkle("kontrol_tablosu", { is: b("is"), amac: b("amac"), kontrol: b("kontrol"), paraf: b("paraf"), imza: b("imza"), makam: b("makam") });
                    sonuc.kontrol++;
                } else if (grup === "cikti") {
                metinAlanaSatirEkle("ciktilar", `- ${b("tanim")}${b("yer") ? ` → ${b("yer")}` : ""}`);
                    sonuc.cikti++;
                }
                imzaYaz(grup, j, imza);
            });
        };
        grupla("gelen", ["belge", "bolum", "islem", "siklik", "sure"]);
        grupla("giden", ["belge", "yer", "siklik", "sure"]);
        grupla("girdi24", ["tanim", "birim"]);
        grupla("girdi27", ["tanim"]);
        grupla("sistem", ["tanim"]);
        grupla("kontrol", ["is", "amac", "kontrol", "paraf", "imza", "makam"]);
        grupla("cikti", ["tanim", "yer"]);
    });
    gorevKartSayacGuncelle();
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
// Sıklık + S/A çipleri (kart görünümü): Günlük alanında sadece Günlük,
// belirli + düzensiz aralıklara ek olarak Yıllık; S/A için S (Sürekli) ve A (Ara sıra)
function siklikCipleri(sutunId) {
    if (sutunId === "gunluk") return ["Günlük"];
    if (sutunId === "sa") return ["S", "A"];
    const liste = ["Günlük", "Haftalık", "Aylık"];
    if (sutunId === "belirli" || sutunId === "duzensiz") liste.push("Yıllık");
    return liste;
}

function cipAciklamasi(sutunId, v) {
    if (sutunId === "sa") return v === "S" ? "Sürekli" : v === "A" ? "Ara sıra" : v;
    return v;
}

// Kart/Tablo görünümü tercihi (2.1). Varsayılan: kart (tek tek doldurma).
let gorevKartModu = true;
let gorevKartOdak = 0;
// Kapalı kartlar (görev özelinde aç/kapa; tüm tabloyu değil tek kartı daraltır).
const gorevKapaliKartlar = new Set();
// Kompakt görünüm: sadece Görev + S/A + sıklık sütunları, detaylar gizli (kalabalık azaltma).
let gorevKompakt = false;
try {
    const t = localStorage.getItem("gorev_gorunum");
    if (t === "tablo" || t === "kart") gorevKartModu = (t === "kart");
} catch (e) { /* yoksay */ }
try {
    gorevKompakt = localStorage.getItem("gorev_kompakt") === "1";
} catch (e) { /* yoksay */ }

function gorevKompaktUygula() {
    const bolum = soruBolumleriEl.querySelector('[data-soru="gorevler"]');
    if (bolum) bolum.classList.toggle("gorev-kompakt", gorevKompakt);
    const kartKok = soruBolumleriEl.querySelector("[data-gorev-kartlar]");
    if (kartKok) kartKok.classList.toggle("gorev-kompakt", gorevKompakt);
    soruBolumleriEl.querySelectorAll("[data-gorev-kompakt]").forEach((b) => {
        b.textContent = gorevKompakt ? "Geniş" : "Kompakt";
        b.classList.toggle("primary", gorevKompakt);
        b.classList.toggle("ghost", !gorevKompakt);
    });
    try { localStorage.setItem("gorev_kompakt", gorevKompakt ? "1" : "0"); } catch (e) { /* yoksay */ }
}

function gorevKartHtml(satir, idx, toplam) {
    const s = gorevDetayNormalize({ ...gorevDetayBos(), ...(satir || {}) });
    const soru = soruyuBul("gorevler");
    const alan = (sutunId) => {
        const sutun = soru.sutunlar.find((x) => x.id === sutunId);
        return hucreAlaniOlustur(soru, sutun, satir[sutunId], idx);
    };
    // Görev metni kartta her zaman tam okunsun: otomatik büyüyen çok satırlı alan
    const gorevMetni = String(satir.gorev ?? "");
    const gorevAlani = `<textarea class="input gorev-kart-metin" name="cevap_gorevler_${idx}_gorev" rows="2" title="${metniKoru(gorevMetni || "Görev / Sorumluluk")}">${metniKoru(gorevMetni)}</textarea>`;
    // Sıklık çipleri: tek tıkla yaz, manuel yazım aynen serbest
    const cipSatiri = (sutunId) => `<div class="cip-satir">${siklikCipleri(sutunId).map((v) => {
        const aktif = String(satir[sutunId] ?? "") === v ? " aktif" : "";
        const aciklama = cipAciklamasi(sutunId, v);
        return `<button type="button" class="cip${aktif}" data-siklik-cip="${idx}:${sutunId}:${v}" title="Tek tıkla seç: ${metniKoru(aciklama)}">${metniKoru(v)}</button>`;
    }).join("")}</div>`;
    const n = gorevDetaySayisi(s);
    const kapali = gorevKapaliKartlar.has(idx);
    return `<article class="gorev-kart${kapali ? " kapali" : ""}" data-kart-idx="${idx}">
        <header class="gorev-kart-baslik">
            <button type="button" class="button ghost small" data-kart-daralt="${idx}" title="${kapali ? "Görevi aç" : "Görevi daralt"}">${kapali ? "▸" : "▾"}</button>
            <button type="button" class="button ghost small" data-kart-tasi="${idx}:-1" ${idx === 0 ? "disabled" : ""} title="Görevi yukarı taşı">↑</button>
            <button type="button" class="button ghost small" data-kart-tasi="${idx}:1" ${idx === toplam - 1 ? "disabled" : ""} title="Görevi aşağı taşı">↓</button>
            <strong>Görev ${idx + 1}/${toplam}</strong>
            <span class="gorev-kart-roz baglanti${n ? " dolu" : ""}" data-kart-sayac="${idx}">🔗${n ? n + " bağlantı" : "bağlantı yok"}</span>
            <span class="gorev-kart-nav">
                <button type="button" class="button ghost small" data-kart-onceki="${idx}" ${idx === 0 ? "disabled" : ""}>◀</button>
                <button type="button" class="button ghost small" data-kart-sonraki="${idx}" ${idx === toplam - 1 ? "disabled" : ""}>▶</button>
                <button type="button" class="button danger small" data-kart-sil="${idx}">Sil</button>
            </span>
        </header>
        <div class="gorev-kart-govde" data-kart-govde="${idx}"${kapali ? " hidden" : ""}>
        <label class="field"><span>Görev / Sorumluluk</span>${gorevAlani}</label>
        <div class="gorev-kart-grid">
            <label class="field"><span>% Zaman</span>${alan("yuzde")}</label>
            <label class="field"><span>S/A</span>${alan("sa")}${cipSatiri("sa")}</label>
            <label class="field"><span>Günlük</span>${alan("gunluk")}${cipSatiri("gunluk")}</label>
            <label class="field"><span>Belirli Aralıklarla</span>${alan("belirli")}${cipSatiri("belirli")}</label>
            <label class="field"><span>Düzensiz Aralıklarla</span>${alan("duzensiz")}${cipSatiri("duzensiz")}</label>
            <label class="field"><span>Adet</span>${alan("adet")}</label>
        </div>
        <div class="gorev-detay gorev-kart-detay" data-kart-detay="${idx}">
            <div class="gorev-detay-grid">
                ${gorevAltGrupHtml("gelen", "📥 Gelen belgeler ve sözlü talimatlar", "Gelen belgeler", s.d_gelen, idx)}
                ${gorevAltGrupHtml("giden", "📤 Giden belgeler ve sözlü talimatlar", "Giden belgeler", s.d_giden, idx)}
                ${gorevAltGrupHtml("girdi24", "🧾 Girdi 2.4 (birim / bölüm)", "2.4 girdiler", s.d_girdi24, idx)}
                ${gorevAltGrupHtml("girdi27", "🧪 Kullanılan girdi 2.7 (hammadde, bilgi…)", "2.7 girdiler", s.d_girdi27, idx)}
                ${gorevAltGrupHtml("sistem", "💻 Sistem 2.6", "2.6 sistemler", s.d_sistem, idx)}
                ${gorevAltGrupHtml("cikti", "📦 Çıktı 2.5", "2.5 çıktılar", s.d_cikti, idx)}
                ${gorevKontrolGrupHtml(s, idx)}
            </div>
        </div>
        </div>
    </article>`;
}

function gorevKartSayacGuncelle() {
    document.querySelectorAll("[data-kart-detay]").forEach((kok) => {
        const idx = kok.dataset.kartDetay;
        let n = 0;
        [["gelen", "belge"], ["giden", "belge"], ["girdi24", "tanim"], ["girdi27", "tanim"], ["sistem", "tanim"], ["cikti", "tanim"]].forEach(([g, a]) => {
            kok.querySelectorAll(`[data-alt-grup="${g}"]`).forEach((el) => {
                const j = el.dataset.altJ;
                if ((kok.querySelector(`[name="cevap_gorevler_${idx}_${g}_${j}_${a}"]`)?.value ?? "").trim()) n++;
            });
        });
        kok.querySelectorAll('[data-alt-grup="kontrol"]').forEach((el) => {
            const j = el.dataset.altJ;
            if ((kok.querySelector(`[name="cevap_gorevler_${idx}_kontrol_${j}_is"]`)?.value ?? "").trim()
                || (kok.querySelector(`[name="cevap_gorevler_${idx}_kontrol_${j}_amac"]`)?.value ?? "").trim()) n++;
        });
        const roz = document.querySelector(`[data-kart-sayac="${idx}"]`);
        if (roz) {
            roz.classList.toggle("dolu", n > 0);
            roz.textContent = n > 0 ? `🔗${n} bağlantı` : "🔗bağlantı yok";
        }
    });
}

// Kart kapsayıcısından görev satırlarını okur (tablo okuyucuyla aynı şema).
function gorevKartVerisiniOku() {
    const kok = soruBolumleriEl.querySelector("[data-gorev-kartlar]");
    if (!kok) return [];
    const soru = soruyuBul("gorevler");
    const satirlar = [];
    kok.querySelectorAll("[data-kart-idx]").forEach((kart) => {
        const idx = kart.dataset.kartIdx;
        const satir = {};
        soru.sutunlar.forEach((sutun) => {
            const alan = kart.querySelector(`[name="cevap_gorevler_${idx}_${sutun.id}"]`);
            if (!alan) return;
            satir[sutun.id] = alan.value.trim();
        });
        const detayKok = kart.querySelector(`[data-kart-detay="${idx}"]`);
        Object.assign(satir, gorevDetayOkuFromDom(detayKok, idx));
        const dolu = Object.values(satir).some((v) => Array.isArray(v) ? v.length : String(v ?? "").trim() !== "");
        if (dolu) satirlar.push(satir);
    });
    return satirlar;
}

function gorevSatirlariOkuAktif() {
    if (gorevKartModu) return gorevKartVerisiniOku();
    const soru = soruyuBul("gorevler");
    return soru ? tabloSatirlariniOku(soru) : [];
}

// Boş satırlar okumada elenir; ekleme/görünüm değişimi her zaman görünür artsın
// ya da korunsun diye aktif görünümdeki DOM sayısını verir.
function gorevDomSatirSayisi() {
    if (gorevKartModu) return soruBolumleriEl.querySelectorAll("[data-gorev-kartlar] [data-kart-idx]").length;
    return soruBolumleriEl.querySelectorAll('[data-tablo="gorevler"] tbody tr[data-satir]:not(.gorev-detay-satir):not(.oneri-detay-satir)').length;
}

// Okunan veriyi DOM sayısına tamamlar (boş başlangıç satırları kaybolmasın).
function gorevVeriyiDomlaDengele(veriler) {
    const taban = Math.max(veriler.length, gorevDomSatirSayisi());
    while (veriler.length < taban) veriler.push(bosSatir(soruyuBul("gorevler")));
    return veriler;
}

// Görünüm değiştirirken veri kaybı olmasın: aktiften oku, iki kapsayıcıyı da yeniden çiz.
function gorevKonteynerleriYenidenCiz(veriler) {
    const soru = soruyuBul("gorevler");
    const govde = soruBolumleriEl.querySelector('[data-tablo="gorevler"] tbody');
    const kartKok = soruBolumleriEl.querySelector("[data-gorev-kartlar]");
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
                    const dar = sutun.tip === "onay" || sutun.tip === "secim" ? ' class="hucre-dar"' : "";
                    return `<td${dar}>${alan}</td>`;
                }).join("")
                + `<td class="row-ops"><button type="button" class="button ghost small tasi-handle" draggable="true" data-satir-tasi="gorevler" title="Sürükleyerek sırala">⠿</button>`
                + (() => { const n = gorevDetaySayisi(s); return `<button type="button" class="button ghost small ${n ? "detay-dolu" : ""}" data-gorev-detay-toggle="${i}" title="Bağlı belge / girdi / çıktı ekle (çoklu)">🔗${n ? n : ""}</button>`; })()
                + `<button type="button" class="button danger small" data-satir-sil="gorevler">Sil</button></td></tr>`;
            return ana + gorevDetaySatirHtml(s, i);
        }).join("");
    }
    if (kartKok) {
        kartKok.innerHTML = liste.map((s, i) => gorevKartHtml(s, i, liste.length)).join("");
        kartKok.classList.toggle("gorev-kompakt", gorevKompakt);
        // Uzun görev maddeleri ilk çizimde de tam sığsın
        kartKok.querySelectorAll("textarea.gorev-kart-metin").forEach(otomatikBuyut);
    }
    // Kapanan kart numarası liste dışına taştıysa temizle (silme sonrası)
    [...gorevKapaliKartlar].forEach((i) => {
        if (i < 0 || i >= liste.length) gorevKapaliKartlar.delete(i);
    });
    const bolum = soruBolumleriEl.querySelector('[data-soru="gorevler"]');
    if (bolum) bolum.classList.toggle("gorev-kompakt", gorevKompakt);
    gorevKartOdak = Math.min(gorevKartOdak, Math.max(liste.length - 1, 0));
    guncelleGorevSayac(liste.length);
    gorevHepsiButonGuncelle();
}

function gorevEkleVeOdakla() {
    const veriler = gorevVeriyiDomlaDengele(gorevSatirlariOkuAktif());
    veriler.push(bosSatir(soruyuBul("gorevler")));
    gorevKonteynerleriYenidenCiz(veriler);
    gorevKartaGit(veriler.length - 1);
    // Tablo modundaysa yeni satır görünür olsun
    if (!gorevKartModu) {
        const govde = soruBolumleriEl.querySelector('[data-tablo="gorevler"] tbody');
        const sonSatir = govde?.querySelector('tr[data-satir]:not(.gorev-detay-satir):not(.oneri-detay-satir):last-of-type');
        if (sonSatir) sonSatir.scrollIntoView({ block: "center", behavior: "smooth" });
        const ilkAlan = govde?.querySelector(`tr[data-satir="${veriler.length - 1}"] input, tr[data-satir="${veriler.length - 1}"] textarea`);
        if (ilkAlan) setTimeout(() => ilkAlan.focus({ preventScroll: true }), 250);
    }
    otomatikKaydetZamanla();
    ilerlemeHesapla();
}

function guncelleGorevSayac(toplam) {
    const el = soruBolumleriEl.querySelector("[data-gorev-sayac]");
    if (el) el.textContent = toplam ? `${Math.min(gorevKartOdak + 1, toplam)}/${toplam}` : "0/0";
}

// Tümünü Daralt/Aç butonunun etiketini kart durumuna göre eşitle
function gorevHepsiButonGuncelle() {
    const toplam = soruBolumleriEl.querySelectorAll("[data-gorev-kartlar] [data-kart-idx]").length;
    const hepsiKapali = toplam > 0 && gorevKapaliKartlar.size >= toplam;
    soruBolumleriEl.querySelectorAll("[data-gorev-hepsi]").forEach((b) => {
        b.textContent = hepsiKapali ? "Tümünü Aç" : "Tümünü Daralt";
        b.title = hepsiKapali ? "Tüm görev kartlarını aç" : "Tüm görev kartlarını daralt";
    });
}

function gorevKartaGit(i) {
    const kartlar = [...soruBolumleriEl.querySelectorAll("[data-gorev-kartlar] [data-kart-idx]")];
    if (!kartlar.length) return;
    gorevKartOdak = Math.max(0, Math.min(i, kartlar.length - 1));
    const hedef = kartlar[gorevKartOdak];
    // Gezginle gidilen kart kapalıysa aç (kullanıcı o görevi düzenleyecek)
    if (hedef && gorevKapaliKartlar.has(gorevKartOdak)) {
        gorevKapaliKartlar.delete(gorevKartOdak);
        hedef.classList.remove("kapali");
        const govde = hedef.querySelector(`[data-kart-govde="${gorevKartOdak}"]`);
        if (govde) { govde.hidden = false; govde.style.display = ""; }
        const dugme = hedef.querySelector("[data-kart-daralt]");
        if (dugme) { dugme.textContent = "▾"; dugme.title = "Görevi daralt"; }
    }
    if (hedef) hedef.scrollIntoView({ block: "nearest", behavior: "smooth" });
    guncelleGorevSayac(kartlar.length);
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
});

soruBolumleriEl.addEventListener("dragover", (event) => {
    if (!suruklenenSatir) return;
    let tr = event.target.closest("tr");
    const sarmal = event.target.closest("[data-tablo]");
    if (!tr || !sarmal || sarmal.dataset.tablo !== suruklenenSatir.tablo || tr === suruklenenSatir.satir) return;
    // Detay satırı hedefse ana satıra yönlendir
    if (tr.classList.contains("gorev-detay-satir") || tr.classList.contains("oneri-detay-satir")) {
        tr = tr.previousElementSibling;
        if (!tr || tr === suruklenenSatir.satir) return;
    }
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
    const detayToggle = event.target.closest("[data-gorev-detay-toggle]");
    if (detayToggle) {
        // Kompakt mod detayları gizler; detayı açmak isteyen önce Geniş'e alınır
        if (gorevKompakt) {
            gorevKompakt = false;
            gorevKompaktUygula();
        }
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
        const detayKok = altEkle.closest("tr.gorev-detay-satir, [data-kart-detay]");
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
            gorevKartSayacGuncelle();
            otomatikKaydetZamanla();
            ilerlemeHesapla();
        }
        return;
    }
    const altSil = event.target.closest("[data-gorev-alt-sil]");
    if (altSil) {
        const [grup, anaIdx] = (altSil.dataset.gorevAltSil || "").split(":");
        const detayKok = altSil.closest("tr.gorev-detay-satir, [data-kart-detay]");
        if (!confirm("Bu bağlantı silinsin mi? (Hedef bölüme eklenen satır kalır)")) return;
        const el = altSil.closest("[data-alt-grup]");
        if (el) el.remove();
        const liste = detayKok?.querySelector(`[data-alt-liste="${grup}"]`);
        if (liste && !liste.querySelector("[data-alt-grup]")) {
            liste.innerHTML = `<p class="gorev-alt-bos" data-alt-bos="${grup}">Henüz yok — istersen ekle.</p>`;
        }
        const govdeSil = altSil.closest("tbody");
        if (govdeSil) guncelleGorevToggleSayisi(govdeSil, anaIdx);
        gorevKartSayacGuncelle();
        otomatikKaydetZamanla();
        ilerlemeHesapla();
        return;
    }
    const modBtn = event.target.closest("[data-gorev-mod]");
    if (modBtn) {
        const veriler = gorevVeriyiDomlaDengele(gorevSatirlariOkuAktif());
        gorevKartModu = modBtn.dataset.gorevMod === "kart";
        try { localStorage.setItem("gorev_gorunum", gorevKartModu ? "kart" : "tablo"); } catch (e) { /* yoksay */ }
        gorevKonteynerleriYenidenCiz(veriler.length ? veriler : [bosSatir(soruyuBul("gorevler"))]);
        const tabloKok = soruBolumleriEl.querySelector('[data-tablo="gorevler"]');
        const kartKok = soruBolumleriEl.querySelector("[data-gorev-kartlar]");
        const aracbar = soruBolumleriEl.querySelector("[data-gorev-aracbar]");
        if (tabloKok) { tabloKok.hidden = gorevKartModu; tabloKok.style.display = gorevKartModu ? "none" : ""; }
        if (kartKok) { kartKok.hidden = !gorevKartModu; kartKok.style.display = gorevKartModu ? "" : "none"; }
        if (aracbar) {
            aracbar.classList.toggle("tablo-modu", !gorevKartModu);
            aracbar.querySelectorAll("[data-gorev-mod]").forEach((b) => {
                const aktif = (b.dataset.gorevMod === "kart") === gorevKartModu;
                b.classList.toggle("primary", aktif);
                b.classList.toggle("secondary", !aktif);
            });
        }
        ilerlemeHesapla();
        return;
    }
    if (event.target.closest("[data-gorev-onceki]")) { gorevKartaGit(gorevKartOdak - 1); return; }
    if (event.target.closest("[data-gorev-sonraki]")) { gorevKartaGit(gorevKartOdak + 1); return; }
    if (event.target.closest("[data-gorev-yeni]")) {
        gorevEkleVeOdakla();
        return;
    }
    const kompaktBtn = event.target.closest("[data-gorev-kompakt]");
    if (kompaktBtn) {
        gorevKompakt = !gorevKompakt;
        gorevKompaktUygula();
        return;
    }
    // Sıklık çipi: tek tıkla değeri yaz (manuel yazım serbestliği korunur)
    const cip = event.target.closest("[data-siklik-cip]");
    if (cip) {
        const parca = (cip.dataset.siklikCip || "").split(":");
        const kartIdx = parca[0], sutunId = parca[1];
        const deger = parca.slice(2).join(":");
        const kart = cip.closest("[data-kart-idx]");
        const girdi = kart?.querySelector(`[name="cevap_gorevler_${kartIdx}_${sutunId}"]`);
        if (girdi) {
            girdi.value = deger;
            girdi.dispatchEvent(new Event("input", { bubbles: true }));
            girdi.dispatchEvent(new Event("change", { bubbles: true }));
            kart.querySelectorAll(`[data-siklik-cip^="${kartIdx}:${sutunId}:"]`).forEach((b) => b.classList.toggle("aktif", b === cip));
            girdi.focus();
        }
        return;
    }
    const kartDaralt = event.target.closest("[data-kart-daralt]");    if (kartDaralt) {
        const idx = parseInt(kartDaralt.dataset.kartDaralt, 10) || 0;
        const kart = kartDaralt.closest("[data-kart-idx]");
        const govde = kart?.querySelector(`[data-kart-govde="${idx}"]`);
        if (gorevKapaliKartlar.has(idx)) {
            gorevKapaliKartlar.delete(idx);
            kart?.classList.remove("kapali");
            if (govde) { govde.hidden = false; govde.style.display = ""; }
            kartDaralt.textContent = "▾";
            kartDaralt.title = "Görevi daralt";
        } else {
            gorevKapaliKartlar.add(idx);
            kart?.classList.add("kapali");
            if (govde) { govde.hidden = true; govde.style.display = "none"; }
            kartDaralt.textContent = "▸";
            kartDaralt.title = "Görevi aç";
        }
        gorevHepsiButonGuncelle();
        return;
    }
    // Kart taşıma: görevi bir üst/alt sıraya al (kapalı durumu görevle taşınır)
    const kartTasi = event.target.closest("[data-kart-tasi]");
    if (kartTasi) {
        const [sIdx, sYon] = (kartTasi.dataset.kartTasi || "").split(":");
        const idx = parseInt(sIdx, 10) || 0;
        const hedef = idx + (parseInt(sYon, 10) || 0);
        const veriler = gorevVeriyiDomlaDengele(gorevSatirlariOkuAktif());
        if (hedef < 0 || hedef >= veriler.length) return;
        const tmp = veriler[idx]; veriler[idx] = veriler[hedef]; veriler[hedef] = tmp;
        const yeni = new Set();
        gorevKapaliKartlar.forEach((i) => {
            if (i === idx) yeni.add(hedef);
            else if (i === hedef) yeni.add(idx);
            else yeni.add(i);
        });
        gorevKapaliKartlar.clear();
        yeni.forEach((i) => gorevKapaliKartlar.add(i));
        gorevKonteynerleriYenidenCiz(veriler);
        gorevKartaGit(hedef);
        otomatikKaydetZamanla();
        ilerlemeHesapla();
        return;
    }
    // Tümünü Daralt/Aç: yeniden çizmeden tüm kartları kapat/aç (odak kaybolmaz)
    const hepsiBtn = event.target.closest("[data-gorev-hepsi]");
    if (hepsiBtn) {
        const kartlar = [...soruBolumleriEl.querySelectorAll("[data-gorev-kartlar] [data-kart-idx]")];
        if (!kartlar.length) return;
        const hepsiKapali = gorevKapaliKartlar.size >= kartlar.length;
        gorevKapaliKartlar.clear();
        if (!hepsiKapali) kartlar.forEach((k) => gorevKapaliKartlar.add(parseInt(k.dataset.kartIdx, 10)));
        kartlar.forEach((kart) => {
            const i = parseInt(kart.dataset.kartIdx, 10);
            const kapali = gorevKapaliKartlar.has(i);
            kart.classList.toggle("kapali", kapali);
            const govde = kart.querySelector(`[data-kart-govde="${i}"]`);
            if (govde) { govde.hidden = kapali; govde.style.display = kapali ? "none" : ""; }
            const dugme = kart.querySelector("[data-kart-daralt]");
            if (dugme) { dugme.textContent = kapali ? "▸" : "▾"; dugme.title = kapali ? "Görevi aç" : "Görevi daralt"; }
        });
        gorevHepsiButonGuncelle();
        return;
    }
    const kartOnce = event.target.closest("[data-kart-onceki]");
    if (kartOnce) { gorevKartaGit(parseInt(kartOnce.dataset.kartOnceki, 10) - 1); return; }
    const kartSonra = event.target.closest("[data-kart-sonraki]");
    if (kartSonra) { gorevKartaGit(parseInt(kartSonra.dataset.kartSonraki, 10) + 1); return; }
    const kartSil = event.target.closest("[data-kart-sil]");
    if (kartSil) {
        if (!confirm("Bu görev silinsin mi? (Hedef bölüme eklenen satırlar kalır)")) return;
        const silinen = parseInt(kartSil.dataset.kartSil, 10) || 0;
        const veriler = gorevVeriyiDomlaDengele(gorevSatirlariOkuAktif());
        veriler.splice(silinen, 1);
        // Kapalı kart numaralarını kaydır (silinenin üstündekiler bir alta iner)
        const guncel = new Set();
        gorevKapaliKartlar.forEach((i) => {
            if (i === silinen) return;
            guncel.add(i > silinen ? i - 1 : i);
        });
        gorevKapaliKartlar.clear();
        guncel.forEach((i) => gorevKapaliKartlar.add(i));
        gorevKonteynerleriYenidenCiz(veriler.length ? veriler : [bosSatir(soruyuBul("gorevler"))]);
        otomatikKaydetZamanla();
        ilerlemeHesapla();
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
// sıradaki alana geç, kartın son alanındaysa yeni görev aç
soruBolumleriEl.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    const hedef = event.target;
    if (!hedef || hedef.tagName !== "INPUT") return;
    if (hedef.type === "checkbox" || hedef.type === "hidden") return;
    const kart = hedef.closest("[data-kart-idx]");
    const satir = hedef.closest('tr[data-satir]:not(.gorev-detay-satir):not(.oneri-detay-satir)');
    const kok = kart || satir;
    if (!kok) return;
    event.preventDefault();
    const alanlar = [...kok.querySelectorAll("input.input")].filter((el) =>
        el.type !== "checkbox" && el.type !== "hidden" && !el.disabled && el.offsetParent !== null);
    const i = alanlar.indexOf(hedef);
    if (i >= 0 && i < alanlar.length - 1) {
        alanlar[i + 1].focus();
        try { alanlar[i + 1].select(); } catch (e) { /* yoksay */ }
    } else if (kart) {
        gorevEkleVeOdakla();
        const kartlar = soruBolumleriEl.querySelectorAll("[data-kart-idx]");
        const son = kartlar[kartlar.length - 1];
        son?.querySelector('input[name$="_yuzde"]')?.focus();
    }
});
let ilerlemeZamanlayici = null;
form.addEventListener("input", (event) => {
    // Görev detayına yazılınca 🔗 sayacını canlı güncelle (kaydetmeden önce ipucu)
    const detayAlani = event.target.name?.match?.(/^cevap_gorevler_(\d+)_(gelen|giden|girdi24|girdi27|sistem|cikti|kontrol)_\d+_(belge|tanim|is|amac)$/);
    if (detayAlani) {
        const govde = event.target.closest("tbody");
        if (govde) guncelleGorevToggleSayisi(govde, detayAlani[1]);
        if (gorevKartModu) gorevKartSayacGuncelle();
    }
    // Karttaki sıklık/S-A alanına yazılınca/seçilince çip işaretini eşitle
    const cipAlani = (event.target.name || "").match(/^cevap_gorevler_(\d+)_(gunluk|belirli|duzensiz|sa)$/);
    if (cipAlani) {
        const kart = event.target.closest("[data-kart-idx]");
        const deger = (event.target.value || "").trim();
        kart?.querySelectorAll(`[data-siklik-cip^="${cipAlani[1]}:${cipAlani[2]}:"]`).forEach((b) => {
            const v = (b.dataset.siklikCip || "").split(":").slice(2).join(":");
            b.classList.toggle("aktif", v === deger && deger !== "");
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
        const kok = event.target.closest("tr.gorev-detay-satir, [data-kart-detay]");
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
gorevKompaktUygula();
gorevHepsiButonGuncelle();
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
