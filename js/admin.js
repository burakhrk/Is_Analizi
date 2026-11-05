// Analiz paneli: yerelden toplu JSON yükleyip kişi ve soru bazlı inceleme.
// Görüşme panelinden ayrıdır: veriler bu tarayıcının IndexedDB'sinde ayrı bir depoda
// tutulur, görüşme kayıtlarına (localStorage) hiç yazılmaz.
(function () {
    "use strict";

    const DB_ADI = "is_analizi_analiz";
    const DEPO = "kayitlar";
    const FILTRE_ALANLARI = [
        { id: "departman", ad: "Departman" },
        { id: "bolum", ad: "Bölüm" },
        { id: "unvan_pozisyon", ad: "Ünvan" },
        { id: "gorusmeci", ad: "Görüşmeci" },
        { id: "vardiya", ad: "Vardiya" },
        { id: "durum", ad: "Durum" }
    ];
    const KISI_SUTUNLARI = [
        { id: "ad", ad: "Personel" },
        { id: "unvan_pozisyon", ad: "Ünvan" },
        { id: "bolum", ad: "Bölüm" },
        { id: "departman", ad: "Departman" },
        { id: "gorusmeci", ad: "Görüşmeci" },
        { id: "vardiya", ad: "Vardiya" },
        { id: "form_tarihi", ad: "Form tarihi" },
        { id: "durum", ad: "Durum" },
        { id: "gorev", ad: "Görev", sayi: true },
        { id: "doluluk", ad: "Doluluk", sayi: true }
    ];
    const SORULAR = IS_ANALIZI_SORULARI.flatMap((b) => b.sorular.map((s) => ({ ...s, bolumBaslik: b.baslik })));

    let kayitlar = [];
    let dbKullanilabilir = true;
    const durum = {
        arama: "",
        filtre: Object.fromEntries(FILTRE_ALANLARI.map((f) => [f.id, ""])),
        sekme: "kisiler",
        soruId: "",
        bosGizle: true,
        secilenDeger: null,
        sirala: { alan: "ad", yon: 1 },
        detayId: null
    };

    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
    const kucuk = (s) => String(s ?? "").toLocaleLowerCase("tr-TR");
    const karsilastir = (a, b) => String(a ?? "").localeCompare(String(b ?? ""), "tr", { numeric: true });

    // ---- IndexedDB ----
    function dbAc() {
        return new Promise((tamam, hata) => {
            const istek = indexedDB.open(DB_ADI, 1);
            istek.onupgradeneeded = () => istek.result.createObjectStore(DEPO, { keyPath: "id" });
            istek.onsuccess = () => tamam(istek.result);
            istek.onerror = () => hata(istek.error);
        });
    }

    async function dbIslem(mod, fn) {
        const db = await dbAc();
        return new Promise((tamam, hata) => {
            const tx = db.transaction(DEPO, mod);
            const istek = fn(tx.objectStore(DEPO));
            tx.oncomplete = () => { db.close(); tamam(istek ? istek.result : undefined); };
            tx.onerror = () => { db.close(); hata(tx.error); };
        });
    }

    const dbHepsi = () => dbIslem("readonly", (st) => st.getAll());
    const dbYaz = (liste) => dbIslem("readwrite", (st) => { liste.forEach((k) => st.put(k)); });
    const dbSil = (id) => dbIslem("readwrite", (st) => st.delete(id));
    const dbTemizle = () => dbIslem("readwrite", (st) => st.clear());

    // ---- veri ----
    function bosMu(v) {
        if (v == null) return true;
        if (Array.isArray(v)) return v.length === 0;
        return String(v).trim() === "";
    }

    function secenekEtiketi(soru, deger) {
        const s = (soru.secenekler || []).find((x) => (typeof x === "string" ? x : x.deger) === deger);
        return s ? (typeof s === "string" ? s : s.etiket) : deger;
    }

    // Bir cevabın düz metin hali (arama, CSV ve sıklık için)
    function cevapMetni(soru, v, c) {
        if (bosMu(v)) return "";
        if (soru.tip === "liste") return v.join(", ");
        if (soru.tip === "onay") return v.map((d) => secenekEtiketi(soru, d)).join(", ");
        if (soru.tip === "matris") return matrisSatirlari(soru, v, c).map((x) => `${x.ortam}: ${x.faktorler.join(", ")}`).join("; ");
        if (soru.tip === "tablo") return v.map((satir) => soru.sutunlar.map((s) => tabloHucre(s, satir[s.id])).filter(Boolean).join(" | ")).join("\n");
        return String(v);
    }

    function tabloHucre(sutun, deger) {
        if (sutun.tip === "onay") return (Array.isArray(deger) ? deger.includes("X") : deger === "X") ? "X" : "";
        return String(deger ?? "").trim();
    }

    function matrisSatirlari(soru, v, c) {
        const kaynak = SORULAR.find((s) => s.id === soru.satirKaynak);
        const secili = Array.isArray(c?.[soru.satirKaynak]) ? c[soru.satirKaynak] : [];
        return (kaynak?.secenekler || []).filter((o) => secili.includes(o.deger)).map((o) => ({
            ortam: o.etiket,
            faktorler: (soru.secenekler || []).filter((f) => v.includes(`${o.deger}:${f.deger}`)).map((f) => f.etiket)
        }));
    }

    function kayitHazirla(ham, dosya) {
        if (!ham || typeof ham !== "object" || Array.isArray(ham)) return null;
        const cevapVar = ham.cevaplar && typeof ham.cevaplar === "object";
        if (!cevapVar && !ham.gorusulenAd) return null;
        const c = varsayilanlariUygula(cevapVar ? ham.cevaplar : {});
        // Eski şemadan kalan kök alanlar boş cevapları doldurur
        const eski = { gorusulenAd: "personel_ismi", pozisyon: "unvan_pozisyon", departman: "departman", gorusmeci: "gorusmeci" };
        Object.entries(eski).forEach(([a, b]) => { if (ham[a] && bosMu(c[b])) c[b] = ham[a]; });
        const formTarihi = ham.form_tarihi || ham.tarih || "";
        const id = typeof ham.id === "string" && ham.id ? ham.id : `dosya:${c.personel_ismi || ""}|${formTarihi}|${dosya}`;
        return {
            id,
            form_tarihi: formTarihi,
            durum: ham.durum === "tamamlandi" ? "tamamlandi" : "taslak",
            guncellenmeTarihi: ham.guncellenmeTarihi || "",
            cevaplar: c,
            kaynak: dosya
        };
    }

    // Arama ve sıralama için türetilen alanlar (depoya yazılmaz)
    function turet(k) {
        const c = k.cevaplar;
        const dolu = SORULAR.filter((s) => !bosMu(c[s.id])).length;
        return {
            ...k,
            ad: c.personel_ismi || "İsimsiz",
            doluluk: Math.round((dolu / SORULAR.length) * 100),
            gorev: Array.isArray(c.gorevler) ? c.gorevler.length : 0,
            metin: kucuk([k.form_tarihi, ...SORULAR.map((s) => cevapMetni(s, c[s.id], c))].join("\n"))
        };
    }

    function alanDegeri(k, alan) {
        if (alan === "durum") return k.durum === "tamamlandi" ? "Tamamlandı" : "Taslak";
        if (alan === "ad" || alan === "doluluk" || alan === "gorev") return k[alan];
        if (alan === "form_tarihi") return k.form_tarihi;
        return String(k.cevaplar[alan] ?? "").trim();
    }

    function filtreliKayitlar() {
        const arama = kucuk(durum.arama).trim();
        return kayitlar.filter((k) => {
            if (arama && !k.metin.includes(arama)) return false;
            return FILTRE_ALANLARI.every((f) => !durum.filtre[f.id] || alanDegeri(k, f.id) === durum.filtre[f.id]);
        });
    }

    // ---- içe aktarma ----
    async function dosyalariYukle(dosyalar) {
        const jsonlar = [...dosyalar].filter((f) => /\.json$/i.test(f.name));
        if (!jsonlar.length) {
            mesajGoster("Seçilenler arasında JSON dosyası yok.", true);
            return;
        }
        const harita = new Map(kayitlar.map((k) => [k.id, k]));
        const yazilacak = [];
        const hatali = [];
        let eklenen = 0, guncellenen = 0, atlanan = 0;
        for (const f of jsonlar) {
            let veri;
            try {
                veri = JSON.parse(await f.text());
            } catch (e) {
                hatali.push(f.name);
                continue;
            }
            let gecerli = 0;
            for (const ham of Array.isArray(veri) ? veri : [veri]) {
                const k = kayitHazirla(ham, f.webkitRelativePath || f.name);
                if (!k) continue;
                gecerli++;
                const mevcut = harita.get(k.id);
                // Aynı kayıt tekrar gelirse en güncel hali kalır
                if (mevcut && (mevcut.guncellenmeTarihi || "") > k.guncellenmeTarihi) { atlanan++; continue; }
                if (mevcut) guncellenen++; else eklenen++;
                harita.set(k.id, turet(k));
                yazilacak.push(k);
            }
            if (!gecerli) hatali.push(f.name);
        }
        kayitlar = [...harita.values()];
        if (dbKullanilabilir && yazilacak.length) {
            try {
                await dbYaz(yazilacak);
            } catch (e) {
                dbKullanilabilir = false;
            }
        }
        const parcalar = [`${jsonlar.length} dosya okundu: ${eklenen} yeni kişi, ${guncellenen} güncellendi`];
        if (atlanan) parcalar.push(`${atlanan} eski sürüm atlandı`);
        if (hatali.length) parcalar.push(`okunamayan: ${hatali.join(", ")}`);
        if (!dbKullanilabilir) parcalar.push("tarayıcı deposu kullanılamadı, veriler sayfa kapanınca silinir");
        mesajGoster(parcalar.join(" · "), hatali.length > 0 || !dbKullanilabilir);
        ciz();
    }

    function mesajGoster(metin, uyari) {
        const el = $("iceAktarMesaj");
        el.textContent = metin;
        el.classList.toggle("uyari", !!uyari);
        el.classList.remove("hidden");
    }

    // ---- çizim ----
    function ciz() {
        const varMi = kayitlar.length > 0;
        $("bosDurum").classList.toggle("hidden", varMi);
        $("panelIcerik").classList.toggle("hidden", !varMi);
        $("temizleBtn").disabled = !varMi;
        if (!varMi) return;
        filtreleriCiz();
        const liste = filtreliKayitlar();
        ozetCiz(liste);
        $("filtreSayac").textContent = `${liste.length} / ${kayitlar.length} kişi`;
        if (durum.sekme === "kisiler") kisiTablosuCiz(liste);
        else soruCiz(liste);
    }

    function ozetCiz(liste) {
        const farkli = (alan) => new Set(liste.map((k) => alanDegeri(k, alan)).filter(Boolean)).size;
        $("ozetKisi").textContent = liste.length;
        $("ozetDepartman").textContent = farkli("departman");
        $("ozetGorusmeci").textContent = farkli("gorusmeci");
        $("ozetDoluluk").textContent = liste.length
            ? `%${Math.round(liste.reduce((t, k) => t + k.doluluk, 0) / liste.length)}` : "-";
    }

    function filtreleriCiz() {
        const kok = $("filtreSecimleri");
        kok.innerHTML = FILTRE_ALANLARI.map((f) => {
            // Seçenekler diğer filtrelerden bağımsız, tüm kayıtlardan gelir
            const degerler = [...new Set(kayitlar.map((k) => alanDegeri(k, f.id)).filter(Boolean))].sort(karsilastir);
            const secili = durum.filtre[f.id];
            if (secili && !degerler.includes(secili)) degerler.push(secili);
            return `<label class="admin-filtre"><span>${f.ad}</span><select class="input" data-filtre="${f.id}">
                <option value="">Tümü</option>
                ${degerler.map((d) => `<option value="${esc(d)}" ${d === secili ? "selected" : ""}>${esc(d)}</option>`).join("")}
            </select></label>`;
        }).join("");
    }

    function siraliKisiler(liste) {
        const { alan, yon } = durum.sirala;
        const sayi = KISI_SUTUNLARI.find((s) => s.id === alan)?.sayi;
        return [...liste].sort((a, b) => {
            const x = alanDegeri(a, alan), y = alanDegeri(b, alan);
            return (sayi ? x - y : karsilastir(x, y)) * yon;
        });
    }

    function kisiTablosuCiz(liste) {
        const { alan, yon } = durum.sirala;
        const ok = (id) => (id === alan ? (yon > 0 ? " ▲" : " ▼") : "");
        $("kisiTablo").innerHTML = `<thead><tr>${KISI_SUTUNLARI.map((s) =>
            `<th><button type="button" class="admin-sirala" data-sirala="${s.id}" aria-sort="${s.id === alan ? (yon > 0 ? "ascending" : "descending") : "none"}">${s.ad}${ok(s.id)}</button></th>`).join("")}</tr></thead>
            <tbody>${liste.length ? siraliKisiler(liste).map((k) => `<tr class="admin-satir" data-kisi="${esc(k.id)}" tabindex="0">
                ${KISI_SUTUNLARI.map((s) => {
                    const v = alanDegeri(k, s.id);
                    if (s.id === "durum") return `<td><span class="status ${k.durum === "tamamlandi" ? "done" : "draft"}">${esc(v)}</span></td>`;
                    if (s.id === "form_tarihi") return `<td>${esc(tarihFormatlaTR(v))}</td>`;
                    if (s.id === "doluluk") return `<td class="admin-sayi">%${v}</td>`;
                    if (s.id === "ad") return `<td><strong>${esc(v)}</strong></td>`;
                    return `<td class="${s.sayi ? "admin-sayi" : ""}">${esc(v || "-")}</td>`;
                }).join("")}</tr>`).join("") : `<tr><td colspan="${KISI_SUTUNLARI.length}" class="admin-bos-satir">Filtrelere uyan kişi yok.</td></tr>`}</tbody>`;
    }

    // ---- soru bazlı ----
    function soruSeciminiDoldur() {
        const sec = $("soruSecim");
        if (sec.options.length) return;
        sec.innerHTML = IS_ANALIZI_SORULARI.map((b) => `<optgroup label="${esc(b.baslik)}">${b.sorular.map((s) =>
            `<option value="${s.id}">${esc(s.etiket)}</option>`).join("")}</optgroup>`).join("");
        durum.soruId = durum.soruId || sec.value;
        sec.value = durum.soruId;
    }

    // Dağılım: seçim/onay seçenekleri, liste maddeleri veya kısa metinlerin sıklığı
    function dagilimHesapla(soru, liste) {
        // Her cevap anahtarı için kişi kümesi: aynı kişi bir maddeyi iki kez yazsa da bir sayılır
        const sayac = new Map();
        const ekle = (kisiId, anahtar, etiket) => {
            const m = sayac.get(anahtar) || { etiket, kisiler: new Set() };
            m.kisiler.add(kisiId);
            sayac.set(anahtar, m);
        };
        let bos = 0;
        liste.forEach((k) => {
            const v = k.cevaplar[soru.id];
            if (bosMu(v)) { bos++; return; }
            if (soru.tip === "onay") v.forEach((d) => ekle(k.id, d, secenekEtiketi(soru, d)));
            else if (soru.tip === "liste") v.forEach((d) => ekle(k.id, kucuk(d.trim()), d.trim()));
            else if (soru.tip === "secim") ekle(k.id, String(v), String(v));
            else ekle(k.id, kucuk(String(v).trim()), String(v).trim());
        });
        let satirlar = [...sayac.entries()].map(([anahtar, m]) => ({ anahtar, etiket: m.etiket, sayi: m.kisiler.size }));
        if (soru.tip === "secim" || soru.tip === "onay") {
            const sira = (soru.secenekler || []).map((s) => (typeof s === "string" ? s : s.deger));
            satirlar.sort((a, b) => sira.indexOf(a.anahtar) - sira.indexOf(b.anahtar));
        } else {
            satirlar.sort((a, b) => b.sayi - a.sayi || karsilastir(a.etiket, b.etiket));
        }
        return { satirlar, bos };
    }

    function dagilimGosterilirMi(soru, liste) {
        if (soru.tip === "secim" || soru.tip === "onay" || soru.tip === "liste") return true;
        if (soru.tip !== "text") return false;
        // Kısa metinler (vardiya, departman...) tekrar ediyorsa sıklık anlamlıdır
        const degerler = liste.map((k) => kucuk(String(k.cevaplar[soru.id] ?? "").trim())).filter(Boolean);
        return degerler.length > 0 && new Set(degerler).size < degerler.length;
    }

    function dagilimHtml(soru, liste) {
        const { satirlar, bos } = dagilimHesapla(soru, liste);
        if (!satirlar.length) return "";
        const gosterilen = satirlar.slice(0, 20);
        const enBuyuk = Math.max(...gosterilen.map((s) => s.sayi));
        const toplam = liste.length;
        const coklu = soru.tip === "onay" || soru.tip === "liste";
        return `<div class="admin-dagilim-kutu">
            <p class="admin-dagilim-baslik">${coklu ? "Kaç kişi işaretledi / yazdı" : "Cevap dağılımı"} <span class="admin-not">· ${toplam} kişi${bos ? `, ${bos} boş` : ""} · çubuğa tıklayıp o cevabı verenleri süzün</span></p>
            <div class="admin-dagilim">${gosterilen.map((s) => {
                const oran = toplam ? Math.round((s.sayi / toplam) * 100) : 0;
                const secili = durum.secilenDeger === s.anahtar;
                return `<button type="button" class="admin-dagilim-satir${secili ? " secili" : ""}" data-deger="${esc(s.anahtar)}" title="${esc(s.etiket)}: ${s.sayi} kişi (%${oran})">
                    <span class="admin-dagilim-etiket">${esc(s.etiket)}</span>
                    <span class="admin-dagilim-iz"><span class="admin-dagilim-bar" style="width:${(s.sayi / enBuyuk) * 100}%"></span></span>
                    <span class="admin-dagilim-sayi">${s.sayi} · %${oran}</span>
                </button>`;
            }).join("")}</div>
            ${satirlar.length > gosterilen.length ? `<p class="admin-not">En sık ${gosterilen.length} cevap gösteriliyor (toplam ${satirlar.length} farklı cevap).</p>` : ""}
        </div>`;
    }

    function matrisHtml(soru, liste) {
        const kaynak = SORULAR.find((s) => s.id === soru.satirKaynak);
        const say = (o, f) => liste.filter((k) => (k.cevaplar[soru.satirKaynak] || []).includes(o) && (k.cevaplar[soru.id] || []).includes(`${o}:${f}`)).length;
        const ortamSay = (o) => liste.filter((k) => (k.cevaplar[soru.satirKaynak] || []).includes(o)).length;
        return `<div class="table-wrap"><table class="answer-table admin-tablo admin-matris"><thead><tr><th>Ortam (seçen)</th>${soru.secenekler.map((f) => `<th>${esc(f.etiket)}</th>`).join("")}</tr></thead>
            <tbody>${kaynak.secenekler.map((o) => `<tr><th scope="row">${esc(o.etiket)} <span class="admin-not">(${ortamSay(o.deger)})</span></th>${soru.secenekler.map((f) => {
                const n = say(o.deger, f.deger);
                return `<td class="admin-sayi${n ? " dolu" : ""}">${n || ""}</td>`;
            }).join("")}</tr>`).join("")}</tbody></table></div>`;
    }

    // Soru bazlı satırlar: CSV ve tablo aynı veriden üretilir
    function soruSatirlari(soru, liste) {
        const kisiler = liste.filter((k) => {
            const v = k.cevaplar[soru.id];
            if (durum.bosGizle && bosMu(v)) return false;
            if (durum.secilenDeger == null) return true;
            if (bosMu(v)) return false;
            if (soru.tip === "onay") return v.includes(durum.secilenDeger);
            if (soru.tip === "liste") return v.some((d) => kucuk(d.trim()) === durum.secilenDeger);
            if (soru.tip === "secim") return String(v) === durum.secilenDeger;
            return kucuk(String(v).trim()) === durum.secilenDeger;
        });
        if (soru.tip === "tablo") {
            const ekSutun = soru.id === "gorevler";
            const basliklar = ["Kişi", ...soru.sutunlar.map((s) => s.baslik), ...(ekSutun ? ["Aylık dk", "Yüzde"] : [])];
            const satirlar = [];
            siraliKisiler(kisiler).forEach((k) => {
                const v = k.cevaplar[soru.id] || [];
                const hesap = ekSutun ? gorevYuzdeleri(v, k.cevaplar.haftalik_gun) : null;
                v.forEach((satir, i) => satirlar.push({
                    kisi: k,
                    hucreler: [k.ad, ...soru.sutunlar.map((s) => tabloHucre(s, satir[s.id])),
                        ...(ekSutun ? [hesap.sureler[i] == null ? "" : String(Math.round(hesap.sureler[i])),
                            hesap.yuzdeler[i] == null ? "" : yuzdeMetni(hesap.yuzdeler[i])] : [])]
                }));
            });
            return { basliklar, satirlar, kisiSayisi: kisiler.length };
        }
        return {
            basliklar: ["Kişi", "Ünvan", "Departman", "Cevap"],
            satirlar: siraliKisiler(kisiler).map((k) => ({
                kisi: k,
                hucreler: [k.ad, alanDegeri(k, "unvan_pozisyon"), alanDegeri(k, "departman"), cevapMetni(soru, k.cevaplar[soru.id], k.cevaplar)]
            })),
            kisiSayisi: kisiler.length
        };
    }

    function soruCiz(liste) {
        soruSeciminiDoldur();
        const soru = SORULAR.find((s) => s.id === durum.soruId);
        if (!soru) return;
        const cevaplayan = liste.filter((k) => !bosMu(k.cevaplar[soru.id])).length;
        const { basliklar, satirlar, kisiSayisi } = soruSatirlari(soru, liste);
        const secim = durum.secilenDeger != null
            ? `<p class="admin-cip">Süzülen cevap: <strong>${esc(dagilimHesapla(soru, liste).satirlar.find((s) => s.anahtar === durum.secilenDeger)?.etiket ?? durum.secilenDeger)}</strong>
                <button type="button" class="button ghost small" data-secim-temizle>Kaldır ✕</button></p>` : "";
        $("soruIcerik").innerHTML = `
            <p class="admin-not">${esc(soru.bolumBaslik)} · ${cevaplayan} / ${liste.length} kişi cevaplamış${soru.tip === "tablo" ? ` · ${satirlar.length} satır` : ""}</p>
            ${soru.tip === "matris" ? matrisHtml(soru, liste) : dagilimGosterilirMi(soru, liste) ? dagilimHtml(soru, liste) : ""}
            ${secim}
            ${soru.tip === "matris" ? "" : `<div class="table-wrap admin-tablo-sar"><table class="answer-table admin-tablo">
                <thead><tr>${basliklar.map((b) => `<th>${esc(b)}</th>`).join("")}</tr></thead>
                <tbody>${satirlar.length ? satirlar.map((s) => `<tr class="admin-satir" data-kisi="${esc(s.kisi.id)}" tabindex="0">${s.hucreler.map((h, i) =>
                    `<td class="admin-hucre${i === 0 ? " admin-hucre-kisi" : ""}">${esc(h || (i === 0 ? "" : "-"))}</td>`).join("")}</tr>`).join("")
                    : `<tr><td colspan="${basliklar.length}" class="admin-bos-satir">${kisiSayisi ? "Satır yok." : "Gösterilecek cevap yok."}</td></tr>`}</tbody>
            </table></div>`}`;
    }

    // ---- kişi detayı ----
    function detayAc(id) {
        const k = kayitlar.find((x) => x.id === id);
        if (!k) return;
        durum.detayId = id;
        const c = k.cevaplar;
        $("detayBaslik").textContent = k.ad;
        $("detayAlt").textContent = [alanDegeri(k, "unvan_pozisyon"), alanDegeri(k, "departman"),
            k.form_tarihi && `Form: ${tarihFormatlaTR(k.form_tarihi)}`, alanDegeri(k, "durum"), `Doluluk %${k.doluluk}`, `Dosya: ${k.kaynak}`]
            .filter(Boolean).join(" · ");
        $("detayIcerik").innerHTML = IS_ANALIZI_SORULARI.map((b) => `<section class="admin-detay-bolum"><h3>${esc(b.baslik)}</h3>
            ${b.sorular.map((s) => `<div class="admin-detay-soru"><p class="admin-detay-etiket">${esc(s.etiket)}</p>${detayCevap(s, c)}</div>`).join("")}</section>`).join("");
        $("detayModal").classList.remove("hidden");
        $("detayKapatBtn").focus();
    }

    function detayCevap(soru, c) {
        const v = c[soru.id];
        if (bosMu(v)) return `<p class="admin-detay-bos">-</p>`;
        if (soru.tip === "tablo") {
            const hesap = soru.id === "gorevler" ? gorevYuzdeleri(v, c.haftalik_gun) : null;
            return `<div class="table-wrap"><table class="answer-table admin-tablo"><thead><tr>${soru.sutunlar.map((s) => `<th>${esc(s.baslik)}</th>`).join("")}${hesap ? "<th>Yüzde</th>" : ""}</tr></thead>
                <tbody>${v.map((satir, i) => `<tr>${soru.sutunlar.map((s) => `<td>${esc(tabloHucre(s, satir[s.id]))}</td>`).join("")}${hesap ? `<td class="admin-sayi">${hesap.yuzdeler[i] == null ? "-" : yuzdeMetni(hesap.yuzdeler[i])}</td>` : ""}</tr>`).join("")}</tbody></table></div>`;
        }
        return `<p class="admin-detay-cevap">${esc(cevapMetni(soru, v, c))}</p>`;
    }

    function detayKapat() {
        $("detayModal").classList.add("hidden");
        durum.detayId = null;
    }

    // ---- CSV ----
    function csvIndir(ad, basliklar, satirlar) {
        const hucre = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
        // Türkçe Excel ; ayırıcı ve BOM ile açar
        const metin = "﻿" + [basliklar, ...satirlar].map((s) => s.map(hucre).join(";")).join("\r\n");
        const blob = new Blob([metin], { type: "text/csv;charset=utf-8" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = ad;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }

    const bugun = () => new Date().toISOString().slice(0, 10);

    // ---- olaylar ----
    $("dosyaInput").addEventListener("change", async (e) => { await dosyalariYukle(e.target.files); e.target.value = ""; });
    $("klasorInput").addEventListener("change", async (e) => { await dosyalariYukle(e.target.files); e.target.value = ""; });

    let suruklemeSayac = 0;
    document.addEventListener("dragenter", (e) => {
        if (![...(e.dataTransfer?.types || [])].includes("Files")) return;
        suruklemeSayac++;
        $("suruklemeKatman").classList.remove("hidden");
    });
    document.addEventListener("dragleave", () => {
        suruklemeSayac = Math.max(0, suruklemeSayac - 1);
        if (!suruklemeSayac) $("suruklemeKatman").classList.add("hidden");
    });
    document.addEventListener("dragover", (e) => e.preventDefault());
    document.addEventListener("drop", async (e) => {
        e.preventDefault();
        suruklemeSayac = 0;
        $("suruklemeKatman").classList.add("hidden");
        if (e.dataTransfer?.files?.length) await dosyalariYukle(e.dataTransfer.files);
    });

    $("temizleBtn").addEventListener("click", async () => {
        if (!confirm(`Paneldeki ${kayitlar.length} kişinin tamamı kaldırılsın mı? (JSON dosyalarınıza ve görüşme paneline dokunulmaz)`)) return;
        kayitlar = [];
        if (dbKullanilabilir) { try { await dbTemizle(); } catch (e) { /* bellekten zaten silindi */ } }
        mesajGoster("Paneldeki tüm kayıtlar kaldırıldı.");
        ciz();
    });

    $("aramaInput").addEventListener("input", (e) => { durum.arama = e.target.value; durum.secilenDeger = null; ciz(); });
    $("filtreSecimleri").addEventListener("change", (e) => {
        const alan = e.target.dataset.filtre;
        if (!alan) return;
        durum.filtre[alan] = e.target.value;
        durum.secilenDeger = null;
        ciz();
    });
    $("filtreTemizleBtn").addEventListener("click", () => {
        Object.keys(durum.filtre).forEach((k) => { durum.filtre[k] = ""; });
        durum.arama = "";
        durum.secilenDeger = null;
        $("aramaInput").value = "";
        ciz();
    });

    document.querySelector(".admin-sekmeler").addEventListener("click", (e) => {
        const btn = e.target.closest("[data-sekme]");
        if (!btn) return;
        durum.sekme = btn.dataset.sekme;
        document.querySelectorAll(".admin-sekme").forEach((b) => {
            b.classList.toggle("aktif", b === btn);
            b.setAttribute("aria-selected", b === btn ? "true" : "false");
        });
        $("sekmeKisiler").classList.toggle("hidden", durum.sekme !== "kisiler");
        $("sekmeSoru").classList.toggle("hidden", durum.sekme !== "soru");
        ciz();
    });

    $("kisiTablo").addEventListener("click", (e) => {
        const sirala = e.target.closest("[data-sirala]");
        if (sirala) {
            const alan = sirala.dataset.sirala;
            durum.sirala = { alan, yon: durum.sirala.alan === alan ? -durum.sirala.yon : 1 };
            ciz();
        }
    });

    $("soruSecim").addEventListener("change", (e) => { durum.soruId = e.target.value; durum.secilenDeger = null; ciz(); });
    $("bosGizle").addEventListener("change", (e) => { durum.bosGizle = e.target.checked; ciz(); });
    $("soruIcerik").addEventListener("click", (e) => {
        const bar = e.target.closest("[data-deger]");
        if (bar) {
            durum.secilenDeger = durum.secilenDeger === bar.dataset.deger ? null : bar.dataset.deger;
            ciz();
            return;
        }
        if (e.target.closest("[data-secim-temizle]")) { durum.secilenDeger = null; ciz(); }
    });

    // Satıra tıklama / Enter -> kişi detayı (her iki tablo)
    document.querySelector("main").addEventListener("click", (e) => {
        const satir = e.target.closest("tr[data-kisi]");
        if (satir && !e.target.closest("button")) detayAc(satir.dataset.kisi);
    });
    document.querySelector("main").addEventListener("keydown", (e) => {
        const satir = e.target.closest?.("tr[data-kisi]");
        if (satir && e.key === "Enter") detayAc(satir.dataset.kisi);
    });

    $("kisiCsvBtn").addEventListener("click", () => {
        const liste = siraliKisiler(filtreliKayitlar());
        csvIndir(`analiz-kisiler-${bugun()}.csv`, KISI_SUTUNLARI.map((s) => s.ad),
            liste.map((k) => KISI_SUTUNLARI.map((s) => (s.id === "form_tarihi" ? tarihFormatlaTR(alanDegeri(k, s.id)) : alanDegeri(k, s.id)))));
    });
    $("soruCsvBtn").addEventListener("click", () => {
        const soru = SORULAR.find((s) => s.id === durum.soruId);
        if (!soru) return;
        if (soru.tip === "matris") {
            const kaynak = SORULAR.find((s) => s.id === soru.satirKaynak);
            const liste = filtreliKayitlar();
            csvIndir(`analiz-${soru.id}-${bugun()}.csv`, ["Ortam", ...soru.secenekler.map((f) => f.etiket)],
                kaynak.secenekler.map((o) => [o.etiket, ...soru.secenekler.map((f) => liste.filter((k) =>
                    (k.cevaplar[soru.satirKaynak] || []).includes(o.deger) && (k.cevaplar[soru.id] || []).includes(`${o.deger}:${f.deger}`)).length)]));
            return;
        }
        const { basliklar, satirlar } = soruSatirlari(soru, filtreliKayitlar());
        csvIndir(`analiz-${soru.id}-${bugun()}.csv`, basliklar, satirlar.map((s) => s.hucreler));
    });

    $("detayKapatBtn").addEventListener("click", detayKapat);
    $("detayModal").addEventListener("click", (e) => { if (e.target === $("detayModal")) detayKapat(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && durum.detayId) detayKapat(); });
    $("detayWordBtn").addEventListener("click", async () => {
        const k = kayitlar.find((x) => x.id === durum.detayId);
        if (!k) return;
        try {
            await isAnaliziWordAktar({ form_tarihi: k.form_tarihi, cevaplar: k.cevaplar });
        } catch (e) {
            alert("Word oluşturulamadı: " + e.message);
        }
    });
    $("detayKaldirBtn").addEventListener("click", async () => {
        const id = durum.detayId;
        const k = kayitlar.find((x) => x.id === id);
        if (!k || !confirm(`${k.ad} panelden kaldırılsın mı? (JSON dosyasına dokunulmaz)`)) return;
        kayitlar = kayitlar.filter((x) => x.id !== id);
        if (dbKullanilabilir) { try { await dbSil(id); } catch (e) { /* bellekten silindi */ } }
        detayKapat();
        ciz();
    });

    // ---- açılış ----
    (async () => {
        try {
            kayitlar = ((await dbHepsi()) || []).map(turet);
        } catch (e) {
            dbKullanilabilir = false;
            mesajGoster("Tarayıcı deposu kullanılamıyor; yüklenen veriler sayfa kapanınca silinir.", true);
        }
        ciz();
    })();
})();
