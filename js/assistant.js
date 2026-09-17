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
            '{"oneriler":[{"soruId":"tablo_id","satirNo":2,"tur":"yazim|tutarlilik|zenginlestirme","mevcut":"...","oneri":"...","gerekce":"kısa gerekçe"}]}' +
            "\nKurallar: en fazla 8 öneri; cevabı boş alanlara öneri üretme; oneri = düzeltilmiş metin önerisi olsun, soruId tablonun id'si olsun; " +
            "satirNo = önerinin ilgili olduğu satırın tablodaki 1'den başlayan sırası (satır belli değilse 0).";
        return [{ role: "system", content: sistem }, { role: "user", content: kullanici }];
    }

    // ---- sonuç çizimi ----
    function sonucKutusu(bolumId) {
        var section = document.querySelector('[data-bolum="' + bolumId + '"]');
        if (!section) return null;
        var kutu = section.querySelector(".asistan-sonuc:not(.tablo-alti)");
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

    // Tablo önerileri ilgili tablonun hemen altına; eşleşmeyenler bölüm kutusuna.
    function tabloSonucCiz(tabloSarmal, soruId, liste, harita) {
        var eski = tabloSarmal.parentElement
            ? tabloSarmal.parentElement.querySelector('.asistan-sonuc.tablo-alti[data-tablo-kutu="' + soruId + '"]')
            : null;
        if (eski) eski.remove();
        var kutu = document.createElement("div");
        kutu.className = "asistan-sonuc tablo-alti";
        kutu.dataset.tabloKutu = soruId;
        kutu.dataset.harita = JSON.stringify(harita);
        kutu.innerHTML = '<div class="asistan-baslik">Tablo önerileri (' + liste.length + ")</div>" + liste.map(function (o, i) {
            var satirNo = parseInt(o.satirNo, 10) || 0;
            return '<div class="oneri-karti" data-oneri="' + i + '">' +
                '<span class="oneri-tur">' + esc(o.tur || "öneri") + "</span>" +
                (satirNo > 0 ? '<span class="oneri-satir">Satır ' + satirNo + "</span>" : "") +
                (o.mevcut ? '<div class="oneri-mevcut">' + esc(String(o.mevcut).slice(0, 300)) + "</div>" : "") +
                '<div class="oneri-metin">' + esc(o.oneri || "") + "</div>" +
                (o.gerekce ? '<div class="oneri-gerekce">' + esc(o.gerekce) + "</div>" : "") +
                '<div class="oneri-islemler">' +
                (satirNo > 0 ? '<button type="button" class="button secondary small" data-satir-git="' + satirNo + '" data-tablo-id="' + esc(soruId) + '">Satıra git</button>' : "") +
                '<button type="button" class="button ghost small" data-kopyala="' + i + '">Kopyala</button>' +
                '<button type="button" class="button ghost small" data-detaylandir>Detaylandır</button>' +
                "</div></div>";
        }).join("");
        if (tabloSarmal.after) tabloSarmal.after(kutu);
        else tabloSarmal.parentElement.appendChild(kutu);
        kutu.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    function satiriVurgula(tabloId, satirNo) {
        var satir = document.querySelector('[data-tablo="' + tabloId + '"] tbody tr:nth-child(' + satirNo + ")");
        if (!satir) return;
        satir.scrollIntoView({ block: "center", behavior: "smooth" });
        satir.classList.add("satir-vurgu");
        setTimeout(function () { satir.classList.remove("satir-vurgu"); }, 1800);
    }

    function sonuclariCiz(bolumId, oneriler, harita) {
        var section = document.querySelector('[data-bolum="' + bolumId + '"]');
        if (!section) return;
        // Eski kutuları temizle (bölüm altı + tablo altları)
        section.querySelectorAll(".asistan-sonuc").forEach(function (n) { n.remove(); });
        if (!oneriler.length) {
            var bos = sonucKutusu(bolumId);
            if (bos) bos.innerHTML = '<div class="asistan-bilgi">Bu bölüm temiz görünüyor — öneri yok. ✅</div>';
            return;
        }
        var dagitilamayan = [];
        var gruplar = {};
        oneriler.forEach(function (o) {
            if (!o) return;
            var tabloSarmal = o.soruId ? section.querySelector('[data-tablo="' + o.soruId + '"]') : null;
            if (tabloSarmal) {
                (gruplar[o.soruId] = gruplar[o.soruId] || { sarmal: tabloSarmal, liste: [] }).liste.push(o);
            } else {
                dagitilamayan.push(o);
            }
        });
        Object.keys(gruplar).forEach(function (soruId) {
            tabloSonucCiz(gruplar[soruId].sarmal, soruId, gruplar[soruId].liste, harita);
        });
        if (!dagitilamayan.length) {
            var bilgi = sonucKutusu(bolumId);
            if (bilgi) {
                bilgi.innerHTML = '<div class="asistan-bilgi">Öneriler ilgili tabloların altına eklendi. ✅</div>';
                infoTemizleZamanla(bilgi);
            }
            return;
        }
        var kutu = sonucKutusu(bolumId);
        if (!kutu) return;
        kutu.innerHTML = '<div class="asistan-baslik">Asistan önerileri (' + dagitilamayan.length + ')</div>' + dagitilamayan.map(function (o, i) {
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
                '<button type="button" class="button ghost small" data-detaylandir>Detaylandır</button>' +
                "</div></div>";
        }).join("");
        kutu.dataset.harita = JSON.stringify(harita);
        kutu.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    function infoTemizleZamanla(kutu) {
        setTimeout(function () { if (kutu && kutu.parentElement) kutu.remove(); }, 4000);
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
        var alanlar = bolumVerisiniTopla(bolum, harita, ayar.anonim)
            .filter(function (a) { return a.tip === "tablo"; });
        if (!alanlar.length) {
            hatayiCiz(bolumId, "Bu bölümde doldurulmuş tablo yok.");
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
            if (dugme) { dugme.disabled = false; dugme.textContent = eski || "✨ Tablo Önerileri"; }
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

    // ---- bölüm butonları (yalnızca tablolu bölümlerde toplu tablo önerisi) ----
    function bolumdeTabloVarMi(bolumId) {
        if (typeof IS_ANALIZI_SORULARI === "undefined") return false;
        var bolum = IS_ANALIZI_SORULARI.find(function (b) { return b.id === bolumId; });
        return !!bolum && bolum.sorular.some(function (s) { return s.tip === "tablo"; });
    }

    function bolumButonlariniEkle() {
        document.querySelectorAll("#questionSections .panel-header").forEach(function (baslik) {
            if (baslik.querySelector("[data-asistan-btn]")) return;
            var section = baslik.closest("[data-bolum]");
            if (!section || !bolumdeTabloVarMi(section.dataset.bolum)) return;
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "button ghost small";
            btn.dataset.asistanBtn = section.dataset.bolum;
            btn.textContent = "✨ Tablo Önerileri";
            btn.title = "Bu bölümdeki tablolar için toplu öneri al";
            btn.addEventListener("click", function (ev) {
                ev.stopPropagation();
                oneriAl(section.dataset.bolum, btn);
            });
            var chev = baslik.querySelector(".chev");
            baslik.insertBefore(btn, chev || null);
        });
    }

    // ---- hücre butonları (tablo dışı alanlarda yerinde öneri) ----
    function hucreyeUygunMu(tip) {
        return tip === "text" || tip === "textarea" || tip === "secim" || tip === "liste" || tip === "onay";
    }

    function hucreButonlariniEkle() {
        document.querySelectorAll('#questionSections .field[data-soru]').forEach(function (alan) {
            if (alan.querySelector("[data-hucre-oneri]")) return;
            var soruId = alan.dataset.soru;
            var soru = null;
            try { soru = soruyuBul(soruId); } catch (e) { soru = null; }
            if (!soru || !hucreyeUygunMu(soru.tip)) return;
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "hucre-oneri-btn";
            btn.dataset.hucreOneri = soruId;
            btn.textContent = "✨";
            btn.title = "Bu alan için öneri al";
            btn.addEventListener("click", function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                hucreOneriAl(soruId, btn);
            });
            alan.appendChild(btn);
        });
    }

    function bolumuBul(soruId) {
        if (typeof IS_ANALIZI_SORULARI === "undefined") return null;
        for (var i = 0; i < IS_ANALIZI_SORULARI.length; i++) {
            var bolum = IS_ANALIZI_SORULARI[i];
            for (var j = 0; j < bolum.sorular.length; j++) {
                if (bolum.sorular[j].id === soruId) return bolum;
            }
        }
        return null;
    }

    function hucreBaglami(bolum, haricId, harita, anonim) {
        var out = [];
        try {
            bolum.sorular.forEach(function (soru) {
                if (soru.id === haricId || soru.tip === "tablo") return;
                var v = kisaDeger(cevapOku(soru)).trim();
                if (!v) return;
                v = v.slice(0, 120);
                out.push(soru.etiket + ": " + (anonim ? maskele(v, harita) : v));
            });
        } catch (e) { /* yoksay */ }
        return out.slice(0, 6);
    }

    function hucreMesajlari(bolumBaslik, alan, baglam) {
        var sistem = "Sen Türkçe yazan bir iş analizi editörüsün. TEK bir form alanı için yazım, tutarlılık ve zenginleştirme önerisi üret. SADECE geçerli JSON döndür.";
        var kullanici = "Bölüm: " + bolumBaslik + "\nAlan: " + alan.etiket + " (id: " + alan.id + ", tip: " + alan.tip + ")\nMevcut cevap: " + (alan.cevap || "(boş)") +
            (baglam.length ? "\nAynı bölümden bağlam:\n- " + baglam.join("\n- ") : "") +
            '\n\nŞu formatta döndür: {"oneriler":[{"soruId":"' + alan.id + '","tur":"yazim|tutarlilik|zenginlestirme","mevcut":"...","oneri":"önerilen metin","gerekce":"kısa gerekçe"}]}' +
            "\nEn fazla 3 öneri; cevap boşsa yalnızca doldurma tavsiyesi ver.";
        return [{ role: "system", content: sistem }, { role: "user", content: kullanici }];
    }

    function hedefGirdi(soruId) {
        var sarmal = document.querySelector('[data-soru="' + soruId + '"]');
        if (!sarmal) return null;
        return sarmal.querySelector("input.input, textarea.input, select.input");
    }

    function secimdeVarMi(selectEl, metin) {
        var hedef = String(metin || "").trim();
        if (!hedef) return false;
        return Array.prototype.some.call(selectEl.options || [], function (o) {
            return o.value.trim() === hedef || o.text.trim() === hedef;
        });
    }

    function hucreSonucCiz(soruId, liste, harita) {
        var sarmal = document.querySelector('[data-soru="' + soruId + '"]');
        if (!sarmal) return;
        var eski = sarmal.querySelector(".hucre-sonuc");
        if (eski) eski.remove();
        var kutu = document.createElement("div");
        kutu.className = "hucre-sonuc";
        kutu.dataset.harita = JSON.stringify(harita);
        if (!liste.length) {
            kutu.innerHTML = '<div class="asistan-bilgi">Bu alan temiz görünüyor ✅</div>';
        } else {
            kutu.innerHTML = liste.map(function (o, i) {
                var girdi = hedefGirdi(soruId);
                var cozulmus = maskeyiCoz(o.oneri || "", harita);
                var dogrudan = !!girdi && (girdi.tagName === "INPUT" || girdi.tagName === "TEXTAREA" ||
                    (girdi.tagName === "SELECT" && secimdeVarMi(girdi, cozulmus)));
                return '<div class="hucre-oneri" data-hucre-oneri-kart="' + i + '">' +
                    '<span class="oneri-tur">' + esc(o.tur || "öneri") + "</span>" +
                    '<div class="oneri-metin">' + esc(o.oneri || "") + "</div>" +
                    (o.gerekce ? '<div class="oneri-gerekce">' + esc(o.gerekce) + "</div>" : "") +
                    '<div class="oneri-islemler">' +
                    (dogrudan
                        ? '<button type="button" class="button primary small" data-hucre-uygula="' + i + '">Uygula</button>'
                        : '<button type="button" class="button ghost small" data-hucre-kopyala="' + i + '">Kopyala</button>') +
                    '<button type="button" class="button ghost small" data-detaylandir>Detaylandır</button>' +
                    '<button type="button" class="button ghost small" data-hucre-kapat>Kapat</button>' +
                    "</div></div>";
            }).join("");
        }
        sarmal.appendChild(kutu);
        sarmal.classList.add("alan-vurgu");
        setTimeout(function () { sarmal.classList.remove("alan-vurgu"); }, 1600);
        kutu.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    // ---- çevrimdışı hızlı yazım denetimi (anahtarsız, kotasız, anlık) ----
    // Tutucu kurallar: yalnızca tartışmasız, bütün-kelime eşleşenler.
    // Türkçe uyumlu kelime sınırı: \b ASCII dışı harflerde (ş, ğ, ü…) çalışmaz.
    var KELIME_ON = "(?<![A-Za-z0-9_ÇçĞğİıÖöŞşÜü])";
    var KELIME_ARKA = "(?![A-Za-z0-9_ÇçĞğİıÖöŞşÜü])";
    function kelimeici(kalip) {
        return new RegExp(KELIME_ON + kalip + KELIME_ARKA, "gi");
    }
    var HIZLI_DUZELT = [
        { ad: "Yazım", rx: kelimeici("herşey"), y: "her şey" },
        { ad: "Yazım", rx: kelimeici("herkez"), y: "herkes" },
        { ad: "Yazım", rx: kelimeici("birşey(ler)?"), y: "bir şey$1" },
        { ad: "Yazım", rx: kelimeici("hiçbirşey"), y: "hiçbir şey" },
        { ad: "Yazım", rx: kelimeici("herhangibir"), y: "herhangi bir" },
        { ad: "Yazım", rx: kelimeici("şuan"), y: "şu an" },
        { ad: "Yazım", rx: kelimeici("değilmi"), y: "değil mi" },
        { ad: "Yazım", rx: kelimeici("orjinal"), y: "orijinal" },
        { ad: "Yazım", rx: kelimeici("yanlız"), y: "yalnız" },
        { ad: "Yazım", rx: kelimeici("heralde"), y: "herhalde" },
        { ad: "Yazım", rx: kelimeici("makina"), y: "makine" },
        { ad: "Yazım", rx: kelimeici("şarz"), y: "şarj" },
        { ad: "Yazım", rx: kelimeici("dokuman"), y: "doküman" },
        { ad: "Karakter", rx: kelimeici("ayrica"), y: "ayrıca" },
        { ad: "Karakter", rx: kelimeici("gorev"), y: "görev" },
        { ad: "Karakter", rx: kelimeici("calisma"), y: "çalışma" },
        { ad: "Karakter", rx: kelimeici("egitim"), y: "eğitim" },
        { ad: "Karakter", rx: kelimeici("yonetici"), y: "yönetici" },
        { ad: "Karakter", rx: kelimeici("mudur"), y: "müdür" },
        { ad: "Karakter", rx: kelimeici("gorusme"), y: "görüşme" },
        { ad: "Karakter", rx: kelimeici("bolum"), y: "bölüm" },
        { ad: "Karakter", rx: kelimeici("cunku"), y: "çünkü" }
    ];

    function durumUydur(orj, duz) {
        var ilk = orj.charAt(0);
        if (ilk && ilk === ilk.toLocaleUpperCase("tr-TR") && ilk !== ilk.toLocaleLowerCase("tr-TR")) {
            return duz.charAt(0).toLocaleUpperCase("tr-TR") + duz.slice(1);
        }
        return duz;
    }

    function hizliTara(metin) {
        var bulgular = [];
        HIZLI_DUZELT.forEach(function (k) {
            k.rx.lastIndex = 0;
            var m = k.rx.exec(metin);
            if (m) {
                var duz = k.y;
                for (var g = 1; g < m.length; g++) duz = duz.split("$" + g).join(m[g] || "");
                duz = durumUydur(m[0], duz);
                if (duz !== m[0]) bulgular.push({ once: m[0], sonra: duz });
            }
        });
        return bulgular;
    }

    function hizliMetinDuzenle(metin) {
        var out = metin;
        HIZLI_DUZELT.forEach(function (k) {
            k.rx.lastIndex = 0;
            out = out.replace(k.rx, function () {
                var args = arguments;
                var duz = k.y;
                for (var g = 1; g < args.length - 2; g++) duz = duz.split("$" + g).join(args[g] || "");
                return durumUydur(args[0], duz);
            });
        });
        return out.replace(/[ \t]{2,}/g, " ");
    }

    function hizliKutuyuKapat(sarmal) {
        var eski = sarmal ? sarmal.querySelector(":scope > .yazim-ipucu") : null;
        if (eski) eski.remove();
    }

    function hizliDenetle(girdi) {
        if (!girdi) return;
        if (girdi.closest("[data-tablo]")) return; // tablo hücreleri LLM'e bırakılır
        if (girdi.tagName !== "TEXTAREA" && !(girdi.tagName === "INPUT" && (!girdi.type || girdi.type === "text"))) return;
        var sarmal = girdi.closest("[data-soru]");
        if (!sarmal) return;
        var metin = girdi.value || "";
        if (!metin.trim() || sarmal.dataset.hizliYoksay === metin) { hizliKutuyuKapat(sarmal); return; }
        var bulgular = hizliTara(metin);
        hizliKutuyuKapat(sarmal);
        if (!bulgular.length) return;
        var kutu = document.createElement("div");
        kutu.className = "yazim-ipucu";
        kutu.innerHTML = '<span class="oneri-tur">✏️ Yazım</span>' +
            '<div class="oneri-metin">' + bulgular.slice(0, 4).map(function (b) {
                return esc(b.once) + " → " + esc(b.sonra);
            }).join(" · ") + (bulgular.length > 4 ? " (+" + (bulgular.length - 4) + ")" : "") + "</div>" +
            '<div class="oneri-islemler">' +
            '<button type="button" class="button primary small" data-hizli-duzelt>Düzelt</button>' +
            '<button type="button" class="button ghost small" data-hizli-yoksay>Yoksay</button>' +
            "</div>";
        // Kutu her zaman girdinin hemen altında: girdiden sonra yerleştir
        if (girdi.after) girdi.after(kutu);
        else sarmal.appendChild(kutu);
    }

    function hizliUygula(sarmal) {
        if (!sarmal) return;
        var girdi = sarmal.querySelector("textarea.input, input.input");
        if (!girdi) return;
        girdi.value = hizliMetinDuzenle(girdi.value || "");
        delete sarmal.dataset.hizliYoksay;
        girdi.dispatchEvent(new Event("input", { bubbles: true }));
        girdi.dispatchEvent(new Event("change", { bubbles: true }));
        try { if (typeof ilerlemeHesapla === "function") ilerlemeHesapla(); } catch (e) { /* yoksay */ }
    }

    function hizliYoksay(sarmal) {
        if (!sarmal) return;
        var girdi = sarmal.querySelector("textarea.input, input.input");
        if (girdi) sarmal.dataset.hizliYoksay = girdi.value || "";
        hizliKutuyuKapat(sarmal);
    }

    function hizliDinle() {
        var govde = document.getElementById("questionSections");
        if (!govde) return;
        govde.addEventListener("change", function (e) {
            hizliDenetle(e.target);
        });
        govde.addEventListener("focusout", function (e) {
            hizliDenetle(e.target);
        });
    }

    async function hucreOneriAl(soruId, dugme) {
        if (!window.LlmIstemci || !LlmIstemci.anahtarVar()) {
            ayarModaliniAc("Önce API anahtarınızı girin.");
            return;
        }
        var soru = null;
        try { soru = soruyuBul(soruId); } catch (e) { return; }
        var bolum = bolumuBul(soruId);
        if (!soru || !bolum) return;
        var ayar = LlmIstemci.ayarGetir();
        var harita = ayar.anonim ? maskeHaritasi() : [];
        var cevap = "";
        try { cevap = kisaDeger(cevapOku(soru)); } catch (e) { cevap = ""; }
        var alan = { id: soru.id, etiket: soru.etiket, tip: soru.tip, cevap: ayar.anonim ? maskele(cevap, harita) : cevap };
        var baglam = hucreBaglami(bolum, soruId, harita, ayar.anonim);
        var eski = dugme ? dugme.textContent : "";
        if (dugme) { dugme.disabled = true; dugme.textContent = "…"; }
        try {
            var metin = await LlmIstemci.sohbet(hucreMesajlari(bolum.baslik, alan, baglam), true);
            var veri = LlmIstemci.jsonAyikla(metin);
            var liste = Array.isArray(veri.oneriler) ? veri.oneriler : [];
            hucreSonucCiz(soruId, liste.filter(function (o) { return o && o.soruId === soruId; }).slice(0, 3), harita);
            durumGuncelle();
        } catch (e) {
            hucreSonucCiz(soruId, [], harita);
            var sarmal = document.querySelector('[data-soru="' + soruId + '"] .hucre-sonuc');
            if (sarmal) sarmal.innerHTML = '<div class="asistan-hata">Asistan hatası: ' + esc(e.message || "Bilinmeyen hata.") + "</div>";
        } finally {
            if (dugme) { dugme.disabled = false; dugme.textContent = eski || "✨"; }
        }
    }

    function hucreUygula(soruId, kart) {
        var kutu = kart.closest(".hucre-sonuc");
        var harita = [];
        try { harita = JSON.parse((kutu && kutu.dataset.harita) || "[]"); } catch (e) { harita = []; }
        var metin = maskeyiCoz(((kart.querySelector(".oneri-metin") || {}).textContent || "").trim(), harita);
        var girdi = hedefGirdi(soruId);
        if (!girdi) return;
        girdi.value = metin;
        girdi.dispatchEvent(new Event("input", { bubbles: true }));
        girdi.dispatchEvent(new Event("change", { bubbles: true }));
        try { if (typeof ilerlemeHesapla === "function") ilerlemeHesapla(); } catch (e) { /* yoksay */ }
        if (kutu) kutu.remove();
    }

    // ---- detaylandır: öneriyi anlamı bozmadan daha açıklayıcı hale getir ----
    function detayMesajlari(bolumBaslik, etiket, orijinal, taslak) {
        var sistem = "Sen Türkçe yazan bir iş analizi editörüsün. Verilen metni anlamını bozmadan daha açıklayıcı hale getirirsin. SADECE geçerli JSON döndür.";
        var kullanici = "Bölüm: " + bolumBaslik + "\nAlan: " + etiket +
            "\nFormdaki orijinal cevap: " + (orijinal || "(boş)") +
            "\nDetaylandırılacak taslak: " + taslak +
            "\n\nKurallar: anlamı değiştirme; metinde olmayan yeni olgu, rakam veya örnek uydurma; " +
            "aynı şeyi farklı sözcüklerle tekrarlayarak şişirme; resmi ve açıklayıcı bir iş dili kullan; " +
            "en fazla 4 cümle / 90 kelime." +
            '\nŞu formatta döndür: {"detayli":"..."}';
        return [{ role: "system", content: sistem }, { role: "user", content: kullanici }];
    }

    async function detaylandir(soruId, kart, dugme) {
        var metinEl = kart.querySelector(".oneri-metin");
        if (!metinEl) return;
        // Detaylı hali hazırsa yeni istek atmadan orijinal/detaylı arasında geçiş yap
        if (kart.dataset.detayli) {
            var detayliMi = metinEl.dataset.mod !== "detayli";
            metinEl.textContent = detayliMi ? kart.dataset.detayli : (kart.dataset.orijinal || metinEl.textContent);
            metinEl.dataset.mod = detayliMi ? "detayli" : "orijinal";
            dugme.textContent = detayliMi ? "Orijinali göster" : "Detaylandır";
            return;
        }
        if (!window.LlmIstemci || !LlmIstemci.anahtarVar()) {
            ayarModaliniAc("Önce API anahtarınızı girin.");
            return;
        }
        var soru = null;
        try { soru = soruyuBul(soruId); } catch (e) { soru = null; }
        var bolum = bolumuBul(soruId);
        var ayar = LlmIstemci.ayarGetir();
        var harita = ayar.anonim ? maskeHaritasi() : [];
        var orijinal = "";
        try { orijinal = soru ? kisaDeger(cevapOku(soru)).slice(0, 400) : ""; } catch (e) { orijinal = ""; }
        if (ayar.anonim) orijinal = maskele(orijinal, harita);
        var taslak = metinEl.textContent.trim();
        if (!taslak) return;
        var eski = dugme.textContent;
        dugme.disabled = true;
        dugme.textContent = "Detaylandırılıyor…";
        try {
            var metin = await LlmIstemci.sohbet(
                detayMesajlari(bolum ? bolum.baslik : "", soru ? soru.etiket : soruId, orijinal, taslak), true);
            var veri = LlmIstemci.jsonAyikla(metin);
            var detayli = String((veri && veri.detayli) || "").trim();
            if (!detayli) throw new Error("Boş yanıt geldi.");
            kart.dataset.orijinal = taslak;
            kart.dataset.detayli = detayli;
            metinEl.textContent = detayli;
            metinEl.dataset.mod = "detayli";
            dugme.textContent = "Orijinali göster";
            durumGuncelle();
        } catch (e) {
            dugme.textContent = eski;
            alert("Detaylandırılamadı: " + (e.message || e));
            return;
        } finally {
            dugme.disabled = false;
        }
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
                limit: parseInt(document.getElementById("llmLimit").value, 10) || 50
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
                    limit: parseInt(document.getElementById("llmLimit").value, 10) || 50
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
            var dBtn = e.target.closest("[data-detaylandir]");
            if (dBtn) {
                var dKart = dBtn.closest("[data-hucre-oneri-kart], [data-oneri]");
                var dSarmal = dBtn.closest("[data-soru]");
                var dSoruId = (dSarmal && dSarmal.dataset.soru) ||
                    ((dKart && dKart.querySelector("code") || {}).textContent || "").trim();
                if (dKart && dSoruId) detaylandir(dSoruId, dKart, dBtn);
                return;
            }
            var hKapat = e.target.closest("[data-hucre-kapat]");
            if (hKapat) {
                var kapanacak = hKapat.closest(".hucre-sonuc");
                if (kapanacak) kapanacak.remove();
                return;
            }
            var hKopyala = e.target.closest("[data-hucre-kopyala]");
            if (hKopyala) {
                var kKart = hKopyala.closest("[data-hucre-oneri-kart]");
                var kMetin = kKart ? ((kKart.querySelector(".oneri-metin") || {}).textContent || "") : "";
                if (navigator.clipboard) navigator.clipboard.writeText(kMetin).catch(function () { /* yoksay */ });
                hKopyala.textContent = "Kopyalandı ✓";
                setTimeout(function () { hKopyala.textContent = "Kopyala"; }, 1500);
                return;
            }
            var hUygula = e.target.closest("[data-hucre-uygula]");
            if (hUygula) {
                var uKart = hUygula.closest("[data-hucre-oneri-kart]");
                var uSarmal = hUygula.closest('[data-soru]');
                if (uKart && uSarmal) hucreUygula(uSarmal.dataset.soru, uKart);
                return;
            }
            var hHizliDuzelt = e.target.closest("[data-hizli-duzelt]");
            if (hHizliDuzelt) {
                hizliUygula(hHizliDuzelt.closest('[data-soru]'));
                return;
            }
            var hHizliYoksay = e.target.closest("[data-hizli-yoksay]");
            if (hHizliYoksay) {
                hizliYoksay(hHizliYoksay.closest('[data-soru]'));
                return;
            }
            var satirBtn = e.target.closest("[data-satir-git]");
            if (satirBtn) {
                satiriVurgula(satirBtn.dataset.tabloId, parseInt(satirBtn.dataset.satirGit, 10) || 0);
                return;
            }
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
    hucreButonlariniEkle();
    hizliDinle();
    modalOlaylari();
    sonucTiklamalari();
    durumGuncelle();
})();
