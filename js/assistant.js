// Asistan: bölüm bazında yazım + tutarlılık + zenginleştirme önerileri (BYOK).
// form.js ile aynı global alanı paylaşır; çakışmamak için tamamı IIFE içindedir.
(function () {
    "use strict";

    var MASKELENECEK_ALANLAR = ["personel_ismi", "ust_amir_ismi"];

    function esc(s) {
        return String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
    }

    function kisaDeger(v) {
        if (v == null) return "";
        if (Array.isArray(v)) {
            return v.map(function (satir) {
                return (satir && typeof satir === "object") ? Object.values(satir).flat().join(" | ") : String(satir);
            }).join("\n").slice(0, 600);
        }
        return String(v).slice(0, 600);
    }

    // ---- isim maskeleme (KVKK dostu mod) ----
    function maskeHaritasi() {
        var harita = [];
        try {
            MASKELENECEK_ALANLAR.forEach(function (id, i) {
                var soru = soruyuBul(id);
                if (!soru) return;
                var v = (typeof cevapOku === "function") ? String(cevapOku(soru) || "").trim() : "";
                if (v) harita.push({ gercek: v, maske: "[KİŞİ-" + (i + 1) + "]" });
            });
        } catch (e) { /* form hazır değilse maskesiz devam */ }
        return harita;
    }

    function maskele(metin, harita) {
        var out = String(metin ?? "");
        harita.forEach(function (m) { out = out.split(m.gercek).join(m.maske); });
        return out;
    }

    function maskeyiCoz(metin, harita) {
        var out = String(metin ?? "");
        harita.forEach(function (m) { out = out.split(m.maske).join(m.gercek); });
        return out;
    }

    // ---- prompt ----
    function bolumVerisiniTopla(bolum, harita, anonim) {
        return bolum.sorular.map(function (soru) {
            var v = "";
            try { v = cevapOku(soru); } catch (e) { v = ""; }
            var metin = kisaDeger(v);
            return { id: soru.id, etiket: soru.etiket, tip: soru.tip, cevap: anonim ? maskele(metin, harita) : metin };
        }).filter(function (s) { return s.cevap && s.cevap.trim(); });
    }

    function mesajlariKur(bolum, alanlar) {
        var sistem = "Sen Türkçe yazan bir iş analizi editörüsün. " +
            "Görevin: yazım/dilbilgisi hataları, tutarsızlıklar (örn. yüzdeler toplamı, boş detaylar) ve " +
            "cevap zenginleştirme önerileri üretmek. SADECE geçerli JSON döndür, başka metin yazma.";
        var kullanici = "Bölüm: " + bolum.baslik + "\n" +
            "Alanlar (id | etiket | tip | cevap):\n" +
            alanlar.map(function (a) { return "- " + a.id + " | " + a.etiket + " | " + a.tip + " | " + a.cevap; }).join("\n") +
            "\n\nŞu formatta döndür:\n" +
            '{"oneriler":[{"soruId":"alan_id","tur":"yazim|tutarlilik|zenginlestirme","mevcut":"...","oneri":"...","gerekce":"kısa gerekçe"}]}' +
            "\nKurallar: en fazla 8 öneri; cevabı boş alanlara öneri üretme; tablo/liste alanlarında oneri = düzeltilmiş metin önerisi olsun, soruId tablonun id'si olsun.";
        return [{ role: "system", content: sistem }, { role: "user", content: kullanici }];
    }

    // ---- sonuç çizimi ----
    function sonucKutusu(bolumId) {
        var section = document.querySelector('[data-bolum="' + bolumId + '"]');
        if (!section) return null;
        var kutu = section.querySelector(".asistan-sonuc");
        if (!kutu) {
            kutu = document.createElement("div");
            kutu.className = "asistan-sonuc";
            section.appendChild(kutu);
        }
        return kutu;
    }

    function uygulanabilirMi(soruId) {
        var soru = null;
        try { soru = soruyuBul(soruId); } catch (e) { return false; }
        return !!soru && (soru.tip === "text" || soru.tip === "textarea" || soru.tip === "secim");
    }

    function sonuclariCiz(bolumId, oneriler, harita) {
        var kutu = sonucKutusu(bolumId);
        if (!kutu) return;
        if (!oneriler.length) {
            kutu.innerHTML = '<div class="asistan-bilgi">Bu bölüm temiz görünüyor — öneri yok. ✅</div>';
            return;
        }
        kutu.innerHTML = '<div class="asistan-baslik">Asistan önerileri (' + oneriler.length + ')</div>' + oneriler.map(function (o, i) {
            var uygulanabilir = uygulanabilirMi(o.soruId);
            return '<div class="oneri-karti" data-oneri="' + i + '">' +
                '<span class="oneri-tur">' + esc(o.tur || "öneri") + '</span>' +
                '<div class="oneri-alan">Alan: <code>' + esc(o.soruId || "-") + '</code></div>' +
                (o.mevcut ? '<div class="oneri-mevcut">Mevcut: ' + esc(String(o.mevcut).slice(0, 300)) + '</div>' : "") +
                '<div class="oneri-metin">' + esc(o.oneri || "") + '</div>' +
                (o.gerekce ? '<div class="oneri-gerekce">' + esc(o.gerekce) + '</div>' : "") +
                '<div class="oneri-islemler">' +
                (uygulanabilir ? '<button type="button" class="button primary small" data-uygula="' + i + '">Uygula</button>' : "") +
                '<button type="button" class="button ghost small" data-kopyala="' + i + '">Kopyala</button>' +
                "</div></div>";
        }).join("");
        kutu.dataset.harita = JSON.stringify(harita);
        kutu.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    function hatayiCiz(bolumId, mesaj) {
        var kutu = sonucKutusu(bolumId);
        if (kutu) kutu.innerHTML = '<div class="asistan-hata">Asistan hatası: ' + esc(mesaj) + "</div>";
    }

    // ---- öneri akışı ----
    async function oneriAl(bolumId, dugme) {
        var bolum = (typeof IS_ANALIZI_SORULARI !== "undefined")
            ? IS_ANALIZI_SORULARI.find(function (b) { return b.id === bolumId; }) : null;
        if (!bolum) return;
        if (!window.LlmIstemci || !LlmIstemci.anahtarVar()) {
            ayarModaliniAc("Önce API anahtarınızı girin.");
            return;
        }
        var ayar = LlmIstemci.ayarGetir();
        var harita = ayar.anonim ? maskeHaritasi() : [];
        var alanlar = bolumVerisiniTopla(bolum, harita, ayar.anonim);
        if (!alanlar.length) {
            hatayiCiz(bolumId, "Bu bölümde doldurulmuş alan yok.");
            return;
        }
        var eski = dugme ? dugme.textContent : "";
        if (dugme) { dugme.disabled = true; dugme.textContent = "Düşünüyor…"; }
        try {
            var metin = await LlmIstemci.sohbet(mesajlariKur(bolum, alanlar), true);
            var veri = LlmIstemci.jsonAyikla(metin);
            var liste = Array.isArray(veri.oneriler) ? veri.oneriler : [];
            sonuclariCiz(bolumId, liste.slice(0, 8), harita);
            durumGuncelle();
        } catch (e) {
            hatayiCiz(bolumId, e.message || "Bilinmeyen hata.");
        } finally {
            if (dugme) { dugme.disabled = false; dugme.textContent = eski || "✨ Öneri Al"; }
        }
    }

    function uygula(bolumId, index) {
        var kutu = sonucKutusu(bolumId);
        if (!kutu) return;
        // Öneri metnini DOM'dan değil, son çizimdeki listeden okumak için kutuda saklamıyoruz;
        // karttaki metni kullanıyoruz (maske çözülür).
        var kart = kutu.querySelector('[data-oneri="' + index + '"]');
        if (!kart) return;
        var harita = [];
        try { harita = JSON.parse(kutu.dataset.harita || "[]"); } catch (e) { harita = []; }
        var alanKod = (kart.querySelector("code") || {}).textContent || "";
        var oneriMetni = ((kart.querySelector(".oneri-metin") || {}).textContent || "").trim();
        oneriMetni = maskeyiCoz(oneriMetni, harita);
        var sarmal = document.querySelector('[data-soru="' + alanKod + '"]');
        if (!sarmal) return;
        var girdi = sarmal.querySelector("input.input, textarea.input, select.input");
        if (!girdi) return;
        girdi.value = oneriMetni;
        girdi.dispatchEvent(new Event("input", { bubbles: true }));
        girdi.dispatchEvent(new Event("change", { bubbles: true }));
        try { if (typeof ilerlemeHesapla === "function") ilerlemeHesapla(); } catch (e) { /* yoksay */ }
        kart.classList.add("uygulandi");
    }

    // ---- bölüm butonları ----
    function bolumButonlariniEkle() {
        document.querySelectorAll("#questionSections .panel-header").forEach(function (baslik) {
            if (baslik.querySelector("[data-asistan-btn]")) return;
            var section = baslik.closest("[data-bolum]");
            if (!section) return;
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "button ghost small";
            btn.dataset.asistanBtn = section.dataset.bolum;
            btn.textContent = "✨ Öneri Al";
            btn.title = "Bu bölüm için yazım + tutarlılık önerileri al";
            btn.addEventListener("click", function (ev) {
                ev.stopPropagation();
                oneriAl(section.dataset.bolum, btn);
            });
            var chev = baslik.querySelector(".chev");
            baslik.insertBefore(btn, chev || null);
        });
    }

    // ---- sidebar + modal ----
    function durumGuncelle() {
        var el = document.getElementById("asistanDurum");
        if (!el || !window.LlmIstemci) return;
        if (!LlmIstemci.anahtarVar()) { el.textContent = "Anahtar girilmedi"; return; }
        var k = LlmIstemci.kotaDurumu();
        el.textContent = "Hazır • bugün kalan " + k.kalan + "/" + k.limit;
    }

    function modelSecenekleriniDoldur(saglayici, seciliModel) {
        var sel = document.getElementById("llmModel");
        if (!sel) return;
        var cfg = LlmIstemci.SAGLAYICILAR[saglayici];
        sel.innerHTML = cfg.modeller.map(function (m) {
            return '<option value="' + esc(m) + '">' + esc(m) + "</option>";
        }).join("");
        sel.value = cfg.modeller.includes(seciliModel) ? seciliModel : cfg.varsayilanModel;
    }

    function ayarModaliniAc(mesaj) {
        var modal = document.getElementById("llmAyarModal");
        if (!modal) return;
        var a = LlmIstemci.ayarGetir();
        document.getElementById("llmSaglayici").value = a.saglayici;
        modelSecenekleriniDoldur(a.saglayici, a.model);
        document.getElementById("llmAnahtar").value = a.apiKey;
        document.getElementById("llmAnonim").checked = a.anonim !== false;
        document.getElementById("llmLimit").value = a.limit;
        var m = document.getElementById("llmAyarMesaj");
        if (m) { m.textContent = mesaj || ""; m.className = "modal-mesaj"; }
        modal.classList.remove("hidden");
    }

    function ayarModaliniKapat() {
        var modal = document.getElementById("llmAyarModal");
        if (modal) modal.classList.add("hidden");
    }

    function modalOlaylari() {
        document.querySelectorAll(".asistan-ayar-ac").forEach(function (btn) {
            btn.addEventListener("click", function () { ayarModaliniAc(""); });
        });

        var kapat = document.getElementById("llmKapatBtn");
        if (kapat) kapat.addEventListener("click", ayarModaliniKapat);

        var modal = document.getElementById("llmAyarModal");
        if (modal) modal.addEventListener("click", function (e) { if (e.target === modal) ayarModaliniKapat(); });

        var sag = document.getElementById("llmSaglayici");
        if (sag) sag.addEventListener("change", function () {
            modelSecenekleriniDoldur(sag.value, "");
        });

        var kaydet = document.getElementById("llmKaydetBtn");
        if (kaydet) kaydet.addEventListener("click", function () {
            var a = {
                saglayici: document.getElementById("llmSaglayici").value,
                model: document.getElementById("llmModel").value,
                apiKey: document.getElementById("llmAnahtar").value.trim(),
                anonim: document.getElementById("llmAnonim").checked,
                limit: parseInt(document.getElementById("llmLimit").value, 10) || 20
            };
            if (!LlmIstemci.SAGLAYICILAR[a.saglayici]) { return; }
            LlmIstemci.ayarKaydet(a);
            var m = document.getElementById("llmAyarMesaj");
            if (m) { m.textContent = "Kaydedildi ✓"; m.className = "modal-mesaj ok"; }
            durumGuncelle();
            setTimeout(ayarModaliniKapat, 450);
        });

        var temizle = document.getElementById("llmTemizleBtn");
        if (temizle) temizle.addEventListener("click", function () {
            LlmIstemci.anahtariSil();
            document.getElementById("llmAnahtar").value = "";
            var m = document.getElementById("llmAyarMesaj");
            if (m) { m.textContent = "Anahtar silindi."; m.className = "modal-mesaj"; }
            durumGuncelle();
        });

        var test = document.getElementById("llmTestBtn");
        if (test) test.addEventListener("click", async function () {
            var m = document.getElementById("llmAyarMesaj");
            test.disabled = true;
            if (m) { m.textContent = "Test ediliyor…"; m.className = "modal-mesaj"; }
            try {
                // Önce ekrandaki değerlerle geçici test (kaydetmeden)
                var gecici = {
                    saglayici: document.getElementById("llmSaglayici").value,
                    model: document.getElementById("llmModel").value,
                    apiKey: document.getElementById("llmAnahtar").value.trim(),
                    anonim: document.getElementById("llmAnonim").checked,
                    limit: parseInt(document.getElementById("llmLimit").value, 10) || 20
                };
                var mevcut = LlmIstemci.ayarGetir();
                LlmIstemci.ayarKaydet(gecici);
                try {
                    await LlmIstemci.baglantiTest();
                    if (m) { m.textContent = "Bağlantı başarılı. ✅"; m.className = "modal-mesaj ok"; }
                } finally {
                    // Anahtarı test için yazdıysak ve kullanıcı kaydetmediyse eski ayara dönmüyoruz;
                    // test başarılıysa ayar kalır, başarısızsa eski ayara dön.
                    if (m && m.textContent.indexOf("başarılı") === -1) LlmIstemci.ayarKaydet(mevcut);
                }
            } catch (e) {
                if (m) { m.textContent = "Test başarısız: " + (e.message || e); m.className = "modal-mesaj hata"; }
            } finally {
                test.disabled = false;
                durumGuncelle();
            }
        });

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") ayarModaliniKapat();
        });
    }

    function sonucTiklamalari() {
        var govde = document.getElementById("questionSections");
        if (!govde) return;
        govde.addEventListener("click", function (e) {
            var uygulaBtn = e.target.closest("[data-uygula]");
            var section = e.target.closest("[data-bolum]");
            if (!section) return;
            if (uygulaBtn) {
                uygula(section.dataset.bolum, uygulaBtn.dataset.uygula);
                return;
            }
            var kopyalaBtn = e.target.closest("[data-kopyala]");
            if (kopyalaBtn) {
                var kart = kopyalaBtn.closest("[data-oneri]");
                var metin = kart ? ((kart.querySelector(".oneri-metin") || {}).textContent || "") : "";
                if (navigator.clipboard) navigator.clipboard.writeText(metin).catch(function () { /* yoksay */ });
                kopyalaBtn.textContent = "Kopyalandı ✓";
                setTimeout(function () { kopyalaBtn.textContent = "Kopyala"; }, 1500);
            }
        });
    }

    // form.js soruları senkron çizer; asistan sonradan takılır.
    bolumButonlariniEkle();
    modalOlaylari();
    sonucTiklamalari();
    durumGuncelle();
})();
