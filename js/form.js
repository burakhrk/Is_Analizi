const form = document.getElementById("analysisForm");
const soruBolumleriEl = document.getElementById("questionSections");
const bolumNavEl = document.getElementById("sectionNav");
const kayitId = new URLSearchParams(window.location.search).get("id");
const mevcutKayit = kayitId ? kayitGetir(kayitId) : null;

function metniKoru(deger) {
    return String(deger ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function guvenliId(deger) {
    return String(deger).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function onaySecenekleri(soru) {
    return (soru.secenekler || []).map((s) => typeof s === "string" ? { deger: s, etiket: s } : s);
}

function bosSatir(soru) {
    const satir = {};
    soru.sutunlar.forEach((sutun) => {
        satir[sutun.id] = sutun.tip === "onay" ? [] : "";
    });
    return satir;
}

function soruAlaniOlustur(soru, cevap) {
    const name = `cevap_${soru.id}`;

    if (soru.tip === "textarea") {
        return `<textarea class="input textarea" name="${name}" rows="4" ${soru.zorunlu ? "required" : ""}>${metniKoru(cevap)}</textarea>`;
    }

    if (soru.tip === "secim") {
        return `
            <select class="input" name="${name}" ${soru.zorunlu ? "required" : ""}>
                <option value="">Seçiniz</option>
                ${soru.secenekler.map((secenek) => `<option value="${metniKoru(secenek)}" ${cevap === secenek ? "selected" : ""}>${metniKoru(secenek)}</option>`).join("")}
            </select>
        `;
    }

    if (soru.tip === "liste") {
        const satirlar = Array.isArray(cevap) ? cevap : [];
        return `<textarea class="input textarea" name="${name}" rows="4" placeholder="${metniKoru(soru.yerTutucu || "Her satıra bir madde yazınız")}">` +
            `${metniKoru(satirlar.join("\n"))}</textarea>`;
    }

    if (soru.tip === "onay") {
        const secili = Array.isArray(cevap) ? cevap : [];
        return `<div class="check-list">` + onaySecenekleri(soru).map((s) => `
            <label class="check-item">
                <input type="checkbox" name="${name}" value="${metniKoru(s.deger)}" ${secili.includes(s.deger) ? "checked" : ""}>
                <span>${metniKoru(s.etiket)}</span>
            </label>`).join("") + `</div>`;
    }

    if (soru.tip === "tablo") {
        const satirlar = Array.isArray(cevap) && cevap.length ? cevap : [];
        const minSatir = soru.sabit ? soru.satirSayisi : Math.max(soru.minSatir || 1, satirlar.length, 1);
        const baslangic = [];
        for (let i = 0; i < Math.min(soru.satirSayisi, Math.max(minSatir, satirlar.length)); i++) {
            baslangic.push(satirlar[i] || bosSatir(soru));
        }
        const satirHtml = (satir, idx) => `
            <tr data-satir="${idx}">
                ${soru.sutunlar.map((sutun) => `<td>${hucreAlaniOlustur(soru, sutun, satir[sutun.id], idx)}</td>`).join("")}
                ${soru.sabit ? "" : `<td class="row-ops"><button type="button" class="button danger small" data-satir-sil="${soru.id}">Sil</button></td>`}
            </tr>`;
        return `
            <div class="table-wrap" data-tablo="${soru.id}" data-maks="${soru.satirSayisi}">
                <table class="answer-table">
                    <thead><tr>
                        ${soru.sutunlar.map((s) => `<th>${metniKoru(s.baslik)}</th>`).join("")}
                        ${soru.sabit ? "" : "<th></th>"}
                    </tr></thead>
                    <tbody>${baslangic.map(satirHtml).join("")}</tbody>
                </table>
                ${soru.sabit ? "" : `<button type="button" class="button secondary small" data-satir-ekle="${soru.id}">Satır Ekle</button>`}
            </div>`;
    }

    return `<input class="input" name="${name}" value="${metniKoru(cevap)}" ${soru.zorunlu ? "required" : ""}>`;
}

function hucreAlaniOlustur(soru, sutun, deger, idx) {
    const name = `cevap_${soru.id}_${idx}_${sutun.id}`;
    if (sutun.tip === "secim") {
        return `<select class="input small-input" name="${name}">
            <option value="">-</option>
            ${sutun.secenekler.map((s) => `<option value="${metniKoru(s)}" ${deger === s ? "selected" : ""}>${metniKoru(s)}</option>`).join("")}
        </select>`;
    }
    if (sutun.tip === "onay") {
        const secili = Array.isArray(deger) ? deger.includes("X") : deger === "X";
        return `<input type="checkbox" class="cell-check" name="${name}" value="X" ${secili ? "checked" : ""}>`;
    }
    return `<input class="input small-input" name="${name}" value="${metniKoru(deger ?? "")}">`;
}

function sorulariCiz() {
    const cevaplar = mevcutKayit?.cevaplar || {};

    bolumNavEl.innerHTML = IS_ANALIZI_SORULARI.map((bolum, index) => `
        <a href="#${guvenliId(bolum.id)}">${index + 1}. ${metniKoru(bolum.baslik)}</a>
    `).join("");

    soruBolumleriEl.innerHTML = IS_ANALIZI_SORULARI.map((bolum) => `
        <section class="panel" id="${guvenliId(bolum.id)}">
            <div class="panel-header">
                <h2>${metniKoru(bolum.baslik)}</h2>
            </div>
            <div class="question-stack">
                ${bolum.sorular.map((soru) => `
                    <label class="field" data-soru="${soru.id}">
                        <span>${metniKoru(soru.etiket)}${soru.zorunlu ? " *" : ""}</span>
                        ${soruAlaniOlustur(soru, cevaplar[soru.id])}
                    </label>
                `).join("")}
            </div>
        </section>
    `).join("");
}

function soruyuBul(id) {
    for (const bolum of IS_ANALIZI_SORULARI) {
        for (const soru of bolum.sorular) {
            if (soru.id === id) return soru;
        }
    }
    return null;
}

function tabloSatirlariniOku(soru) {
    const govde = soruBolumleriEl.querySelector(`[data-tablo="${soru.id}"] tbody`);
    const satirlar = [];
    govde.querySelectorAll("tr").forEach((tr, idx) => {
        const satir = {};
        soru.sutunlar.forEach((sutun) => {
            const alan = tr.querySelector(`[name="cevap_${soru.id}_${idx}_${sutun.id}"]`);
            if (!alan) return;
            if (sutun.tip === "onay") {
                satir[sutun.id] = alan.checked ? ["X"] : [];
            } else {
                satir[sutun.id] = alan.value.trim();
            }
        });
        const dolu = Object.values(satir).some((v) => Array.isArray(v) ? v.length : v);
        if (dolu) satirlar.push(satir);
    });
    return satirlar;
}

function formuDoldur() {
    if (!mevcutKayit) {
        form.elements.form_tarihi.value = new Date().toISOString().slice(0, 10);
        return;
    }
    document.getElementById("pageTitle").textContent = "Görüşmeyi Düzenle";
    form.elements.form_tarihi.value = mevcutKayit.form_tarihi || "";
}

function formVerisiniAl(durum) {
    const cevaplar = {};

    IS_ANALIZI_SORULARI.forEach((bolum) => {
        bolum.sorular.forEach((soru) => {
            if (soru.tip === "tablo") {
                cevaplar[soru.id] = tabloSatirlariniOku(soru);
                return;
            }
            if (soru.tip === "onay") {
                cevaplar[soru.id] = [...form.querySelectorAll(`input[name="cevap_${soru.id}"]:checked`)].map((el) => el.value);
                return;
            }
            const alan = form.elements[`cevap_${soru.id}`];
            if (!alan) return;
            if (soru.tip === "liste") {
                cevaplar[soru.id] = alan.value.split("\n").map((s) => s.trim()).filter(Boolean);
            } else {
                cevaplar[soru.id] = alan.value.trim();
            }
        });
    });

    return {
        id: kayitId || undefined,
        form_tarihi: form.elements.form_tarihi.value,
        durum,
        cevaplar
    };
}

function kaydet(durum) {
    const kayit = kayitKaydet(formVerisiniAl(durum));
    window.location.href = `form.html?id=${kayit.id}`;
}

document.getElementById("saveDraftButton").addEventListener("click", () => kaydet("taslak"));

document.getElementById("wordExportButton").addEventListener("click", async () => {
    const kayit = formVerisiniAl(mevcutKayit?.durum || "taslak");
    try {
        await isAnaliziWordAktar(kayit);
    } catch (error) {
        alert("Word oluşturulamadı: " + error.message);
    }
});

form.addEventListener("submit", (event) => {
    event.preventDefault();
    kaydet("tamamlandi");
});

soruBolumleriEl.addEventListener("click", (event) => {
    const ekleId = event.target.dataset?.satirEkle;
    const silId = event.target.dataset?.satirSil;
    const soru = soruyuBul(ekleId || silId);
    if (!soru) return;
    const govde = soruBolumleriEl.querySelector(`[data-tablo="${soru.id}"] tbody`);
    if (ekleId) {
        const maks = Number(soruBolumleriEl.querySelector(`[data-tablo="${soru.id}"]`).dataset.maks);
        if (govde.rows.length >= maks) {
            alert(`En fazla ${maks} satır girilebilir (formdaki tablo bu kadar).`);
            return;
        }
        const idx = govde.rows.length;
        const tr = document.createElement("tr");
        tr.dataset.satir = String(idx);
        tr.innerHTML = soru.sutunlar.map((sutun) => `<td>${hucreAlaniOlustur(soru, sutun, sutun.tip === "onay" ? [] : "", idx)}</td>`).join("") +
            `<td class="row-ops"><button type="button" class="button danger small" data-satir-sil="${soru.id}">Sil</button></td>`;
        govde.appendChild(tr);
    } else if (silId) {
        event.target.closest("tr")?.remove();
    }
});

sorulariCiz();
formuDoldur();
