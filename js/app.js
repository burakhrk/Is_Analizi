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
    return new Intl.DateTimeFormat("tr-TR").format(new Date(tarih));
}

function listeyiCiz() {
    const arama = aramaEl.value.trim().toLocaleLowerCase("tr-TR");
    const durum = durumEl.value;
    const kayitlar = tumKayitlariGetir();

    const filtreliKayitlar = kayitlar.filter((kayit) => {
        const metin = [kayit.gorusulenAd, kayit.pozisyon, kayit.departman, kayit.gorusmeci]
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
    listeEl.innerHTML = filtreliKayitlar.map((kayit) => `
        <article class="analysis-item">
            <div class="item-main">
                <span class="status ${kayit.durum === "tamamlandi" ? "done" : "draft"}">${durumEtiketi(kayit.durum)}</span>
                <h3>${metniKoru(kayit.gorusulenAd || "İsimsiz Görüşme")}</h3>
                <p>${metniKoru(kayit.pozisyon || "Pozisyon girilmedi")} · ${metniKoru(kayit.departman || "Departman girilmedi")}</p>
                <small>${metniKoru(tarihiFormatla(kayit.tarih))} · ${metniKoru(kayit.gorusmeci || "Görüşmeci girilmedi")}</small>
            </div>
            <div class="item-actions">
                <a class="button secondary small" href="form.html?id=${kayit.id}">Aç</a>
                <button class="button danger small" type="button" data-delete="${kayit.id}">Sil</button>
            </div>
        </article>
    `).join("");
}

aramaEl.addEventListener("input", listeyiCiz);
durumEl.addEventListener("change", listeyiCiz);

listeEl.addEventListener("click", (event) => {
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
        await verileriIceAktar(file);
        listeyiCiz();
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
