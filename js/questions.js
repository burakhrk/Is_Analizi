const IS_ANALIZI_SORULARI = [
    {
        id: "genel_bilgiler",
        baslik: "Genel Bilgiler",
        sorular: [
            { id: "ust_amir_ismi", etiket: "Üst amirinin ismi", tip: "text" },
            { id: "ust_amir_pozisyonu", etiket: "Üst amirinin pozisyonu", tip: "text" },
            { id: "ust_amir_bolum", etiket: "Üst amirin bölümü", tip: "text" },
            { id: "ust_amir_departman", etiket: "Üst amirin departmanı", tip: "text" },
            { id: "diger_raporlama", etiket: "Bağlı olduğunuz amir dışında raporlama yaptığınız veya iş talimatı aldığınız kişi ve pozisyonlar", tip: "liste", yerTutucu: "Kişi - Pozisyon" },
            { id: "mevcut_pozisyon_suresi", etiket: "Mevcut pozisyonunuzdaki çalışma süreniz", tip: "text" },
            { id: "ayni_unvanda_calisan_sayisi", etiket: "Biriminizde aynı iş / görev unvanında çalışan sayısı", tip: "text" },
            { id: "fazla_mesai_suresi_sikligi", etiket: "Fazla mesai varsa süresi ve sıklığı", tip: "textarea" },
            { id: "nobet_sistemi", etiket: "Nöbet sistemi varsa süresi ve sıklığı", tip: "textarea" },
            { id: "vekalet_eden_unvanlar", etiket: "Size vekâlet eden iş unvanı / unvanları", tip: "liste" },
            { id: "vekalet_edilen_unvanlar", etiket: "Sizin vekâlet ettiğiniz iş unvanı / unvanları", tip: "liste" }
        ]
    },
    {
        id: "pozisyon_ozeti",
        baslik: "Pozisyon Özeti",
        sorular: [
            { id: "rol_amaci", etiket: "Bir iki cümle ile görevinizin genel amacını açıklayınız", tip: "textarea", zorunlu: true },
            { id: "gorev_sorumluluk_onem", etiket: "Pozisyonunuzun getirdiği görev ve sorumlulukları önem derecesine göre sıralayınız ve açıklayınız", tip: "liste", yerTutucu: "Görev - harcanan zaman yüzdesi - sürekli/ara sıra - sıklık - adet" },
            { id: "mevcut_yetkiler", etiket: "Bu pozisyona dair görevlerinizi gerçekleştirirken size verilen mevcut yetkiler nelerdir?", tip: "textarea" },
            { id: "olmasi_gereken_yetkiler", etiket: "Görevleri daha iyi yapabilmek için mevcut yetki ve sorumluluklar dışında hangi yetki ve sorumluluklar olmalıdır?", tip: "textarea" },
            { id: "girdiler_birimler", etiket: "Bu faaliyetleri yapmak için hangi girdiler gerekmektedir ve bunları hangi birim / bölüm sağlamaktadır?", tip: "textarea" },
            { id: "ciktilar_nereye_gider", etiket: "Bu faaliyetler sonunda hangi çıktılar üretilmektedir ve bunlar nereye gider?", tip: "textarea" },
            { id: "kullanilan_sistemler", etiket: "Faaliyetleri gerçekleştirirken hangi sistemler kullanılmaktadır?", tip: "liste", yerTutucu: "Örn. ERP, Excel, e-posta, üretim takip sistemi" },
            { id: "kullanilan_girdiler", etiket: "Faaliyetlerinizi gerçekleştirmek için kullandığınız girdiler nelerdir? (hammadde, bilgi, hedef, malzeme, insan vb.)", tip: "textarea" },
            { id: "performans_olcumu_var_mi", etiket: "Faaliyet sonuçlarınızı hedefe ulaşma açısından ölçüyor musunuz?", tip: "secim", secenekler: ["Evet", "Hayır", "Kısmen"] },
            { id: "mevcut_performans", etiket: "Faaliyetlerinizin mevcut performansı nedir?", tip: "textarea" },
            { id: "performans_gostergeleri", etiket: "Hangi göstergelerle ölçüyorsunuz? (miktar, sayı, oran, maliyet vb.)", tip: "textarea" }
        ]
    },
    {
        id: "dokuman_kontrol",
        baslik: "Dokümanlar ve Kontroller",
        sorular: [
            { id: "hazirlanan_kontrol_edilen_dokumanlar", etiket: "İşle ilgili hazırlanan, kontrol edilen veya onaylanan form, doküman ve raporlar nelerdir?", tip: "textarea" },
            { id: "gelen_belgeler_talimatlar", etiket: "Gelen belgeler ve sözlü talimatlar nelerdir? Geldiği bölüm, yapılan işlem, sıklık ve harcanan süreyi belirtiniz", tip: "liste", yerTutucu: "Belge/talimat - geldiği bölüm - işlem - sıklık - süre" },
            { id: "giden_belgeler_talimatlar", etiket: "Giden belgeler ve sözlü talimatlar nelerdir? Gönderildiği yer, amaç, sıklık ve harcanan süreyi belirtiniz", tip: "liste", yerTutucu: "Belge - gönderildiği yer/amaç - sıklık - süre" },
            { id: "is_esnasi_kontroller", etiket: "İş esnasında sizin tarafınızdan yapılan kontroller nelerdir ve hangi sıklıkta yapılır?", tip: "liste", yerTutucu: "Kontrol/onay türü - sıklık - süre" },
            { id: "agirlikli_caba", etiket: "Yapılan işin gerektirdiği ağırlıklı çaba ne kadardır? Zihinsel ve fiziksel çaba yüzdelerini açıklayınız", tip: "textarea" },
            { id: "is_nasil_kontrol_ediliyor", etiket: "Yaptığınız işler nasıl ve kim tarafından kontrol ediliyor ya da onaylanıyor?", tip: "liste", yerTutucu: "Yapılan iş - kontrol amacı - kontrol eden/onaylayan - kontrol/paraf/imza/makam onay" },
            { id: "is_yapanin_yetkileri", etiket: "İş yapanın yetkileri nelerdir?", tip: "liste", yerTutucu: "Örn. iş verme, kontrol etme, vekâlet etme, izin verme, harcama, satın alma, imzalama" }
        ]
    },
    {
        id: "bilgi_beceri",
        baslik: "Bilgi ve Beceri",
        sorular: [
            { id: "egitim", etiket: "Bu pozisyon için gerekli özel eğitim düzeyi nedir?", tip: "textarea" },
            { id: "lisans_sertifikalar", etiket: "Bu pozisyonun iyi şekilde doldurulması için gerekli lisans veya sertifikalar nelerdir?", tip: "liste" },
            { id: "diger_bilgi_beceri", etiket: "Görevleri yerine getirmek için gerekli diğer bilgi, beceri veya kabiliyetler nelerdir?", tip: "textarea" },
            { id: "araclar", etiket: "Bu görevde kullanılması gereken makine, teçhizat, ofis ekipmanı vb. nelerdir?", tip: "liste", yerTutucu: "Örn. bilgisayar, ERP, forklift, ölçüm cihazı" },
            { id: "calisma_yeri_yuzdeleri", etiket: "Çalışmalar nerede yapılmaktadır? Ofis masa başı, ofis bölümler arası ve mobil çalışma yüzdelerini yazınız", tip: "textarea" },
            { id: "oturma_duzeni", etiket: "Çalışma yerinizdeki oturma düzeni işinizi kolaylaştırıyor mu? Hayır ise önerileriniz nelerdir?", tip: "textarea" },
            { id: "fiziksel_ortam", etiket: "Yapılan iş hangi fiziksel ortamda gerçekleşmektedir?", tip: "liste", yerTutucu: "Örn. büro, atölye, dış ortam, laboratuvar, depo, bilgisayar" },
            { id: "sosyal_sorunlar", etiket: "Çalışma ortamında yaşadığınız sosyal sorunlar var mı?", tip: "textarea" },
            { id: "ortam_faktorleri", etiket: "Çalışma ortamında maruz kalınan faktörler nelerdir?", tip: "liste", yerTutucu: "Örn. gürültü, aydınlatma, sıcak, soğuk, nem, toz, koku, ergonomi, havalandırma, kimyasal" },
            { id: "is_riskleri", etiket: "İş kazası, trafik kazası veya meslek hastalığı riski var mı? Şiddet ve sıklığını belirtiniz", tip: "textarea" },
            { id: "gizli_bilgiler", etiket: "İşinizle ilgili gizlenmesi gereken bilgiler varsa konusu, kullanım sıklığı ve açığa çıkmasının sakıncaları nelerdir?", tip: "textarea" },
            { id: "olasi_hatalar", etiket: "Çalışma sırasında yapılabilecek hatalar nelerdir, kim fark etmelidir ve ne tür zararlara yol açabilir?", tip: "textarea" },
            { id: "verimlilik_onerileri_birim", etiket: "Biriminizde faaliyetlerin daha etkili, verimli, kaliteli ve daha az maliyetle yapılması için önerileriniz nelerdir?", tip: "textarea" },
            { id: "seyahat", etiket: "Göreviniz gereği seyahat ediyorsanız amacı ve sıklığı nedir?", tip: "textarea" },
            { id: "aciklanmasinda_yarar_var", etiket: "İşinizle ilgili açıklanmasında yarar gördüğünüz konular nelerdir?", tip: "textarea" }
        ]
    },
    {
        id: "isin_analizi",
        baslik: "İşin Analizi",
        sorular: [
            { id: "yapilmamasi_gereken_isler", etiket: "Sizin tarafınızdan yerine getirilen ancak yapılmaması gerektiğini düşündüğünüz işler var mı? Nedenini ve hangi kadro tarafından yapılması gerektiğini belirtiniz", tip: "liste", yerTutucu: "İş - yapılma nedeni - hangi kadro yapmalı" },
            { id: "yapilmasi_gereken_yapilamayan_isler", etiket: "Sizin tarafınızdan yapılması gerektiğini düşündüğünüz ancak yapılamayan işler var mı? Nedenini ve hangi kadro tarafından yapılması gerektiğini belirtiniz", tip: "textarea" },
            { id: "yeni_hizmet_faaliyetler", etiket: "Biriminizde yapılamayan fakat yapılmasında yarar gördüğünüz yeni hizmet veya faaliyetler var mı?", tip: "liste", yerTutucu: "Yeni hizmet/faaliyet - nedeni" },
            { id: "birimde_yapilmamasi_gereken_faaliyetler", etiket: "Biriminizde yapılan fakat yapılmaması gerektiğini düşündüğünüz hizmet ve faaliyetler nelerdir?", tip: "liste", yerTutucu: "Hizmet/faaliyet - nedeni - mevcutta hangi kadro yapıyor" },
            { id: "koordinasyon_eksigi_faaliyetler", etiket: "Uygun koordinasyon sağlanamadığı için yapılması gerektiği halde yapılamayan faaliyetler var mı?", tip: "liste", yerTutucu: "Faaliyet - koordine olamama nedeni - çözüm önerisi" },
            { id: "memnuniyet_derecesi", etiket: "Yaptığınız işle ilgili memnuniyet dereceniz nedir?", tip: "secim", secenekler: ["1 - Memnun değilim", "2", "3", "4", "5 - Çok memnunum"] },
            { id: "bu_iste_kac_kisi", etiket: "Sizce bu işte kaç kişi çalışmalıdır? Gerekçesini yazınız", tip: "textarea" },
            { id: "personel_sikintisi", etiket: "Faaliyetlerin yapılmasında personel sıkıntısı çekiyor musunuz? Hangi faaliyetlerde ve kadro unvanlarında?", tip: "textarea" },
            { id: "eleman_sayisi_yeterli_mi", etiket: "Eleman sayınız yeterli mi? Yeterli olduğu halde az iş çıktığına inanıyorsanız sebebi nedir?", tip: "textarea" },
            { id: "genel_verimlilik_onerileri", etiket: "Kurum faaliyetlerinin daha etkili, verimli, kaliteli ve daha az maliyetle yapılması için önerileriniz var mı?", tip: "textarea" },
            { id: "performans_artirma_onerileri", etiket: "Faaliyetlerinizin veya çalışanlarınızın performansını artırmak için önerileriniz nelerdir?", tip: "textarea" },
            { id: "iyilestirme_engelleri", etiket: "Faaliyetlerinizin iyileştirilmesini zorlaştıran engeller var mı?", tip: "textarea" },
            { id: "organizasyon_semasi_degisikligi", etiket: "Faaliyetlerin daha etkili ve verimli olması için birim organizasyon şemanızda değişikliğe ihtiyaç var mı?", tip: "textarea" }
        ]
    },
    {
        id: "deneyim",
        baslik: "Deneyim",
        sorular: [
            { id: "yeni_baslayan_deneyim", etiket: "Bu pozisyona yeni başlayacak personelin sahip olması gereken deneyimler ve deneyim süresi ne olmalıdır?", tip: "textarea" },
            { id: "tam_yetkinlik_suresi", etiket: "Yeni atanan birinin tüm ana görevleri tam yapabilmesi için ne kadarlık deneyime ve iş başı eğitimine ihtiyaç vardır?", tip: "textarea" }
        ]
    },
    {
        id: "gucluk_yaraticilik",
        baslik: "Güçlük ve Yaratıcılık",
        sorular: [
            { id: "kompleks_problem_ornekleri", etiket: "Son 12 ayda karşılaştığınız kompleks görev, proje veya problemlere örnek veriniz; çözümde kullandığınız politika, prosedür, standart veya yöntemleri açıklayınız", tip: "textarea" },
            { id: "gelistirilen_metotlar", etiket: "İşi kolaylaştırmak için geliştirdiğiniz metotlar, prosedürler, fikirler ve teknikler nelerdir?", tip: "textarea" },
            { id: "gerekli_politika_prosedur_yasa", etiket: "Bu pozisyonda gerekli olan politikalar, iç prosedürler veya yasalar nelerdir?", tip: "textarea" }
        ]
    },
    {
        id: "ic_dis_kontaklar",
        baslik: "İç ve Dış Kontaklar",
        sorular: [
            { id: "ic_kontaklar", etiket: "Firma içerisinde sürekli iletişim içinde bulunduğunuz kişiler kimlerdir? Konu ve sıklığı belirtiniz", tip: "liste", yerTutucu: "Kiminle - görüşülecek konu - sıklık" },
            { id: "dis_kontaklar", etiket: "Firma dışında sürekli iletişim içinde bulunduğunuz kişiler kimlerdir? Konu ve sıklığı belirtiniz", tip: "liste", yerTutucu: "Kiminle - görüşülecek konu - sıklık" },
            { id: "bilgi_gelisi_yeterli_mi", etiket: "İhtiyaç duyduğunuz bilgilerin gelişi yeterli ve zamanında mı?", tip: "secim", secenekler: ["Evet", "Hayır", "Kısmen"] },
            { id: "bilgi_gelis_problemleri", etiket: "Cevabınız hayır veya kısmen ise nereden, hangi bilgi ve problem nedir?", tip: "liste", yerTutucu: "Nereden - hangi bilgi - problem" },
            { id: "yanlis_isten_etkilenenler", etiket: "Yaptığınız yanlış bir işten kimler veya hangi bölümler etkilenir?", tip: "liste", yerTutucu: "İş - bölüm/kişi - nasıl etkilenir" }
        ]
    },
    {
        id: "liderlik",
        baslik: "Liderlik",
        sorular: [
            { id: "bagli_personel_var_mi", etiket: "Size bağlı personel bulunmakta mıdır?", tip: "secim", secenekler: ["Evet", "Hayır"] },
            { id: "yonetim_sorumlulugu", etiket: "Diğer kişileri yönetirken sorumluluğunuzu özetleyiniz; eğitim, koordinasyon, performans, disiplin ve yetkileri belirtiniz", tip: "textarea" },
            { id: "bagli_personel_sayisi", etiket: "Bağlı personel sayısı kaç kişidir? Doğrudan ve dolaylı raporlama yapanları ayırarak yazınız", tip: "textarea" }
        ]
    }
];
