# İş Analizi Odaklı Uygulama

IsAnaliziForm'un birebir dijital karşılığı: web formu + resmi Word şablonuna
birebir formatlı `.docx` çıktı.

Odak:

- İş analizi formu oluşturma (formdaki 12 bölümün tamamı)
- Kayıtları listeleme (taslak / tamamlandı)
- Soruları merkezi dosyadan yönetme (`js/questions.js`)
- Resmi şablona doldurulmuş `.docx` aktarma (Word butonu)
- JSON ile içe/dışa aktarma
- Verileri tarayıcıda `localStorage` ile saklama

## Word şablonu

- `IsAnaliziForm.doc`: Word'den gelen orijinal form (değiştirilmez referans).
- `assets/IsAnaliziForm-template.docx`: doldurulabilir şablon. `{{alan_adi}}`
  yer tutucuları içerir; uygulama bu dosyayı kayıt verisiyle doldurup `.docx`
  indirir. Biçim (tablolar, başlıklar, sayfa yapısı) orijinal formla aynıdır.
- Alan kimlikleri `js/questions.js` içindeki soru `id` alanlarıyla birebir
  eşleşir (`js/word-export.js` içindeki `wordVerisiniHazirla` bu eşlemeyi kurar).
- Tekrarlı tablolar (görevler, belgeler, kontaklar…) şablonda döngü satırıdır:
  web formunda istenildiği kadar satır eklenir, Word çıktısında tablo aynı
  sayıda satırla oluşur. Boş tablo tek boş satırla çıkar. Sabit tablolar
  (genel bilgiler, çaba, risk, matris, imza) formdaki gibidir.
- Tek sütunlu cevap kutularında (2.2, 4.1, 6.1, 7.1…) cevabın her satırı
  kutunun kendi çizgisine yazılır; kutu orijinal boyunda kalır, taşan
  cevapta büyür.
- Bazı işaretler koddan gelir: 8.3/9.1 Evet-Hayır, 9.3 sayıları ve form tarihi
  cevapsızsa orijinal `___` çizgisi kalır; 9.3 toplamı doğrudan + dolaylıdır;
  4.6.1 matrisi `ortam_faktor` listesinden (`ortam:faktor`) dolar.
- 2.1'de dakika girilir; yüzde aylık süreden hesaplanır (dakika × adet × ayda kaç
  kez, ay 4 hafta, haftada 5 gün 20 / 6 gün 24 gün). Sıklık metinden okunur
  ("2 haftada 1", "3 ayda"); okunamazsa görev hesap dışı kalır, hata verilmez.
- Şablon güncellenirse (ör. form değişirse): yeni `.doc` dosyasını Word ile
  `.docx` olarak `assets/IsAnaliziForm-template.docx` üzerine kaydedin ve
  yer tutucuları koruyun. Tablolar satır içi kalmalı
  (Tablo Özellikleri'nde "Metin Kaydırma: Yok"); kayan tablo sayfa bölemez.

## Analiz paneli

`admin.html`: görüşme panelinden ayrı, yerelden toplu JSON yükleyip inceleme
sayfası (görüşme ekranından bağlantı verilmez). JSON dosyaları, klasör ya da
sürükle-bırak ile eklenir; aynı kayıt tekrar gelirse en güncel hali kalır.
Sekmeler: Kişiler (filtre, aramada eşleşen cümle, sıralama, detay, Word),
Soru Bazlı (cevap dağılımı, çubuğa tıklayıp süzme), Görev Havuzu (benzer
görevler birleşik, aylık iş yükü), Karşılaştırma (departman / bölüm / ünvan /
görüşmeci / vardiya bazında), Raporlama Ağacı (üst amir cevaplarından) ve Veri
Kalitesi (boş sorular, hesaplanamayan görevler, eksik bilgiler). Her görünüm
CSV'ye, filtrelenen kişilerin tüm cevapları Excel'e (.xlsx, tablolar ayrı
sayfada) aktarılır. Veriler tarayıcının IndexedDB'sinde ayrı bir depoda
(`is_analizi_analiz`) tutulur; görüşme kayıtlarına yazılmaz.

## Çalıştırma

Statik dosyalar yeterlidir, örn. proje klasöründe:

```sh
python -m http.server 8001
```

Ardından `http://localhost:8001/` adresini açın.
