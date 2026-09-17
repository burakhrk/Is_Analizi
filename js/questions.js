// IsAnaliziForm ile birebir aynı bölümler (12 sayfalık resmi form).
// Alan kimlikleri (id) Word şablonundaki {{etiket}} yer tutucularıyla eşleşir.
// Tipler: text | textarea | secim | liste | onay | tablo
const IS_ANALIZI_SORULARI = [
    {
        id: "genel_bilgiler",
        baslik: "GENEL BİLGİLER",
        sorular: [
            { id: "personel_ismi", etiket: "Personel İsmi", tip: "text", zorunlu: true },
            { id: "unvan_pozisyon", etiket: "Ünvanı / Pozisyonu", tip: "text", zorunlu: true },
            { id: "bolum", etiket: "Bölüm", tip: "text" },
            { id: "departman", etiket: "Departman", tip: "text" },
            { id: "ust_amir_ismi", etiket: "Üst Amirinin İsmi", tip: "text" },
            { id: "ust_amir_pozisyonu", etiket: "Üst Amirinin Pozisyonu", tip: "text" },
            { id: "ust_amir_bolum", etiket: "Üst Amirin Bölümü", tip: "text" },
            { id: "ust_amir_departman", etiket: "Üst Amirin Departmanı", tip: "text" },
            {
                id: "diger_iletisim", etiket: "Bağlı olduğunuz amir dışında raporlama yaptığınız / iş talimatı aldığınız kişiler", tip: "tablo",
                minSatir: 3,
                sutunlar: [
                    { id: "kisi", baslik: "Kişi", tip: "text" },
                    { id: "pozisyon", baslik: "Pozisyon", tip: "text" }
                ]
            },
            { id: "calisma_yil", etiket: "Mevcut pozisyondaki çalışma süresi (Yıl)", tip: "text" },
            { id: "calisma_ay", etiket: "Mevcut pozisyondaki çalışma süresi (Ay)", tip: "text" },
            { id: "ayni_unvan_sayisi", etiket: "Biriminizde aynı iş / görev unvanında çalışan sayısı", tip: "text" },
            { id: "fazla_mesai_var", etiket: "Fazla mesai yapıyor musunuz?", tip: "onay", secenekler: [{ deger: "evet", etiket: "Fazla mesai yapıyorum" }] },
            { id: "fazla_mesai", etiket: "Fazla mesai varsa süresi ve sıklığı (açıklayınız)", tip: "textarea" },
            { id: "nobet_var", etiket: "Nöbet sistemi var mı?", tip: "onay", secenekler: [{ deger: "evet", etiket: "Nöbet sistemi var" }] },
            { id: "nobet", etiket: "Nöbet sistemi varsa süresi ve sıklığı (açıklayınız)", tip: "textarea" },
            { id: "vekalet_eden", etiket: "Kendisine vekâlet eden iş unvanı / unvanları", tip: "liste" },
            { id: "vekalet_edilen", etiket: "Kendisinin vekâlet ettiği iş unvanı / unvanları", tip: "liste" }
        ]
    },
    {
        id: "pozisyon_ozeti",
        baslik: "POZİSYON ÖZETİ",
        sorular: [
            { id: "rol_amaci", etiket: "Görevinizin genel amacı (bir iki cümle ile özet)", tip: "textarea", zorunlu: true },
            {
                id: "gorevler", etiket: "2.1. Görev ve sorumluluklar (önem derecesine göre; S = sürekli, A = ara sıra; yüzdeler toplamı %100)", tip: "tablo",
                minSatir: 3,
                sutunlar: [
                    { id: "gorev", baslik: "Görev / Sorumluluk", tip: "text" },
                    { id: "yuzde", baslik: "% Zaman", tip: "text" },
                    { id: "sa", baslik: "S/A", tip: "secim", secenekler: ["S", "A"] },
                    { id: "gunluk", baslik: "Günlük", tip: "text" },
                    { id: "belirli", baslik: "Belirli Aralıklarla", tip: "text" },
                    { id: "duzensiz", baslik: "Düzensiz Aralıklarla", tip: "text" },
                    { id: "adet", baslik: "Adet", tip: "text" }
                ]
            },
            { id: "mevcut_yetkiler", etiket: "2.2. Görevleri gerçekleştirirken size verilen mevcut yetkiler", tip: "textarea" },
            { id: "gereken_yetkiler", etiket: "2.3. Mevcut yetki ve sorumluluklar dışında olması gereken yetki ve sorumluluklar", tip: "textarea" },
            { id: "girdiler_birimler", etiket: "2.4. Bu faaliyetler için hangi girdiler gerekir? Hangi birim / bölüm sağlar?", tip: "textarea" },
            { id: "ciktilar", etiket: "2.5. Bu faaliyetler sonunda hangi çıktılar üretilir, nereye gider?", tip: "textarea" },
            { id: "sistemler", etiket: "2.6. Faaliyetleri gerçekleştirirken hangi sistemler kullanılmaktadır?", tip: "liste", yerTutucu: "Örn. ERP, Excel, e-posta" },
            { id: "kullanilan_girdiler", etiket: "2.7. Faaliyetler için kullandığınız girdiler (hammadde, bilgi, hedef, malzeme, insan vb.)", tip: "textarea" },
            { id: "performans_olcum", etiket: "2.8. Faaliyet sonuçlarınızı hedefe ulaşma açısından ölçüyor musunuz?", tip: "secim", secenekler: ["Evet", "Hayır", "Kısmen"] },
            { id: "mevcut_performans", etiket: "2.8.1. Faaliyetlerinizin mevcut performansı nedir?", tip: "textarea" },
            { id: "performans_gostergeleri", etiket: "2.8.2. Hangi göstergelerle ölçüyorsunuz? (miktar, sayı, oran, maliyet vb.)", tip: "textarea" }
        ]
    },
    {
        id: "diger_bilgiler",
        baslik: "3. DİĞER BİLGİLER",
        sorular: [
            { id: "hazirlanan_dokumanlar", etiket: "İşle ilgili hazırlanan, kontrol edilen veya onaylanan form, doküman ve raporlar", tip: "textarea" },
            {
                id: "gelen_belgeler", etiket: "Gelen belgeler ve sözlü talimatlar", tip: "tablo",
                minSatir: 2,
                sutunlar: [
                    { id: "belge", baslik: "Belge / Talimat", tip: "text" },
                    { id: "bolum", baslik: "Geldiği Bölüm", tip: "text" },
                    { id: "islem", baslik: "Yapılan İşlem", tip: "text" },
                    { id: "siklik", baslik: "Sıklık (kez/ay)", tip: "text" },
                    { id: "sure", baslik: "Süre (Saat/Dakika)", tip: "text" }
                ]
            },
            {
                id: "giden_belgeler", etiket: "Giden belgeler ve sözlü talimatlar", tip: "tablo",
                minSatir: 2,
                sutunlar: [
                    { id: "belge", baslik: "Belge Adı", tip: "text" },
                    { id: "yer_amac", baslik: "Gönderildiği Yer ve Amacı", tip: "text" },
                    { id: "siklik", baslik: "Sıklık", tip: "text" },
                    { id: "sure", baslik: "Süre (Saat/Dakika)", tip: "text" }
                ]
            },
            {
                id: "is_kontrolleri", etiket: "İş esnasında sizin tarafınızdan yapılan kontroller ve sıklığı", tip: "tablo",
                minSatir: 2,
                sutunlar: [
                    { id: "tur", baslik: "Kontrol / Onay Türü", tip: "text" },
                    { id: "siklik", baslik: "Sıklık", tip: "text" },
                    { id: "sure", baslik: "Süre (dak.)", tip: "text" }
                ]
            },
            { id: "caba_zihinsel_yuzde", etiket: "Ağırlıklı çaba: zihinsel %", tip: "text" },
            { id: "caba_zihinsel_aciklama", etiket: "Ağırlıklı çaba: zihinsel açıklama", tip: "text" },
            { id: "caba_fiziksel_yuzde", etiket: "Ağırlıklı çaba: fiziksel %", tip: "text" },
            { id: "caba_fiziksel_aciklama", etiket: "Ağırlıklı çaba: fiziksel açıklama", tip: "text" },
            {
                id: "kontrol_tablosu", etiket: "Yaptığınız işler nasıl ve kim tarafından kontrol / onaylanıyor?", tip: "tablo",
                minSatir: 1,
                sutunlar: [
                    { id: "is", baslik: "Yapılan İş", tip: "text" },
                    { id: "amac", baslik: "Kontrol Amacı", tip: "text" },
                    { id: "kontrol", baslik: "Kontrol", tip: "text" },
                    { id: "paraf", baslik: "Paraf", tip: "text" },
                    { id: "imza", baslik: "İmza", tip: "text" },
                    { id: "makam", baslik: "Makam Onay", tip: "text" }
                ]
            },
            {
                id: "yetkiler", etiket: "İş yapanın yetkileri (uygun olanları işaretleyin)", tip: "onay",
                secenekler: [
                    { deger: "y_is_verme", etiket: "İş verme, yönlendirme" },
                    { deger: "y_kontrol", etiket: "Kontrol etme, düzeltme" },
                    { deger: "y_vekalet", etiket: "Vekâlet etme" },
                    { deger: "y_ceza", etiket: "Cezalandırma" },
                    { deger: "y_odul", etiket: "Ödüllendirme" },
                    { deger: "y_gorev_deg", etiket: "İş/görev değiştirme" },
                    { deger: "y_egitim", etiket: "Eğitim verme" },
                    { deger: "y_disiplin", etiket: "Disiplin amiri" },
                    { deger: "y_izin", etiket: "İzin verme" },
                    { deger: "y_harcama", etiket: "Harcama" },
                    { deger: "y_satinalma", etiket: "Satın alma" },
                    { deger: "y_imza", etiket: "İmzalama" },
                    { deger: "y_paraf", etiket: "Paraflama" },
                    { deger: "y_temsil", etiket: "Temsil" },
                    { deger: "y_diger", etiket: "Diğer" }
                ]
            },
            { id: "y_diger_aciklama", etiket: "Diğer yetki açıklaması", tip: "text" }
        ]
    },
    {
        id: "bilgi_beceri",
        baslik: "4. BİLGİ ve BECERİ",
        sorular: [
            { id: "egitim", etiket: "4.1. Bu pozisyon için gerekli özel eğitim düzeyi", tip: "textarea" },
            { id: "lisans_sertifikalar", etiket: "4.2. Gerekli lisans veya sertifikalar", tip: "liste" },
            { id: "diger_bilgi_beceri", etiket: "4.3. Gerekli diğer bilgi, beceri veya kabiliyetler", tip: "textarea" },
            { id: "araclar", etiket: "4.4. Kullanılması gereken makine, teçhizat, ofis ekipmanı vb.", tip: "liste" },
            { id: "yuzde_masa", etiket: "4.5. Ofis ortamında masa başında %", tip: "text" },
            { id: "yuzde_bolumler", etiket: "4.5. Ofis ortamında bölümler arasında %", tip: "text" },
            { id: "yuzde_mobil", etiket: "4.5. Ofis ortamı dışında mobil %", tip: "text" },
            { id: "oturma_duzeni", etiket: "4.6. Oturma düzeni işinizi kolaylaştırıyor mu? Hayır ise önerileriniz", tip: "textarea" },
            {
                id: "ortamlar", etiket: "4.6.1. Yapılan iş hangi fiziksel ortam(lar)da gerçekleşmektedir?", tip: "onay",
                secenekler: [
                    { deger: "buro", etiket: "Büro" },
                    { deger: "atolye", etiket: "Atölye" },
                    { deger: "dis", etiket: "Dış Ortam" },
                    { deger: "lab", etiket: "Laboratuvar" },
                    { deger: "depo", etiket: "Depo" },
                    { deger: "pc", etiket: "Bilgisayar" },
                    { deger: "diger", etiket: "Diğer (açıklayınız)" }
                ]
            },
            {
                id: "faktorler", etiket: "Çalışma ortamında maruz kalınan faktörler", tip: "onay",
                secenekler: [
                    { deger: "gurultu", etiket: "Gürültü" },
                    { deger: "aydinlatma", etiket: "Kötü Aydınlatma" },
                    { deger: "sicak", etiket: "Sıcak" },
                    { deger: "soguk", etiket: "Soğuk" },
                    { deger: "nem", etiket: "Nem" },
                    { deger: "toz", etiket: "Toz" },
                    { deger: "koku", etiket: "Kötü koku" },
                    { deger: "ergonomi", etiket: "Ergonomik olmayan masa sandalye" },
                    { deger: "havalandirma", etiket: "Havalandırma" },
                    { deger: "kimyasal", etiket: "Kimyasal Madde" },
                    { deger: "diger", etiket: "Diğer (açıklayınız)" }
                ]
            },
            { id: "ortam_diger_aciklama", etiket: "Diğer ortam açıklaması", tip: "text" },
            { id: "faktor_diger_aciklama", etiket: "Diğer faktör açıklaması", tip: "text" },
            { id: "sosyal_sorunlar", etiket: "4.6.2. Çalışma ortamında yaşadığınız sosyal sorunlar (ayrımcılık, alay, mobbing vb.)", tip: "textarea" },
            { id: "risk_kaza_siddet", etiket: "İş kazası riski şiddeti", tip: "secim", secenekler: ["Yok", "Düşük", "Orta", "Yüksek"] },
            { id: "risk_kaza_siklik", etiket: "İş kazası riski sıklığı", tip: "secim", secenekler: ["Yok", "Düşük", "Orta", "Yüksek"] },
            { id: "risk_trafik_var", etiket: "Trafik kazası riski var mı?", tip: "onay", secenekler: [{ deger: "X", etiket: "Var" }] },
            { id: "risk_trafik_siddet", etiket: "Trafik kazası riski şiddeti", tip: "secim", secenekler: ["Yok", "Düşük", "Orta", "Yüksek"] },
            { id: "risk_trafik_siklik", etiket: "Trafik kazası riski sıklığı", tip: "secim", secenekler: ["Yok", "Düşük", "Orta", "Yüksek"] },
            { id: "risk_meslek_var", etiket: "Meslek hastalıklarına yakalanma riski var mı?", tip: "onay", secenekler: [{ deger: "X", etiket: "Var" }] },
            { id: "risk_meslek_siddet", etiket: "Meslek hastalığı riski şiddeti", tip: "secim", secenekler: ["Yok", "Düşük", "Orta", "Yüksek"] },
            { id: "risk_meslek_siklik", etiket: "Meslek hastalığı riski sıklığı", tip: "secim", secenekler: ["Yok", "Düşük", "Orta", "Yüksek"] },
            {
                id: "gizli_bilgiler", etiket: "4.7. Gizlenmesi gereken bilgiler (konusu, kullanım sıklığı, açığa çıkma sakıncası)", tip: "tablo",
                minSatir: 1,
                sutunlar: [
                    { id: "konu", baslik: "Gizli Bilginin Konusu", tip: "text" },
                    { id: "siklik", baslik: "Kullanılma Sıklığı", tip: "text" },
                    { id: "sakinca", baslik: "Açığa Çıkma Sakıncası", tip: "text" }
                ]
            },
            {
                id: "olasi_hatalar", etiket: "4.7.1. Çalışma sırasında yapılabilecek hatalar", tip: "tablo",
                minSatir: 1,
                sutunlar: [
                    { id: "hata", baslik: "Olası Hata", tip: "text" },
                    { id: "kendisi", baslik: "Kendisi", tip: "onay" },
                    { id: "esit", baslik: "Eşit Düzey", tip: "onay" },
                    { id: "ust", baslik: "Üst Düzey", tip: "onay" },
                    { id: "birim", baslik: "Diğer Birim", tip: "onay" },
                    { id: "disi", baslik: "Kurum Dışı", tip: "onay" },
                    { id: "sorun", baslik: "Yol Açtığı Sorun/Zarar", tip: "text" },
                    { id: "gevet", baslik: "Giderilir: Evet", tip: "onay" },
                    { id: "ghayir", baslik: "Giderilir: Hayır", tip: "onay" }
                ]
            },
            { id: "birim_oneriler", etiket: "4.7.2. Birim faaliyetlerinin daha etkili, verimli, kaliteli ve az maliyetli olması için öneriler", tip: "textarea" },
            { id: "seyahat", etiket: "4.8. Görev gereği seyahat: amacı ve sıklığı", tip: "textarea" },
            { id: "aciklama_yararli", etiket: "4.9. İşinizle ilgili açıklanmasında yarar gördüğünüz konular", tip: "textarea" }
        ]
    },
    {
        id: "isin_analizi",
        baslik: "5. İŞİN ANALİZİ",
        sorular: [
            {
                id: "yapilmamasi", etiket: "5.1. Yerinize getirilen ancak yapılmaması gerektiğini düşündüğünüz işler", tip: "tablo",
                minSatir: 1,
                sutunlar: [
                    { id: "is", baslik: "Yapılmaması Gereken İş", tip: "text" },
                    { id: "neden", baslik: "Yapılma Nedeni", tip: "text" },
                    { id: "kadro", baslik: "Hangi Kadro Yapmalı", tip: "text" }
                ]
            },
            { id: "yapilamayan_isler", etiket: "5.2. Yapılması gerektiğini düşündüğünüz ancak yapılamayan işler", tip: "textarea" },
            {
                id: "yeni_hizmetler", etiket: "5.3. Birimde yapılamayan fakat yarar görülen yeni hizmet / faaliyetler", tip: "tablo",
                minSatir: 1,
                sutunlar: [
                    { id: "hizmet", baslik: "Yeni Hizmet / Faaliyet", tip: "text" },
                    { id: "neden", baslik: "Nedeni", tip: "text" }
                ]
            },
            {
                id: "mevcut_kadro_isleri", etiket: "5.3. (devam) Yapılmaması gereken işler ve mevcutta hangi kadronun yaptığı", tip: "tablo",
                minSatir: 1,
                sutunlar: [
                    { id: "is", baslik: "Yapılmaması Gereken İş", tip: "text" },
                    { id: "neden", baslik: "Yapılma Nedeni", tip: "text" },
                    { id: "kadro", baslik: "Mevcutta Hangi Kadro Yapıyor", tip: "text" }
                ]
            },
            {
                id: "birim_yapilmamasi", etiket: "5.4. Birimde yapılan fakat yapılmaması gerektiğini düşündüğünüz hizmet / faaliyetler", tip: "tablo",
                minSatir: 1,
                sutunlar: [
                    { id: "hizmet", baslik: "Hizmet / Faaliyet Tanımı", tip: "text" },
                    { id: "neden", baslik: "Nedeni", tip: "text" }
                ]
            },
            {
                id: "koordinasyon", etiket: "5.5. Koordinasyon eksikliği yüzünden yapılamayan faaliyetler", tip: "tablo",
                minSatir: 1,
                sutunlar: [
                    { id: "faaliyet", baslik: "Faaliyet Tanımı", tip: "text" },
                    { id: "neden", baslik: "Koordine Olamama Nedeni", tip: "text" },
                    { id: "cozum", baslik: "Çözüm Önerisi", tip: "text" }
                ]
            },
            { id: "memnuniyet", etiket: "İş memnuniyet derecesi (1: memnun değilim – 5: çok memnunum)", tip: "secim", secenekler: ["1", "2", "3", "4", "5"] },
            { id: "kac_kisi", etiket: "Sizce bu işte kaç kişi çalışmalıdır? Gerekçesi", tip: "textarea" },
            { id: "personel_sikintisi", etiket: "Faaliyetlerde personel sıkıntısı çekiyor musunuz? Hangi faaliyet / kadro?", tip: "textarea" },
            { id: "eleman_yeterli_mi", etiket: "Eleman sayınız yeterli mi? Az iş çıkıyorsa sebebi", tip: "textarea" },
            { id: "verimlilik_onerileri", etiket: "Kurum faaliyetlerinin daha etkili, verimli, kaliteli ve az maliyetli olması için öneriler", tip: "textarea" },
            { id: "performans_artirma", etiket: "Faaliyet / çalışan performansını artırmak için öneriler", tip: "textarea" },
            { id: "iyilestirme_engelleri", etiket: "Faaliyetlerin iyileştirilmesini zorlaştıran engeller", tip: "textarea" },
            { id: "org_degisikligi", etiket: "5.13. Birim organizasyon şemasında değişiklik ihtiyacı var mı?", tip: "textarea" }
        ]
    },
    {
        id: "deneyim",
        baslik: "6. DENEYİM",
        sorular: [
            { id: "yeni_deneyim", etiket: "6.1. Pozisyona yeni başlayacak personelin sahip olması gereken deneyimler ve süresi", tip: "textarea" },
            { id: "yetkinlik_suresi", etiket: "6.2. Yeni atanan birinin tüm ana görevleri tam yapabilmesi için gereken deneyim ve iş başı eğitimi", tip: "textarea" }
        ]
    },
    {
        id: "gucluk_yaraticilik",
        baslik: "7. GÜÇLÜK VE YARATICILIK",
        sorular: [
            { id: "kompleks_ornekler", etiket: "7.1. Son 12 ayda karşılaştığınız kompleks görev / proje / problem örnekleri ve çözümde kullandığınız politika, prosedür, standartlar", tip: "textarea" },
            { id: "gelistirilen_metotlar", etiket: "7.2. İşi kolaylaştırmak için geliştirdiğiniz metot, prosedür, fikir ve teknikler", tip: "textarea" },
            { id: "politika_prosedur", etiket: "7.3. Bu pozisyonda gerekli politikalar, iç prosedürler veya yasalar", tip: "textarea" }
        ]
    },
    {
        id: "ic_dis_kontaklar",
        baslik: "8. İÇ VE DIŞ KONTAKLAR",
        sorular: [
            {
                id: "ic_kontaklar", etiket: "8.1. Firma içinde sürekli iletişimde olduğunuz kişiler (konu, sıklık)", tip: "tablo",
                minSatir: 1,
                sutunlar: [
                    { id: "kisi", baslik: "Kiminle", tip: "text" },
                    { id: "konu", baslik: "Görüşülecek Konu", tip: "text" },
                    { id: "siklik", baslik: "Sıklık", tip: "text" }
                ]
            },
            {
                id: "dis_kontaklar", etiket: "8.2. Firma dışında sürekli iletişimde olduğunuz kişiler (konu, sıklık)", tip: "tablo",
                minSatir: 1,
                sutunlar: [
                    { id: "kisi", baslik: "Kiminle", tip: "text" },
                    { id: "konu", baslik: "Görüşülecek Konu", tip: "text" },
                    { id: "siklik", baslik: "Sıklık", tip: "text" }
                ]
            },
            { id: "bilgi_gelis", etiket: "8.3. İhtiyaç duyduğunuz bilgiler size yeterli ve zamanında geliyor mu?", tip: "secim", secenekler: ["Evet", "Hayır"] },
            {
                id: "bilgi_problemleri", etiket: "8.3. (devam) Cevabınız hayır ise: nereden, hangi bilgi, problem ne?", tip: "tablo",
                minSatir: 1,
                sutunlar: [
                    { id: "nereden", baslik: "Nereden", tip: "text" },
                    { id: "bilgi", baslik: "Hangi Bilgi", tip: "text" },
                    { id: "problem", baslik: "Problem Ne?", tip: "text" }
                ]
            },
            {
                id: "etkilenenler", etiket: "8.4. Yanlış bir işinizden kimler / hangi bölümler nasıl etkilenir?", tip: "tablo",
                minSatir: 1,
                sutunlar: [
                    { id: "is", baslik: "İş", tip: "text" },
                    { id: "bolum", baslik: "Bölüm / Kişi", tip: "text" },
                    { id: "nasil", baslik: "Nasıl?", tip: "text" }
                ]
            }
        ]
    },
    {
        id: "liderlik",
        baslik: "9. LİDERLİK",
        sorular: [
            { id: "liderlik_var", etiket: "9.1. Size bağlı personel var mı?", tip: "secim", secenekler: ["Evet", "Hayır"] },
            { id: "yonetim_sorumlulugu", etiket: "9.2. Yönetim sorumluluğunuz (eğitim, koordinasyon, performans, disiplin, yetkiler)", tip: "textarea" },
            { id: "dogrudan_sayi", etiket: "9.3. Doğrudan raporlama yapan personel sayısı", tip: "text" },
            { id: "dolayli_sayi", etiket: "9.3. Dolaylı raporlama yapan personel sayısı", tip: "text" },
            {
                id: "personel_unvanlar", etiket: "9.4. Doğrudan yönettiğiniz personelin unvanları ve sayıları", tip: "tablo",
                minSatir: 1,
                sutunlar: [
                    { id: "unvan", baslik: "Görev / Pozisyon", tip: "text" },
                    { id: "sayi", baslik: "Eleman Sayısı", tip: "text" }
                ]
            }
        ]
    },
    {
        id: "gorev_harici",
        baslik: "10. GÖREVİNİZ HARİCİNDEKİ İŞLER",
        sorular: [
            { id: "harici_isler", etiket: "İş tanımınızda olmadığı halde yaptığınız işler", tip: "textarea" }
        ]
    },
    {
        id: "zor_yanlar",
        baslik: "11. İŞİNİZİN EN ZOR VE KARMAŞIK YANI",
        sorular: [
            {
                id: "zor_yanlar", etiket: "Konular ve niçin", tip: "tablo",
                minSatir: 2,
                sutunlar: [
                    { id: "konu", baslik: "Konu", tip: "text" },
                    { id: "neden", baslik: "Niçin?", tip: "text" }
                ]
            }
        ]
    },
    {
        id: "imza",
        baslik: "TARİH",
        sorular: [
            { id: "imza_tarih", etiket: "Tarih", tip: "text" }
        ]
    }
];
