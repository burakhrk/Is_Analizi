const IS_ANALIZI_SORULARI = [
    {
        id: "genel_rol",
        baslik: "Rolün Amacı",
        sorular: [
            {
                id: "rol_amaci",
                etiket: "Bu pozisyonun temel amacı nedir?",
                tip: "textarea",
                zorunlu: true
            },
            {
                id: "is_sonuclari",
                etiket: "Bu rolün başarılı sayılması için hangi çıktılar beklenir?",
                tip: "textarea"
            },
            {
                id: "yoklugunda_etki",
                etiket: "Bu iş yapılmazsa süreçte ne aksar?",
                tip: "textarea"
            }
        ]
    },
    {
        id: "is_envanteri",
        baslik: "İş Envanteri",
        sorular: [
            {
                id: "gunluk_isler",
                etiket: "Günlük yapılan işler",
                tip: "liste",
                yerTutucu: "Örn. gelen talepleri kontrol etmek"
            },
            {
                id: "periyodik_isler",
                etiket: "Haftalık, aylık veya yıllık işler",
                tip: "liste",
                yerTutucu: "Örn. aylık rapor hazırlamak"
            },
            {
                id: "duzensiz_isler",
                etiket: "Talep geldikçe yapılan işler",
                tip: "liste",
                yerTutucu: "Örn. denetim sorularını yanıtlamak"
            }
        ]
    },
    {
        id: "zaman_yogunluk",
        baslik: "Zaman ve Yoğunluk",
        sorular: [
            {
                id: "calisma_duzeni",
                etiket: "Normal çalışma düzeni nasıldır?",
                tip: "textarea"
            },
            {
                id: "yogun_donemler",
                etiket: "Yoğun dönemler hangi zamanlarda oluşur?",
                tip: "textarea"
            },
            {
                id: "fazla_mesai",
                etiket: "Fazla mesai veya iş yetiştirememe durumu var mı?",
                tip: "secim",
                secenekler: ["Hayır", "Bazen", "Sık sık"]
            }
        ]
    },
    {
        id: "yetki_sorumluluk",
        baslik: "Yetki ve Sorumluluk",
        sorular: [
            {
                id: "karar_yetkileri",
                etiket: "Bu pozisyon hangi konularda karar alabilir?",
                tip: "textarea"
            },
            {
                id: "onay_beklenen",
                etiket: "Hangi konularda başkasından onay beklenir?",
                tip: "textarea"
            },
            {
                id: "raporlama",
                etiket: "Kime raporlar, kimlerle düzenli çalışır?",
                tip: "textarea"
            }
        ]
    },
    {
        id: "yetkinlik",
        baslik: "Yetkinlikler",
        sorular: [
            {
                id: "egitim",
                etiket: "Gerekli eğitim düzeyi veya bölüm bilgisi",
                tip: "text"
            },
            {
                id: "deneyim",
                etiket: "Gerekli deneyim",
                tip: "text"
            },
            {
                id: "araclar",
                etiket: "Kullanılan yazılım, ekipman veya araçlar",
                tip: "liste",
                yerTutucu: "Örn. Excel, ERP, üretim makinesi"
            },
            {
                id: "kritik_yetkinlikler",
                etiket: "Kritik yetkinlikler",
                tip: "liste",
                yerTutucu: "Örn. iletişim, analiz, dikkat"
            }
        ]
    },
    {
        id: "sorun_iyilestirme",
        baslik: "Sorunlar ve İyileştirme",
        sorular: [
            {
                id: "zorlayan_konular",
                etiket: "İşi en çok zorlaştıran konular nelerdir?",
                tip: "textarea"
            },
            {
                id: "iyilestirme_fikirleri",
                etiket: "Süreç nasıl iyileştirilebilir?",
                tip: "textarea"
            },
            {
                id: "ek_not",
                etiket: "Eklemek istediğiniz başka bir konu var mı?",
                tip: "textarea"
            }
        ]
    }
];
