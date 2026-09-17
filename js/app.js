const listeEl = document.getElementById("analysisList");
const bosEl = document.getElementById("emptyState");
const aramaEl = document.getElementById("searchInput");
const durumEl = document.getElementById("statusFilter");

function metniKoru(deger) {
    return String(deger ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function durumEtiketi(durum) {
    return durum === "tamamlandi" ? "Tamamlandı" : "Taslak";
}

function tarihiFormatla(tarih) {
    if (!tarih) return "-";
    const p = String(tarih).split("-");
    if (p.length === 3) return `${p[2]}.${p[1]}.${p[0]}`;
    return tarih;
}

function kayitAdi(kayit) {
    return kayit.cevaplar?.personel_ismi || kayit.gorusulenAd || "İsimsiz Görüşme";
}

function kayitPozisyon(kayit) {
    return kayit.cevaplar?.unvan_pozisyon || kayit.pozisyon || "Pozisyon girilmedi";
}

function kayitDepartman(kayit) {
    return kayit.cevaplar?.departman || kayit.departman || "Departman girilmedi";
}

function listeyiCiz() {
    const arama = aramaEl.value.trim().toLocaleLowerCase("tr-TR");
    const durum = durumEl.value;
    const kayitlar = tumKayitlariGetir();

    const filtreliKayitlar = kayitlar.filter((kayit) => {
        const metin = [kayitAdi(kayit), kayitPozisyon(kayit), kayitDepartman(kayit)]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase("tr-TR");
        const aramaUyar = !arama || metin.includes(arama);
        const durumUyar = durum === "tum" || kayit.durum === durum;
        return aramaUyar && durumUyar;
    });

    document.getElementById("totalCount").textContent = kayitlar.length;
    document.getElementById("draftCount").textContent = kayitlar.filter((kayit) => kayit.durum !== "tamamlandi").length;
    document.getElementById("doneCount").textContent = kayitlar.filter((kayit) => kayit.durum === "tamamlandi").length;

    bosEl.classList.toggle("hidden", filtreliKayitlar.length > 0);
    listeEl.innerHTML = filtreliKayitlar.map((kayit) => {
        const devam = kayit.durum !== "tamamlandi";
        return `
        <article class="analysis-item">
            <div class="item-main">
                <span class="status ${kayit.durum === "tamamlandi" ? "done" : "draft"}">${durumEtiketi(kayit.durum)}</span>
                <h3>${metniKoru(kayitAdi(kayit))}</h3>
                <p>${metniKoru(kayitPozisyon(kayit))} · ${metniKoru(kayitDepartman(kayit))}</p>
                <small>${metniKoru(tarihiFormatla(kayit.form_tarihi || kayit.tarih))} · Son düzenleme: ${metniKoru(tarihSaatFormatla(kayit.guncellenmeTarihi))}</small>
            </div>
            <div class="item-actions">
                <a class="button secondary small" href="form.html?id=${kayit.id}${devam ? "&devam=1" : ""}">${devam ? "Devam Et" : "Aç"}</a>
                <button class="button ghost small" type="button" data-word="${kayit.id}">Word</button>
                <button class="button ghost small" type="button" data-pdf="${kayit.id}">PDF</button>
                <button class="button ghost small" type="button" data-json="${kayit.id}">JSON</button>
                <button class="button danger small" type="button" data-delete="${kayit.id}">Sil</button>
            </div>
        </article>
    `;}).join("");
}

aramaEl.addEventListener("input", listeyiCiz);
durumEl.addEventListener("change", listeyiCiz);

listeEl.addEventListener("click", async (event) => {
    const wordId = event.target.dataset.word;
    if (wordId) {
        const kayit = kayitGetir(wordId);
        if (!kayit) return;
        const uyarilar = wordOnKontrolUyarilari(kayit);
        if (uyarilar.length && !confirm("Word öncesi kontrol:\n• " + uyarilar.join("\n• ") + "\n\nYine de Word'e aktarılsın mı?")) {
            return;
        }
        event.target.disabled = true;
        try {
            await isAnaliziWordAktar(kayit);
        } catch (error) {
            alert("Word oluşturulamadı: " + error.message);
        } finally {
            event.target.disabled = false;
        }
        return;
    }

    const jsonId = event.target.dataset.json;
    if (jsonId) {
        const kayit = kayitGetir(jsonId);
        if (kayit) tekKayitDisaAktar(kayit);
        return;
    }

    const pdfId = event.target.dataset.pdf;
    if (pdfId) {
        const kayit = kayitGetir(pdfId);
        if (kayit) kayitYazdir(kayit);
        return;
    }

    const silinecekId = event.target.dataset.delete;
    if (!silinecekId) return;
    if (confirm("Bu görüşme kaydı silinsin mi?")) {
        kayitSil(silinecekId);
        listeyiCiz();
    }
});

document.getElementById("exportButton").addEventListener("click", verileriDisaAktar);

document.getElementById("importInput").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
        const sonuc = await verileriIceAktar(file);
        listeyiCiz();
        alert(`${sonuc.eklenen} yeni kayıt eklendi, ${sonuc.guncellenen} kayıt güncellendi. Mevcut kayıtlar korunur.`);
    } catch (error) {
        alert(error.message);
    } finally {
        event.target.value = "";
    }
});

document.getElementById("sampleButton").addEventListener("click", () => {
    ornekVeriYukle();
    listeyiCiz();
});

listeyiCiz();
