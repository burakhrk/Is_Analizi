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
            rol_amaci: "Mali kayıtların doğru, eksiksiz ve zamanında tutulmasını sağlamak.",
            is_sonuclari: "Faturaların işlenmesi, mutabakatların tamamlanması ve raporların hazırlanması.",
            yoklugunda_etki: "Ödemeler, kapanış süreçleri ve raporlamalar gecikir.",
            gunluk_isler: ["Fatura kontrolü", "Banka hareketlerini takip etme", "E-posta taleplerini yanıtlama"],
            periyodik_isler: ["Aylık KDV hazırlığı", "Banka mutabakatı", "Kapanış raporları"],
            duzensiz_isler: ["Denetim sorularını yanıtlama", "Özel yönetim raporları"],
            calisma_duzeni: "Hafta içi 09:00-18:00 arası çalışılır.",
            yogun_donemler: "Ay sonu, çeyrek kapanışları ve yıl sonu.",
            fazla_mesai: "Bazen",
            karar_yetkileri: "Rutin kayıt düzeltmeleri ve evrak kontrol kararları.",
            onay_beklenen: "Yüksek tutarlı ödeme ve özel rapor talepleri.",
            raporlama: "Mali İşler Müdürü'ne raporlar.",
            egitim: "İşletme, iktisat, maliye veya muhasebe bölümü.",
            deneyim: "En az 2 yıl muhasebe deneyimi.",
            araclar: ["Excel", "ERP", "E-fatura sistemi"],
            kritik_yetkinlikler: ["Dikkat", "Analitik düşünme", "Zaman yönetimi"],
            zorlayan_konular: "Eksik evrak ve dönemsel iş yoğunluğu.",
            iyilestirme_fikirleri: "Evrak akışının dijital takip edilmesi ve kapanış takviminin netleşmesi.",
            ek_not: "Yedekleme planı güçlendirilmeli."
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
