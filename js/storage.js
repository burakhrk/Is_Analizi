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
    return tumKayitlariGetir().find((kayit) => kayit.id === id) || null;
}

function kayitKaydet(veri) {
    const kayitlar = tumKayitlariGetir();
    const simdi = new Date().toISOString();

    if (veri.id) {
        const index = kayitlar.findIndex((kayit) => kayit.id === veri.id);
        if (index !== -1) {
            kayitlar[index] = {
                ...kayitlar[index],
                ...veri,
                guncellenmeTarihi: simdi
            };
            kayitlariYaz(kayitlar);
            return kayitlar[index];
        }
    }

    const yeniKayit = {
        ...veri,
        id: crypto.randomUUID(),
        olusturulmaTarihi: simdi,
        guncellenmeTarihi: simdi
    };
    kayitlar.unshift(yeniKayit);
    kayitlariYaz(kayitlar);
    return yeniKayit;
}

function kayitSil(id) {
    kayitlariYaz(tumKayitlariGetir().filter((kayit) => kayit.id !== id));
}

function ornekVeriYukle() {
    const mevcut = tumKayitlariGetir();
    const ornek = {
        gorusulenAd: "Ayşe Demir",
        pozisyon: "Muhasebe Uzmanı",
        departman: "Mali İşler",
        tesis: "Merkez Ofis",
        gorusmeci: "İK Ekibi",
        tarih: new Date().toISOString().slice(0, 10),
        baslangic: "10:00",
        bitis: "11:00",
        durum: "taslak",
        genelGozlemler: "Rol, dönemsel yoğunluklardan etkileniyor. Özellikle ay kapanışlarında iş hacmi artıyor.",
        cevaplar: {
            ust_amir_ismi: "Mehmet Yılmaz",
            ust_amir_pozisyonu: "Mali İşler Müdürü",
            ust_amir_bolum: "Muhasebe",
            ust_amir_departman: "Mali İşler",
            diger_raporlama: ["Denetim Uzmanı - İç Denetim"],
            mevcut_pozisyon_suresi: "3 yıl",
            ayni_unvanda_calisan_sayisi: "4",
            fazla_mesai_suresi_sikligi: "Ay kapanışlarında ayda 8-10 saat.",
            nobet_sistemi: "Nöbet sistemi yok.",
            vekalet_eden_unvanlar: ["Muhasebe Yardımcısı"],
            vekalet_edilen_unvanlar: ["Muhasebe Yardımcısı"],
            rol_amaci: "Mali kayıtların doğru, eksiksiz ve zamanında tutulmasını sağlamak.",
            gorev_sorumluluk_onem: ["Fatura kontrolü - %40 - sürekli - günlük - 50 adet", "Banka mutabakatı - %30 - sürekli - aylık", "Kapanış raporları - %30 - ara sıra - aylık"],
            mevcut_yetkiler: "Rutin kayıt düzeltmeleri ve evrak kontrolü.",
            olmasi_gereken_yetkiler: "Yüksek tutarlı ödemelerde ön onay yetkisi.",
            girdiler_birimler: "Faturalar ve banka ekstreleri; Satınalma ve Banka birimlerinden.",
            ciktilar_nereye_gider: "Mutabakat raporları ve kapanış dosyası; Mali İşler Müdürü'ne.",
            kullanilan_sistemler: ["ERP", "Excel", "E-fatura sistemi"],
            kullanilan_girdiler: "Fatura bilgisi, banka hareketleri, kapanış hedefleri.",
            performans_olcumu_var_mi: "Evet",
            mevcut_performans: "Kapanışlar zamanında tamamlanıyor, mutabakat oranı %98.",
            performans_gostergeleri: "Fatura adedi, hata oranı, kapanış süresi.",
            hazirlanan_kontrol_edilen_dokumanlar: "Fatura kontrol formu, mutabakat raporu, kapanış dosyası.",
            gelen_belgeler_talimatlar: ["Fatura - Satınalma - kontrol - günlük - 1 saat"],
            giden_belgeler_talimatlar: ["Mutabakat - Mali İşler Müdürü - onay - aylık - 2 saat"],
            is_esnasi_kontroller: ["Evrak tamlık kontrolü - günlük - 30 dk"],
            agirlikli_caba: "Zihinsel %80, fiziksel %20.",
            is_nasil_kontrol_ediliyor: ["Kapanış raporu - doğruluk - Mali İşler Müdürü - imza"],
            is_yapanin_yetkileri: ["Evrak kontrol etme", "Kayıt düzeltme"],
            egitim: "İşletme, iktisat, maliye veya muhasebe bölümü.",
            lisans_sertifikalar: ["SMMM tercih sebebi"],
            diger_bilgi_beceri: "Dikkat, analitik düşünme, zaman yönetimi.",
            araclar: ["Bilgisayar", "ERP", "Excel"],
            calisma_yeri_yuzdeleri: "Ofis masa başı %90, bölümler arası %10.",
            oturma_duzeni: "Mevcut düzen yeterli.",
            fiziksel_ortam: ["Büro", "Bilgisayar"],
            sosyal_sorunlar: "Belirgin sosyal sorun yok.",
            ortam_faktorleri: ["Aydınlatma", "Ergonomi"],
            is_riskleri: "Belirgin kaza veya meslek hastalığı riski yok.",
            gizli_bilgiler: "Mali veriler gizlidir; sızması güven kaybına yol açar.",
            olasi_hatalar: "Yanlış kayıt girilmesi; muhasebe ekibi fark etmeli; mali zarara yol açabilir.",
            verimlilik_onerileri_birim: "Evrak akışının dijital takip edilmesi.",
            seyahat: "Seyahat yok.",
            aciklanmasinda_yarar_var: "Kapanış takviminin netleşmesi faydalı olur.",
            yapilmamasi_gereken_isler: ["Arşiv taşıma - destek eksikliği - İdari İşler yapmalı"],
            yapilmasi_gereken_yapilamayan_isler: "Analitik raporlamaya zaman kalmıyor; yoğunluk nedeniyle.",
            yeni_hizmet_faaliyetler: ["Otomatik mutabakat raporu - hata azaltma"],
            birimde_yapilmamasi_gereken_faaliyetler: ["Fiziki arşiv taşıma - zaman kaybı - İdari İşler yapıyor"],
            koordinasyon_eksigi_faaliyetler: ["Satınalma ile evrak koordinasyonu - gecikme - ortak havuz önerisi"],
            memnuniyet_derecesi: "4",
            bu_iste_kac_kisi: "4 kişi yeterli; kapanış dönemleri için yedek planı gerekli.",
            personel_sikintisi: "Kapanış dönemlerinde Muhasebe Yardımcısı kadrosunda sıkışıklık oluyor.",
            eleman_sayisi_yeterli_mi: "Genel olarak yeterli; yoğun dönem planlaması iyileştirilmeli.",
            genel_verimlilik_onerileri: "Dijital onay akışı ve kapanış takvimi.",
            performans_artirma_onerileri: "Eğitim ve otomatik kontrol listeleri.",
            iyilestirme_engelleri: "Eksik evrak ve dönemsel yoğunluk.",
            organizasyon_semasi_degisikligi: "Mevcut şema yeterli.",
            yeni_baslayan_deneyim: "En az 2 yıl muhasebe deneyimi.",
            tam_yetkinlik_suresi: "3 ay iş başı eğitimi ile tam yetkinlik.",
            kompleks_problem_ornekleri: "Yıl sonu mutabakat farkı ERP kayıtları karşılaştırılarak çözüldü.",
            gelistirilen_metotlar: "Kontrol listesi ve Excel şablonu geliştirildi.",
            gerekli_politika_prosedur_yasa: "Vergi mevzuatı ve iç muhasebe prosedürü.",
            ic_kontaklar: ["Mali İşler Müdürü - onay ve raporlama - haftalık"],
            dis_kontaklar: ["Bağımsız denetçi - bilgi talebi - yıllık"],
            bilgi_gelisi_yeterli_mi: "Kısmen",
            bilgi_gelis_problemleri: ["Satınalma - fatura bilgisi - gecikme"],
            yanlis_isten_etkilenenler: ["Yanlış kayıt - Mali İşler - kapanış gecikir"],
            bagli_personel_var_mi: "Hayır",
            yonetim_sorumlulugu: "Doğrudan yönetim sorumluluğu yok.",
            bagli_personel_sayisi: "0"
        }
    };

    kayitlariYaz([kayitKaydet(ornek), ...mevcut.filter((kayit) => kayit.gorusulenAd !== ornek.gorusulenAd)]);
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
