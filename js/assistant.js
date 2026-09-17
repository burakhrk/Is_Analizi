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
            "Görevin: tutarsızlıklar (örn. yüzdeler toplamı, boş detaylar) ve " +
            "cevap zenginleştirme önerileri üretmek. SADECE geçerli JSON döndür, başka metin yazma.";
        var kullanici = "Bölüm: " + bolum.baslik + "\n" +
            "Alanlar (id | etiket | tip | cevap):\n" +
            alanlar.map(function (a) { return "- " + a.id + " | " + a.etiket + " | " + a.tip + " | " + a.cevap; }).join("\n") +
            "\n\nŞu formatta döndür:\n" +
            '{"oneriler":[{"soruId":"tablo_id","satirNo":2,"tur":"tutarlilik|zenginlestirme","mevcut":"...","oneri":"...","gerekce":"kısa gerekçe"}]}' +
            "\nKurallar: en fazla 8 öneri; cevabı boş alanlara öneri üretme; oneri = düzeltilmiş metin önerisi olsun, soruId tablonun id'si olsun; " +
            "satirNo = önerinin ilgili olduğu satırın tablodaki 1'den başlayan sırası (satır belli değilse 0)." +
            '\nBoş tablolar için ayrıca: {"ornekler":[{"soruId":"tablo_id","satirlar":[{"sutun_id":"değer"}]}]} — ' +
            "her boş tabloya en fazla 3 örnek satır; sütun id'leri yukarıdaki Sütunlar listesindeki id'lerle birebir aynı olsun; " +
            "kesin rakam/tarih/özel isim uydurma, genel-geçer ifadeler kullan.";
        return [{ role: "system", content: sistem }, { role: "user", content: kullanici }];
    }

    function turEtiketi(tur) {
        return tur === "ornek" ? "örnek taslak" : (tur || "öneri");
    }

    // ---- kelime bazlı fark (mevcut → öneri karşılaştırması) ----
    function farkHtml(eskiMetin, yeniMetin) {
        var a = String(eskiMetin || "").trim().split(/\s+/).filter(Boolean);
        var b = String(yeniMetin || "").trim().split(/\s+/).filter(Boolean);
        if (!a.length || !b.length) return "";
        if (a.join(" ") === b.join(" ")) return "";
        if (a.length * b.length > 30000) return "";
        var n = a.length, m = b.length, gen = m + 1;
        var dp = new Uint16Array((n + 1) * gen);
        var i, j;
        for (i = n - 1; i >= 0; i--) {
            for (j = m - 1; j >= 0; j--) {
                dp[i * gen + j] = a[i] === b[j]
                    ? dp[(i + 1) * gen + j + 1] + 1
                    : Math.max(dp[(i + 1) * gen + j], dp[i * gen + j + 1]);
            }
        }
        var html = "", x = 0, y = 0;
        while (x < n && y < m) {
            if (a[x] === b[y]) { html += esc(a[x]) + " "; x++; y++; }
            else if (dp[(x + 1) * gen + y] >= dp[x * gen + y + 1]) { html += "<del>" + esc(a[x]) + "</del> "; x++; }
            else { html += "<ins>" + esc(b[y]) + "</ins> "; y++; }
        }
        while (x < n) { html += "<del>" + esc(a[x]) + "</del> "; x++; }
        while (y < m) { html += "<ins>" + esc(b[y]) + "</ins> "; y++; }
        return html;
    }

    // Fark hesaplanabilirse karşılaştırmalı, yoksa düz metin gösterir.
    // Saf öneri her zaman data-saf özniteliğinde durur (Uygula/Kopyala oradan okur).
    function oneriMetinHtml(o) {
        var saf = String((o && o.oneri) || "");
        var fark = farkHtml((o && o.mevcut) || "", saf);
        if (fark) return '<div class="oneri-metin" data-saf="' + esc(saf) + '">' + fark + "</div>";
        return '<div class="oneri-metin">' + esc(saf) + "</div>";
    }

    function kartSafMetin(kart) {
        var el = kart ? kart.querySelector(".oneri-metin") : null;
        if (!el) return "";
        return ((el.dataset.saf != null ? el.dataset.saf : el.textContent) || "").trim();
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
                '<span class="oneri-tur">' + esc(turEtiketi(o.tur)) + "</span>" +
                (satirNo > 0 ? '<span class="oneri-satir">Satır ' + satirNo + "</span>" : "") +
                (o.mevcut ? '<div class="oneri-mevcut">' + esc(String(o.mevcut).slice(0, 300)) + "</div>" : "") +
                oneriMetinHtml(o) +
                (o.gerekce ? '<div class="oneri-gerekce">' + esc(o.gerekce) + "</div>" : "") +
                '<div class="oneri-islemler">' +
                (satirNo > 0 ? '<button type="button" class="button secondary small" data-satir-git="' + satirNo + '" data-tablo-id="' + esc(soruId) + '">Satıra git</button>' : "") +
                '<button type="button" class="button ghost small" data-kopyala="' + i + '">Kopyala</button>' +
                '<button type="button" class="button ghost small" data-detaylandir>Detaylandır</button>' +
                '<button type="button" class="button ghost small" data-oneri-kapat>Kapat</button>' +
                "</div></div>";
        }).join("");
        if (tabloSarmal.after) tabloSarmal.after(kutu);
        else tabloSarmal.parentElement.appendChild(kutu);
        kutu.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    // Boş tablolara örnek satırlar (tablonun hemen altına, tek tıkla eklenir)
    var ornekSatirDeposu = {};

    function ornekSatirCiz(soruId, satirlar, harita, baslik) {
        var tabloSarmal = document.querySelector('[data-tablo="' + soruId + '"]');
        if (!tabloSarmal || !tabloSarmal.parentElement) return;
        ornekSatirDeposu[soruId] = satirlar;
        var eski = tabloSarmal.parentElement.querySelector('.asistan-sonuc.ornek-alti[data-tablo-kutu="' + soruId + '"]');
        if (eski) eski.remove();
        var soru = null;
        try { soru = soruyuBul(soruId); } catch (e) { soru = null; }
        var baslikAd = function (cid) {
            if (!soru) return cid;
            var c = soru.sutunlar.find(function (x) { return x.id === cid; });
            return c ? c.baslik : cid;
        };
        var kutu = document.createElement("div");
        kutu.className = "asistan-sonuc tablo-alti ornek-alti";
        kutu.dataset.tabloKutu = soruId;
        kutu.dataset.harita = JSON.stringify(harita);
        kutu.innerHTML = '<div class="asistan-baslik">' + esc(baslik || "Örnek satırlar") + ' (' + satirlar.length + ")</div>" + satirlar.map(function (sat, i) {
            var ozet = Object.keys(sat).map(function (cid) {
                return baslikAd(cid) + ": " + String(sat[cid] == null ? "" : sat[cid]);
            }).join(" | ").slice(0, 300);
            return '<div class="oneri-karti" data-ornek-kart="' + i + '">' +
                '<span class="oneri-tur">örnek taslak</span>' +
                '<div class="oneri-metin">' + esc(ozet) + "</div>" +
                '<div class="oneri-islemler"><button type="button" class="button primary small" data-ornek-ekle="' + i +
                '" data-ornek-soru="' + esc(soruId) + '">Satır olarak ekle</button>' +
                '<button type="button" class="button ghost small" data-oneri-kapat>Kapat</button></div></div>';
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
        // Yazım türü kaldırıldı: yalnızca tutarlılık + zenginleştirme gösterilir.
        oneriler = (oneriler || []).filter(function (o) { return o && o.tur !== "yazim"; });
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
                    '<span class="oneri-tur">' + esc(turEtiketi(o.tur)) + '</span>' +
                '<div class="oneri-alan">Alan: <code>' + esc(o.soruId || "-") + '</code></div>' +
                (o.mevcut ? '<div class="oneri-mevcut">Mevcut: ' + esc(String(o.mevcut).slice(0, 300)) + '</div>' : "") +
                oneriMetinHtml(o) +
                (o.gerekce ? '<div class="oneri-gerekce">' + esc(o.gerekce) + '</div>' : "") +
                '<div class="oneri-islemler">' +
                (uygulanabilir ? '<button type="button" class="button primary small" data-uygula="' + i + '">Uygula</button>' : "") +
                '<button type="button" class="button ghost small" data-kopyala="' + i + '">Kopyala</button>' +
                '<button type="button" class="button ghost small" data-detaylandir>Detaylandır</button>' +
                '<button type="button" class="button ghost small" data-oneri-kapat>Kapat</button>' +
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
        var tablolar = bolum.sorular.filter(function (s) { return s.tip === "tablo"; });
        if (!tablolar.length) {
            hatayiCiz(bolumId, "Bu bölümde tablo yok.");
            return;
        }
        var dolu = {};
        bolumVerisiniTopla(bolum, harita, ayar.anonim).forEach(function (a) { if (a.tip === "tablo") dolu[a.id] = a; });
        var alanlar = tablolar.map(function (soru) {
            if (dolu[soru.id]) return dolu[soru.id];
            return {
                id: soru.id, etiket: soru.etiket, tip: "tablo",
                cevap: "(boş tablo — örnek satır öner) Sütunlar: " + soru.sutunlar.map(function (c) { return c.id + " (" + c.baslik + ")"; }).join(", ")
            };
        });
        var eski = dugme ? dugme.textContent : "";
        if (dugme) { dugme.disabled = true; dugme.textContent = "Düşünüyor…"; }
        try {
            var metin = await LlmIstemci.sohbet(mesajlariKur(bolum, alanlar), true);
            var veri = LlmIstemci.jsonAyikla(metin);
            var liste = Array.isArray(veri.oneriler) ? veri.oneriler : [];
            sonuclariCiz(bolumId, liste.slice(0, 8), harita);
            var ornekHam = veri.ornekler && typeof veri.ornekler === "object" ? veri.ornekler : [];
            (Array.isArray(ornekHam) ? ornekHam : []).forEach(function (g) {
                if (!g || !g.soruId || !Array.isArray(g.satirlar)) return;
                var temiz = g.satirlar.filter(function (r) { return r && typeof r === "object" && !Array.isArray(r); }).slice(0, 3);
                if (temiz.length) ornekSatirCiz(g.soruId, temiz, harita);
            });
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
        var oneriMetni = kartSafMetin(kart);
        oneriMetni = maskeyiCoz(oneriMetni, harita);
        var sarmal = document.querySelector('[data-soru="' + alanKod + '"]');
        if (!sarmal) return;
        var girdi = sarmal.querySelector("input.input, textarea.input, select.input");
        if (!girdi) return;
        var oncekiDeger = girdi.value;
        girdi.value = oneriMetni;
        girdi.dispatchEvent(new Event("input", { bubbles: true }));
        girdi.dispatchEvent(new Event("change", { bubbles: true }));
        try { if (typeof ilerlemeHesapla === "function") ilerlemeHesapla(); } catch (e) { /* yoksay */ }
        gecmiseEkle({ tip: "deger", soruId: alanKod, etiket: etiketKisa(alanKod), onceki: oncekiDeger, sonraki: oneriMetni });
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

    function pozisyonBaglami(harita, anonim) {
        try {
            var u = soruyuBul("unvan_pozisyon"), r = soruyuBul("rol_amaci");
            var us = u ? kisaDeger(cevapOku(u)).slice(0, 80) : "";
            var rs = r ? kisaDeger(cevapOku(r)).slice(0, 160) : "";
            var t = ("Pozisyon: " + us + "\nRol amacı: " + rs).trim();
            return anonim ? maskele(t, harita) : t;
        } catch (e) { return ""; }
    }

    function hucreMesajlari(bolumBaslik, alan, baglam, ornekModu, pozisyon, secenekMetni) {
        if (ornekModu) {
            var sistem = "Sen Türkçe yazan bir iş analizi editörüsün. Boş bırakılmış bir form alanı için, verilen bağlama uygun, " +
                "doğrudan forma yazılabilecek ÖRNEK bir cevap taslağı üretirsin. SADECE geçerli JSON döndür.";
            var kullanici = (pozisyon ? pozisyon + "\n" : "") + "Bölüm: " + bolumBaslik +
                "\nAlan: " + alan.etiket + " (id: " + alan.id + ", tip: " + alan.tip + ")" +
                (secenekMetni ? "\n" + secenekMetni : "") +
                (baglam.length ? "\nAynı bölümden bağlam:\n- " + baglam.join("\n- ") : "") +
                '\n\nŞu formatta döndür: {"oneriler":[{"soruId":"' + alan.id + '","tur":"ornek","mevcut":"","oneri":"örnek cevap taslağı","gerekce":"neden uygun"}]}' +
                "\nKurallar: tek öneri; somut ve gerçekçi ol; kesinleşmemiş rakam/tarih/özel isim uydurma, " +
                "yerine genel-geçer ifadeler kullan (örn. aylık, ilgili birim); resmi iş dili; seçim tipinde oneri seçeneklerden biri olsun.";
            return [{ role: "system", content: sistem }, { role: "user", content: kullanici }];
        }
        var sistem2 = "Sen Türkçe yazan bir iş analizi editörüsün. TEK bir form alanı için tutarlılık ve zenginleştirme önerisi üret. SADECE geçerli JSON döndür.";
        var kullanici2 = "Bölüm: " + bolumBaslik + "\nAlan: " + alan.etiket + " (id: " + alan.id + ", tip: " + alan.tip + ")\nMevcut cevap: " + (alan.cevap || "(boş)") +
            (baglam.length ? "\nAynı bölümden bağlam:\n- " + baglam.join("\n- ") : "") +
            '\n\nŞu formatta döndür: {"oneriler":[{"soruId":"' + alan.id + '","tur":"tutarlilik|zenginlestirme","mevcut":"...","oneri":"düzeltilmiş/önerilen metin","gerekce":"kısa gerekçe"}]}' +
            "\nEn fazla 3 öneri; cevap boşsa yalnızca doldurma tavsiyesi ver.";
        return [{ role: "system", content: sistem2 }, { role: "user", content: kullanici2 }];
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
        // Yazım türü kaldırıldı: yalnızca tutarlılık + zenginleştirme gösterilir.
        liste = (liste || []).filter(function (o) { return o && o.tur !== "yazim"; });
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
                    '<span class="oneri-tur">' + esc(turEtiketi(o.tur)) + "</span>" +
                    oneriMetinHtml({ mevcut: (girdi && (girdi.tagName === "INPUT" || girdi.tagName === "TEXTAREA")) ? (girdi.value || "") : "", oneri: cozulmus }) +
                    (o.gerekce ? '<div class="oneri-gerekce">' + esc(o.gerekce) + "</div>" : "") +
                    '<div class="oneri-islemler">' +
                    (dogrudan
                        ? '<button type="button" class="button primary small" data-hucre-uygula="' + i + '">Uygula</button>'
                        : '<button type="button" class="button ghost small" data-hucre-kopyala="' + i + '">Kopyala</button>') +
                    '<button type="button" class="button ghost small" data-detaylandir>Detaylandır</button>' +
                    '<button type="button" class="button ghost small" data-oneri-kapat>Kapat</button>' +
                    "</div></div>";
            }).join("");
        }
        sarmal.appendChild(kutu);
        sarmal.classList.add("alan-vurgu");
        setTimeout(function () { sarmal.classList.remove("alan-vurgu"); }, 1600);
        kutu.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    // ---- hücre önerisi (tek alan: ✨ ile yerinde öneri) ----

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
        var bosAlan = !cevap.trim();
        var secenekMetni = "";
        if (soru.tip === "secim" && Array.isArray(soru.secenekler) && soru.secenekler.length) {
            secenekMetni = "Seçenekler: " + soru.secenekler.join(", ");
        }
        var eski = dugme ? dugme.textContent : "";
        if (dugme) { dugme.disabled = true; dugme.textContent = "…"; }
        try {
            var metin = await LlmIstemci.sohbet(hucreMesajlari(bolum.baslik, alan, baglam, bosAlan, pozisyonBaglami(harita, ayar.anonim), secenekMetni), true);
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
        var kutu = kart.closest(".hucre-sonuc") || kart.closest("[data-harita]");
        var harita = [];
        try { harita = JSON.parse((kutu && kutu.dataset.harita) || "[]"); } catch (e) { harita = []; }
        var metin = maskeyiCoz(kartSafMetin(kart), harita);
        var girdi = hedefGirdi(soruId);
        if (!girdi) return;
        var onceki = girdi.value;
        girdi.value = metin;
        girdi.dispatchEvent(new Event("input", { bubbles: true }));
        girdi.dispatchEvent(new Event("change", { bubbles: true }));
        try { if (typeof ilerlemeHesapla === "function") ilerlemeHesapla(); } catch (e) { /* yoksay */ }
        gecmiseEkle({ tip: "deger", soruId: soruId, etiket: etiketKisa(soruId), onceki: onceki, sonraki: metin });
        // Alan altındaki kutu kapanır; sohbet geçmişi korunur
        if (kutu && kutu.classList.contains("hucre-sonuc") && !kart.closest("#sohbetAkis")) kutu.remove();
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
        var taslak = kartSafMetin(kart);
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
        sohbetKotaGuncelle();
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

    // ---- değişiklik geçmişi (geri/ileri al) ----
    // Asistanın yazdıkları + elle yazılanların ikisi de izlenir.
    // Elle yazımda odaklanınca değer fotoğrafı alınır, odaktan çıkınca
    // değiştiyse tek adım kaydedilir (tuş vuruşu başına kayıt yok).
    // Geçmiş oturumluk tutulur (sayfa yenilenince sıfırlanır).
    var gecmis = [];
    var ileri = [];

    function etiketKisa(soruId) {
        try {
            var s = soruyuBul(soruId);
            if (s && s.etiket) return String(s.etiket).slice(0, 45);
        } catch (e) { /* yoksay */ }
        return soruId;
    }

    function girisEtiketi(g) {
        if (!g) return "";
        if (g.tip === "satirlar") return g.satirlar.length + " tablo satırı";
        return g.etiket || g.soruId || "değişiklik";
    }

    function gecmisDurumuGuncelle() {
        var geri = document.getElementById("geriAlBtn");
        var il = document.getElementById("ileriAlBtn");
        if (geri) {
            geri.disabled = !gecmis.length;
            geri.title = gecmis.length ? ("Geri al: " + girisEtiketi(gecmis[gecmis.length - 1])) : "Geri alınacak işlem yok";
        }
        if (il) {
            il.disabled = !ileri.length;
            il.title = ileri.length ? ("İleri al: " + girisEtiketi(ileri[ileri.length - 1])) : "İleri alınacak işlem yok";
        }
    }

    function gecmiseEkle(giris) {
        gecmis.push(giris);
        if (gecmis.length > 100) gecmis.shift();
        ileri.length = 0;
        gecmisDurumuGuncelle();
    }

    function degisiklikSonrasi() {
        try { if (typeof ilerlemeHesapla === "function") ilerlemeHesapla(); } catch (e) { /* yoksay */ }
        try { if (typeof otomatikKaydetZamanla === "function") otomatikKaydetZamanla(); } catch (e) { /* yoksay */ }
        gecmisDurumuGuncelle();
    }

    function degerYaz(soruId, deger) {
        var g = hedefGirdi(soruId);
        if (!g) return false;
        g.value = deger;
        g.dispatchEvent(new Event("input", { bubbles: true }));
        g.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
    }

    function alanYaz(giris, deger) {
        var el = (giris.el && document.contains(giris.el)) ? giris.el
            : (giris.name ? document.querySelector('[name="' + giris.name + '"]') : null);
        if (!el) return false;
        if (giris.isCheck) el.checked = !!deger;
        else el.value = deger;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
    }

    function geriAl() {
        var giris = gecmis.pop();
        if (!giris) return;
        if (giris.tip === "deger") {
            degerYaz(giris.soruId, giris.onceki);
        } else if (giris.tip === "alan") {
            alanYaz(giris, giris.onceki);
        } else if (giris.tip === "satirlar") {
            giris.satirlar.forEach(function (s) {
                if (s.tr && s.tr.parentElement) s.tr.parentElement.removeChild(s.tr);
            });
        }
        ileri.push(giris);
        degisiklikSonrasi();
    }

    function ileriAl() {
        var giris = ileri.pop();
        if (!giris) return;
        if (giris.tip === "deger") {
            degerYaz(giris.soruId, giris.sonraki);
        } else if (giris.tip === "alan") {
            alanYaz(giris, giris.sonraki);
        } else if (giris.tip === "satirlar") {
            giris.satirlar.forEach(function (s) {
                var govde = document.querySelector('[data-tablo="' + s.soruId + '"] tbody');
                if (!govde || !s.tr || s.tr.parentElement) return;
                var ref = govde.rows[s.index] || null;
                if (ref) govde.insertBefore(s.tr, ref);
                else govde.appendChild(s.tr);
            });
        }
        gecmis.push(giris);
        degisiklikSonrasi();
    }

    function gecmisOlaylari() {
        var geri = document.getElementById("geriAlBtn");
        if (geri) geri.addEventListener("click", geriAl);
        var il = document.getElementById("ileriAlBtn");
        if (il) il.addEventListener("click", ileriAl);
        document.addEventListener("keydown", function (e) {
            // Alan içindeyken tarayıcının kendi geri alması çalışsın
            var hedef = e.target;
            var alanda = hedef && (hedef.tagName === "INPUT" || hedef.tagName === "TEXTAREA" ||
                hedef.tagName === "SELECT" || hedef.isContentEditable);
            if ((e.ctrlKey || e.metaKey) && !e.altKey && !alanda) {
                var tus = String(e.key || "").toLowerCase();
                if (tus === "z" && !e.shiftKey) { e.preventDefault(); geriAl(); }
                else if (tus === "y" || (tus === "z" && e.shiftKey)) { e.preventDefault(); ileriAl(); }
            }
        });
        gecmisDurumuGuncelle();
    }

    // ---- elle yazılanların izlenmesi (odak fotoğrafı + odaktan çıkışta tek adım) ----
    var odakAnlik = null;

    function alanKimligi(el) {
        var sarmal = el.closest ? el.closest("[data-soru]") : null;
        var soruId = (sarmal && sarmal.dataset.soru) || el.name || "alan";
        if (soruId === "form_tarihi") return { soruId: soruId, etiket: "Form Tarihi" };
        try {
            return { soruId: soruId, etiket: String(etiketKisa(soruId)).slice(0, 45) };
        } catch (e) {
            return { soruId: soruId, etiket: soruId };
        }
    }

    function manuelIzleme() {
        var form = document.getElementById("analysisForm");
        if (!form) return;
        form.addEventListener("focusin", function (e) {
            var el = e.target && e.target.closest ? e.target.closest("input, textarea, select") : null;
            if (!el || el.disabled || !el.name) { odakAnlik = null; return; }
            odakAnlik = { el: el, isCheck: el.type === "checkbox", deger: el.type === "checkbox" ? !!el.checked : el.value };
        });
        form.addEventListener("focusout", function (e) {
            if (!odakAnlik) return;
            var kayit = odakAnlik;
            odakAnlik = null;
            var el = kayit.el;
            if (!document.contains(el)) return;
            var simdi = kayit.isCheck ? !!el.checked : el.value;
            if (simdi === kayit.deger) return;
            var kim = alanKimligi(el);
            gecmiseEkle({ tip: "alan", el: el, name: el.name, isCheck: kayit.isCheck, soruId: kim.soruId, etiket: kim.etiket, onceki: kayit.deger, sonraki: simdi });
        });
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
                limit: parseInt(document.getElementById("llmLimit").value, 10) || 1000
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
                    limit: parseInt(document.getElementById("llmLimit").value, 10) || 1000
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
            // Beğenilmeyen öneriyi tek tıkla kapat; son kart kapanırsa kutu da kalkar.
            var kapatBtn = e.target.closest("[data-oneri-kapat]");
            if (kapatBtn) {
                var kart = kapatBtn.closest(".oneri-karti, .hucre-oneri");
                var kutu = kapatBtn.closest(".asistan-sonuc, .hucre-sonuc, .girdi-sonuc");
                if (kart) kart.remove();
                if (kutu && !kutu.querySelector(".oneri-karti, .hucre-oneri")) kutu.remove();
                return;
            }
            var girdiBtn = e.target.closest("[data-girdi-ekle]");
            if (girdiBtn) {
                var gid = girdiBtn.dataset.girdiAlan;
                var aday = (girdiOneriDeposu[gid] || [])[parseInt(girdiBtn.dataset.girdiEkle, 10) || 0];
                var girdiEl = gid ? hedefGirdi(gid) : null;
                if (aday && girdiEl) {
                    var onceki = girdiEl.value || "";
                    var satir = girdiSatirMetni(aday);
                    girdiEl.value = onceki ? (onceki.replace(/\s+$/, "") + "\n" + satir) : satir;
                    girdiEl.dispatchEvent(new Event("input", { bubbles: true }));
                    girdiEl.dispatchEvent(new Event("change", { bubbles: true }));
                    gecmiseEkle({ tip: "deger", soruId: gid, etiket: etiketKisa(gid), onceki: onceki, sonraki: girdiEl.value });
                    degisiklikSonrasi();
                    var gKart = girdiBtn.closest("[data-girdi-kart]");
                    if (gKart) gKart.classList.add("uygulandi");
                    girdiBtn.disabled = true;
                    girdiBtn.textContent = "Eklendi ✓";
                }
                return;
            }
            var ornekBtn = e.target.closest("[data-ornek-ekle]");
            if (ornekBtn) {
                var sid = ornekBtn.dataset.ornekSoru;
                var sat = (ornekSatirDeposu[sid] || [])[parseInt(ornekBtn.dataset.ornekEkle, 10) || 0];
                if (sid && sat) {
                    var kutuEl = ornekBtn.closest(".asistan-sonuc");
                    var har = [];
                    try { har = JSON.parse((kutuEl && kutuEl.dataset.harita) || "[]"); } catch (err) { har = []; }
                    var tr = belgeSatirEkle(sid, sat, har);
                    if (tr) {
                        gecmiseEkle({ tip: "satirlar", satirlar: [{ soruId: sid, tr: tr, index: parseInt(tr.dataset.satir, 10) || 0 }] });
                        tr.classList.add("satir-vurgu");
                        setTimeout(function () { tr.classList.remove("satir-vurgu"); }, 2500);
                        degisiklikSonrasi();
                        ornekBtn.disabled = true;
                        ornekBtn.textContent = "Eklendi ✓";
                    }
                }
                return;
            }
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
                var kMetin = kKart ? kartSafMetin(kKart) : "";
                if (navigator.clipboard) navigator.clipboard.writeText(kMetin).catch(function () { /* yoksay */ });
                hKopyala.textContent = "Kopyalandı ✓";
                setTimeout(function () { hKopyala.textContent = "Kopyala"; }, 1500);
                return;
            }
            var hUygula = e.target.closest("[data-hucre-uygula]");
            if (hUygula) {
                var uKart = hUygula.closest("[data-hucre-oneri-kart]");
                var uSarmal = hUygula.closest('[data-soru]');
                var sid = (uSarmal && uSarmal.dataset.soru) || hUygula.dataset.soru;
                if (uKart && sid) {
                    hucreUygula(sid, uKart);
                    // Sohbet içinden uygulandıysa ilgili alana git
                    if (!uSarmal && hUygula.closest("#sohbetAkis")) {
                        var b = bolumuBul(sid);
                        if (b) bolumeGit(b.id, sid);
                    }
                }
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
                var metin = kart ? kartSafMetin(kart) : "";
                if (navigator.clipboard) navigator.clipboard.writeText(metin).catch(function () { /* yoksay */ });
                kopyalaBtn.textContent = "Kopyalandı ✓";
                setTimeout(function () { kopyalaBtn.textContent = "Kopyala"; }, 1500);
            }
        });
    }

    // ---- görevlerden belge önerisi (gelen + giden tablolarına taslak satır) ----
    function belgeAdiNorm(metin) {
        return String(metin || "").toLocaleLowerCase("tr-TR").trim().replace(/\s+/g, " ");
    }

    function mevcutBelgeAdlari(soruId) {
        var soru = null;
        try { soru = soruyuBul(soruId); } catch (e) { return []; }
        if (!soru) return [];
        var satirlar = [];
        try { satirlar = cevapOku(soru) || []; } catch (e) { satirlar = []; }
        return satirlar.map(function (s) { return (s && s.belge) || ""; }).filter(Boolean);
    }

    function belgeSatirEkle(soruId, degerler, harita) {
        var soru = null;
        try { soru = soruyuBul(soruId); } catch (e) { return null; }
        var govde = document.querySelector('[data-tablo="' + soruId + '"] tbody');
        if (!soru || !govde) return null;
        var idx = govde.rows.length;
        var tr = document.createElement("tr");
        tr.dataset.satir = String(idx);
        tr.innerHTML = soru.sutunlar.map(function (sutun) {
            var ham = maskeyiCoz(String(degerler[sutun.id] != null ? degerler[sutun.id] : ""), harita);
            var alan = hucreAlaniOlustur(soru, sutun, sutun.tip === "onay" ? [] : ham, idx);
            if (sutun.tip === "text" && soru.id === "gorevler" && sutun.id === "gorev") {
                return '<td><div class="gorev-hucre hucre-genis">' + alan + '<button type="button" class="button ghost small gorev-toggle" data-satir-genislet title="Tam metni göster">▾</button></div></td>';
            }
            if (sutun.tip === "text") {
                return "<td>" + alan + "</td>";
            }
            var dar = sutun.tip === "onay" || sutun.tip === "secim" ? ' class="hucre-dar"' : "";
            return "<td" + dar + ">" + alan + "</td>";
        }).join("") +
            '<td class="row-ops"><button type="button" class="button ghost small tasi-handle" draggable="true" data-satir-tasi="' + soruId + '" title="Sürükleyerek sırala">⠿</button><button type="button" class="button danger small" data-satir-sil="' + soruId + '">Sil</button></td>';
        govde.appendChild(tr);
        return tr;
    }

    function belgeBilgi(mesaj, ok) {
        var alan = document.querySelector('#questionSections .field[data-soru="gelen_belgeler"]');
        if (!alan) return;
        var eski = alan.querySelector(".belge-bilgi");
        if (eski) eski.remove();
        var div = document.createElement("div");
        div.className = "belge-bilgi" + (ok ? " ok" : "");
        div.textContent = mesaj;
        var sarmal = alan.querySelector(".table-wrap");
        if (sarmal && sarmal.after) sarmal.after(div);
        else alan.appendChild(div);
        div.scrollIntoView({ block: "nearest", behavior: "smooth" });
        setTimeout(function () { if (div.parentElement) div.remove(); }, 8000);
    }

    function belgeMesajlari(baglam) {
        var sistem = "Sen Türkçe yazan bir iş analizi editörüsün. Görev listesinden geçen belgeleri çıkarıp gelen/giden tablolarına dağıtırsın. SADECE geçerli JSON döndür.";
        var kullanici = baglam +
            '\n\nŞu formatta döndür:\n{"gelen":[{"belge":"...","bolum":"","islem":"...","siklik":"...","sure":""}],"giden":[{"belge":"...","yer_amac":"","siklik":"...","sure":""}]}' +
            "\nKurallar: yalnızca görevlerde adı geçen veya açıkça ima edilen belgeler; kontrol edilen/kullanılan girdi niteliğindekiler gelen, " +
            "üretilen/gönderilen çıktılar giden; yön belirsizse en mantıklı tek tarafa yaz; mevcut listedekileri tekrarlama; " +
            "bilinmeyen alanı boş string bırak; her liste en fazla 10 satır.";
        return [{ role: "system", content: sistem }, { role: "user", content: kullanici }];
    }

    async function belgeOner(dugme) {
        if (!window.LlmIstemci || !LlmIstemci.anahtarVar()) {
            ayarModaliniAc("Önce API anahtarınızı girin.");
            return;
        }
        var gorevSoru = null, rolSoru = null, unvanSoru = null;
        try {
            gorevSoru = soruyuBul("gorevler");
            rolSoru = soruyuBul("rol_amaci");
            unvanSoru = soruyuBul("unvan_pozisyon");
        } catch (e) { /* yoksay */ }
        if (!gorevSoru) return;
        var satirlar = [];
        try { satirlar = cevapOku(gorevSoru) || []; } catch (e) { satirlar = []; }
        if (!satirlar.length) {
            belgeBilgi("Önce 2.1 Görev ve sorumluluklar tablosunu doldurun.", false);
            return;
        }
        var ayar = LlmIstemci.ayarGetir();
        var harita = ayar.anonim ? maskeHaritasi() : [];
        var gorevMetni = satirlar.map(function (s, i) {
            var parcalar = [s.gorev, s.yuzde ? "%" + s.yuzde : "",
                [s.gunluk, s.belirli, s.duzensiz].filter(Boolean).join("/"),
                s.adet ? "adet:" + s.adet : ""].filter(Boolean).join(" | ");
            return (i + 1) + ". " + parcalar;
        }).join("\n");
        var baglam = "Pozisyon: " + kisaDeger(unvanSoru ? cevapOku(unvanSoru) : "").slice(0, 80) +
            "\nRol amacı: " + kisaDeger(rolSoru ? cevapOku(rolSoru) : "").slice(0, 200) +
            "\nGörevler (2.1):\n" + gorevMetni.slice(0, 2500) +
            "\nMevcut gelen belgeler: " + (mevcutBelgeAdlari("gelen_belgeler").join("; ") || "(yok)") +
            "\nMevcut giden belgeler: " + (mevcutBelgeAdlari("giden_belgeler").join("; ") || "(yok)");
        if (ayar.anonim) baglam = maskele(baglam, harita);
        var eski = dugme ? dugme.textContent : "";
        if (dugme) { dugme.disabled = true; dugme.textContent = "Belgeler çıkarılıyor…"; }
        try {
            var metin = await LlmIstemci.sohbet(belgeMesajlari(baglam), true);
            var veri = LlmIstemci.jsonAyikla(metin);
            var gelenSet = {};
            mevcutBelgeAdlari("gelen_belgeler").forEach(function (b) { gelenSet[belgeAdiNorm(b)] = 1; });
            var gidenSet = {};
            mevcutBelgeAdlari("giden_belgeler").forEach(function (b) { gidenSet[belgeAdiNorm(b)] = 1; });
            // Tek tek ekleme: adaylar doğrudan tabloya yazılmaz, her tablonun
            // altında kart olarak listelenir; kullanıcı istediğini "Satır olarak ekle" ile alır.
            var atlanan = 0;
            var gelenAday = [];
            (Array.isArray(veri.gelen) ? veri.gelen.slice(0, 10) : []).forEach(function (o) {
                if (!o || !String(o.belge || "").trim()) return;
                var anahtar = belgeAdiNorm(maskeyiCoz(o.belge, harita));
                if (gelenSet[anahtar]) { atlanan++; return; }
                gelenSet[anahtar] = 1;
                gelenAday.push({ belge: maskeyiCoz(o.belge, harita), bolum: maskeyiCoz(o.bolum, harita), islem: maskeyiCoz(o.islem, harita), siklik: maskeyiCoz(o.siklik, harita), sure: maskeyiCoz(o.sure, harita) });
            });
            var gidenAday = [];
            (Array.isArray(veri.giden) ? veri.giden.slice(0, 10) : []).forEach(function (o) {
                if (!o || !String(o.belge || "").trim()) return;
                var anahtar = belgeAdiNorm(maskeyiCoz(o.belge, harita));
                if (gidenSet[anahtar]) { atlanan++; return; }
                gidenSet[anahtar] = 1;
                gidenAday.push({ belge: maskeyiCoz(o.belge, harita), yer_amac: maskeyiCoz(o.yer_amac, harita), siklik: maskeyiCoz(o.siklik, harita), sure: maskeyiCoz(o.sure, harita) });
            });
            if (gelenAday.length) ornekSatirCiz("gelen_belgeler", gelenAday, [], "Belge önerileri — inceleyip tek tek ekleyin");
            if (gidenAday.length) ornekSatirCiz("giden_belgeler", gidenAday, [], "Belge önerileri — inceleyip tek tek ekleyin");
            try {
                if (typeof ilerlemeHesapla === "function") ilerlemeHesapla();
            } catch (e) { /* yoksay */ }
            durumGuncelle();
            if (!gelenAday.length && !gidenAday.length) {
                belgeBilgi(atlanan ? "Yeni belge bulunamadı (" + atlanan + " tekrar atlandı)." : "Görevlerden belge çıkarılamadı.", false);
            } else {
                belgeBilgi(gelenAday.length + " gelen + " + gidenAday.length + " giden öneri listelendi." +
                    (atlanan ? " (" + atlanan + " tekrar atlandı)" : "") + " İstediklerinizi tek tek ekleyin.", true);
            }
        } catch (e) {
            belgeBilgi("Belge önerisi alınamadı: " + (e.message || e), false);
        } finally {
            if (dugme) { dugme.disabled = false; dugme.textContent = eski || "📥 Görevlerdeki belgeleri öner"; }
        }
    }

    function belgeOnerButonlariniEkle() {
        ["gelen_belgeler", "giden_belgeler"].forEach(function (id) {
            var alan = document.querySelector('#questionSections .field[data-soru="' + id + '"]');
            if (!alan || alan.querySelector("[data-belge-oner]")) return;
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "button secondary small";
            btn.dataset.belgeOner = "1";
            btn.textContent = "📥 Görevlerdeki belgeleri öner";
            btn.title = "2.1'deki görevlerden gelen + giden belge önerileri üretir, tek tek eklersiniz";
            btn.addEventListener("click", function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                belgeOner(btn);
            });
            var sira = document.createElement("div");
            sira.className = "belge-oner-sira";
            sira.appendChild(btn);
            var sarmal = alan.querySelector(".table-wrap");
            if (sarmal) alan.insertBefore(sira, sarmal);
            else alan.appendChild(sira);
        });
    }

    // ---- görevlerden girdi önerisi (2.4 + 2.7 metin alanlarına tek tek eklenir) ----
    var girdiOneriDeposu = {};
    var GIRDI_ALANLARI = ["girdiler_birimler", "kullanilan_girdiler"];

    function girdiAdiNorm(metin) {
        return String(metin || "").toLocaleLowerCase("tr-TR").trim().replace(/\s+/g, " ");
    }

    function alanBilgi(alanId, mesaj, ok) {
        var alan = document.querySelector('#questionSections .field[data-soru="' + alanId + '"]');
        if (!alan) return;
        var eski = alan.querySelector(".belge-bilgi");
        if (eski) eski.remove();
        var div = document.createElement("div");
        div.className = "belge-bilgi" + (ok ? " ok" : "");
        div.textContent = mesaj;
        alan.appendChild(div);
        div.scrollIntoView({ block: "nearest", behavior: "smooth" });
        setTimeout(function () { if (div.parentElement) div.remove(); }, 8000);
    }

    function girdiMesajlari(baglam) {
        var sistem = "Sen Türkçe yazan bir iş analizi editörüsün. Görev listesinden o iş için gereken girdileri çıkarırsın. SADECE geçerli JSON döndür.";
        var kullanici = baglam +
            '\n\nŞu formatta döndür:\n{"girdiler":[{"girdi":"...","birim":"...","not":"..."}]}' +
            "\nKurallar: yalnızca görevlerde adı geçen veya açıkça ima edilen girdiler (hammadde, bilgi, hedef, malzeme, evrak, sistem verisi...); " +
            "birim = girdiyi sağlayan birim/bölüm (bilinmiyorsa boş string); mevcut listedekileri tekrarlama; " +
            "bilinmeyen alanı boş string bırak; en fazla 10 kayıt.";
        return [{ role: "system", content: sistem }, { role: "user", content: kullanici }];
    }

    function girdiSatirMetni(aday) {
        var g = String((aday && aday.girdi) || "").trim();
        var b = String((aday && aday.birim) || "").trim();
        return b ? (g + " — " + b) : g;
    }

    function girdiOneriCiz(alanId, adaylar) {
        var alan = document.querySelector('#questionSections .field[data-soru="' + alanId + '"]');
        if (!alan) return;
        girdiOneriDeposu[alanId] = adaylar;
        var eski = alan.querySelector(".girdi-sonuc");
        if (eski) eski.remove();
        var kutu = document.createElement("div");
        kutu.className = "hucre-sonuc girdi-sonuc";
        kutu.innerHTML = '<div class="asistan-baslik">Girdi önerileri — inceleyip tek tek ekleyin (' + adaylar.length + ")</div>" + adaylar.map(function (a, i) {
            return '<div class="oneri-karti" data-girdi-kart="' + i + '">' +
                '<span class="oneri-tur">girdi adayı</span>' +
                '<div class="oneri-metin">' + esc(girdiSatirMetni(a)) + "</div>" +
                (a.not ? '<div class="oneri-gerekce">' + esc(a.not) + "</div>" : "") +
                '<div class="oneri-islemler"><button type="button" class="button primary small" data-girdi-ekle="' + i +
                '" data-girdi-alan="' + esc(alanId) + '">Ekle</button>' +
                '<button type="button" class="button ghost small" data-oneri-kapat>Kapat</button></div></div>';
        }).join("");
        alan.appendChild(kutu);
        kutu.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    async function girdiOner(alanId, dugme) {
        if (!window.LlmIstemci || !LlmIstemci.anahtarVar()) {
            ayarModaliniAc("Önce API anahtarınızı girin.");
            return;
        }
        var gorevSoru = null, rolSoru = null, unvanSoru = null;
        try {
            gorevSoru = soruyuBul("gorevler");
            rolSoru = soruyuBul("rol_amaci");
            unvanSoru = soruyuBul("unvan_pozisyon");
        } catch (e) { /* yoksay */ }
        if (!gorevSoru) return;
        var satirlar = [];
        try { satirlar = cevapOku(gorevSoru) || []; } catch (e) { satirlar = []; }
        if (!satirlar.length) {
            alanBilgi(alanId, "Önce 2.1 Görev ve sorumluluklar tablosunu doldurun.", false);
            return;
        }
        var ayar = LlmIstemci.ayarGetir();
        var harita = ayar.anonim ? maskeHaritasi() : [];
        var gorevMetni = satirlar.map(function (s, i) {
            return (i + 1) + ". " + String(s.gorev || "");
        }).join("\n");
        var mevcut = "";
        try { mevcut = kisaDeger(cevapOku(soruyuBul(alanId))); } catch (e) { mevcut = ""; }
        var baglam = "Pozisyon: " + kisaDeger(unvanSoru ? cevapOku(unvanSoru) : "").slice(0, 80) +
            "\nRol amacı: " + kisaDeger(rolSoru ? cevapOku(rolSoru) : "").slice(0, 200) +
            "\nGörevler (2.1):\n" + gorevMetni.slice(0, 2500) +
            "\nMevcut girdiler: " + (String(mevcut || "").slice(0, 500) || "(yok)");
        if (ayar.anonim) baglam = maskele(baglam, harita);
        var eski = dugme ? dugme.textContent : "";
        if (dugme) { dugme.disabled = true; dugme.textContent = "Girdiler çıkarılıyor…"; }
        try {
            var metin = await LlmIstemci.sohbet(girdiMesajlari(baglam), true);
            var veri = LlmIstemci.jsonAyikla(metin);
            var mevcutNorm = girdiAdiNorm(maskeyiCoz(mevcut, harita));
            var gorulen = {};
            var adaylar = [];
            var atlanan = 0;
            (Array.isArray(veri.girdiler) ? veri.girdiler.slice(0, 10) : []).forEach(function (o) {
                if (!o || !String(o.girdi || "").trim()) return;
                var g = String(maskeyiCoz(o.girdi, harita)).trim();
                var anahtar = girdiAdiNorm(g);
                if (!anahtar || gorulen[anahtar] || (mevcutNorm && mevcutNorm.indexOf(anahtar) !== -1)) { atlanan++; return; }
                gorulen[anahtar] = 1;
                adaylar.push({ girdi: g, birim: String(maskeyiCoz(o.birim, harita) || "").trim(), not: String(maskeyiCoz(o.not, harita) || "").trim() });
            });
            if (!adaylar.length) {
                alanBilgi(alanId, atlanan ? "Yeni girdi bulunamadı (" + atlanan + " tekrar atlandı)." : "Görevlerden girdi çıkarılamadı.", false);
            } else {
                girdiOneriCiz(alanId, adaylar);
                alanBilgi(alanId, adaylar.length + " girdi önerisi listelendi." +
                    (atlanan ? " (" + atlanan + " tekrar atlandı)" : "") + " İstediklerinizi tek tek ekleyin.", true);
            }
            durumGuncelle();
        } catch (e) {
            alanBilgi(alanId, "Girdi önerisi alınamadı: " + (e.message || e), false);
        } finally {
            if (dugme) { dugme.disabled = false; dugme.textContent = eski || "📥 Görevlerden girdi öner"; }
        }
    }

    function girdiOnerButonlariniEkle() {
        GIRDI_ALANLARI.forEach(function (id) {
            var alan = document.querySelector('#questionSections .field[data-soru="' + id + '"]');
            if (!alan || alan.querySelector("[data-girdi-oner]")) return;
            var girdi = alan.querySelector("textarea.input, input.input");
            if (!girdi) return;
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "button secondary small";
            btn.dataset.girdiOner = "1";
            btn.textContent = "📥 Görevlerden girdi öner";
            btn.title = "2.1'deki görevlerden girdi önerileri üretir, tek tek eklersiniz";
            btn.addEventListener("click", function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                girdiOner(id, btn);
            });
            var sira = document.createElement("div");
            sira.className = "belge-oner-sira";
            sira.appendChild(btn);
            alan.insertBefore(sira, girdi);
        });
    }

    // ---- yan sohbet: bölümler arası tutarlılık + serbest soru ----
    var sohbetGecmisi = [];

    function bolumBasligi(bolumId) {
        if (typeof IS_ANALIZI_SORULARI === "undefined") return "";
        var b = IS_ANALIZI_SORULARI.find(function (x) { return x.id === bolumId; });
        return b ? b.baslik : "";
    }

    function formOzetiKompakt(harita, anonim, azami) {
        var cikti = [];
        IS_ANALIZI_SORULARI.forEach(function (b) {
            var satirlar = [];
            b.sorular.forEach(function (soru) {
                var v;
                try { v = cevapOku(soru); } catch (e) { return; }
                if (soru.tip === "tablo") {
                    if (Array.isArray(v) && v.length) {
                        var oz = v.slice(0, 6).map(function (r, i) {
                            var vals = Object.keys(r).map(function (k) {
                                var x = r[k];
                                return Array.isArray(x) ? x.join("+") : String(x == null ? "" : x);
                            }).filter(Boolean);
                            return (i + 1) + "." + vals.slice(0, 3).join("/").slice(0, 80);
                        }).join("; ");
                        satirlar.push(soru.id + " [tablo " + v.length + " satır]: " + oz.slice(0, 300));
                    }
                    return;
                }
                var t = kisaDeger(v).trim();
                if (t) satirlar.push(soru.id + ": " + t.slice(0, 120));
            });
            if (satirlar.length) cikti.push("## " + b.baslik + " (" + b.id + ")\n" + satirlar.join("\n"));
        });
        var metin = cikti.join("\n\n");
        if (anonim) metin = maskele(metin, harita);
        return metin.slice(0, azami || 6000);
    }

    function sohbetEkle(kim, icerik) {
        var akis = document.getElementById("sohbetAkis");
        if (!akis) return null;
        var div = document.createElement("div");
        div.className = "sohbet-msg " + kim;
        if (icerik instanceof Node) div.appendChild(icerik);
        else div.innerHTML = icerik;
        akis.appendChild(div);
        akis.scrollTop = akis.scrollHeight;
        return div;
    }

    // Hafif markdown: **kalın**, madde ve numaralı listeler (asistan cevapları için)
    function markdownLite(metin) {
        var satirlar = String(metin || "").split("\n");
        var html = "", liste = null;
        function satirici(s) {
            return esc(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
        }
        function listeKapat() {
            if (liste) { html += "</" + liste + ">"; liste = null; }
        }
        satirlar.forEach(function (ham) {
            var s = ham.trim();
            var m;
            if ((m = s.match(/^([-*•])\s+(.*)/))) {
                if (liste !== "ul") { listeKapat(); html += "<ul>"; liste = "ul"; }
                html += "<li>" + satirici(m[2]) + "</li>";
            } else if ((m = s.match(/^\d+[.)]\s+(.*)/))) {
                if (liste !== "ol") { listeKapat(); html += "<ol>"; liste = "ol"; }
                html += "<li>" + satirici(m[1]) + "</li>";
            } else if (!s) {
                listeKapat();
            } else {
                listeKapat();
                html += "<p>" + satirici(s) + "</p>";
            }
        });
        listeKapat();
        return html;
    }

    function sohbetMetinEkle(kim, metin) {
        var div = document.createElement("div");
        div.className = "sohbet-metin";
        if (kim === "asistan") div.innerHTML = markdownLite(metin);
        else div.textContent = metin;
        return sohbetEkle(kim, div);
    }

    function bolumeGit(bolumId, soruId, satirNo) {
        if (!bolumId) return;
        var section = document.querySelector('[data-bolum="' + bolumId + '"]');
        if (section) {
            section.classList.remove("collapsed");
            section.scrollIntoView({ block: "start", behavior: "smooth" });
            section.classList.add("flash");
            setTimeout(function () { section.classList.remove("flash"); }, 1800);
        }
        if (soruId) {
            var alan = document.querySelector('[data-soru="' + soruId + '"]');
            if (alan) {
                setTimeout(function () {
                    alan.scrollIntoView({ block: "center", behavior: "smooth" });
                    alan.classList.add("alan-vurgu");
                    setTimeout(function () { alan.classList.remove("alan-vurgu"); }, 1800);
                }, 400);
            }
        }
        if (satirNo && soruId) {
            setTimeout(function () { satiriVurgula(soruId, satirNo); }, 750);
        }
    }

    // ---- form içi kelime/isim arama (yerel, kotasız, anlık) ----
    function aramaTerimiCikar(mesaj) {
        var m = String(mesaj || "").trim();
        if (!m) return "";
        var alinti = m.match(/["“”']([^"“”']{2,60})["“”']/);
        if (alinti) return alinti[1].trim();
        var k = m.toLocaleLowerCase("tr-TR");
        var son = k.match(/^(.{2,60}?)\s+(nerede geçiyor|nerede yazıyor|nerede|nerelerde|ara|bul|göster|goster|liste|listele)\??\s*$/);
        if (son) return m.slice(son.index, son.index + son[1].length).trim();
        var bas = k.match(/^(ara|bul|göster|goster)\s+(.{2,60})\??\s*$/);
        if (bas) return m.slice(bas.index + bas[1].length, bas.index + bas[0].length).replace(/\?+\s*$/, "").trim();
        return "";
    }

    // Türkçe ekleri tolere et: "faturayı" → fatura, "mutabakatı" → mutabakat, "onayı" → onay
    function terimAdaylari(terim) {
        var t = String(terim || "").trim();
        if (t.length < 2) return [];
        var adaylar = [t];
        var ekle = function (s) {
            s = String(s || "").trim();
            if (s.length >= 4 && adaylar.indexOf(s) === -1) adaylar.push(s);
        };
        ekle(t.replace(/['’][yns][ıiuü]$/i, ""));
        ekle(t.replace(/[aeıioöuü]y[ıiuü]$/i, function (m) { return m.charAt(0); }));
        ekle(t.replace(/([aeıioöuü])y[ıiuü]$/i, "$1y"));
        ekle(t.replace(/[^aeıioöuü'’][yns][ıiuü]$/i, function (m) { return m.charAt(0); }));
        ekle(t.replace(/s[ıiuü]$/i, ""));
        ekle(t.replace(/([tdk])[ıiuü]$/i, "$1"));
        ekle(t.replace(/[ıiuü]$/i, ""));
        return adaylar;
    }

    function formdaAra(terim) {
        var adaylar = terimAdaylari(terim).map(function (a) { return a.toLocaleLowerCase("tr-TR"); });
        if (!adaylar.length) return [];
        var sonuclar = [];
        var gorulen = {};
        IS_ANALIZI_SORULARI.forEach(function (b) {
            b.sorular.forEach(function (soru) {
                var v;
                try { v = cevapOku(soru); } catch (e) { return; }
                var vurdu = function (metin) {
                    var kk = String(metin || "").toLocaleLowerCase("tr-TR");
                    return adaylar.some(function (a) { return kk.indexOf(a) !== -1; });
                };
                if (soru.tip === "tablo") {
                    if (!Array.isArray(v)) return;
                    v.forEach(function (satir, i) {
                        Object.keys(satir).forEach(function (cid) {
                            var x = satir[cid];
                            var metin = Array.isArray(x) ? x.join(" ") : String(x == null ? "" : x);
                            if (metin.trim() && vurdu(metin)) {
                                var anahtar = b.id + "|" + soru.id + "|" + i + "|" + cid;
                                if (gorulen[anahtar]) return;
                                gorulen[anahtar] = 1;
                                sonuclar.push({ bolumId: b.id, bolum: b.baslik, soruId: soru.id, etiket: soru.etiket, satirNo: i + 1, eslesme: metin.slice(0, 160) });
                            }
                        });
                    });
                    return;
                }
                var metin = Array.isArray(v) ? v.join(" ") : String(v == null ? "" : v);
                if (metin.trim() && vurdu(metin)) {
                    var anahtar = b.id + "|" + soru.id;
                    if (gorulen[anahtar]) return;
                    gorulen[anahtar] = 1;
                    sonuclar.push({ bolumId: b.id, bolum: b.baslik, soruId: soru.id, etiket: soru.etiket, satirNo: 0, eslesme: metin.slice(0, 160) });
                }
            });
        });
        return sonuclar.slice(0, 30);
    }

    function parcaVurgula(metin, terim) {
        var kk = String(metin || ""), ti = String(terim || "").toLocaleLowerCase("tr-TR");
        var ki = kk.toLocaleLowerCase("tr-TR");
        var idx = ki.indexOf(ti);
        if (idx === -1 || !ti) return esc(kk.slice(0, 140));
        var bas = Math.max(0, idx - 40), son = Math.min(kk.length, idx + String(terim).length + 40);
        return (bas > 0 ? "…" : "") + esc(kk.slice(bas, idx)) + "<mark>" + esc(kk.slice(idx, idx + String(terim).length)) + "</mark>" +
            esc(kk.slice(idx + String(terim).length, son)) + (son < kk.length ? "…" : "");
    }

    function aramaSonuclariniCiz(terim, sonuclar) {
        var kutu = document.createElement("div");
        kutu.className = "sohbet-uyari-liste";
        kutu.innerHTML = '<div class="asistan-baslik">“' + esc(terim) + "” — " + sonuclar.length + " sonuç</div>" + sonuclar.map(function (r) {
            return '<div class="oneri-karti">' +
                '<div class="oneri-alan">' + esc(r.bolum) + " • " + esc(r.etiket) + (r.satirNo ? " • Satır " + r.satirNo : "") + "</div>" +
                '<div class="oneri-gerekce">' + parcaVurgula(r.eslesme, terim) + "</div>" +
                '<div class="oneri-islemler"><button type="button" class="button secondary small" data-git-bolum="' + esc(r.bolumId) +
                '" data-git-soru="' + esc(r.soruId) + '"' + (r.satirNo ? ' data-git-satir="' + r.satirNo + '"' : "") + ">Git</button>" +
                '<button type="button" class="button ghost small" data-oneri-kapat>Kapat</button></div></div>';
        }).join("");
        sohbetEkle("asistan", kutu);
    }

    function anahtarYoksaAc() {
        if (window.LlmIstemci && LlmIstemci.anahtarVar()) return false;
        ayarModaliniAc("Önce API anahtarınızı girin.");
        return true;
    }

    function duzeltilebilirMi(soruId) {
        var soru = null;
        try { soru = soruyuBul(soruId); } catch (e) { return false; }
        return !!soru && (soru.tip === "text" || soru.tip === "textarea" || soru.tip === "secim" || soru.tip === "liste");
    }

    function duzeltmeMesajlari(etiket, mevcut, uyari) {
        var sistem = "Sen Türkçe yazan bir iş analizi editörüsün. Bir tutarlılık uyarısını giderecek düzeltilmiş metni üretirsin. SADECE geçerli JSON döndür.";
        var kullanici = "Alan: " + etiket + "\nMevcut cevap: " + (mevcut || "(boş)") + "\nUyarı: " + uyari +
            "\n\nKurallar: yalnızca uyarıyı giderecek en küçük değişikliği yap; anlamı ve diğer bilgileri koru; " +
            "yeni olgu, rakam veya örnek uydurma." +
            '\nŞu formatta döndür: {"duzeltme":"..."}';
        return [{ role: "system", content: sistem }, { role: "user", content: kullanici }];
    }

    async function duzeltmeHazirla(soruId, uyariMesaj, dugme) {
        if (anahtarYoksaAc()) return;
        var soru = null;
        try { soru = soruyuBul(soruId); } catch (e) { soru = null; }
        if (!soru) return;
        var ayar = LlmIstemci.ayarGetir();
        var harita = ayar.anonim ? maskeHaritasi() : [];
        var mevcut = "";
        try { mevcut = kisaDeger(cevapOku(soru)).slice(0, 500); } catch (e) { mevcut = ""; }
        if (ayar.anonim) mevcut = maskele(mevcut, harita);
        var eski = dugme.textContent;
        dugme.disabled = true;
        dugme.textContent = "Hazırlanıyor…";
        try {
            var metin = await LlmIstemci.sohbet(duzeltmeMesajlari(soru.etiket, mevcut, uyariMesaj), true);
            var veri = LlmIstemci.jsonAyikla(metin);
            var duz = String((veri && veri.duzeltme) || "").trim();
            if (!duz) throw new Error("Boş yanıt geldi.");
            duz = maskeyiCoz(duz, harita);
            var canli = "";
            var g = hedefGirdi(soruId);
            if (g) canli = g.value || "";
            var wrap = document.createElement("div");
            wrap.dataset.harita = JSON.stringify(harita);
            wrap.innerHTML = '<div class="hucre-oneri" data-hucre-oneri-kart="dz">' +
                '<span class="oneri-tur">✨ Düzeltme önerisi</span>' +
                oneriMetinHtml({ mevcut: canli, oneri: duz }) +
                '<div class="oneri-islemler"><button type="button" class="button primary small" data-hucre-uygula="dz" data-soru="' + esc(soruId) + '">Uygula ve git</button>' +
                '<button type="button" class="button ghost small" data-oneri-kapat>Kapat</button></div></div>';
            sohbetEkle("asistan", wrap);
            durumGuncelle();
        } catch (e) {
            sohbetEkle("asistan", "Düzeltme hazırlanamadı: " + esc(e.message || e));
        } finally {
            dugme.disabled = false;
            dugme.textContent = eski;
        }
    }

    function tutarlikMesajlari(ozet) {
        var sistem = "Sen Türkçe yazan bir iş analizi denetçisisin. BÖLÜMLER ARASI tutarlılık hatalarını ve kritik eksikleri bulursun. SADECE geçerli JSON döndür.";
        var kullanici = "Form özeti (bölüm | alan: cevap):\n" + ozet +
            '\n\nŞu formatta döndür: {"uyarilar":[{"bolumId":"...","soruId":"... ya da null","tur":"tutarsizlik|eksik|oner","mesaj":"tek cümlelik açıklama"}]}' +
            "\nKurallar: en fazla 12 uyarı; tek bölümde kalan yazım hataları DEĞİL, bölümler arası çelişkiler ve kritik eksikler; " +
            "ör. yüzdeler toplamı ≠ %100, işaretli seçenek ama boş detay, personel/seyahat/yetki/kontrol çelişkileri, boş kritik alanlar.";
        return [{ role: "system", content: sistem }, { role: "user", content: kullanici }];
    }

    async function tutarlikKontrolu() {
        if (anahtarYoksaAc()) return;
        var yuk = sohbetEkle("asistan", '<span class="sohbet-yaziyor">Form taranıyor…</span>');
        if (!yuk) return;
        try {
            var ayar = LlmIstemci.ayarGetir();
            var harita = ayar.anonim ? maskeHaritasi() : [];
            var ozet = formOzetiKompakt(harita, ayar.anonim, 6000);
            if (!ozet.trim()) {
                yuk.innerHTML = "Henüz doldurulmuş alan yok. Önce birkaç bölüm doldurun.";
                return;
            }
            var metin = await LlmIstemci.sohbet(tutarlikMesajlari(ozet), true);
            var veri = LlmIstemci.jsonAyikla(metin);
            var liste = (Array.isArray(veri.uyarilar) ? veri.uyarilar : []).slice(0, 12);
            yuk.remove();
            if (!liste.length) {
                sohbetEkle("asistan", "Bölümler arası tutarsızlık bulunamadı. ✅");
                return;
            }
            var kutu = document.createElement("div");
            kutu.className = "sohbet-uyari-liste";
            kutu.innerHTML = '<div class="asistan-baslik">Tutarlılık kontrolü (' + liste.length + ")</div>" + liste.map(function (o) {
                var rozet = o.tur === "tutarsizlik" ? "⚠️" : (o.tur === "eksik" ? "⬜" : "💡");
                var baslik = bolumBasligi(o.bolumId);
                var islemler = "";
                if (duzeltilebilirMi(o.soruId)) {
                    islemler += '<button type="button" class="button primary small" data-duzelt-soru="' + esc(o.soruId) +
                        '" data-duzelt-uyari="' + esc(o.mesaj || "") + '">Düzeltme öner</button>';
                }
                if (o.bolumId) {
                    islemler += '<button type="button" class="button secondary small" data-git-bolum="' + esc(o.bolumId) + '"' +
                        (o.soruId ? ' data-git-soru="' + esc(o.soruId) + '"' : "") + ">Git</button>";
                }
                islemler += '<button type="button" class="button ghost small" data-oneri-kapat>Kapat</button>';
                return '<div class="oneri-karti">' +
                    '<span class="oneri-tur">' + rozet + " " + esc(o.tur || "uyarı") + "</span>" +
                    (baslik ? '<div class="oneri-alan">' + esc(baslik) + "</div>" : "") +
                    '<div class="oneri-metin">' + esc(o.mesaj || "") + "</div>" +
                    (islemler ? '<div class="oneri-islemler">' + islemler + "</div>" : "") +
                    "</div>";
            }).join("");
            sohbetEkle("asistan", kutu);
            durumGuncelle();
        } catch (e) {
            yuk.innerHTML = "Hata: " + esc(e.message || e);
        }
    }

    async function formOzeti() {
        if (anahtarYoksaAc()) return;
        var yuk = sohbetEkle("asistan", '<span class="sohbet-yaziyor">Özet hazırlanıyor…</span>');
        if (!yuk) return;
        try {
            var ayar = LlmIstemci.ayarGetir();
            var harita = ayar.anonim ? maskeHaritasi() : [];
            var ozet = formOzetiKompakt(harita, ayar.anonim, 5000);
            if (!ozet.trim()) {
                yuk.innerHTML = "Henüz doldurulmuş alan yok.";
                return;
            }
            var cevap = await LlmIstemci.sohbet([
                { role: "system", content: "Sen iş analizi formu değerlendiren Türkçe bir asistansın. SADECE düz metin döndür." },
                { role: "user", content: "Aşağıdaki formun doldurulma durumunu değerlendir: hangi bölümler güçlü, hangileri yüzeysel, " +
                    "detaylı bir çıktı için en kritik 3 eksik ne? En fazla 120 kelime, madde listesi, Türkçe.\n\n" + ozet }
            ], false);
            yuk.remove();
            sohbetMetinEkle("asistan", String(cevap || "").trim());
            sohbetGecmisi.push({ kim: "ozet", metin: String(cevap || "").slice(0, 500) });
            durumGuncelle();
        } catch (e) {
            yuk.innerHTML = "Hata: " + esc(e.message || e);
        }
    }

    async function sohbetSor(soruMetni) {
        sohbetMetinEkle("ben", soruMetni);
        // Kelime/isim araması: önce formda birebir ara (kotasız, anlık)
        var terim = aramaTerimiCikar(soruMetni);
        if (terim) {
            var bulunan = formdaAra(terim);
            if (bulunan.length) {
                aramaSonuclariniCiz(terim, bulunan);
                return;
            }
            sohbetEkle("asistan", "“" + esc(terim) + "” formda bulunamadı — yazımı kontrol edip tekrar deneyin veya sorunuzu yazın.");
            return;
        }
        var yuk = sohbetEkle("asistan", '<span class="sohbet-yaziyor">Düşünüyor…</span>');
        if (!yuk) return;
        try {
            var ayar = LlmIstemci.ayarGetir();
            var harita = ayar.anonim ? maskeHaritasi() : [];
            var ozet = formOzetiKompakt(harita, ayar.anonim, 4000);
            var mesajlar = [{ role: "system", content: "Sen iş analizi formu doldurmaya yardım eden Türkçe bir asistansın. " +
                "Kısa ve pratik cevap ver (en fazla 120 kelime). Gerekirse hangi bölüme/alan bakılacağını söyle." }];
            sohbetGecmisi.filter(function (h) { return h.kim === "ben" || h.kim === "asistan"; }).slice(-4).forEach(function (h) {
                mesajlar.push({ role: h.kim === "ben" ? "user" : "assistant", content: h.metin });
            });
            mesajlar.push({ role: "user", content: "Form özeti:\n" + ozet + "\n\nSoru: " + soruMetni });
            var cevap = await LlmIstemci.sohbet(mesajlar, false);
            yuk.remove();
            cevap = String(cevap || "").trim();
            sohbetMetinEkle("asistan", cevap);
            sohbetGecmisi.push({ kim: "ben", metin: soruMetni }, { kim: "asistan", metin: cevap.slice(0, 500) });
            if (sohbetGecmisi.length > 12) sohbetGecmisi = sohbetGecmisi.slice(-12);
            durumGuncelle();
        } catch (e) {
            yuk.innerHTML = "Hata: " + esc(e.message || e);
        }
    }

    function sohbetKotaGuncelle() {
        var el = document.getElementById("sohbetKota");
        if (!el || !window.LlmIstemci) return;
        if (!LlmIstemci.anahtarVar()) { el.textContent = "Anahtar yok"; return; }
        var k = LlmIstemci.kotaDurumu();
        el.textContent = "Kalan " + k.kalan + "/" + k.limit;
    }

    function sohbetOlaylari() {
        var panel = document.getElementById("sohbetPaneli");
        var ac = document.getElementById("sohbetAcBtn");
        if (ac) ac.addEventListener("click", function () {
            if (!panel) return;
            panel.classList.toggle("hidden");
            if (!panel.classList.contains("hidden")) {
                sohbetKotaGuncelle();
                if (!panel.dataset.karsilandi) {
                    panel.dataset.karsilandi = "1";
                    sohbetEkle("asistan", "Merhaba 👋 <b>Tutarlılık Kontrolü</b> ile formu taratabilir, <b>'kelime' nerede geçiyor?</b> diye arayabilir veya sorunuzu yazabilirsiniz.");
                }
                var giris = document.getElementById("sohbetMetin");
                if (giris) giris.focus();
            }
        });
        var kapat = document.getElementById("sohbetKapatBtn");
        if (kapat) kapat.addEventListener("click", function () {
            if (panel) panel.classList.add("hidden");
        });
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && panel && !panel.classList.contains("hidden")) panel.classList.add("hidden");
        });
        var akis = document.getElementById("sohbetAkis");
        if (akis) akis.addEventListener("click", function (e) {
            // Beğenilmeyen kartı kapat (sohbet geçmişi korunur, boş kutu kalkar)
            var sk = e.target.closest("[data-oneri-kapat]");
            if (sk) {
                var skart = sk.closest(".oneri-karti, .hucre-oneri");
                var smsg = sk.closest(".sohbet-msg");
                var sliste = sk.closest(".sohbet-uyari-liste");
                if (skart) skart.remove();
                if (sliste && !sliste.querySelector(".oneri-karti")) sliste.remove();
                if (smsg && !smsg.querySelector(".oneri-karti, .hucre-oneri") && !smsg.textContent.trim()) smsg.remove();
                return;
            }
            // Sohbetteki "Uygula ve git": alana yaz + ilgili bölüme git
            var hu = e.target.closest("[data-hucre-uygula]");
            if (hu && hu.closest("#sohbetAkis")) {
                var hsid = hu.dataset.soru;
                var hkart = hu.closest("[data-hucre-oneri-kart]");
                if (hsid && hkart) {
                    hucreUygula(hsid, hkart);
                    var hb = bolumuBul(hsid);
                    if (hb) bolumeGit(hb.id, hsid);
                }
                return;
            }
            var dz = e.target.closest("[data-duzelt-soru]");
            if (dz) {
                duzeltmeHazirla(dz.dataset.duzeltSoru, dz.dataset.duzeltUyari || "", dz);
                return;
            }
            var git = e.target.closest("[data-git-bolum]");
            if (git) bolumeGit(git.dataset.gitBolum, git.dataset.gitSoru || null, parseInt(git.dataset.gitSatir || "0", 10) || null);
        });
        document.querySelectorAll("[data-hizli-islem]").forEach(function (btn) {
            btn.addEventListener("click", function () {
                if (btn.dataset.hizliIslem === "tutarlik") tutarlikKontrolu();
                else if (btn.dataset.hizliIslem === "ozet") formOzeti();
            });
        });
        var cip = document.getElementById("sohbetCip");
        if (cip) cip.addEventListener("click", function (e) {
            var d = e.target.closest("[data-cip-doldur]");
            if (d) {
                var giris = document.getElementById("sohbetMetin");
                if (giris) { giris.value = d.dataset.cipDoldur; giris.focus(); }
                return;
            }
            var b = e.target.closest("[data-cip]");
            if (!b) return;
            if (anahtarYoksaAc()) return;
            sohbetSor(b.dataset.cip);
        });
        var form = document.getElementById("sohbetForm");
        if (form) form.addEventListener("submit", function (e) {
            e.preventDefault();
            var giris = document.getElementById("sohbetMetin");
            if (!giris) return;
            if (anahtarYoksaAc()) return;
            var soru = giris.value.trim().slice(0, 500);
            if (!soru) return;
            giris.value = "";
            sohbetSor(soru);
        });
    }

    // form.js soruları senkron çizer; asistan sonradan takılır.
    // Her alt sistem izole çalışır: biri hata verirse diğerleri etkilenmez.
    function guvenliCalistir(ad, fn) {
        try { fn(); } catch (e) { console.error("Asistan alt sistemi hata verdi:", ad, e); }
    }
    guvenliCalistir("bolum", bolumButonlariniEkle);
    guvenliCalistir("belge", belgeOnerButonlariniEkle);
    guvenliCalistir("girdi", girdiOnerButonlariniEkle);
    guvenliCalistir("hucre", hucreButonlariniEkle);
    guvenliCalistir("gecmis", gecmisOlaylari);
    guvenliCalistir("manuel", manuelIzleme);
    guvenliCalistir("sohbet", sohbetOlaylari);
    guvenliCalistir("modal", modalOlaylari);
    guvenliCalistir("sonuc", sonucTiklamalari);
    guvenliCalistir("durum", durumGuncelle);
})();
