// Resmi IsAnaliziForm şablonunu (assets/IsAnaliziForm-template.docx) kayıt
// verisiyle doldurup birebir formatlı .docx indirir (PizZip + docxtemplater).
const WORD_SABLON_YOLU = "assets/IsAnaliziForm-template.docx";

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
    if (p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`;
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

    // 2) Yetkiler: her seçenek ayrı X kutusu
    const yetkiler = Array.isArray(c.yetkiler) ? c.yetkiler : [];
    (soruTaniminiBul("yetkiler")?.secenekler || []).forEach((s) => {
        data[s.deger] = yetkiler.includes(s.deger) ? "X" : "";
    });

    // 3) Ortam x Faktör matrisi (kartezyen X)
    const ortamlar = Array.isArray(c.ortamlar) ? c.ortamlar : [];
    const faktorler = Array.isArray(c.faktorler) ? c.faktorler : [];
    (soruTaniminiBul("ortamlar")?.secenekler || []).forEach((o) => {
        (soruTaniminiBul("faktorler")?.secenekler || []).forEach((f) => {
            data[`m_${o.deger}_${f.deger}`] = (ortamlar.includes(o.deger) && faktorler.includes(f.deger)) ? "X" : "";
        });
    });

    // 4) Risk satırları: Yok kutusu + şiddet/sıklık X'i
    [["kaza", c.risk_kaza_yok, c.risk_kaza_siddet, c.risk_kaza_siklik],
     ["trafik", c.risk_trafik_yok, c.risk_trafik_siddet, c.risk_trafik_siklik],
     ["meslek", c.risk_meslek_yok, c.risk_meslek_siddet, c.risk_meslek_siklik]
    ].forEach(([ad, yok, siddet, siklik]) => {
        data[`r_${ad}_yok`] = xMi(yok);
        ["dusuk", "orta", "yuksek"].forEach((lvl) => {
            data[`r_${ad}_s_${lvl}`] = siddetSlug(siddet) === lvl ? "X" : "";
            data[`r_${ad}_f_${lvl}`] = siddetSlug(siklik) === lvl ? "X" : "";
        });
    });

    // 5) Evet/Hayır kutuları (8.3 bilgi, 9.1 liderlik)
    data.b_evet = c.bilgi_gelis === "Evet" ? "X" : "";
    data.b_hayir = c.bilgi_gelis === "Hayır" ? "X" : "";
    data.l_evet = c.liderlik_var === "Evet" ? "X" : "";
    data.l_hayir = c.liderlik_var === "Hayır" ? "X" : "";

    // 6) Tablolar: prefix + NN + _ + sutun (diger_iletisim özel şablonlu)
    IS_ANALIZI_SORULARI.forEach((bolum) => {
        bolum.sorular.forEach((soru) => {
            if (soru.tip !== "tablo") return;
            const satirlar = Array.isArray(c[soru.id]) ? c[soru.id] : [];
            for (let i = 0; i < soru.satirSayisi; i++) {
                const satir = satirlar[i] || {};
                soru.sutunlar.forEach((sutun) => {
                    const etiket = soru.sablon
                        ? soru.sablon.replace("{sutun}", sutun.id).replace("{satir}", String(i + 1))
                        : `${soru.prefix}${String(i + 1).padStart(2, "0")}_${sutun.id}`;
                    const v = satir[sutun.id];
                    data[etiket] = sutun.tip === "onay" ? xMi(v) : String(v ?? "");
                });
            }
        });
    });

    return data;
}

async function isAnaliziWordAktar(kayit) {
    const yanit = await fetch(WORD_SABLON_YOLU);
    if (!yanit.ok) throw new Error(`Şablon yüklenemedi (${WORD_SABLON_YOLU})`);
    const buf = await yanit.arrayBuffer();

    const zip = new PizZip(buf);
    const doc = new docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: "{{", end: "}}" },
        nullGetter: () => ""
    });
    doc.render(wordVerisiniHazirla(kayit));

    const blob = doc.getZip().generate({
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
