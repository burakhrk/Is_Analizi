// Geri Al / Yinele: elle yapılan alan değişikliklerini izler (odak fotoğrafı + odaktan
// çıkışta tek adım). form.js ile aynı global alanı paylaşır; çakışmamak için IIFE içindedir.
(function () {
    "use strict";

    var gecmis = [];
    var ileri = [];
    var odakAnlik = null;

    function etiketKisa(soruId) {
        try {
            var s = soruyuBul(soruId);
            if (s && s.etiket) return String(s.etiket).slice(0, 45);
        } catch (e) { /* yoksay */ }
        return soruId;
    }

    function alanKimligi(el) {
        var sarmal = el.closest ? el.closest("[data-soru]") : null;
        var soruId = (sarmal && sarmal.dataset.soru) || el.name || "alan";
        if (soruId === "form_tarihi") return { soruId: soruId, etiket: "Form Tarihi" };
        return { soruId: soruId, etiket: etiketKisa(soruId) };
    }

    function durumGuncelle() {
        var geri = document.getElementById("geriAlBtn");
        var il = document.getElementById("ileriAlBtn");
        if (geri) {
            geri.disabled = !gecmis.length;
            geri.title = gecmis.length ? ("Geri al: " + gecmis[gecmis.length - 1].etiket) : "Geri alınacak işlem yok";
        }
        if (il) {
            il.disabled = !ileri.length;
            il.title = ileri.length ? ("Yinele: " + ileri[ileri.length - 1].etiket) : "Yinelenecek işlem yok";
        }
    }

    function gecmiseEkle(giris) {
        gecmis.push(giris);
        if (gecmis.length > 100) gecmis.shift();
        ileri.length = 0;
        durumGuncelle();
    }

    // Değeri yazar ve form.js'in input/change dinleyicilerini (otomatik kayıt, ilerleme,
    // koşullu paneller) tetikler.
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
        alanYaz(giris, giris.onceki);
        ileri.push(giris);
        durumGuncelle();
    }

    function ileriAl() {
        var giris = ileri.pop();
        if (!giris) return;
        alanYaz(giris, giris.sonraki);
        gecmis.push(giris);
        durumGuncelle();
    }

    var geriBtn = document.getElementById("geriAlBtn");
    if (geriBtn) geriBtn.addEventListener("click", geriAl);
    var ileriBtn = document.getElementById("ileriAlBtn");
    if (ileriBtn) ileriBtn.addEventListener("click", ileriAl);

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

    var form = document.getElementById("analysisForm");
    if (form) {
        form.addEventListener("focusin", function (e) {
            var el = e.target && e.target.closest ? e.target.closest("input, textarea, select") : null;
            if (!el || el.disabled || !el.name) { odakAnlik = null; return; }
            odakAnlik = { el: el, isCheck: el.type === "checkbox", deger: el.type === "checkbox" ? !!el.checked : el.value };
        });
        form.addEventListener("focusout", function () {
            if (!odakAnlik) return;
            var kayit = odakAnlik;
            odakAnlik = null;
            var el = kayit.el;
            if (!document.contains(el)) return;
            var simdi = kayit.isCheck ? !!el.checked : el.value;
            if (simdi === kayit.deger) return;
            var kim = alanKimligi(el);
            gecmiseEkle({ el: el, name: el.name, isCheck: kayit.isCheck, soruId: kim.soruId, etiket: kim.etiket, onceki: kayit.deger, sonraki: simdi });
        });
    }

    durumGuncelle();
})();
