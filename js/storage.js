const STORAGE_KEY = "is_analizi_odakli_kayitlar";

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

// Eski kayıtlar veya boş formlar için şemayı tamamla (questions.js ile aynı tipler).
function varsayilanlariUygula(cevaplar) {
    const out = { ...cevaplar };
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
        cevaplar: varsayilanlariUygula(veri.cevaplar || {})
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
            diger_iletisim: [{ kisi: "Denetim Uzmanı", pozisyon: "İç Denetim" }],
            calisma_yil: "3",
            calisma_ay: "0",
            ayni_unvan_sayisi: "4",
            fazla_mesai: "Ay kapanışlarında ayda 8-10 saat.",
            nobet: "Nöbet sistemi yok.",
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
                { belge: "Fatura", bolum: "Satınalma", islem: "Kontrol", siklik: "Günlük", sure: "1 saat" }
            ],
            giden_belgeler: [
                { belge: "Mutabakat raporu", yer_amac: "Mali İşler Müdürü - onay", siklik: "Aylık", sure: "2 saat" }
            ],
            is_kontrolleri: [
                { tur: "Evrak tamlık kontrolü", siklik: "Günlük", sure: "30 dk" }
            ],
            caba_zihinsel_yuzde: "80",
            caba_zihinsel_aciklama: "Sürekli dikkat ve analiz gerektirir.",
            caba_fiziksel_yuzde: "20",
            caba_fiziksel_aciklama: "Masa başı çalışma.",
            kontrol_tablosu: [
                { is: "Kapanış raporu", amac: "Doğruluk", kontrol: [], paraf: [], imza: ["X"], makam: [] }
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
            risk_kaza_yok: ["X"],
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
            bilgi_gelis: "Kısmen",
            bilgi_problemleri: [{ nereden: "Satınalma", bilgi: "Fatura bilgisi", problem: "Gecikme" }],
            etkilenenler: [{ is: "Yanlış kayıt", bolum: "Mali İşler", nasil: "Kapanış gecikir" }],
            liderlik_var: "Hayır",
            imza_tarih: new Date().toISOString().slice(0, 10),
            imza: "Ayşe Demir"
        })
    };

    kayitlariYaz([kayitKaydet(ornek), ...mevcut.filter((k) => (k.cevaplar?.personel_ismi || k.gorusulenAd) !== ornek.cevaplar.personel_ismi)]);
}

function verileriDisaAktar() {
    const blob = new Blob([JSON.stringify(tumKayitlariGetir(), null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `is-analizi-kayitlari-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
}

async function verileriIceAktar(file) {
    const metin = await file.text();
    const veri = JSON.parse(metin);
    if (!Array.isArray(veri)) {
        throw new Error("JSON dosyası kayıt listesi içermiyor.");
    }
    kayitlariYaz(veri);
}
