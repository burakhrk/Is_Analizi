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
- Şablon güncellenirse (ör. form değişirse): yeni `.doc` dosyasını Word ile
  `.docx` olarak `assets/IsAnaliziForm-template.docx` üzerine kaydedin ve
  yer tutucuları koruyun. Görev ve sorumluluklar tablosu satır içi kalmalı
  (Tablo Özellikleri'nde "Metin Kaydırma: Yok"); kayan tablo sayfa bölemez.

## Çalıştırma

Statik dosyalar yeterlidir, örn. proje klasöründe:

```sh
python -m http.server 8001
```

Ardından `http://localhost:8001/` adresini açın.
