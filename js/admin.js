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
        detayId: null,
        gorevAra: "",
        gorevGrupla: true,
        kaliteTur: null
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
        const cizici = {
            kisiler: kisiTablosuCiz, soru: soruCiz, gorev: gorevHavuzuCiz,
            karsilastirma: karsilastirmaCiz, rapor: raporAgaciCiz, kalite: kaliteCiz
        };
        cizici[durum.sekme](liste);
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

    // Aramada bağlam: terimin geçtiği ilk sorunun etiketi ve çevresindeki metin
    function isaretle(metin, terim) {
        const kucukMetin = kucuk(metin);
        let cikti = "", i = 0, j;
        while (terim && (j = kucukMetin.indexOf(terim, i)) >= 0) {
            cikti += esc(metin.slice(i, j)) + `<mark>${esc(metin.slice(j, j + terim.length))}</mark>`;
            i = j + terim.length;
        }
        return cikti + esc(metin.slice(i));
    }

    function aramaBaglami(k, terim) {
        const bulunan = [];
        SORULAR.forEach((s) => {
            const metin = cevapMetni(s, k.cevaplar[s.id], k.cevaplar).replace(/\s+/g, " ");
            const yer = kucuk(metin).indexOf(terim);
            if (yer >= 0) bulunan.push({ s, metin, yer });
        });
        if (!bulunan.length) return "";
        const { s, metin, yer } = bulunan[0];
        const bas = Math.max(0, yer - 40), son = Math.min(metin.length, yer + terim.length + 60);
        return `<div class="admin-baglam"><span class="admin-baglam-soru">${esc(kisaEtiket(s))}:</span>
            ${bas > 0 ? "…" : ""}${isaretle(metin.slice(bas, son), terim)}${son < metin.length ? "…" : ""}
            ${bulunan.length > 1 ? `<span class="admin-not">+${bulunan.length - 1} soruda daha</span>` : ""}</div>`;
    }

    function kisaEtiket(soru) {
        const e = soru.etiket.replace(/\s*\((?:Word'e yazılmaz|[^)]*için[^)]*)\)/g, "").trim();
        return e.length > 60 ? `${e.slice(0, 57)}…` : e;
    }

    function kisiTablosuCiz(liste) {
        const terim = kucuk(durum.arama).trim();
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
                    if (s.id === "ad") return `<td><strong>${esc(v)}</strong>${terim ? aramaBaglami(k, terim) : ""}</td>`;
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

    // ---- veri kalitesi ----
    // Word'e giden ve şu anki cevaplara göre sorulması gereken sorular (formdaki "… ise" kuralları)
    const WORD_DISI = new Set(["haftalik_gun", "vardiya", "gorusmeci"]);
    function uygulanabilir(soru, c) {
        if (WORD_DISI.has(soru.id) || soru.tip === "matris") return false;
        if (soru.tip === "onay" && (soru.secenekler || []).length === 1) return false; // işaretsiz de cevaptır
        const iceriyor = (id, deger) => Array.isArray(c[id]) && c[id].includes(deger);
        switch (soru.id) {
            case "y_diger_aciklama": return iceriyor("yetkiler", "y_diger");
            case "ortam_diger_aciklama": return iceriyor("ortamlar", "diger");
            case "faktor_diger_aciklama": return (c.ortam_faktor || []).some((h) => h.endsWith(":diger"));
            case "bilgi_problemleri": return c.bilgi_gelis !== "Evet";
            case "yonetim_sorumlulugu": case "dogrudan_sayi": case "dolayli_sayi": case "personel_unvanlar":
                return c.liderlik_var !== "Hayır";
            case "risk_trafik_siddet": case "risk_trafik_siklik": return iceriyor("risk_trafik_var", "X");
            case "risk_meslek_siddet": case "risk_meslek_siklik": return iceriyor("risk_meslek_var", "X");
            default: return true;
        }
    }

    const KALITE_TURLERI = ["Word öncesi uyarı", "Boş soru", "Görev", "Eksik bilgi", "Taslak"];

    function kaliteSorunlari(k) {
        const c = k.cevaplar;
        const sorunlar = [];
        const ekle = (tur, metin) => sorunlar.push({ tur, metin });
        wordOnKontrolUyarilari(k).forEach((u) => ekle("Word öncesi uyarı", u));
        const bos = SORULAR.filter((s) => uygulanabilir(s, c) && bosMu(c[s.id]));
        if (bos.length) {
            ekle("Boş soru", `${bos.length} soru boş: ${bos.slice(0, 5).map(kisaEtiket).join(" · ")}${bos.length > 5 ? " …" : ""}`);
        }
        const gorevler = Array.isArray(c.gorevler) ? c.gorevler : [];
        if (!gorevler.length) {
            ekle("Görev", "Görev girilmemiş");
        } else {
            const { yuzdeler } = gorevYuzdeleri(gorevler, c.haftalik_gun);
            const hesapsiz = gorevler.map((g, i) => (yuzdeler[i] == null ? i : -1)).filter((i) => i >= 0);
            if (hesapsiz.length) {
                ekle("Görev", `${hesapsiz.length} görevin yüzdesi hesaplanamadı (dakika veya sıklık okunamadı): ${hesapsiz.slice(0, 3).map((i) =>
                    `${i + 1}. ${String(gorevler[i].gorev || "").slice(0, 40)}`).join(" · ")}${hesapsiz.length > 3 ? " …" : ""}`);
            }
        }
        if (bosMu(c.haftalik_gun)) ekle("Eksik bilgi", "Haftalık çalışma günü seçilmemiş (görev yüzdelerinde 5 gün varsayıldı)");
        if (bosMu(c.gorusmeci)) ekle("Eksik bilgi", "Görüşmeyi yapan kişi girilmemiş");
        if (k.durum !== "tamamlandi") ekle("Taslak", "Kayıt tamamlanmamış (taslak)");
        return sorunlar;
    }

    function kaliteCiz(liste) {
        const satirlar = liste.map((k) => ({ k, sorunlar: kaliteSorunlari(k) }));
        const sayac = Object.fromEntries(KALITE_TURLERI.map((t) => [t, satirlar.filter((s) => s.sorunlar.some((x) => x.tur === t)).length]));
        const sorunsuz = satirlar.filter((s) => !s.sorunlar.length).length;
        const tur = durum.kaliteTur;
        const gosterilen = satirlar.filter((s) => (tur ? s.sorunlar.some((x) => x.tur === tur) : s.sorunlar.length))
            .sort((a, b) => b.sorunlar.length - a.sorunlar.length || karsilastir(a.k.ad, b.k.ad));
        $("kaliteIcerik").innerHTML = `
            <div class="admin-cipler">${KALITE_TURLERI.map((t) => `<button type="button" class="admin-cip-btn${tur === t ? " secili" : ""}" data-kalite-tur="${t}" ${sayac[t] ? "" : "disabled"}>
                ${esc(t)} <strong>${sayac[t]}</strong></button>`).join("")}
                <span class="admin-not">${sorunsuz} / ${liste.length} kişide sorun yok</span></div>
            <div class="table-wrap admin-tablo-sar"><table class="answer-table admin-tablo">
                <thead><tr><th>Kişi</th><th>Ünvan</th><th>Departman</th><th>Sorunlar</th></tr></thead>
                <tbody>${gosterilen.length ? gosterilen.map(({ k, sorunlar }) => `<tr class="admin-satir" data-kisi="${esc(k.id)}" tabindex="0">
                    <td class="admin-hucre-kisi">${esc(k.ad)}</td><td>${esc(alanDegeri(k, "unvan_pozisyon") || "-")}</td><td>${esc(alanDegeri(k, "departman") || "-")}</td>
                    <td><ul class="admin-sorun-liste">${sorunlar.filter((x) => !tur || x.tur === tur).map((x) =>
                        `<li><span class="admin-etiket">${esc(x.tur)}</span> ${esc(x.metin)}</li>`).join("")}</ul></td></tr>`).join("")
                    : `<tr><td colspan="4" class="admin-bos-satir">Gösterilecek sorun yok.</td></tr>`}</tbody>
            </table></div>`;
    }

    // ---- görev havuzu ----
    function gorevSatirlari(liste) {
        const satirlar = [];
        liste.forEach((k) => {
            const gorevler = Array.isArray(k.cevaplar.gorevler) ? k.cevaplar.gorevler : [];
            const { sureler, yuzdeler } = gorevYuzdeleri(gorevler, k.cevaplar.haftalik_gun);
            gorevler.forEach((g, i) => {
                const metin = String(g.gorev ?? "").trim();
                if (!metin && bosMu(g.yuzde)) return;
                satirlar.push({
                    kisi: k,
                    metin: metin || "(görev adı yok)",
                    dakika: String(g.yuzde ?? "").trim(),
                    adet: String(g.adet ?? "").trim(),
                    siklik: [g.gunluk, g.belirli, g.duzensiz].map((v) => String(v ?? "").trim()).filter(Boolean).join(" / "),
                    sa: String(g.sa ?? "").trim(),
                    aylik: sureler[i],
                    yuzde: yuzdeler[i]
                });
            });
        });
        return satirlar;
    }

    // Benzer görev: kelime kökü (ilk 6 harf) kümelerinin Jaccard benzerliği >= 0,5
    const DURAK = new Set(["ile", "icin", "olan", "gibi", "veya", "olarak", "her", "tum", "the", "and"]);
    function kelimeKumesi(metin) {
        return new Set(siklikNormal(metin).replace(/[^a-z0-9 ]+/g, " ").split(/\s+/)
            .filter((w) => w.length >= 3 && !DURAK.has(w)).map((w) => w.slice(0, 6)));
    }

    function benzerlik(a, b) {
        if (!a.size || !b.size) return 0;
        let ortak = 0;
        a.forEach((w) => { if (b.has(w)) ortak++; });
        return ortak / (a.size + b.size - ortak);
    }

    function gorevGruplari(satirlar, birlestir) {
        const gruplar = [];
        [...satirlar].sort((a, b) => (b.aylik ?? -1) - (a.aylik ?? -1)).forEach((s) => {
            const anahtar = kucuk(s.metin).replace(/\s+/g, " ");
            const kume = kelimeKumesi(s.metin);
            let g = gruplar.find((x) => x.anahtar === anahtar || (birlestir && benzerlik(x.kume, kume) >= 0.5));
            if (!g) { g = { anahtar, kume, satirlar: [] }; gruplar.push(g); }
            g.satirlar.push(s);
        });
        return gruplar.map((g) => {
            const hesapli = g.satirlar.filter((s) => s.aylik != null);
            const kisiler = [...new Map(g.satirlar.map((s) => [s.kisi.id, s.kisi])).values()];
            return {
                metin: g.satirlar[0].metin,
                yazim: new Set(g.satirlar.map((s) => s.metin)).size,
                yazimlar: [...new Set(g.satirlar.map((s) => s.metin))],
                adet: g.satirlar.length,
                kisiler,
                aylik: hesapli.reduce((t, s) => t + s.aylik, 0),
                ortYuzde: hesapli.length ? hesapli.reduce((t, s) => t + s.yuzde, 0) / hesapli.length : null,
                surekli: g.satirlar.filter((s) => s.sa === "S").length,
                araSira: g.satirlar.filter((s) => s.sa === "A").length,
                hesapsiz: g.satirlar.length - hesapli.length
            };
        }).sort((a, b) => b.aylik - a.aylik || b.kisiler.length - a.kisiler.length);
    }

    function gorevHavuzuVerisi(liste) {
        const terim = kucuk(durum.gorevAra).trim();
        const satirlar = gorevSatirlari(liste).filter((s) => !terim || kucuk(s.metin).includes(terim));
        return { satirlar, gruplar: gorevGruplari(satirlar, durum.gorevGrupla) };
    }

    const dk = (n) => Math.round(n).toLocaleString("tr-TR");

    function gorevHavuzuCiz(liste) {
        const { satirlar, gruplar } = gorevHavuzuVerisi(liste);
        const toplam = gruplar.reduce((t, g) => t + g.aylik, 0);
        const hesapsiz = satirlar.filter((s) => s.aylik == null).length;
        const enBuyuk = Math.max(1, ...gruplar.map((g) => g.aylik));
        $("gorevIcerik").innerHTML = `
            <p class="admin-not">${satirlar.length} görev · ${gruplar.length} ${durum.gorevGrupla ? "grup (benzerler birleşik)" : "farklı görev"} · toplam aylık ${dk(toplam)} dk${hesapsiz ? ` · ${hesapsiz} görev hesaplanamadı (Veri Kalitesi sekmesine bakın)` : ""}</p>
            <div class="table-wrap admin-tablo-sar"><table class="answer-table admin-tablo">
                <thead><tr><th>Görev</th><th>Kişi</th><th>Aylık toplam (dk)</th><th title="Görevin, onu yapan kişinin aylık iş yükündeki ortalama payı">Kişi içi pay</th><th>S / A</th><th>Yapanlar</th></tr></thead>
                <tbody>${gruplar.length ? gruplar.map((g) => `<tr>
                    <td class="admin-hucre" title="${esc(g.yazimlar.join("\n"))}">${esc(g.metin)}${g.yazim > 1 ? ` <span class="admin-not">(+${g.yazim - 1} benzer yazım)</span>` : ""}</td>
                    <td class="admin-sayi">${g.kisiler.length}</td>
                    <td class="admin-bar-hucre"><span class="admin-mini-bar" style="width:${(g.aylik / enBuyuk) * 100}%"></span><span class="admin-sayi">${g.aylik ? dk(g.aylik) : "-"}</span></td>
                    <td class="admin-sayi">${g.ortYuzde == null ? "-" : yuzdeMetni(g.ortYuzde)}</td>
                    <td class="admin-sayi">${g.surekli} / ${g.araSira}</td>
                    <td class="admin-hucre">${g.kisiler.map((k) => `<button type="button" class="admin-kisi-link" data-kisi-ac="${esc(k.id)}">${esc(k.ad)}</button>`).join(", ")}</td>
                </tr>`).join("") : `<tr><td colspan="6" class="admin-bos-satir">Görev bulunamadı.</td></tr>`}</tbody>
            </table></div>`;
    }

    // ---- karşılaştırma ----
    const RISK_SEVIYE = ["Düşük", "Orta", "Yüksek"];
    const YOK_CEVAP = /^(yok|yoktur|hayır|hayir|-|\.)\.?$/i;

    function karsilastirmaVerisi(liste, alan) {
        const gruplar = new Map();
        liste.forEach((k) => {
            const ad = alanDegeri(k, alan) || "(boş)";
            if (!gruplar.has(ad)) gruplar.set(ad, []);
            gruplar.get(ad).push(k);
        });
        return [...gruplar.entries()].map(([ad, kisiler]) => {
            let gorev = 0, surekli = 0, araSira = 0, aylik = 0;
            const memnuniyet = [];
            kisiler.forEach((k) => {
                const c = k.cevaplar;
                const g = Array.isArray(c.gorevler) ? c.gorevler : [];
                gorev += g.length;
                surekli += g.filter((x) => x.sa === "S").length;
                araSira += g.filter((x) => x.sa === "A").length;
                aylik += gorevYuzdeleri(g, c.haftalik_gun).toplam;
                const m = parseFloat(c.memnuniyet);
                if (!Number.isNaN(m)) memnuniyet.push(m);
            });
            const say = (fn) => kisiler.filter(fn).length;
            return {
                ad, kisi: kisiler.length, gorev, aylik,
                kisiBasi: aylik / kisiler.length,
                surekliOran: surekli + araSira ? (surekli / (surekli + araSira)) * 100 : null,
                memnuniyet: memnuniyet.length ? memnuniyet.reduce((a, b) => a + b, 0) / memnuniyet.length : null,
                memnuniyetSayi: memnuniyet.length,
                doluluk: kisiler.reduce((t, k) => t + k.doluluk, 0) / kisiler.length,
                liderlik: say((k) => k.cevaplar.liderlik_var === "Evet"),
                risk: say((k) => RISK_SEVIYE.includes(k.cevaplar.risk_kaza_siddet)
                    || (k.cevaplar.risk_trafik_var || []).includes("X") || (k.cevaplar.risk_meslek_var || []).includes("X")),
                sikinti: say((k) => !bosMu(k.cevaplar.personel_sikintisi) && !YOK_CEVAP.test(String(k.cevaplar.personel_sikintisi).trim()))
            };
        }).sort((a, b) => b.kisi - a.kisi || karsilastir(a.ad, b.ad));
    }

    const KARSILASTIRMA_SUTUNLARI = [
        { ad: "Kişi", deger: (g) => g.kisi },
        { ad: "Görev", deger: (g) => g.gorev },
        { ad: "Aylık iş yükü (dk)", deger: (g) => Math.round(g.aylik), metin: (g) => dk(g.aylik) },
        { ad: "Kişi başı aylık (dk)", deger: (g) => Math.round(g.kisiBasi), metin: (g) => dk(g.kisiBasi), bar: true },
        { ad: "Sürekli görev oranı", deger: (g) => g.surekliOran, metin: (g) => (g.surekliOran == null ? "-" : `%${Math.round(g.surekliOran)}`) },
        { ad: "Memnuniyet (1-5)", deger: (g) => g.memnuniyet, metin: (g) => (g.memnuniyet == null ? "-" : `${g.memnuniyet.toFixed(1).replace(".", ",")} (${g.memnuniyetSayi})`) },
        { ad: "Doluluk", deger: (g) => Math.round(g.doluluk), metin: (g) => `%${Math.round(g.doluluk)}` },
        { ad: "Bağlı personeli olan", deger: (g) => g.liderlik },
        { ad: "Risk belirten", deger: (g) => g.risk },
        { ad: "Personel sıkıntısı belirten", deger: (g) => g.sikinti }
    ];

    function karsilastirmaCiz(liste) {
        const alan = $("grupAlan").value;
        const veri = karsilastirmaVerisi(liste, alan);
        const enBuyuk = Math.max(1, ...veri.map((g) => g.kisiBasi));
        const grupAdi = $("grupAlan").selectedOptions[0].textContent;
        $("karsilastirmaIcerik").innerHTML = `
            <p class="admin-not">${veri.length} ${grupAdi.toLocaleLowerCase("tr-TR")} · aylık iş yükü görevlerin dakika × adet × sıklık toplamıdır; hesaplanamayan görevler dahil değildir</p>
            <div class="table-wrap admin-tablo-sar"><table class="answer-table admin-tablo">
                <thead><tr><th>${esc(grupAdi)}</th>${KARSILASTIRMA_SUTUNLARI.map((s) => `<th>${esc(s.ad)}</th>`).join("")}</tr></thead>
                <tbody>${veri.map((g) => `<tr class="admin-satir" data-grup-filtre="${esc(g.ad)}" tabindex="0" title="Bu gruba filtrele">
                    <td class="admin-hucre-kisi">${esc(g.ad)}</td>
                    ${KARSILASTIRMA_SUTUNLARI.map((s) => s.bar
                        ? `<td class="admin-bar-hucre"><span class="admin-mini-bar" style="width:${(g.kisiBasi / enBuyuk) * 100}%"></span><span class="admin-sayi">${s.metin(g)}</span></td>`
                        : `<td class="admin-sayi">${esc(s.metin ? s.metin(g) : s.deger(g))}</td>`).join("")}
                </tr>`).join("")}</tbody>
            </table></div>`;
    }

    // ---- raporlama ağacı ----
    const adAnahtari = (s) => kucuk(String(s ?? "").trim()).replace(/\s+/g, " ");

    function raporAgaciCiz(liste) {
        const kisiler = new Map(liste.map((k) => [adAnahtari(k.ad), k]));
        const cocuklar = new Map();
        const kayitsizAmirler = new Map();
        const kokler = [];
        liste.forEach((k) => {
            const c = k.cevaplar;
            const ust = adAnahtari(c.ust_amir_ismi);
            if (!ust || ust === adAnahtari(k.ad)) { kokler.push(adAnahtari(k.ad)); return; }
            if (!cocuklar.has(ust)) cocuklar.set(ust, []);
            cocuklar.get(ust).push(adAnahtari(k.ad));
            if (!kisiler.has(ust) && !kayitsizAmirler.has(ust)) {
                kayitsizAmirler.set(ust, { ad: String(c.ust_amir_ismi).trim(), unvan: String(c.ust_amir_pozisyonu || "").trim(), departman: String(c.ust_amir_departman || "").trim() });
            }
        });
        kayitsizAmirler.forEach((_, anahtar) => kokler.push(anahtar));
        const ziyaret = new Set();
        const dugum = (anahtar) => {
            if (ziyaret.has(anahtar)) return "";
            ziyaret.add(anahtar);
            const k = kisiler.get(anahtar);
            const altlar = (cocuklar.get(anahtar) || []).sort((a, b) => karsilastir(kisiler.get(a)?.ad, kisiler.get(b)?.ad));
            let kart;
            if (k) {
                const ayrica = (k.cevaplar.diger_iletisim || []).map((s) => String(s.kisi || "").trim()).filter(Boolean);
                kart = `<button type="button" class="admin-dugum" data-kisi-ac="${esc(k.id)}">
                    <strong>${esc(k.ad)}</strong><span>${esc([alanDegeri(k, "unvan_pozisyon"), alanDegeri(k, "departman")].filter(Boolean).join(" · "))}</span>
                    ${ayrica.length ? `<span class="admin-ayrica">ayrıca raporladığı: ${esc(ayrica.join(", "))}</span>` : ""}</button>`;
            } else {
                const a = kayitsizAmirler.get(anahtar);
                kart = `<div class="admin-dugum kayitsiz"><strong>${esc(a.ad)}</strong><span>${esc([a.unvan, a.departman].filter(Boolean).join(" · ") || "kayıt yok")}</span></div>`;
            }
            const alt = altlar.map(dugum).filter(Boolean).join("");
            return `<li>${kart}${altlar.length ? `<span class="admin-alt-sayi">${altlar.length} kişi bağlı</span>` : ""}${alt ? `<ul>${alt}</ul>` : ""}</li>`;
        };
        let govde = kokler.sort((a, b) => (cocuklar.get(b)?.length || 0) - (cocuklar.get(a)?.length || 0)).map(dugum).join("");
        // Döngüdeki (birbirinin amiri görünen) kişiler köke bağlanmaz; ayrıca gösterilir
        const dongu = [...kisiler.keys()].filter((a) => !ziyaret.has(a));
        if (dongu.length) govde += dongu.map(dugum).join("");
        $("raporIcerik").innerHTML = `
            <p class="admin-not">${liste.length} kişi · ${kayitsizAmirler.size} kaydı olmayan amir${dongu.length ? ` · ${dongu.length} kişi döngüde (birbirini amir göstermiş)` : ""}</p>
            ${liste.length ? `<ul class="admin-agac">${govde}</ul>` : `<p class="admin-bos-satir">Kişi yok.</p>`}`;
    }

    // ---- Excel dökümü (.xlsx, PizZip ile) ----
    const XML_BAS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    const xmlEsc = (s) => String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
        .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    const sutunHarfi = (i) => { let s = ""; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };

    function sayfaXml(basliklar, satirlar) {
        const hucre = (v, r, c, stil) => {
            const ref = `${sutunHarfi(c)}${r}`;
            if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${stil}><v>${v}</v></c>`;
            const metin = String(v ?? "");
            if (!metin) return "";
            return `<c r="${ref}" t="inlineStr"${stil}><is><t xml:space="preserve">${xmlEsc(metin.slice(0, 32000))}</t></is></c>`;
        };
        const genislik = basliklar.map((b, c) => Math.min(60, Math.max(10, String(b).length,
            ...satirlar.slice(0, 200).map((s) => Math.max(...String(s[c] ?? "").split("\n").map((x) => x.length))))));
        const son = sutunHarfi(Math.max(0, basliklar.length - 1));
        return `${XML_BAS}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${genislik.map((g, i) => `<col min="${i + 1}" max="${i + 1}" width="${g + 2}" customWidth="1"/>`).join("")}</cols>
<sheetData><row r="1">${basliklar.map((b, c) => hucre(b, 1, c, ' s="1"')).join("")}</row>
${satirlar.map((s, i) => `<row r="${i + 2}">${s.map((v, c) => hucre(v, i + 2, c, ' s="2"')).join("")}</row>`).join("\n")}</sheetData>
<autoFilter ref="A1:${son}${satirlar.length + 1}"/></worksheet>`;
    }

    function xlsxIndir(ad, sayfalar) {
        const zip = new PizZip();
        const ns = "http://schemas.openxmlformats.org";
        zip.file("[Content_Types].xml", `${XML_BAS}<Types xmlns="${ns}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sayfalar.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`);
        zip.file("_rels/.rels", `${XML_BAS}<Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
        zip.file("xl/workbook.xml", `${XML_BAS}<workbook xmlns="${ns}/spreadsheetml/2006/main" xmlns:r="${ns}/officeDocument/2006/relationships"><sheets>${sayfalar.map((s, i) => `<sheet name="${xmlEsc(s.ad)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`);
        zip.file("xl/_rels/workbook.xml.rels", `${XML_BAS}<Relationships xmlns="${ns}/package/2006/relationships">${sayfalar.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${ns}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sayfalar.length + 1}" Type="${ns}/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
        zip.file("xl/styles.xml", `${XML_BAS}<styleSheet xmlns="${ns}/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
        sayfalar.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sayfaXml(s.basliklar, s.satirlar)));
        const blob = zip.generate({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", compression: "DEFLATE" });
        saveAs(blob, ad);
    }

    // Excel sayfa adı: en çok 31 karakter, []:*?/\ olmadan, benzersiz
    function sayfaAdlari(adlar) {
        const kullanilan = new Set();
        return adlar.map((a) => {
            let ad = String(a).replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Sayfa";
            for (let n = 2; kullanilan.has(kucuk(ad)); n++) ad = `${ad.slice(0, 27)} (${n})`;
            kullanilan.add(kucuk(ad));
            return ad;
        });
    }

    function excelSayfalari(liste) {
        const kisiler = siraliKisiler(liste);
        const ozel = ["personel_ismi", "unvan_pozisyon", "bolum", "departman", "gorusmeci", "vardiya", "haftalik_gun"];
        const duz = SORULAR.filter((s) => s.tip !== "tablo" && !ozel.includes(s.id));
        const tablolar = SORULAR.filter((s) => s.tip === "tablo");
        const adlar = sayfaAdlari(["Kişiler", ...tablolar.map((s) => s.etiket.replace(/\([^)]*\)/g, " ").replace(/^[\d.\s]+/, ""))]);
        const sayfalar = [{
            ad: adlar[0],
            basliklar: ["Personel", "Ünvan", "Bölüm", "Departman", "Görüşmeci", "Vardiya", "Haftalık gün", "Form tarihi", "Durum", "Doluluk (%)", "Görev sayısı", "Aylık iş yükü (dk)", "Kaynak dosya",
                ...duz.map((s) => kisaEtiket(s))],
            satirlar: kisiler.map((k) => {
                const c = k.cevaplar;
                return [k.ad, c.unvan_pozisyon, c.bolum, c.departman, c.gorusmeci, c.vardiya, c.haftalik_gun, tarihFormatlaTR(k.form_tarihi), alanDegeri(k, "durum"),
                    k.doluluk, k.gorev, Math.round(gorevYuzdeleri(c.gorevler || [], c.haftalik_gun).toplam), k.kaynak,
                    ...duz.map((s) => cevapMetni(s, c[s.id], c))];
            })
        }];
        tablolar.forEach((soru, i) => {
            const gorev = soru.id === "gorevler";
            const satirlar = [];
            kisiler.forEach((k) => {
                const v = Array.isArray(k.cevaplar[soru.id]) ? k.cevaplar[soru.id] : [];
                const hesap = gorev ? gorevYuzdeleri(v, k.cevaplar.haftalik_gun) : null;
                v.forEach((satir, j) => satirlar.push([k.ad, alanDegeri(k, "departman"), ...soru.sutunlar.map((s) => tabloHucre(s, satir[s.id])),
                    ...(gorev ? [hesap.sureler[j] == null ? "" : Math.round(hesap.sureler[j]), hesap.yuzdeler[j] == null ? "" : Math.round(hesap.yuzdeler[j] * 10) / 10] : [])]));
            });
            sayfalar.push({
                ad: adlar[i + 1],
                basliklar: ["Kişi", "Departman", ...soru.sutunlar.map((s) => s.baslik), ...(gorev ? ["Aylık dk", "Yüzde"] : [])],
                satirlar
            });
        });
        return sayfalar;
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
        document.querySelectorAll("[data-sekme-panel]").forEach((p) => p.classList.toggle("hidden", p.dataset.sekmePanel !== durum.sekme));
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
        const link = e.target.closest("[data-kisi-ac]");
        if (link) { detayAc(link.dataset.kisiAc); return; }
        // Karşılaştırma satırı: o gruba filtrele ve kişiler sekmesine geç
        const grup = e.target.closest("[data-grup-filtre]");
        if (grup) {
            const alan = $("grupAlan").value;
            durum.filtre[alan] = grup.dataset.grupFiltre === "(boş)" ? "" : grup.dataset.grupFiltre;
            document.querySelector('[data-sekme="kisiler"]').click();
            return;
        }
        const tur = e.target.closest("[data-kalite-tur]");
        if (tur) { durum.kaliteTur = durum.kaliteTur === tur.dataset.kaliteTur ? null : tur.dataset.kaliteTur; ciz(); return; }
        const satir = e.target.closest("tr[data-kisi]");
        if (satir && !e.target.closest("button")) detayAc(satir.dataset.kisi);
    });

    $("gorevAra").addEventListener("input", (e) => { durum.gorevAra = e.target.value; ciz(); });
    $("gorevGrupla").addEventListener("change", (e) => { durum.gorevGrupla = e.target.checked; ciz(); });
    $("grupAlan").addEventListener("change", () => ciz());

    $("gorevCsvBtn").addEventListener("click", () => {
        const { gruplar } = gorevHavuzuVerisi(filtreliKayitlar());
        csvIndir(`analiz-gorev-havuzu-${bugun()}.csv`, ["Görev", "Benzer yazım", "Kişi", "Aylık toplam (dk)", "Kişi içi pay (%)", "Sürekli", "Ara sıra", "Hesaplanamayan", "Yapanlar"],
            gruplar.map((g) => [g.metin, g.yazim, g.kisiler.length, Math.round(g.aylik), g.ortYuzde == null ? "" : g.ortYuzde.toFixed(1).replace(".", ","),
                g.surekli, g.araSira, g.hesapsiz, g.kisiler.map((k) => k.ad).join(", ")]));
    });
    $("karsilastirmaCsvBtn").addEventListener("click", () => {
        const veri = karsilastirmaVerisi(filtreliKayitlar(), $("grupAlan").value);
        csvIndir(`analiz-karsilastirma-${bugun()}.csv`, [$("grupAlan").selectedOptions[0].textContent, ...KARSILASTIRMA_SUTUNLARI.map((s) => s.ad)],
            veri.map((g) => [g.ad, ...KARSILASTIRMA_SUTUNLARI.map((s) => (s.metin ? s.metin(g) : s.deger(g)))]));
    });
    $("excelBtn").addEventListener("click", () => {
        const liste = filtreliKayitlar();
        if (!liste.length) return;
        xlsxIndir(`analiz-dokum-${bugun()}.xlsx`, excelSayfalari(liste));
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
