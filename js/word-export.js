// Resmi IsAnaliziForm şablonunu (assets/IsAnaliziForm-template.docx) kayıt
// verisiyle doldurup birebir formatlı .docx indirir (PizZip + docxtemplater).
const WORD_SABLON_YOLU = "assets/IsAnaliziForm-template.docx";

// Cevap kutularının satır sayıları (orijinal formdaki kutu boyları).
const KUTU_SATIR = {
    mevcut_yetkiler: 6, gereken_yetkiler: 8, egitim: 5, lisans_sertifikalar: 4,
    diger_bilgi_beceri: 6, araclar: 4, yeni_deneyim: 9, yetkinlik_suresi: 9,
    kompleks_ornekler: 17, gelistirilen_metotlar: 8, politika_prosedur: 11,
    yonetim_sorumlulugu: 11, harici_isler: 8
};

// Kutu tablosunun şablon satırını cevap sayısı kadar çoğaltır.
// (docxtemplater tek hücreli satır döngüsünü satır yerine metin olarak
// birleştirir; bu yüzden satırlar burada, çizgileriyle birlikte kopyalanır.)
// Her kopyadaki {{#id}}{{satir}}{{/id}} -> {{id_0}}, {{id_1}}, ...
function kutuSatirlariniCogalt(xmlStr, id, degerler) {
    const kalip = `{{#${id}}}{{satir}}{{/${id}}}`;
    const idx = xmlStr.indexOf(`{{#${id}}}`);
    if (idx === -1 || !xmlStr.includes(kalip)) {
        throw new Error(`Şablon satırı bulunamadı: ${id}`);
    }
    const trBasMatches = [...xmlStr.slice(0, idx).matchAll(/<w:tr[\s>]/g)];
    if (!trBasMatches.length) {
        throw new Error(`Şablon satırı bulunamadı: ${id}`);
    }
    const trBas = trBasMatches[trBasMatches.length - 1].index;
    const trSon = xmlStr.indexOf("</w:tr>", idx) + "</w:tr>".length;
    const sablon = xmlStr.slice(trBas, trSon);
    const kopyalar = degerler.map((v, i) => sablon.split(kalip).join(`{{${id}_${i}}}`));
    return xmlStr.slice(0, trBas) + kopyalar.join("") + xmlStr.slice(trSon);
}

function soruTaniminiBul(id) {
    for (const bolum of IS_ANALIZI_SORULARI) {
        for (const soru of bolum.sorular) {
            if (soru.id === id) return soru;
        }
    }
    return null;
}

function xMi(deger) {
    return Array.isArray(deger) ? (deger.includes("X") ? "X" : "") : (deger === "X" ? "X" : "");
}

function listeMetni(deger) {
    if (Array.isArray(deger)) return deger.join("\n");
    return String(deger ?? "");
}

function siddetSlug(deger) {
    const d = String(deger || "").toLocaleLowerCase("tr-TR");
    if (d.startsWith("düşük") || d.startsWith("dusuk")) return "dusuk";
    if (d.startsWith("orta")) return "orta";
    if (d.startsWith("yüksek") || d.startsWith("yuksek")) return "yuksek";
    return "";
}

function tarihFormatlaTR(tarih) {
    if (!tarih) return "";
    const p = String(tarih).split("-");
    if (p.length === 3) return `${p[2]}.${p[1]}.${p[0]}`;
    return String(tarih);
}

function dosyaAdiOlustur(kayit) {
    const ad = (kayit.cevaplar?.personel_ismi || "is-analizi")
        .toLocaleLowerCase("tr-TR")
        .replaceAll("ı", "i").replaceAll("ğ", "g").replaceAll("ü", "u")
        .replaceAll("ş", "s").replaceAll("ö", "o").replaceAll("ç", "c")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `${ad || "is-analizi"}-${kayit.form_tarihi || new Date().toISOString().slice(0, 10)}.docx`;
}

function wordVerisiniHazirla(kayit) {
    const c = varsayilanlariUygula(kayit.cevaplar || {});
    const data = { form_tarihi: tarihFormatlaTR(kayit.form_tarihi) };

    // 1) Skaler + liste + secim: doğrudan
    IS_ANALIZI_SORULARI.forEach((bolum) => {
        bolum.sorular.forEach((soru) => {
            const v = c[soru.id];
            if (soru.tip === "liste") data[soru.id] = listeMetni(v);
            else if (soru.tip === "tablo" || soru.tip === "onay") return; // aşağıda özel
            else data[soru.id] = String(v ?? "");
        });
    });

    // Tarih görünümlü metin alanları: YYYY-MM-DD yazıldıysa TR formata çevir
    ["imza_tarih"].forEach((alan) => {
        if (/^\d{4}-\d{2}-\d{2}/.test(data[alan] || "")) {
            data[alan] = tarihFormatlaTR(data[alan]);
        }
    });

    // 1b) Cevap kutuları: metin satırlara bölünür (kutuSatirlariniCogalt her
    // satırı kendi çizgisine yerleştirir; kutu orijinal boyuna tamamlanır).
    Object.entries(KUTU_SATIR).forEach(([id, sayi]) => {
        const v = c[id];
        const ham = Array.isArray(v) ? v.join("\n") : String(v ?? "");
        const satirlar = ham.split("\n");
        while (satirlar.length && satirlar[satirlar.length - 1].trim() === "") satirlar.pop();
        while (satirlar.length < sayi) satirlar.push("");
        data[id] = satirlar;
    });

    // 2) Yetkiler: her seçenek ayrı X kutusu
    const yetkiler = Array.isArray(c.yetkiler) ? c.yetkiler : [];
    (soruTaniminiBul("yetkiler")?.secenekler || []).forEach((s) => {
        data[s.deger] = yetkiler.includes(s.deger) ? "X" : "";
    });
    // "Diğer" açıklaması yalnızca kutu işaretliyse çıkar (entegre davranış)
    if (!yetkiler.includes("y_diger")) {
        data.y_diger_aciklama = "";
    }

    // 3) Ortam x Faktör matrisi (kartezyen X)
    const ortamlar = Array.isArray(c.ortamlar) ? c.ortamlar : [];
    const faktorler = Array.isArray(c.faktorler) ? c.faktorler : [];
    (soruTaniminiBul("ortamlar")?.secenekler || []).forEach((o) => {
        (soruTaniminiBul("faktorler")?.secenekler || []).forEach((f) => {
            data[`m_${o.deger}_${f.deger}`] = (ortamlar.includes(o.deger) && faktorler.includes(f.deger)) ? "X" : "";
        });
    });
    // "Diğer" açıklamaları yalnızca kutu işaretliyse çıkar
    if (!ortamlar.includes("diger")) {
        data.ortam_diger_aciklama = "";
    }
    if (!faktorler.includes("diger")) {
        data.faktor_diger_aciklama = "";
    }

    // 4) Risk satırları: "Var" yoksa veya "Yok" seçildiyse şiddet/sıklık X'i çıkmaz.
    //    (kaza satırında Var-sorusu yok; yalnızca seçimler belirler.)
    [["kaza", null, c.risk_kaza_siddet, c.risk_kaza_siklik],
     ["trafik", c.risk_trafik_var, c.risk_trafik_siddet, c.risk_trafik_siklik],
     ["meslek", c.risk_meslek_var, c.risk_meslek_siddet, c.risk_meslek_siklik]
    ].forEach(([ad, varDeger, siddet, siklik]) => {
        const varMi = varDeger == null
            ? true
            : (Array.isArray(varDeger) ? varDeger.includes("X") : !!varDeger);
        const yokMu = !varMi || siddet === "Yok" || siklik === "Yok";
        data[`r_${ad}_yok`] = yokMu ? "X" : "";
        ["dusuk", "orta", "yuksek"].forEach((lvl) => {
            data[`r_${ad}_s_${lvl}`] = !yokMu && siddetSlug(siddet) === lvl ? "X" : "";
            data[`r_${ad}_f_${lvl}`] = !yokMu && siddetSlug(siklik) === lvl ? "X" : "";
        });
    });

    // 5) Evet/Hayır kutuları (8.3 bilgi, 9.1 liderlik)
    data.b_evet = c.bilgi_gelis === "Evet" ? "X" : "";
    data.b_hayir = c.bilgi_gelis === "Hayır" ? "X" : "";
    data.l_evet = c.liderlik_var === "Evet" ? "X" : "";
    data.l_hayir = c.liderlik_var === "Hayır" ? "X" : "";

    // 6) Tablolar: döngü dizileri (Word tablosu satır sayısı kadar büyür).
    //    Boş tabloya tek boş satır konur ki başlık yalnız kalmasın.
    IS_ANALIZI_SORULARI.forEach((bolum) => {
        bolum.sorular.forEach((soru) => {
            if (soru.tip !== "tablo") return;
            const satirlar = Array.isArray(c[soru.id]) ? c[soru.id] : [];
            const dizin = satirlar.length ? satirlar : [{}];
            data[soru.id] = dizin.map((satir) => {
                const s = {};
                soru.sutunlar.forEach((sutun) => {
                    const v = satir[sutun.id];
                    s[sutun.id] = sutun.tip === "onay" ? xMi(v) : String(v ?? "");
                });
                return s;
            });
        });
    });

    return data;
}

function sayiyaCevir(deger) {
    if (deger == null) return NaN;
    let s = String(deger).trim();
    if (!s) return NaN;
    s = s.replace(/%/g, "").trim();
    if (!s) return NaN;
    s = s.replace(/\s+/g, "").replace(/,/g, ".");
    const eslesme = s.match(/-?\d+(\.\d+)?/);
    if (!eslesme) return NaN;
    const n = parseFloat(eslesme[0]);
    return Number.isFinite(n) ? n : NaN;
}

// Sadece uyarı amaçlı ön kontrol (engelleme yok, Word formatına dokunmaz).
// form.js ve app.js'teki tekli "Word" butonları bunu kullanır.
function wordOnKontrolUyarilari(kayit) {
    const uyarilar = [];
    const c = (kayit && kayit.cevaplar) || {};

    const eksikler = [];
    if (!String(c.personel_ismi || "").trim()) eksikler.push("Personel İsmi");
    if (!String(c.unvan_pozisyon || "").trim()) eksikler.push("Ünvan / Pozisyon");
    if (!String(c.rol_amaci || "").trim()) eksikler.push("Görevin genel amacı");
    if (!String((kayit && kayit.form_tarihi) || "").trim()) eksikler.push("Form Tarihi");
    if (eksikler.length) uyarilar.push("Eksik: " + eksikler.join(", "));

    const toplamKontrol = (etiket, degerler) => {
        const ham = degerler.map(sayiyaCevir);
        if (ham.every((n) => Number.isNaN(n))) return;
        const toplam = ham.reduce((a, b) => a + (Number.isNaN(b) ? 0 : b), 0);
        if (Math.abs(toplam - 100) > 0.01) {
            uyarilar.push(`${etiket} toplamı %${Math.round(toplam * 100) / 100} (beklenen %100)`);
        }
    };

    // 2.1 görev yüzdeleri şimdilik denetlenmez (dakika yazılıyor, % hesabı sonra).
    toplamKontrol("4.5 Çalışma ortamı", [c.yuzde_masa, c.yuzde_bolumler, c.yuzde_mobil]);
    toplamKontrol("Ağırlıklı çaba", [c.caba_zihinsel_yuzde, c.caba_fiziksel_yuzde]);

    return uyarilar;
}

async function isAnaliziWordAktar(kayit) {
    const yanit = await fetch(WORD_SABLON_YOLU);
    if (!yanit.ok) throw new Error(`Şablon yüklenemedi (${WORD_SABLON_YOLU})`);
    const buf = await yanit.arrayBuffer();

    const zip = new PizZip(buf);
    const veri = wordVerisiniHazirla(kayit);
    let xmlStr = zip.file("word/document.xml").asText();
    Object.keys(KUTU_SATIR).forEach((id) => {
        const degerler = veri[id];
        delete veri[id];
        xmlStr = kutuSatirlariniCogalt(xmlStr, id, degerler);
        degerler.forEach((v, i) => { veri[`${id}_${i}`] = v; });
    });
    zip.file("word/document.xml", xmlStr);
    const doc = new docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: "{{", end: "}}" },
        nullGetter: () => ""
    });
    doc.render(veri);

    const blob = doc.getZip().generate({
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        compression: "DEFLATE"
    });
    const dosyaAdi = dosyaAdiOlustur(kayit);
    if (typeof saveAs === "function") {
        saveAs(blob, dosyaAdi);
    } else {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = dosyaAdi;
        link.click();
        URL.revokeObjectURL(link.href);
    }
}
