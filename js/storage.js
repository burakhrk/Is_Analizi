const STORAGE_KEY = "is_analizi_odakli_kayitlar";

function tarihSaatFormatla(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    return d.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function tumKayitlariGetir() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (error) {
        console.error("Kayıtlar okunamadı", error);
        return [];
    }
}

function kayitlariYaz(kayitlar) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(kayitlar));
}

function kayitGetir(id) {
    const kayit = tumKayitlariGetir().find((k) => k.id === id) || null;
    if (kayit) kayit.cevaplar = varsayilanlariUygula(kayit.cevaplar || {});
    return kayit;
}

// Eski tek-metinli zor_yanlar cevabını yeni tablo satırlarına taşı (kayıp önleme).
function zorYanlariTasi(cevaplar) {
    const v = cevaplar.zor_yanlar;
    if (typeof v === "string" && v.trim()) {
        cevaplar.zor_yanlar = v.split("\n").map((s) => s.trim()).filter(Boolean)
            .map((satir) => ({ konu: satir, neden: "" }));
    }
    return cevaplar;
}
// Eski tek-alanlı metin kaydını yeni checkbox + detay yapısına taşı.
function onayDetayTasi(cevaplar, varId, detayId) {
    const out = { ...cevaplar };
    if (out[varId] == null) {
        const detay = typeof out[detayId] === "string" ? out[detayId].trim() : "";
        out[varId] = detay ? ["evet"] : [];
    }
    if (!Array.isArray(out[varId])) {
        out[varId] = out[varId] === "evet" ? ["evet"] : [];
    }
    return out;
}
function fazlaMesaiTasi(cevaplar) {
    return onayDetayTasi(cevaplar, "fazla_mesai_var", "fazla_mesai");
}
function nobetTasi(cevaplar) {
    return onayDetayTasi(cevaplar, "nobet_var", "nobet");
}
// Eski "yok" kutusunu yeni "var mı?" kutusuna çevir (kaza yok-sorusu kalktı).
function riskVarTasi(cevaplar, ad) {
    const out = { ...cevaplar };
    const yokId = `risk_${ad}_yok`;
    const varId = `risk_${ad}_var`;
    if (out[varId] == null) {
        const yokIsaretli = Array.isArray(out[yokId]) ? out[yokId].includes("X") : out[yokId] === "X";
        const secimYok = out[`risk_${ad}_siddet`] === "Yok" || out[`risk_${ad}_siklik`] === "Yok";
        out[varId] = (!yokIsaretli && !secimYok) ? ["X"] : [];
    }
    if (!Array.isArray(out[varId])) {
        out[varId] = out[varId] ? ["X"] : [];
    }
    delete out[yokId];
    return out;
}
function riskTasi(cevaplar) {
    const out = { ...cevaplar };
    delete out.risk_kaza_yok;
    return riskVarTasi(riskVarTasi(out, "trafik"), "meslek");
}
// Eski kayıtlar veya boş formlar için şemayı tamamla (questions.js ile aynı tipler).
function varsayilanlariUygula(cevaplar) {
    const out = riskTasi(nobetTasi(fazlaMesaiTasi(zorYanlariTasi({ ...cevaplar }))));
    IS_ANALIZI_SORULARI.forEach((bolum) => {
        bolum.sorular.forEach((soru) => {
            const v = out[soru.id];
            if (soru.tip === "tablo" || soru.tip === "liste" || soru.tip === "onay") {
                if (!Array.isArray(v)) out[soru.id] = [];
            } else if (v == null || typeof v !== "string") {
                out[soru.id] = v ?? "";
            }
        });
    });
    return out;
}

function kayitKaydet(veri) {
    const kayitlar = tumKayitlariGetir();
    const simdi = new Date().toISOString();
    const temiz = {
        form_tarihi: veri.form_tarihi || "",
        durum: veri.durum || "taslak",
        cevaplar: varsayilanlariUygula(veri.cevaplar || {}),
        ...(veri.sonBolum ? { sonBolum: veri.sonBolum } : {})
    };

    if (veri.id) {
        const index = kayitlar.findIndex((k) => k.id === veri.id);
        if (index !== -1) {
            kayitlar[index] = { ...kayitlar[index], ...temiz, guncellenmeTarihi: simdi };
            kayitlariYaz(kayitlar);
            return kayitlar[index];
        }
    }

    const yeniKayit = {
        ...temiz,
        id: crypto.randomUUID(),
        olusturulmaTarihi: simdi,
        guncellenmeTarihi: simdi
    };
    kayitlar.unshift(yeniKayit);
    kayitlariYaz(kayitlar);
    return yeniKayit;
}

function kayitSil(id) {
    kayitlariYaz(tumKayitlariGetir().filter((k) => k.id !== id));
}

function ornekVeriYukle() {
    const mevcut = tumKayitlariGetir();
    const ornek = {
        form_tarihi: new Date().toISOString().slice(0, 10),
        durum: "taslak",
        cevaplar: varsayilanlariUygula({
            personel_ismi: "Ayşe Demir",
            unvan_pozisyon: "Muhasebe Uzmanı",
            bolum: "Muhasebe",
            departman: "Mali İşler",
            ust_amir_ismi: "Mehmet Yılmaz",
            ust_amir_pozisyonu: "Mali İşler Müdürü",
            ust_amir_bolum: "Muhasebe",
            ust_amir_departman: "Mali İşler",
            diger_iletisim: [
                { kisi: "Denetim Uzmanı", pozisyon: "İç Denetim" },
                { kisi: "Satınalma Uzmanı", pozisyon: "Satınalma" },
                { kisi: "Bordro Yetkilisi", pozisyon: "İnsan Kaynakları" }
            ],
            calisma_yil: "3",
            calisma_ay: "0",
            ayni_unvan_sayisi: "4",
            fazla_mesai: "Ay kapanışlarında ayda 8-10 saat.",
            nobet: "",
            vekalet_eden: ["Muhasebe Yardımcısı"],
            vekalet_edilen: ["Muhasebe Yardımcısı"],
            rol_amaci: "Mali kayıtların doğru, eksiksiz ve zamanında tutulmasını sağlamak.",
            gorevler: [
                { gorev: "Fatura kontrolü", yuzde: "40", sa: "S", gunluk: "X", belirli: "", duzensiz: "", adet: "50" },
                { gorev: "Banka mutabakatı", yuzde: "30", sa: "S", gunluk: "", belirli: "Aylık", duzensiz: "", adet: "1" },
                { gorev: "Kapanış raporları", yuzde: "30", sa: "A", gunluk: "", belirli: "Aylık", duzensiz: "", adet: "3" }
            ],
            mevcut_yetkiler: "Rutin kayıt düzeltmeleri ve evrak kontrolü.",
            gereken_yetkiler: "Yüksek tutarlı ödemelerde ön onay yetkisi.",
            girdiler_birimler: "Faturalar ve banka ekstreleri; Satınalma ve Banka birimlerinden.",
            ciktilar: "Mutabakat raporları ve kapanış dosyası; Mali İşler Müdürü'ne.",
            sistemler: ["ERP", "Excel", "E-fatura sistemi"],
            kullanilan_girdiler: "Fatura bilgisi, banka hareketleri, kapanış hedefleri.",
            performans_olcum: "Evet",
            mevcut_performans: "Kapanışlar zamanında tamamlanıyor, mutabakat oranı %98.",
            performans_gostergeleri: "Fatura adedi, hata oranı, kapanış süresi.",
            hazirlanan_dokumanlar: "Fatura kontrol formu, mutabakat raporu, kapanış dosyası.",
            gelen_belgeler: [
                { belge: "Fatura", bolum: "Satınalma", islem: "Kontrol", siklik: "Günlük", sure: "1 saat" },
                { belge: "Banka ekstresi", bolum: "Banka", islem: "Mutabakat", siklik: "Haftalık", sure: "2 saat" }
            ],
            giden_belgeler: [
                { belge: "Mutabakat raporu", yer_amac: "Mali İşler Müdürü - onay", siklik: "Aylık", sure: "2 saat" },
                { belge: "KDV icmali", yer_amac: "Mali Müşavir - beyan", siklik: "Aylık", sure: "1 saat" }
            ],
            is_kontrolleri: [
                { tur: "Evrak tamlık kontrolü", siklik: "Günlük", sure: "30 dk" },
                { tur: "Tutarlılık kontrolü", siklik: "Haftalık", sure: "1 saat" }
            ],
            caba_zihinsel_yuzde: "80",
            caba_zihinsel_aciklama: "Sürekli dikkat ve analiz gerektirir.",
            caba_fiziksel_yuzde: "20",
            caba_fiziksel_aciklama: "Masa başı çalışma.",
            kontrol_tablosu: [
                { is: "Kapanış raporu", amac: "Doğruluk", kontrol: "", paraf: "", imza: "Mali İşler Müdürü", makam: "" },
                { is: "Fatura kaydı", amac: "Tamlık", kontrol: "Muhasebe Uzmanı", paraf: "", imza: "", makam: "" }
            ],
            yetkiler: ["y_kontrol", "y_paraf", "y_imza"],
            egitim: "İşletme, iktisat, maliye veya muhasebe bölümü.",
            lisans_sertifikalar: ["SMMM tercih sebebi"],
            diger_bilgi_beceri: "Dikkat, analitik düşünme, zaman yönetimi.",
            araclar: ["Bilgisayar", "ERP", "Excel"],
            yuzde_masa: "90",
            yuzde_bolumler: "10",
            yuzde_mobil: "0",
            oturma_duzeni: "Mevcut düzen yeterli.",
            ortamlar: ["buro", "pc"],
            faktorler: ["aydinlatma", "ergonomi"],
            sosyal_sorunlar: "Belirgin sosyal sorun yok.",
            risk_trafik_var: [],
            risk_meslek_var: [],
            gizli_bilgiler: [
                { konu: "Mali veriler", siklik: "Sürekli", sakinca: "Güven kaybı" }
            ],
            olasi_hatalar: [
                { hata: "Yanlış kayıt", kendisi: [], esit: ["X"], ust: [], birim: [], disi: [], sorun: "Kapanış gecikmesi", gevet: ["X"], ghayir: [] }
            ],
            birim_oneriler: "Evrak akışının dijital takip edilmesi.",
            seyahat: "Seyahat yok.",
            aciklama_yararli: "Kapanış takviminin netleşmesi faydalı olur.",
            yapilmamasi: [
                { is: "Arşiv taşıma", neden: "Destek eksikliği", kadro: "İdari İşler" }
            ],
            yapilamayan_isler: "Analitik raporlamaya yoğunluktan zaman kalmıyor.",
            yeni_hizmetler: [{ hizmet: "Otomatik mutabakat raporu", neden: "Hata azaltma" }],
            mevcut_kadro_isleri: [
                { is: "Fiziki arşiv taşıma", neden: "Destek personeli yokluğu", kadro: "İdari İşler" }
            ],
            birim_yapilmamasi: [
                { hizmet: "Fiziki arşiv taşıma", neden: "Uzmanlık dışı ve zaman kaybı" }
            ],
            koordinasyon: [
                { faaliyet: "Satınalma ile evrak koordinasyonu", neden: "Ortak havuz yokluğu", cozum: "Ortak evrak havuzu kurulması" }
            ],
            memnuniyet: "4",
            kac_kisi: "4 kişi yeterli; kapanış dönemleri için yedek planı gerekli.",
            personel_sikintisi: "Kapanış dönemlerinde yardımcı kadroda sıkışıklık oluyor.",
            eleman_yeterli_mi: "Genel olarak yeterli.",
            verimlilik_onerileri: "Dijital onay akışı ve kapanış takvimi.",
            performans_artirma: "Eğitim ve otomatik kontrol listeleri.",
            iyilestirme_engelleri: "Eksik evrak ve dönemsel yoğunluk.",
            org_degisikligi: "Mevcut şema yeterli.",
            yeni_deneyim: "En az 2 yıl muhasebe deneyimi.",
            yetkinlik_suresi: "3 ay iş başı eğitimi ile tam yetkinlik.",
            kompleks_ornekler: "Yıl sonu mutabakat farkı ERP kayıtları karşılaştırılarak çözüldü.",
            gelistirilen_metotlar: "Kontrol listesi ve Excel şablonu geliştirildi.",
            politika_prosedur: "Vergi mevzuatı ve iç muhasebe prosedürü.",
            ic_kontaklar: [{ kisi: "Mali İşler Müdürü", konu: "Onay ve raporlama", siklik: "Haftalık" }],
            dis_kontaklar: [{ kisi: "Bağımsız denetçi", konu: "Bilgi talebi", siklik: "Yıllık" }],
            bilgi_gelis: "Hayır",
            bilgi_problemleri: [{ nereden: "Satınalma", bilgi: "Fatura bilgisi", problem: "Gecikme" }],
            etkilenenler: [{ is: "Yanlış kayıt", bolum: "Mali İşler", nasil: "Kapanış gecikir" }],
            liderlik_var: "Hayır",
            dogrudan_sayi: "0",
            dolayli_sayi: "0",
            harici_isler: "Kapanış dönemlerinde arşiv düzenleme desteği ve denetim ekibine belge hazırlama.",
            zor_yanlar: [
                { konu: "Eksik evrakla ay kapanışına yetişmek", neden: "Zaman baskısı ve bekleyen onaylar" },
                { konu: "Mutabakat farklarını iz sürerek kapatmak", neden: "Dikkat ve sabır gerektirir" }
            ],
            imza_tarih: new Date().toISOString().slice(0, 10),
        })
    };

    kayitlariYaz([kayitKaydet(ornek), ...mevcut.filter((k) => (k.cevaplar?.personel_ismi || k.gorusulenAd) !== ornek.cevaplar.personel_ismi)]);
}

function kayitDosyaAdi(kayit) {
    const ad = (kayit.cevaplar?.personel_ismi || kayit.gorusulenAd || "is-analizi")
        .toLocaleLowerCase("tr-TR")
        .replaceAll("ı", "i").replaceAll("ğ", "g").replaceAll("ü", "u")
        .replaceAll("ş", "s").replaceAll("ö", "o").replaceAll("ç", "c")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `${ad || "is-analizi"}-${kayit.form_tarihi || kayit.tarih || new Date().toISOString().slice(0, 10)}.json`;
}

function jsonIndir(veri, dosyaAdi) {
    const blob = new Blob([JSON.stringify(veri, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = dosyaAdi;
    link.click();
    URL.revokeObjectURL(link.href);
}

function verileriDisaAktar() {
    jsonIndir(tumKayitlariGetir(), `is-analizi-kayitlari-${new Date().toISOString().slice(0, 10)}.json`);
}

function tekKayitDisaAktar(kayit) {
    const tam = kayit.id ? (kayitGetir(kayit.id) || kayit) : kayit;
    jsonIndir(tam, kayitDosyaAdi(tam));
}

// Kayıp yaşatmaz: içe aktarılan kayıtlar id üzerinden birleştirilir (ekle/güncelle),
// mevcut kayıtlar silinmez. Tek nesne veya dizi kabul eder.
async function verileriIceAktar(file) {
    const metin = await file.text();
    let veri;
    try {
        veri = JSON.parse(metin);
    } catch (error) {
        throw new Error("JSON dosyası okunamadı.");
    }
    const liste = Array.isArray(veri) ? veri : [veri];
    if (!liste.length) throw new Error("JSON dosyasında kayıt bulunamadı.");

    const kayitlar = tumKayitlariGetir();
    const simdi = new Date().toISOString();
    let eklenen = 0, guncellenen = 0;

    liste.forEach((ham) => {
        if (!ham || typeof ham !== "object" || Array.isArray(ham)) {
            throw new Error("JSON dosyasında geçersiz kayıt var.");
        }
        const id = typeof ham.id === "string" && ham.id ? ham.id : crypto.randomUUID();
        const temiz = {
            id,
            form_tarihi: ham.form_tarihi || ham.tarih || "",
            durum: ham.durum === "tamamlandi" ? "tamamlandi" : "taslak",
            cevaplar: varsayilanlariUygula(ham.cevaplar && typeof ham.cevaplar === "object" ? ham.cevaplar : {}),
            olusturulmaTarihi: ham.olusturulmaTarihi || simdi,
            guncellenmeTarihi: simdi,
            ...(ham.sonBolum ? { sonBolum: ham.sonBolum } : {})
        };
        // Eski şemadan kalan alanları koru (kayıp önleme): yeniden adlandırılanları
        // yeni anahtarlara taşı, diğerlerini olduğu gibi sakla (exportta yok sayılır).
        const eskiEsleme = { gorusulenAd: "personel_ismi", pozisyon: "unvan_pozisyon", departman: "departman" };
        Object.entries(eskiEsleme).forEach(([eski, yeni]) => {
            if (ham[eski] && !temiz.cevaplar[yeni]) temiz.cevaplar[yeni] = ham[eski];
        });
        ["tesis", "gorusmeci", "baslangic", "bitis", "genelGozlemler", "tarih"].forEach((alan) => {
            if (ham[alan] != null && ham[alan] !== "" && temiz.cevaplar[alan] == null) {
                temiz.cevaplar[alan] = ham[alan];
            }
        });
        const index = kayitlar.findIndex((k) => k.id === id);
        if (index !== -1) {
            kayitlar[index] = { ...kayitlar[index], ...temiz, olusturulmaTarihi: kayitlar[index].olusturulmaTarihi || temiz.olusturulmaTarihi };
            guncellenen++;
        } else {
            kayitlar.unshift(temiz);
            eklenen++;
        }
    });

    kayitlariYaz(kayitlar);
    return { eklenen, guncellenen };
}
