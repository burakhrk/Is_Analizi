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
        kaliteTur: null,
        altSekme: {},
        analizCsv: {},
        tanimSecim: null
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

    // Filtre ve karşılaştırmada aynı birimin farklı yazımları tek grup sayılır
    // ("İnsan Kaynakları" = "İnsan Kaynakları Departman"); görünen ad en sık yazımdır.
    const GRUPLANAN = new Set(["departman", "bolum", "unvan_pozisyon", "gorusmeci", "vardiya"]);
    let grupHaritasi = new Map();

    function grupAnahtari(deger) {
        return siklikNormal(deger).replace(/\([^)]*\)/g, " ")
            .replace(/\b(departmani|departman|bolumu|bolum|birimi|birim)\b/g, " ")
            .replace(/[^a-z0-9]+/g, " ").trim();
    }

    function grupHaritasiniKur() {
        const sayac = new Map();
        kayitlar.forEach((k) => GRUPLANAN.forEach((alan) => {
            const ham = String(k.cevaplar[alan] ?? "").trim();
            if (!ham) return;
            const anahtar = `${alan}|${grupAnahtari(ham) || kucuk(ham)}`;
            if (!sayac.has(anahtar)) sayac.set(anahtar, new Map());
            const m = sayac.get(anahtar);
            m.set(ham, (m.get(ham) || 0) + 1);
        }));
        grupHaritasi = new Map([...sayac.entries()].map(([anahtar, m]) =>
            [anahtar, [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0]]));
    }

    function grupDegeri(k, alan) {
        if (!GRUPLANAN.has(alan)) return alanDegeri(k, alan);
        const ham = String(k.cevaplar[alan] ?? "").trim();
        if (!ham) return "";
        return grupHaritasi.get(`${alan}|${grupAnahtari(ham) || kucuk(ham)}`) || ham;
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
            return FILTRE_ALANLARI.every((f) => !durum.filtre[f.id] || grupDegeri(k, f.id) === durum.filtre[f.id]);
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
        grupHaritasiniKur();
        filtreleriCiz();
        const liste = filtreliKayitlar();
        ozetCiz(liste);
        $("filtreSayac").textContent = `${liste.length} / ${kayitlar.length} kişi`;
        const cizici = {
            kisiler: kisiTablosuCiz, soru: soruCiz, gorev: gorevHavuzuCiz,
            karsilastirma: karsilastirmaCiz, rapor: raporAgaciCiz, kalite: kaliteCiz
        };
        if (ANALIZLER[durum.sekme]) analizSekmesiCiz(durum.sekme, liste);
        else cizici[durum.sekme](liste);
    }

    function ozetCiz(liste) {
        const farkli = (alan) => new Set(liste.map((k) => grupDegeri(k, alan)).filter(Boolean)).size;
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
            const degerler = [...new Set(kayitlar.map((k) => grupDegeri(k, f.id)).filter(Boolean))].sort(karsilastir);
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
    function listeMaddeleri(metin) {
        const parcalar = [];
        let derinlik = 0, parca = "";
        for (const h of String(metin ?? "")) {
            if (h === "(") derinlik++;
            if (h === ")") derinlik = Math.max(0, derinlik - 1);
            if ((h === "," || h === ";") && !derinlik) { parcalar.push(parca); parca = ""; } else parca += h;
        }
        parcalar.push(parca);
        return parcalar.map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
    }

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
            else if (soru.tip === "liste") v.flatMap(listeMaddeleri).forEach((d) => ekle(k.id, kucuk(d), d));
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

    // Yalnızca noktalama ("-", "..", "?") içeren cevap
    function anlamsizMi(v) {
        if (typeof v !== "string") return false;
        const t = v.trim();
        return t !== "" && !/[\p{L}\p{N}]/u.test(t);
    }

    // "Haftada 3" yazılıp adet de 3 girilmişse sayı iki kez çarpılır
    function siklikAdetTekrari(g) {
        const adet = sayiyaCevir(g.adet);
        if (Number.isNaN(adet) || adet <= 1) return false;
        return [g.gunluk, g.belirli, g.duzensiz].some((m) => {
            const e = siklikNormal(m).match(/\b(gun|hafta|ay|yil)(?:da|de|ta|te|lik|luk)?\s+(\d+(?:[.,]\d+)?)/);
            return e && parseFloat(e[2].replace(",", ".")) === adet;
        });
    }

    const KALITE_TURLERI = ["Word öncesi uyarı", "Boş soru", "Görev", "Eksik bilgi", "Taslak"];

    function kaliteSorunlari(k) {
        const c = k.cevaplar;
        const sorunlar = [];
        const ekle = (tur, metin) => sorunlar.push({ tur, metin });
        wordOnKontrolUyarilari(k).forEach((u) => ekle("Word öncesi uyarı", u));
        const bos = SORULAR.filter((s) => uygulanabilir(s, c) && bosMu(c[s.id]));
        const anlamsiz = SORULAR.filter((s) => uygulanabilir(s, c) && anlamsizMi(c[s.id]));
        const zorunluAnlamsiz = anlamsiz.filter((s) => s.zorunlu);
        if (zorunluAnlamsiz.length) {
            ekle("Eksik bilgi", `Zorunlu alanda anlamlı cevap yok: ${zorunluAnlamsiz.map((s) => `${kisaEtiket(s)} ("${String(c[s.id]).trim()}")`).join(" · ")}`);
        }
        if (anlamsiz.length > zorunluAnlamsiz.length) {
            const digerleri = anlamsiz.filter((s) => !s.zorunlu);
            ekle("Boş soru", `${digerleri.length} soruda yalnızca "-" gibi işaret var: ${digerleri.slice(0, 5).map(kisaEtiket).join(" · ")}${digerleri.length > 5 ? " …" : ""}`);
        }
        if (bos.length) {
            ekle("Boş soru", `${bos.length} soru boş: ${bos.slice(0, 5).map(kisaEtiket).join(" · ")}${bos.length > 5 ? " …" : ""}`);
        }
        const gorevler = Array.isArray(c.gorevler) ? c.gorevler : [];
        if (!gorevler.length) {
            ekle("Görev", "Görev girilmemiş");
        } else {
            const { yuzdeler } = gorevYuzdeleri(gorevler, c.haftalik_gun);
            const hesapsiz = gorevler.map((g, i) => (yuzdeler[i] == null ? i : -1)).filter((i) => i >= 0);
            const tekrar = gorevler.map((g, i) => (siklikAdetTekrari(g) ? i : -1)).filter((i) => i >= 0);
            if (tekrar.length) {
                ekle("Görev", `${tekrar.length} görevde sıklıktaki sayı adet olarak tekrar yazılmış olabilir (ör. "Haftada 3" + adet 3 = haftada 9 sayılır): ${tekrar.slice(0, 3).map((i) =>
                    `${i + 1}. ${String(gorevler[i].gorev || "").slice(0, 35)}`).join(" · ")}${tekrar.length > 3 ? " …" : ""}`);
            }
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
            const ad = grupDegeri(k, alan) || "(boş)";
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
    const adAnahtari = (s) => siklikNormal(String(s ?? "")).replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();

    // Amir adı kayıtlı kişilerden biriyle 1 harf (uzun adlarda 2) farkla eşleşiyorsa o kişidir
    function harfFarki(a, b) {
        if (Math.abs(a.length - b.length) > 2) return 99;
        let onceki = Array.from({ length: b.length + 1 }, (_, i) => i);
        for (let i = 1; i <= a.length; i++) {
            const satir = [i];
            for (let j = 1; j <= b.length; j++) {
                satir[j] = Math.min(onceki[j] + 1, satir[j - 1] + 1, onceki[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            }
            onceki = satir;
        }
        return onceki[b.length];
    }

    function benzerKisi(anahtar, kisiler) {
        const sinir = anahtar.length >= 12 ? 2 : 1;
        const adaylar = [...kisiler.keys()].filter((k) => harfFarki(anahtar, k) <= sinir);
        return adaylar.length === 1 ? adaylar[0] : null;
    }

    function raporAgaciCiz(liste) {
        const kisiler = new Map(liste.map((k) => [adAnahtari(k.ad), k]));
        const cocuklar = new Map();
        const kayitsizAmirler = new Map();
        const kokler = [];
        const yazimFarki = new Map();
        liste.forEach((k) => {
            const c = k.cevaplar;
            let ust = adAnahtari(c.ust_amir_ismi);
            if (ust && !kisiler.has(ust)) {
                const benzer = benzerKisi(ust, kisiler);
                if (benzer && benzer !== adAnahtari(k.ad)) {
                    yazimFarki.set(adAnahtari(k.ad), String(c.ust_amir_ismi).trim());
                    ust = benzer;
                }
            }
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
                    ${ayrica.length ? `<span class="admin-ayrica">ayrıca raporladığı: ${esc(ayrica.join(", "))}</span>` : ""}
                    ${yazimFarki.has(anahtar) ? `<span class="admin-ayrica">amir adını "${esc(yazimFarki.get(anahtar))}" yazmış, kayıtlı kişiyle eşleştirildi</span>` : ""}</button>`;
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
            <p class="admin-not">${liste.length} kişi · ${kayitsizAmirler.size} kaydı olmayan amir${yazimFarki.size ? ` · ${yazimFarki.size} amir adı farklı yazılmış, eşleştirildi` : ""}${dongu.length ? ` · ${dongu.length} kişi döngüde (birbirini amir göstermiş)` : ""}</p>
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

    // =====================================================================
    // Süreç / Risk / Verimlilik / Görev Tanımı analizleri
    // Her analiz { html, csv: { basliklar, satirlar } } döndürür.
    // =====================================================================

    // ---- ortak yardımcılar ----
    function hucre(v) {
        return v && typeof v === "object" ? v : { t: String(v ?? ""), h: esc(v ?? "") };
    }

    function tabloHtml(basliklar, satirlar, bosMetin = "Kayıt yok.") {
        return `<div class="table-wrap admin-tablo-sar"><table class="answer-table admin-tablo">
            <thead><tr>${basliklar.map((b) => `<th>${esc(b)}</th>`).join("")}</tr></thead>
            <tbody>${satirlar.length ? satirlar.map((s) => `<tr>${s.map((c) => {
                const x = hucre(c);
                return `<td${x.s ? ` class="${x.s}"` : ""}${x.st ? ` style="${x.st}"` : ""}>${x.h}</td>`;
            }).join("")}</tr>`).join("") : `<tr><td colspan="${basliklar.length}" class="admin-bos-satir">${esc(bosMetin)}</td></tr>`}</tbody>
        </table></div>`;
    }

    const csvVerisi = (basliklar, satirlar) => ({ basliklar, satirlar: satirlar.map((s) => s.map((c) => hucre(c).t)) });
    const kisiHucre = (k) => ({ t: k.ad, h: `<button type="button" class="admin-kisi-link" data-kisi-ac="${esc(k.id)}">${esc(k.ad)}</button>` });
    const kisilerHucre = (liste) => ({ t: liste.map((k) => k.ad).join(", "), h: liste.map((k) => kisiHucre(k).h).join(", ") });
    const sayiHucre = (n) => ({ t: n == null || Number.isNaN(n) ? "" : String(Math.round(n)), h: n == null || Number.isNaN(n) ? "-" : dk(n), s: "admin-sayi" });
    const etiketHucre = (metin, tur = "") => ({ t: metin, h: `<span class="admin-etiket ${tur}">${esc(metin)}</span>` });
    const altBaslik = (metin, not = "") => `<h3 class="admin-alt-baslik">${esc(metin)}${not ? ` <span class="admin-not">${esc(not)}</span>` : ""}</h3>`;
    const aylikGunu = (k) => (String(k.cevaplar.haftalik_gun ?? "").trim() === "6" ? 24 : 20);
    const tekilKisiler = (liste) => [...new Map(liste.map((k) => [k.id, k])).values()];

    // "60 dakika", "1 saat", "40 dk/işlem", "90" -> dakika
    function sureDakika(metin) {
        const m = siklikNormal(metin).match(/(\d+(?:[.,]\d+)?)\s*(saat|sa\b|dakika|dak|dk)?/);
        if (!m) return NaN;
        const n = parseFloat(m[1].replace(",", "."));
        return m[2] && m[2].startsWith("sa") ? n * 60 : n;
    }

    // Belge sıklığı: düz sayı "kez/ay" sütunudur, metin ise sıklık okuyucusundan geçer
    function aylikKez(siklik, aylikGun) {
        const t = String(siklik ?? "").trim();
        if (/^\d+(?:[.,]\d+)?$/.test(t)) return parseFloat(t.replace(",", "."));
        return siklikAylikCarpan(t, aylikGun);
    }

    // "1-2 yıl", "en az 3 yıl", "3 ay", "6 hafta" -> ay (aralıkta alt sınır)
    // isbasi: "2 yıllık eğitim ve 3-6 ay işbaşı" gibi metinlerde işbaşının yanındaki süre tercih edilir
    function sureAy(metin, isbasi = false) {
        const s = siklikNormal(metin);
        const kalip = /(\d+(?:[.,]\d+)?)\s*(?:-\s*\d+(?:[.,]\d+)?\s*)?(yil|ay|hafta|gun)/;
        const yakin = isbasi && s.match(/(\d+(?:[.,]\d+)?)\s*(?:-\s*\d+(?:[.,]\d+)?\s*)?(yil|ay|hafta|gun)[a-z]*\s+is ?basi/);
        const m = yakin || s.match(kalip);
        if (!m) return null;
        const n = parseFloat(m[1].replace(",", "."));
        return { yil: n * 12, ay: n, hafta: n / 4, gun: n / 30 }[m[2]];
    }

    const ayMetni = (ay) => (ay == null ? "-" : ay >= 12 ? `${(ay / 12).toFixed(ay % 12 ? 1 : 0).replace(".", ",")} yıl` : `${Math.round(ay * 10) / 10} ay`.replace(".", ","));

    // Serbest metinden birim adı: "Merkez İK – vardiya raporu" -> "Merkez İK"
    const birimAdi = (metin) => String(metin ?? "").split(/\s[–—-]\s|[,(:;/]/)[0].replace(/\s+/g, " ").trim();

    function birimSozlugu() {
        const goster = new Map();
        return {
            anahtar(ad) {
                const a = birimAdi(ad);
                if (!a || anlamsizMi(a)) return null;
                const k = grupAnahtari(a) || kucuk(a);
                if (!goster.has(k)) goster.set(k, a);
                return k;
            },
            ad: (k) => goster.get(k) || k
        };
    }

    // Kelime/tema sıklığı: kaç kişinin metninde geçtiği (kökün en sık yazımı gösterilir)
    const TEMA_DURAK = new Set(["icin", "olan", "olarak", "gibi", "veya", "daha", "ilgili", "gerekli", "olmasi", "yapilmasi",
        "edilmesi", "saglanmasi", "tum", "her", "bir", "yok", "var", "ile", "olmalı", "olmali", "konusunda", "sekilde", "uzerinde", "yapmak", "etmek", "kisi", "kisiler"]);
    function temaSikligi(kayitlar, adet = 12) {
        const sayac = new Map();
        kayitlar.forEach(({ k, metin }) => {
            const goruldu = new Set();
            (String(metin ?? "").toLocaleLowerCase("tr-TR").match(/[\p{L}]{4,}/gu) || []).forEach((kelime) => {
                const norm = siklikNormal(kelime);
                if (TEMA_DURAK.has(norm)) return;
                const kok = norm.slice(0, 6);
                if (goruldu.has(kok)) return;
                goruldu.add(kok);
                const m = sayac.get(kok) || { kisiler: new Set(), yazim: new Map() };
                m.kisiler.add(k.id);
                m.yazim.set(kelime, (m.yazim.get(kelime) || 0) + 1);
                sayac.set(kok, m);
            });
        });
        return [...sayac.values()].map((m) => ({
            kelime: [...m.yazim.entries()].sort((a, b) => b[1] - a[1])[0][0],
            kisi: m.kisiler.size
        })).filter((t) => t.kisi >= 2).sort((a, b) => b.kisi - a.kisi || karsilastir(a.kelime, b.kelime)).slice(0, adet);
    }

    const temaHtml = (temalar, toplam) => (temalar.length
        ? `<div class="admin-cipler">${temalar.map((t) => `<span class="admin-tema">${esc(t.kelime)} <strong>${t.kisi}</strong><span class="admin-not">/${toplam}</span></span>`).join("")}</div>`
        : `<p class="admin-not">En az iki kişide ortak geçen kelime yok.</p>`);

    // Metin anahtar kelime eşleştirme (Türkçe karakter ve büyük harf bağımsız)
    const metinNormal = (m) => ` ${siklikNormal(m).replace(/[^a-z0-9]+/g, " ")} `;
    const iceriyor = (norm, kokler) => kokler.filter((kok) => norm.includes(` ${kok}`));

    // ---- 1) bilgi akışı ----
    function akisSvg(akislar, ad) {
        if (!akislar.length) return "";
        const sol = [...new Set(akislar.map((a) => a.kaynak))];
        const sag = [...new Set(akislar.map((a) => a.hedef))];
        const satir = 28, ust = 28, W = 820, x1 = 250, x2 = W - 250;
        const H = Math.max(sol.length, sag.length) * satir + ust + 12;
        const y = (i, n) => ust + ((i + 0.5) * (H - ust - 12)) / n;
        const enBuyuk = Math.max(1, ...akislar.map((a) => a.deger));
        const kisalt = (m) => (m.length > 32 ? `${m.slice(0, 30)}…` : m);
        const cizgiler = akislar.map((a) => {
            const ya = y(sol.indexOf(a.kaynak), sol.length), yb = y(sag.indexOf(a.hedef), sag.length), orta = (x1 + x2) / 2;
            return `<path d="M${x1} ${ya} C${orta} ${ya} ${orta} ${yb} ${x2} ${yb}" fill="none" stroke="var(--primary)" stroke-opacity="0.4" stroke-width="${(1.5 + (a.deger / enBuyuk) * 10).toFixed(1)}" stroke-linecap="round"><title>${esc(`${ad(a.kaynak)} → ${ad(a.hedef)}: ${a.etiket}`)}</title></path>`;
        }).join("");
        const yazilar = sol.map((k, i) => `<text x="${x1 - 10}" y="${y(i, sol.length) + 4}" text-anchor="end">${esc(kisalt(ad(k)))}</text>`).join("")
            + sag.map((k, i) => `<text x="${x2 + 10}" y="${y(i, sag.length) + 4}">${esc(kisalt(ad(k)))}</text>`).join("");
        return `<div class="admin-svg-sar"><svg class="admin-akis" viewBox="0 0 ${W} ${H}" role="img" aria-label="Birimler arası belge akışı">
            <text x="${x1 - 10}" y="14" text-anchor="end" class="admin-svg-baslik">Gönderen</text><text x="${x2 + 10}" y="14" class="admin-svg-baslik">Alan</text>
            ${cizgiler}${yazilar}</svg></div>`;
    }

    function akisAnalizi(liste) {
        const birim = birimSozlugu();
        const akislar = new Map();
        const ekle = (kaynak, hedef, belge, k, sure, kez) => {
            const anahtar = `${kaynak}→${hedef}`;
            const a = akislar.get(anahtar) || { kaynak, hedef, belgeler: new Set(), kisiler: [], aylik: 0, hesapsiz: 0 };
            a.belgeler.add(belge);
            a.kisiler.push(k);
            const aylik = sure * kez;
            if (Number.isFinite(aylik)) a.aylik += aylik; else a.hesapsiz++;
            akislar.set(anahtar, a);
        };
        const belirsiz = birim.anahtar("(belirtilmemiş)");
        liste.forEach((k) => {
            const c = k.cevaplar, gun = aylikGunu(k);
            const kendi = birim.anahtar(grupDegeri(k, "departman")) || birim.anahtar("(departman yok)");
            (c.gelen_belgeler || []).forEach((r) => {
                const belge = String(r.belge ?? "").trim();
                if (!belge || anlamsizMi(belge)) return;
                ekle(birim.anahtar(r.bolum) || belirsiz, kendi, belge, k, sureDakika(r.sure), aylikKez(r.siklik, gun));
            });
            (c.giden_belgeler || []).forEach((r) => {
                const belge = String(r.belge ?? "").trim();
                if (!belge || anlamsizMi(belge)) return;
                ekle(kendi, birim.anahtar(r.yer_amac) || belirsiz, belge, k, sureDakika(r.sure), aylikKez(r.siklik, gun));
            });
        });
        const liste2 = [...akislar.values()].sort((a, b) => b.aylik - a.aylik || b.belgeler.size - a.belgeler.size);
        const yuk = new Map();
        liste2.forEach((a) => {
            [[a.kaynak, "cikis"], [a.hedef, "giris"]].forEach(([b, yon]) => {
                const y = yuk.get(b) || { giris: 0, cikis: 0, aylik: 0 };
                y[yon] += a.belgeler.size;
                y.aylik += a.aylik;
                yuk.set(b, y);
            });
        });
        const ciz = liste2.slice(0, 18).map((a) => ({ kaynak: a.kaynak, hedef: a.hedef, deger: a.aylik || a.belgeler.size, etiket: `${a.belgeler.size} belge, aylık ${dk(a.aylik)} dk` }));
        const basliklar = ["Gönderen", "Alan", "Belge", "Belgeler", "İşleyen kişiler", "Aylık süre (dk)"];
        const satirlar = liste2.map((a) => [birim.ad(a.kaynak), birim.ad(a.hedef), { t: String(a.belgeler.size), h: String(a.belgeler.size), s: "admin-sayi" },
            [...a.belgeler].join(" · "), kisilerHucre(tekilKisiler(a.kisiler)), sayiHucre(a.aylik)]);
        const yukSatir = [...yuk.entries()].sort((a, b) => b[1].aylik - a[1].aylik).map(([b, y]) =>
            [birim.ad(b), { t: String(y.giris), h: String(y.giris), s: "admin-sayi" }, { t: String(y.cikis), h: String(y.cikis), s: "admin-sayi" }, sayiHucre(y.aylik)]);
        return {
            html: `<p class="admin-not">${liste2.length} akış · gelen/giden belge cevaplarından; süre × aylık sıklık. Çizgi kalınlığı aylık süreyi gösterir (ilk 18 akış), üzerine gelince ayrıntı görünür.</p>
                ${akisSvg(ciz, birim.ad)}
                ${altBaslik("Birim yükü", "en çok belge alan/gönderen ve bu akışlara harcanan aylık süre")}
                ${tabloHtml(["Birim", "Gelen akış (belge)", "Giden akış (belge)", "Aylık süre (dk)"], yukSatir)}
                ${altBaslik("Tüm akışlar")}${tabloHtml(basliklar, satirlar, "Belge cevabı yok.")}`,
            csv: csvVerisi(basliklar, satirlar)
        };
    }

    // ---- 2) iş tekrarı ----
    function tekrarAnalizi(liste) {
        const satirlar = [];
        gorevGruplari(gorevSatirlari(liste), true).filter((g) => g.kisiler.length >= 2).forEach((g) => {
            satirlar.push({ tur: "Görev", konu: g.metin, yazim: g.yazim, kisiler: g.kisiler, aylik: g.aylik });
        });
        const belgeler = [];
        liste.forEach((k) => ["gelen_belgeler", "giden_belgeler"].forEach((alan) => (k.cevaplar[alan] || []).forEach((r) => {
            const ad = String(r.belge ?? "").trim();
            if (ad && !anlamsizMi(ad)) belgeler.push({ k, ad, kume: kelimeKumesi(ad), anahtar: kucuk(ad).replace(/\s+/g, " ") });
        })));
        const gruplar = [];
        belgeler.forEach((b) => {
            let g = gruplar.find((x) => x.anahtar === b.anahtar || benzerlik(x.kume, b.kume) >= 0.6);
            if (!g) { g = { anahtar: b.anahtar, kume: b.kume, ad: b.ad, uyeler: [] }; gruplar.push(g); }
            g.uyeler.push(b);
        });
        gruplar.forEach((g) => {
            const kisiler = tekilKisiler(g.uyeler.map((u) => u.k));
            if (kisiler.length >= 2) satirlar.push({ tur: "Belge", konu: g.ad, yazim: new Set(g.uyeler.map((u) => u.ad)).size, kisiler, aylik: null });
        });
        satirlar.sort((a, b) => b.kisiler.length - a.kisiler.length || (b.aylik || 0) - (a.aylik || 0));
        const basliklar = ["Tür", "Konu", "Kişi", "Yapanlar", "Birimler", "Aylık toplam (dk)"];
        const tablo = satirlar.map((s) => [etiketHucre(s.tur), { t: s.konu, h: `${esc(s.konu)}${s.yazim > 1 ? ` <span class="admin-not">(+${s.yazim - 1} benzer yazım)</span>` : ""}` },
            { t: String(s.kisiler.length), h: String(s.kisiler.length), s: "admin-sayi" }, kisilerHucre(s.kisiler),
            [...new Set(s.kisiler.map((k) => grupDegeri(k, "departman") || "-"))].join(", "), sayiHucre(s.aylik)]);
        return {
            html: `<p class="admin-not">Birden fazla kişinin yaptığı (benzer yazılmış) görevler ve işlediği belgeler. Farklı birimlerde aynı iş, mükerrer emek ya da net olmayan sorumluluk işareti olabilir.</p>
                ${tabloHtml(basliklar, tablo, "Birden fazla kişide ortak görev veya belge bulunamadı.")}`,
            csv: csvVerisi(basliklar, tablo)
        };
    }

    // ---- 3) onay zinciri ----
    const ASAMALAR = [["kontrol", "Kontrol"], ["paraf", "Paraf"], ["imza", "İmza"], ["makam", "Makam onay"]];

    function onayAnalizi(liste) {
        const onaylayan = new Map();
        const tanimsiz = [];
        const kayitsiz = [];
        liste.forEach((k) => {
            const satirlar = (k.cevaplar.kontrol_tablosu || []).filter((r) => String(r.is ?? "").trim() || String(r.amac ?? "").trim());
            if (!satirlar.length) kayitsiz.push(k);
            satirlar.forEach((r) => {
                let bulundu = false;
                ASAMALAR.forEach(([id, ad]) => {
                    const v = r[id];
                    const metin = Array.isArray(v) ? (v.includes("X") ? "X" : "") : String(v ?? "").trim();
                    if (!metin || anlamsizMi(metin)) return;
                    bulundu = true;
                    const kim = metin === "X" ? `(isim yazılmamış) ${ad}` : metin;
                    const anahtar = grupAnahtari(kim) || kucuk(kim);
                    const o = onaylayan.get(anahtar) || { ad: kim, isler: [], asama: {}, kisiler: [] };
                    o.isler.push(String(r.is ?? "").trim());
                    o.asama[ad] = (o.asama[ad] || 0) + 1;
                    o.kisiler.push(k);
                    onaylayan.set(anahtar, o);
                });
                if (!bulundu) tanimsiz.push({ k, is: String(r.is ?? "").trim(), amac: String(r.amac ?? "").trim() });
            });
        });
        const onayBaslik = ["Kontrol / onay veren", "İş sayısı", "Aşamalar", "İşleri gönderen kişiler", "İşler"];
        const onaySatir = [...onaylayan.values()].sort((a, b) => b.isler.length - a.isler.length).map((o) => [o.ad,
            { t: String(o.isler.length), h: String(o.isler.length), s: "admin-sayi" },
            Object.entries(o.asama).map(([a, n]) => `${a} ${n}`).join(", "), kisilerHucre(tekilKisiler(o.kisiler)), [...new Set(o.isler)].join(" · ")]);
        const kontrolSatir = liste.map((k) => {
            const gun = aylikGunu(k);
            let aylik = 0, hesapsiz = 0;
            const rows = (k.cevaplar.is_kontrolleri || []).filter((r) => String(r.tur ?? "").trim());
            rows.forEach((r) => {
                const v = sureDakika(r.sure) * aylikKez(r.siklik, gun);
                if (Number.isFinite(v)) aylik += v; else hesapsiz++;
            });
            return { k, adet: rows.length, aylik, hesapsiz };
        }).filter((x) => x.adet).sort((a, b) => b.aylik - a.aylik).map((x) => [kisiHucre(x.k), grupDegeri(x.k, "departman") || "-",
            { t: String(x.adet), h: String(x.adet), s: "admin-sayi" }, sayiHucre(x.aylik), { t: String(x.hesapsiz), h: x.hesapsiz ? String(x.hesapsiz) : "-", s: "admin-sayi" }]);
        return {
            html: `${altBaslik("Onay yükü", "3.6 kontrol tablosundan; kimde onay yığılıyor")}
                ${tabloHtml(onayBaslik, onaySatir, "Kontrol tablosu cevabı yok.")}
                ${altBaslik("Kontrol edeni belirtilmemiş işler", `${tanimsiz.length} iş`)}
                ${tabloHtml(["Kişi", "Yapılan iş", "Kontrol amacı"], tanimsiz.map((t) => [kisiHucre(t.k), t.is || "-", t.amac || "-"]), "Hepsinde kontrol eden belirtilmiş.")}
                ${kayitsiz.length ? `<p class="admin-not">Kontrol tablosu hiç doldurulmamış: ${kayitsiz.map((k) => kisiHucre(k).h).join(", ")}</p>` : ""}
                ${altBaslik("Kişinin yaptığı kontrollerin aylık süresi", "3.2 cevaplarından; süre × sıklık")}
                ${tabloHtml(["Kişi", "Departman", "Kontrol sayısı", "Aylık süre (dk)", "Hesaplanamayan"], kontrolSatir, "Kontrol cevabı yok.")}`,
            csv: csvVerisi(onayBaslik, onaySatir)
        };
    }

    // ---- 4) yedeklilik ----
    const YOK_DEGER = /^(yok|yoktur|hayir|hayır|bulunmuyor|bulunmamaktadir|-|\.+)\.?$/i;

    function yedekAnalizi(liste) {
        const satirlar = liste.map((k) => {
            const c = k.cevaplar;
            const yedekler = (Array.isArray(c.vekalet_eden) ? c.vekalet_eden : []).map((s) => String(s).trim()).filter((s) => s && !YOK_DEGER.test(s));
            const kayitli = liste.filter((d) => d.id !== k.id && yedekler.some((y) => {
                const ynorm = metinNormal(y);
                const parcalar = adAnahtari(d.ad).split(" ").filter((p) => p.length >= 3);
                return parcalar.filter((p) => ynorm.includes(` ${p} `)).length >= Math.min(2, parcalar.length);
            }));
            const gorevler = Array.isArray(c.gorevler) ? c.gorevler : [];
            const surekli = gorevler.filter((g) => g.sa === "S").length;
            const aylik = gorevYuzdeleri(gorevler, c.haftalik_gun).toplam;
            const bagli = (sayiyaCevir(c.dogrudan_sayi) || 0) + (sayiyaCevir(c.dolayli_sayi) || 0);
            const ayniUnvan = sayiyaCevir(c.ayni_unvan_sayisi);
            let risk = "Düşük", neden = [];
            if (!yedekler.length) {
                risk = "Orta";
                neden.push("vekâlet eden yok");
                if (surekli >= 5 || aylik >= 6000 || bagli > 0 || ayniUnvan === 0) {
                    risk = "Yüksek";
                    if (surekli >= 5) neden.push(`${surekli} sürekli görev`);
                    if (aylik >= 6000) neden.push(`aylık ${dk(aylik)} dk iş yükü`);
                    if (bagli > 0) neden.push(`${bagli} bağlı personel`);
                    if (ayniUnvan === 0) neden.push("aynı ünvanda başka kimse yok");
                }
            }
            return { k, yedekler, kayitli, surekli, aylik, bagli, ayniUnvan: c.ayni_unvan_sayisi, risk, neden };
        });
        const sira = { "Yüksek": 0, "Orta": 1, "Düşük": 2 };
        satirlar.sort((a, b) => sira[a.risk] - sira[b.risk] || b.aylik - a.aylik);
        const basliklar = ["Kişi", "Ünvan", "Risk", "Vekâlet eden", "Yedeği panelde", "Sürekli görev", "Aylık iş yükü (dk)", "Bağlı personel", "Aynı ünvanda", "Neden"];
        const tablo = satirlar.map((s) => [kisiHucre(s.k), alanDegeri(s.k, "unvan_pozisyon") || "-",
            etiketHucre(s.risk, s.risk === "Yüksek" ? "kirmizi" : s.risk === "Orta" ? "" : "yesil"),
            s.yedekler.join(" · ") || "-", s.kayitli.length ? kisilerHucre(s.kayitli) : "-",
            { t: String(s.surekli), h: String(s.surekli), s: "admin-sayi" }, sayiHucre(s.aylik), { t: String(s.bagli), h: s.bagli ? String(s.bagli) : "-", s: "admin-sayi" },
            String(s.ayniUnvan ?? "").trim() || "-", s.neden.join(", ") || "-"]);
        const yuksek = satirlar.filter((s) => s.risk === "Yüksek").length;
        return {
            html: `<p class="admin-not">${yuksek} kişi yüksek riskte. Vekâlet edeni olmayan ve çok sayıda sürekli görevi, yüksek iş yükü, bağlı personeli ya da aynı ünvanda eşi olmayan pozisyonlar "bu kişi yokken iş durur" riskini taşır.</p>
                ${tabloHtml(basliklar, tablo)}`,
            csv: csvVerisi(basliklar, tablo)
        };
    }

    // ---- 5) hata ve kontrol boşluğu ----
    const FARK_EDEN = [["kendisi", "Kendisi"], ["esit", "Eşit düzey"], ["ust", "Üst düzey"], ["birim", "Diğer birim"], ["disi", "Kurum dışı"]];
    const isaretli = (v) => (Array.isArray(v) ? v.includes("X") : String(v ?? "").trim() === "X");

    function hataAnalizi(liste) {
        const hatalar = [];
        const dagilim = Object.fromEntries(FARK_EDEN.map(([id]) => [id, 0]));
        liste.forEach((k) => (k.cevaplar.olasi_hatalar || []).forEach((r) => {
            const hata = String(r.hata ?? "").trim();
            if (!hata || anlamsizMi(hata)) return;
            const eden = FARK_EDEN.filter(([id]) => isaretli(r[id]));
            eden.forEach(([id]) => dagilim[id]++);
            const bulgu = [];
            if (!eden.length) bulgu.push(["Fark eden belirtilmemiş", ""]);
            else if (eden.length === 1 && eden[0][0] === "kendisi") bulgu.push(["Yalnızca kendisi fark eder", "kirmizi"]);
            if (isaretli(r.disi)) bulgu.push(["Kurum dışına yansıyor", "kirmizi"]);
            if (isaretli(r.ghayir)) bulgu.push(["Giderilemez", "kirmizi"]);
            hatalar.push({ k, hata, eden: eden.map(([, ad]) => ad), sorun: String(r.sorun ?? "").trim(), bulgu });
        }));
        hatalar.sort((a, b) => b.bulgu.length - a.bulgu.length);
        const toplam = hatalar.length;
        const enBuyuk = Math.max(1, ...Object.values(dagilim));
        const dagilimHtml = `<div class="admin-dagilim">${FARK_EDEN.map(([id, ad]) => `<div class="admin-dagilim-satir admin-dagilim-sabit" title="${esc(ad)}: ${dagilim[id]} hata">
            <span class="admin-dagilim-etiket">${esc(ad)}</span><span class="admin-dagilim-iz"><span class="admin-dagilim-bar" style="width:${(dagilim[id] / enBuyuk) * 100}%"></span></span>
            <span class="admin-dagilim-sayi">${dagilim[id]} · %${toplam ? Math.round((dagilim[id] / toplam) * 100) : 0}</span></div>`).join("")}</div>`;
        const etki = new Map();
        const birim = birimSozlugu();
        liste.forEach((k) => (k.cevaplar.etkilenenler || []).forEach((r) => {
            const b = birim.anahtar(r.bolum);
            if (!b || !String(r.is ?? "").trim()) return;
            const e = etki.get(b) || { adet: 0, kisiler: [], ornek: [] };
            e.adet++;
            e.kisiler.push(k);
            if (e.ornek.length < 3) e.ornek.push(`${String(r.is).trim()}${r.nasil ? ` (${String(r.nasil).trim()})` : ""}`);
            etki.set(b, e);
        }));
        const basliklar = ["Kişi", "Olası hata", "Fark eden", "Yol açtığı sorun", "Bulgu"];
        const tablo = hatalar.map((h) => [kisiHucre(h.k), h.hata, h.eden.join(", ") || "-", h.sorun || "-",
            { t: h.bulgu.map((b) => b[0]).join(", "), h: h.bulgu.map(([m, t]) => etiketHucre(m, t).h).join(" ") || "-" }]);
        return {
            html: `${altBaslik("Hatayı kim fark ediyor", `${toplam} olası hata`)}${dagilimHtml}
                ${altBaslik("Kontrol boşlukları", "yalnızca kişinin kendisinin fark edebildiği, kurum dışına yansıyan ya da giderilemeyen hatalar önce")}
                ${tabloHtml(basliklar, tablo, "Olası hata cevabı yok.")}
                ${altBaslik("Yanlış işten etkilenen birimler", "8.4 cevaplarından")}
                ${tabloHtml(["Etkilenen birim / kişi", "Kaç iş", "Bildiren", "Örnekler"], [...etki.entries()].sort((a, b) => b[1].adet - a[1].adet).map(([b, e]) =>
                    [birim.ad(b), { t: String(e.adet), h: String(e.adet), s: "admin-sayi" }, kisilerHucre(tekilKisiler(e.kisiler)), e.ornek.join(" · ")]), "Etkilenen cevabı yok.")}`,
            csv: csvVerisi(basliklar, tablo)
        };
    }

    // ---- 6) yetki uyumu ----
    function yetkiAnalizi(liste) {
        const yetkiSoru = SORULAR.find((s) => s.id === "yetkiler");
        const secenekler = (yetkiSoru?.secenekler || []).filter((s) => s.deger !== "y_diger");
        const kisiler = siraliKisiler(liste);
        const matrisSatir = kisiler.map((k) => [kisiHucre(k), alanDegeri(k, "unvan_pozisyon") || "-",
            ...secenekler.map((s) => {
                const var_ = (k.cevaplar.yetkiler || []).includes(s.deger);
                return { t: var_ ? "X" : "", h: var_ ? "X" : "", s: `admin-sayi${var_ ? " admin-dolu" : ""}` };
            }),
            { t: String((k.cevaplar.yetkiler || []).length), h: String((k.cevaplar.yetkiler || []).length), s: "admin-sayi" }]);
        const toplamSatir = [{ t: "Toplam", h: "<strong>Toplam</strong>" }, "",
            ...secenekler.map((s) => { const n = kisiler.filter((k) => (k.cevaplar.yetkiler || []).includes(s.deger)).length; return { t: String(n), h: `<strong>${n}</strong>`, s: "admin-sayi" }; }), ""];
        const eksik = kisiler.filter((k) => !bosMu(k.cevaplar.gereken_yetkiler) && !YOK_DEGER.test(String(k.cevaplar.gereken_yetkiler).trim()) && !anlamsizMi(k.cevaplar.gereken_yetkiler));
        const eksikBaslik = ["Kişi", "Ünvan", "Olması gereken yetkiler (2.3)", "Yapılamayan işler (5.2)", "Mevcut yetkiler (2.2)"];
        const eksikSatir = eksik.map((k) => [kisiHucre(k), alanDegeri(k, "unvan_pozisyon") || "-", String(k.cevaplar.gereken_yetkiler).trim(),
            String(k.cevaplar.yapilamayan_isler ?? "").trim() || "-", String(k.cevaplar.mevcut_yetkiler ?? "").trim() || "-"]);
        const temalar = temaSikligi(eksik.map((k) => ({ k, metin: `${k.cevaplar.gereken_yetkiler} ${k.cevaplar.yapilamayan_isler || ""}` })));
        return {
            html: `${altBaslik("Yetki eksikliği belirtenler", `${eksik.length} / ${liste.length} kişi`)}
                ${temaHtml(temalar, eksik.length)}
                ${tabloHtml(eksikBaslik, eksikSatir, "Kimse ek yetki ihtiyacı belirtmemiş.")}
                ${altBaslik("Yetki matrisi", "3.7'de işaretlenen yetkiler")}
                ${tabloHtml(["Kişi", "Ünvan", ...secenekler.map((s) => s.etiket), "Toplam"], [...matrisSatir, toplamSatir])}`,
            csv: csvVerisi(eksikBaslik, eksikSatir)
        };
    }

    // ---- 7, 8) görev sınıflandırma ----
    // Kökler Türkçe karaktersiz ve küçük harf; kelimenin başıyla eşleşir.
    const KATEGORILER = [
        { id: "plan", ad: "Planlama / yönlendirme", kokler: ["plan", "program", "organiz", "yonlendir", "gorevlendir", "oncelik", "dagit"] },
        { id: "kontrol", ad: "Kontrol / denetim", kokler: ["kontrol", "denet", "takip", "dogrula", "incele", "onay", "uygunlu", "teyit"] },
        { id: "rapor", ad: "Raporlama / analiz", kokler: ["rapor", "analiz", "hesapla", "olcum", "verim", "turnover", "istatist"] },
        { id: "iletisim", ad: "İletişim / koordinasyon", kokler: ["mail", "ilet", "bildir", "gorus", "toplanti", "brief", "koordin", "gonder", "telefon", "cevapla", "bilgilendir"] },
        { id: "veri", ad: "Veri / evrak işlemi", kokler: ["isle", "giris", "kayit", "excel", "pdks", "puantaj", "evrak", "belge", "form", "tara", "arsiv", "dosya", "imzalat", "tahakkuk", "hakedis", "fatura", "guncelle", "tablo"] },
        { id: "operasyon", ad: "Üretim / saha operasyonu", kokler: ["uretim", "saha", "temiz", "paket", "kesim", "sevkiyat", "yukle", "depo", "hat", "makine", "barkod", "numune", "dondur", "glaze", "etiket"] },
        { id: "personel", ad: "Personel / eğitim", kokler: ["egitim", "oryantasyon", "personel", "izin", "mulakat", "disiplin", "savunma", "ise al"] }
    ];
    const DIGER_KATEGORI = { id: "diger", ad: "Diğer" };
    const OTOMASYON_KOKLERI = ["isle", "giris", "kayit", "excel", "pdks", "puantaj", "tara", "arsiv", "dosyala", "mail", "ilet", "gonder", "form", "tablo", "liste", "guncelle", "imzalat", "cikti", "aktar", "sisteme", "olustur", "hesapla"];

    function gorevKategorileri(metin) {
        const n = metinNormal(metin);
        const bulunan = KATEGORILER.filter((kat) => iceriyor(n, kat.kokler).length);
        return bulunan.length ? bulunan : [DIGER_KATEGORI];
    }

    function otomasyonAnalizi(liste) {
        const satirlar = gorevSatirlari(liste).map((s) => ({ ...s, ipucu: iceriyor(metinNormal(s.metin), OTOMASYON_KOKLERI) }))
            .filter((s) => s.ipucu.length >= 2).sort((a, b) => (b.aylik ?? 0) - (a.aylik ?? 0));
        const toplamIs = liste.reduce((t, k) => t + gorevYuzdeleri(k.cevaplar.gorevler || [], k.cevaplar.haftalik_gun).toplam, 0);
        const adayToplam = satirlar.reduce((t, s) => t + (s.aylik || 0), 0);
        const birim = new Map();
        satirlar.forEach((s) => {
            const b = grupDegeri(s.kisi, "departman") || "(departman yok)";
            const x = birim.get(b) || { aylik: 0, adet: 0, kisiler: [] };
            x.aylik += s.aylik || 0;
            x.adet++;
            x.kisiler.push(s.kisi);
            birim.set(b, x);
        });
        const birimToplam = (b) => liste.filter((k) => (grupDegeri(k, "departman") || "(departman yok)") === b)
            .reduce((t, k) => t + gorevYuzdeleri(k.cevaplar.gorevler || [], k.cevaplar.haftalik_gun).toplam, 0);
        const basliklar = ["Görev", "Kişi", "Departman", "Aylık süre (dk)", "Aylık saat", "İpuçları"];
        const tablo = satirlar.map((s) => [s.metin, kisiHucre(s.kisi), grupDegeri(s.kisi, "departman") || "-", sayiHucre(s.aylik),
            { t: s.aylik == null ? "" : (s.aylik / 60).toFixed(1), h: s.aylik == null ? "-" : (s.aylik / 60).toFixed(1).replace(".", ","), s: "admin-sayi" }, s.ipucu.join(", ")]);
        return {
            html: `<div class="admin-vurgu-kutu"><strong>Ayda yaklaşık ${dk(adayToplam / 60)} saat</strong> tekrarlayan veri, evrak ve iletim işi var
                (toplam iş yükünün %${toplamIs ? Math.round((adayToplam / toplamIs) * 100) : 0}'i). Bu görevler sisteme entegrasyon, ortak dosya ya da form otomasyonu için adaydır.</div>
                <p class="admin-not">Görev metninde en az iki ipucu (işleme, Excel, PDKS, tarama, mail ile iletme, form, tablo…) geçen görevler. Sınıflandırma kelimeye dayalıdır, gözden geçirin.</p>
                ${altBaslik("Departmana göre")}
                ${tabloHtml(["Departman", "Aday görev", "Aylık saat", "Departman iş yükündeki payı", "Kişiler"], [...birim.entries()].sort((a, b) => b[1].aylik - a[1].aylik).map(([b, x]) => {
                    const t = birimToplam(b);
                    return [b, { t: String(x.adet), h: String(x.adet), s: "admin-sayi" }, { t: (x.aylik / 60).toFixed(1), h: (x.aylik / 60).toFixed(1).replace(".", ","), s: "admin-sayi" },
                        { t: t ? String(Math.round((x.aylik / t) * 100)) : "", h: t ? `%${Math.round((x.aylik / t) * 100)}` : "-", s: "admin-sayi" }, kisilerHucre(tekilKisiler(x.kisiler))];
                }), "Aday görev bulunamadı.")}
                ${altBaslik("Aday görevler")}${tabloHtml(basliklar, tablo, "Aday görev bulunamadı.")}`,
            csv: csvVerisi(basliklar, tablo)
        };
    }

    // Isı tablosu hücresi: tek renk tonu, değer metni her zaman yazılı
    const isiHucre = (oran) => ({
        t: oran == null ? "" : String(Math.round(oran)),
        h: oran ? `%${Math.round(oran)}` : "-",
        s: "admin-sayi",
        st: oran ? `background: rgba(37, 99, 235, ${(0.06 + (oran / 100) * 0.5).toFixed(2)})` : ""
    });

    function profilAnalizi(liste) {
        const kategoriler = [...KATEGORILER, DIGER_KATEGORI];
        const profil = (kisiler) => {
            const dkler = Object.fromEntries(kategoriler.map((k) => [k.id, 0]));
            let toplam = 0;
            gorevSatirlari(kisiler).forEach((s) => {
                if (s.aylik == null) return;
                const kat = gorevKategorileri(s.metin);
                kat.forEach((k) => { dkler[k.id] += s.aylik / kat.length; });
                toplam += s.aylik;
            });
            return { dkler, toplam };
        };
        const satir = (ad, p, ilkHucre) => [ilkHucre || ad, sayiHucre(p.toplam / 60),
            ...kategoriler.map((k) => isiHucre(p.toplam ? (p.dkler[k.id] / p.toplam) * 100 : null))];
        const basliklar = ["Kişi", "Aylık saat", ...kategoriler.map((k) => k.ad)];
        const kisiSatir = siraliKisiler(liste).map((k) => satir(k.ad, profil([k]), kisiHucre(k)));
        const gruplar = new Map();
        liste.forEach((k) => { const g = grupDegeri(k, "departman") || "(departman yok)"; if (!gruplar.has(g)) gruplar.set(g, []); gruplar.get(g).push(k); });
        const grupSatir = [...gruplar.entries()].sort((a, b) => b[1].length - a[1].length).map(([g, ks]) => satir(`${g} (${ks.length})`, profil(ks)));
        return {
            html: `<p class="admin-not">Görevlerin aylık süresi, metnindeki anahtar kelimelere göre kategorilere dağıtılır (birden çok kategoriye uyan görev eşit bölünür). Koyu hücre, zamanın büyük kısmının o işe gittiğini gösterir.</p>
                ${altBaslik("Departman profili")}${tabloHtml(["Departman", "Aylık saat", ...kategoriler.map((k) => k.ad)], grupSatir)}
                ${altBaslik("Kişi profili")}${tabloHtml(basliklar, kisiSatir)}`,
            csv: csvVerisi(basliklar, kisiSatir)
        };
    }

    // ---- 9) sistem matrisi ----
    const SISTEM_ESANLAM = [
        [/^(e ?posta|e-posta|mail|mail programi|outlook|ms outlook|eposta)$/, "E-posta / Outlook"],
        [/^(excel|ms excel|microsoft excel)$/, "Excel"],
        [/^(word|ms word)$/, "Word"],
        [/^(ms office|office programlari|office|microsoft office)/, "MS Office"],
        [/^(whatsapp|whatsaap|whatsap|watsap)/, "WhatsApp"],
        [/^pdks/, "PDKS"],
        [/^fts/, "FTS"]
    ];
    function sistemAdi(ham) {
        const n = siklikNormal(ham).replace(/[^a-z0-9 -]+/g, " ").replace(/\s+/g, " ").trim();
        if (!n || YOK_DEGER.test(n)) return null;
        const es = SISTEM_ESANLAM.find(([re]) => re.test(n));
        return es ? es[1] : ham.replace(/\s+/g, " ").trim();
    }
    const SISTEM_IZI = [["excel", "Excel"], ["pdks", "PDKS"], ["fts", "FTS"], ["mail", "E-posta / Outlook"], ["outlook", "E-posta / Outlook"], ["netsis", "Netsis"], ["kimlik bildirim", "Kimlik Bildirim Sistemi"], ["whatsapp", "WhatsApp"], ["erp", "ERP"], ["sap", "SAP"]];

    function sistemAnalizi(liste) {
        const kullanim = new Map();
        liste.forEach((k) => {
            const kaynak = [...(k.cevaplar.sistemler || []), ...(k.cevaplar.gorevler || []).flatMap((g) => (g.d_sistem || []).map((d) => d.tanim))];
            kaynak.flatMap(listeMaddeleri).map(sistemAdi).filter(Boolean).forEach((s) => {
                const anahtar = kucuk(s);
                const x = kullanim.get(anahtar) || { ad: s, kisiler: new Set() };
                x.kisiler.add(k.id);
                kullanim.set(anahtar, x);
            });
        });
        const sistemler = [...kullanim.values()].sort((a, b) => b.kisiler.size - a.kisiler.size || karsilastir(a.ad, b.ad));
        const kisiler = siraliKisiler(liste);
        const matrisBaslik = ["Kişi", "Departman", ...sistemler.map((s) => s.ad)];
        const matris = kisiler.map((k) => [kisiHucre(k), grupDegeri(k, "departman") || "-",
            ...sistemler.map((s) => (s.kisiler.has(k.id) ? { t: "X", h: "X", s: "admin-sayi admin-dolu" } : { t: "", h: "", s: "admin-sayi" }))]);
        const toplam = [{ t: "Kişi sayısı", h: "<strong>Kişi sayısı</strong>" }, "", ...sistemler.map((s) => ({ t: String(s.kisiler.size), h: `<strong>${s.kisiler.size}</strong>`, s: "admin-sayi" }))];
        const gorevler = gorevSatirlari(liste);
        const excel = new Map();
        const aktarim = [];
        gorevler.forEach((s) => {
            const n = metinNormal(s.metin);
            const izler = [...new Set(SISTEM_IZI.filter(([iz]) => n.includes(` ${iz}`)).map(([, ad]) => ad))];
            if (izler.includes("Excel")) {
                const x = excel.get(s.kisi.id) || { k: s.kisi, aylik: 0, adet: 0 };
                x.aylik += s.aylik || 0;
                x.adet++;
                excel.set(s.kisi.id, x);
            }
            if (izler.length >= 2 || (izler.length && iceriyor(n, ["aktar", "isle", "girilme", "giris"]).length)) aktarim.push({ s, izler });
        });
        return {
            html: `${altBaslik("Kim hangi sistemi kullanıyor", "2.6 cevapları ve görev detayları; aynı sistemin farklı yazımları birleştirilir")}
                ${tabloHtml(matrisBaslik, [...matris, toplam], "Sistem cevabı yok.")}
                ${altBaslik("Excel bağımlılığı", "görev metninde Excel geçen işler")}
                ${tabloHtml(["Kişi", "Görev", "Aylık süre (dk)"], [...excel.values()].sort((a, b) => b.aylik - a.aylik).map((x) =>
                    [kisiHucre(x.k), { t: String(x.adet), h: String(x.adet), s: "admin-sayi" }, sayiHucre(x.aylik)]), "Görevlerde Excel geçmiyor.")}
                ${altBaslik("Elle aktarım adayları", "bir sistemden diğerine ya da sisteme elle veri işlenen görevler")}
                ${tabloHtml(["Görev", "Kişi", "Sistemler", "Aylık süre (dk)"], aktarim.sort((a, b) => (b.s.aylik ?? 0) - (a.s.aylik ?? 0)).map(({ s, izler }) =>
                    [s.metin, kisiHucre(s.kisi), izler.join(", "), sayiHucre(s.aylik)]), "Aday bulunamadı.")}`,
            csv: csvVerisi(matrisBaslik, [...matris, toplam])
        };
    }

    // ---- 13) görev tanımı taslağı ----
    function tanimSecenekleri(liste) {
        const unvanlar = new Map();
        liste.forEach((k) => { const u = grupDegeri(k, "unvan_pozisyon") || "(ünvan yok)"; if (!unvanlar.has(u)) unvanlar.set(u, []); unvanlar.get(u).push(k); });
        return [
            ...[...unvanlar.entries()].sort((a, b) => karsilastir(a[0], b[0])).map(([u, ks]) => ({ id: `u:${u}`, ad: `Ünvan: ${u} (${ks.length} kişi)`, kisiler: ks, baslik: u })),
            ...siraliKisiler(liste).map((k) => ({ id: `k:${k.id}`, ad: `Kişi: ${k.ad}`, kisiler: [k], baslik: alanDegeri(k, "unvan_pozisyon") || k.ad }))
        ];
    }

    function enSik(degerler) {
        const sayac = new Map();
        degerler.map((d) => String(d ?? "").trim()).filter((d) => d && !anlamsizMi(d)).forEach((d) => sayac.set(d, (sayac.get(d) || 0) + 1));
        return [...sayac.entries()].sort((a, b) => b[1] - a[1]).map(([d]) => d);
    }

    function gorevTanimiHtml(secim) {
        const ks = secim.kisiler;
        const tek = ks.length === 1;
        const metinler = (alan) => enSik(ks.map((k) => k.cevaplar[alan]));
        const liste_ = (dizi) => (dizi.length ? `<ul>${dizi.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : `<p class="admin-not">-</p>`);
        const paragraf = (dizi) => (dizi.length ? dizi.map((d) => `<p>${esc(d)}</p>`).join("") : `<p class="admin-not">-</p>`);
        const gruplar = gorevGruplari(gorevSatirlari(ks), true).sort((a, b) => (b.ortYuzde ?? -1) - (a.ortYuzde ?? -1));
        const gorevSatir = gruplar.slice(0, 20).map((g) => `<tr><td>${esc(g.metin)}</td><td class="admin-sayi">${g.ortYuzde == null ? "-" : yuzdeMetni(g.ortYuzde)}</td>
            <td>${g.surekli >= g.araSira ? "Sürekli" : "Ara sıra"}</td>${tek ? "" : `<td class="admin-sayi">${g.kisiler.length}/${ks.length}</td>`}</tr>`).join("");
        const yetkiSoru = SORULAR.find((s) => s.id === "yetkiler");
        const yetkiler = (yetkiSoru?.secenekler || []).map((s) => ({ s, n: ks.filter((k) => (k.cevaplar.yetkiler || []).includes(s.deger)).length })).filter((x) => x.n);
        const kontaklar = (alan) => enSik(ks.flatMap((k) => (k.cevaplar[alan] || []).map((r) => [r.kisi, r.konu].map((x) => String(x ?? "").trim()).filter((x) => x && !anlamsizMi(x)).join(" – "))));
        const sertifikalar = enSik(ks.flatMap((k) => (k.cevaplar.lisans_sertifikalar || []).flatMap(listeMaddeleri))).filter((s) => !YOK_DEGER.test(s));
        const sistemler = enSik(ks.flatMap((k) => (k.cevaplar.sistemler || []).flatMap(listeMaddeleri).map(sistemAdi)));
        const araclar = enSik(ks.flatMap((k) => (k.cevaplar.araclar || []).flatMap(listeMaddeleri)));
        const ort = (alan) => { const d = ks.map((k) => sayiyaCevir(k.cevaplar[alan])).filter((n) => !Number.isNaN(n)); return d.length ? Math.round(d.reduce((a, b) => a + b, 0) / d.length) : null; };
        const riskler = [["İş kazası", ks.map((k) => k.cevaplar.risk_kaza_siddet)], ["Meslek hastalığı", ks.filter((k) => isaretli(k.cevaplar.risk_meslek_var)).map((k) => k.cevaplar.risk_meslek_siddet)],
            ["Trafik kazası", ks.filter((k) => isaretli(k.cevaplar.risk_trafik_var)).map((k) => k.cevaplar.risk_trafik_siddet)]]
            .map(([ad, d]) => [ad, enSik(d.filter((x) => RISK_SEVIYE.includes(x)))[0]]).filter(([, s]) => s);
        const bagli = enSik(ks.flatMap((k) => (k.cevaplar.personel_unvanlar || []).map((r) => [r.unvan, r.sayi].map((x) => String(x ?? "").trim()).filter(Boolean).join(": "))));
        return `<article class="admin-tanim" id="tanimBelge">
            <h2>Görev Tanımı: ${esc(secim.baslik)}</h2>
            <p class="admin-not">${tek ? `${esc(ks[0].ad)} ile yapılan görüşmeden` : `${ks.length} kişinin görüşmesinden birleştirildi (${esc(ks.map((k) => k.ad).join(", "))})`} · taslaktır, gözden geçirilmelidir</p>
            <table class="admin-tanim-kunye"><tbody>
                <tr><th>Departman / Bölüm</th><td>${esc([...new Set([enSik(ks.map((k) => grupDegeri(k, "departman")))[0], enSik(ks.map((k) => grupDegeri(k, "bolum")))[0]].filter(Boolean))].join(" / ") || "-")}</td></tr>
                <tr><th>Bağlı olduğu pozisyon</th><td>${esc(metinler("ust_amir_pozisyonu")[0] || "-")}</td></tr>
                <tr><th>Ayrıca raporladığı</th><td>${esc(enSik(ks.flatMap((k) => (k.cevaplar.diger_iletisim || []).map((r) => r.pozisyon))).join(", ") || "-")}</td></tr>
                <tr><th>Yönettiği personel</th><td>${esc(bagli.join(", ") || "-")}</td></tr>
            </tbody></table>
            <h3>1. Görevin amacı</h3>${paragraf(metinler("rol_amaci"))}
            <h3>2. Temel görev ve sorumluluklar</h3>
            ${gruplar.length ? `<table class="admin-tanim-tablo"><thead><tr><th>Görev</th><th>Zaman payı</th><th>Süreklilik</th>${tek ? "" : "<th>Yapan</th>"}</tr></thead><tbody>${gorevSatir}</tbody></table>
                ${gruplar.length > 20 ? `<p class="admin-not">+${gruplar.length - 20} görev daha (düşük paylı)</p>` : ""}` : `<p class="admin-not">-</p>`}
            <h3>3. Yetkiler</h3>
            ${yetkiler.length ? `<ul>${yetkiler.map(({ s, n }) => `<li>${esc(s.etiket)}${tek ? "" : ` <span class="admin-not">(${n}/${ks.length})</span>`}</li>`).join("")}</ul>` : ""}
            ${paragraf(metinler("mevcut_yetkiler"))}
            <h3>4. Aranan nitelikler</h3>
            <p><strong>Eğitim:</strong> ${esc(metinler("egitim").join(" · ") || "-")}</p>
            <p><strong>Lisans / sertifika:</strong> ${esc(sertifikalar.join(", ") || "-")}</p>
            <p><strong>Bilgi, beceri, yetkinlik:</strong> ${esc(metinler("diger_bilgi_beceri").join(" · ") || "-")}</p>
            <p><strong>Deneyim:</strong> ${esc(metinler("yeni_deneyim").join(" · ") || "-")}</p>
            <p><strong>İş başı eğitimi:</strong> ${esc(metinler("yetkinlik_suresi").join(" · ") || "-")}</p>
            <h3>5. Kullanılan sistem ve araçlar</h3>
            <p>${esc([...sistemler, ...araclar].join(", ") || "-")}</p>
            <h3>6. İletişim</h3>
            <p><strong>Kurum içi:</strong></p>${liste_(kontaklar("ic_kontaklar").slice(0, 10))}
            <p><strong>Kurum dışı:</strong></p>${liste_(kontaklar("dis_kontaklar").slice(0, 10))}
            <h3>7. Çalışma koşulları</h3>
            <p><strong>Çalışma yeri:</strong> masa başı %${ort("yuzde_masa") ?? "-"}, bölümler arası %${ort("yuzde_bolumler") ?? "-"}, ofis dışı %${ort("yuzde_mobil") ?? "-"}</p>
            <p><strong>Çaba:</strong> zihinsel %${ort("caba_zihinsel_yuzde") ?? "-"}, fiziksel %${ort("caba_fiziksel_yuzde") ?? "-"}</p>
            <p><strong>Riskler:</strong> ${esc(riskler.map(([a, s]) => `${a} (${s})`).join(", ") || "-")}</p>
        </article>`;
    }

    function tanimAnalizi(liste) {
        const secenekler = tanimSecenekleri(liste);
        const secim = secenekler.find((s) => s.id === durum.tanimSecim) || secenekler[0];
        durum.tanimSecim = secim.id;
        return {
            html: `<div class="admin-tanim-arac">
                    <select class="input" data-tanim-sec aria-label="Görev tanımı için kişi ya da ünvan seçin">${secenekler.map((s) => `<option value="${esc(s.id)}" ${s.id === secim.id ? "selected" : ""}>${esc(s.ad)}</option>`).join("")}</select>
                    <button type="button" class="button secondary small" data-tanim-word>Word indir</button>
                    <button type="button" class="button ghost small" data-tanim-yazdir>Yazdır / PDF</button>
                </div>
                ${gorevTanimiHtml(secim)}`,
            csv: null
        };
    }

    function tanimDosyaAdi() {
        const ad = kucuk(document.querySelector("#tanimBelge h2")?.textContent.replace("Görev Tanımı:", "") || "gorev-tanimi");
        return `gorev-tanimi-${siklikNormal(ad).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "taslak"}`;
    }

    function tanimWordIndir() {
        const belge = document.getElementById("tanimBelge");
        if (!belge) return;
        const stil = "body{font-family:Calibri,Arial,sans-serif;font-size:11pt}h2{font-size:16pt}h3{font-size:12pt;margin-top:14pt;color:#1d4ed8}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:4pt;vertical-align:top;text-align:left}.admin-not{color:#666;font-size:9pt}";
        const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>Görev Tanımı</title><style>${stil}</style></head><body>${belge.innerHTML}</body></html>`;
        saveAs(new Blob(["﻿", html], { type: "application/msword" }), `${tanimDosyaAdi()}.doc`);
    }

    function tanimYazdir() {
        const belge = document.getElementById("tanimBelge");
        if (!belge) return;
        const pencere = window.open("", "_blank");
        if (!pencere) { alert("Yazdırma penceresi açılamadı (açılır pencere engeli)."); return; }
        pencere.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(tanimDosyaAdi())}</title>
            <style>body{font-family:Arial,sans-serif;font-size:11pt;margin:24px}h3{color:#1d4ed8}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:4px 6px;vertical-align:top;text-align:left}.admin-not{color:#666;font-size:9pt}</style>
            </head><body>${belge.innerHTML}</body></html>`);
        pencere.document.close();
        pencere.focus();
        pencere.print();
    }

    // ---- 14) yetkinlik ve eğitim ihtiyacı ----
    function yetkinlikAnalizi(liste) {
        const satirlar = siraliKisiler(liste).map((k) => {
            const c = k.cevaplar;
            const yil = sayiyaCevir(c.calisma_yil), ay = sayiyaCevir(c.calisma_ay);
            const mevcut = (Number.isNaN(yil) ? 0 : yil * 12) + (Number.isNaN(ay) ? 0 : ay);
            const bilinmiyor = Number.isNaN(yil) && Number.isNaN(ay);
            const gerekli = sureAy(c.yeni_deneyim);
            const isbasi = sureAy(c.yetkinlik_suresi, true);
            const bulgu = [];
            if (!bilinmiyor && isbasi != null && mevcut < isbasi) bulgu.push(["İş başı eğitim süresi içinde", "kirmizi"]);
            else if (!bilinmiyor && gerekli != null && mevcut < gerekli) bulgu.push(["Pozisyonda, istenen deneyim süresinin altında", ""]);
            if (bosMu(c.egitim) || anlamsizMi(c.egitim)) bulgu.push(["Eğitim şartı yazılmamış", ""]);
            return { k, mevcut: bilinmiyor ? null : mevcut, gerekli, isbasi, bulgu };
        });
        const basliklar = ["Kişi", "Ünvan", "Pozisyondaki süre", "İstenen deneyim", "İş başı eğitimi", "Bulgu"];
        const tablo = satirlar.map((s) => [kisiHucre(s.k), alanDegeri(s.k, "unvan_pozisyon") || "-", ayMetni(s.mevcut), ayMetni(s.gerekli), ayMetni(s.isbasi),
            { t: s.bulgu.map((b) => b[0]).join(", "), h: s.bulgu.map(([m, t]) => etiketHucre(m, t).h).join(" ") || "-" }]);
        const say = (dizi) => {
            const m = new Map();
            dizi.forEach(({ k, d }) => { const anahtar = kucuk(d); const x = m.get(anahtar) || { d, kisiler: new Set() }; x.kisiler.add(k.id); m.set(anahtar, x); });
            return [...m.values()].sort((a, b) => b.kisiler.size - a.kisiler.size);
        };
        const sertifikalar = say(liste.flatMap((k) => (k.cevaplar.lisans_sertifikalar || []).flatMap(listeMaddeleri).filter((d) => !YOK_DEGER.test(d) && !anlamsizMi(d)).map((d) => ({ k, d }))));
        const beceriler = say(liste.flatMap((k) => listeMaddeleri(String(k.cevaplar.diger_bilgi_beceri ?? "").replace(/\n/g, ",")).filter((d) => d.length > 2 && !anlamsizMi(d)).map((d) => ({ k, d }))));
        const egitimDuzeyi = (m) => {
            const n = siklikNormal(m);
            if (/yuksek lisans|master/.test(n)) return "Yüksek lisans";
            if (/on ?lisans|meslek yuksek/.test(n)) return "Ön lisans";
            if (/lisans|universite|muhendis/.test(n)) return "Lisans";
            if (/lise/.test(n)) return "Lise";
            return null;
        };
        const duzey = say(liste.map((k) => ({ k, d: egitimDuzeyi(k.cevaplar.egitim) })).filter((x) => x.d));
        const ozet = (dizi, ad) => tabloHtml([ad, "Kişi"], dizi.slice(0, 15).map((x) => [x.d, { t: String(x.kisiler.size), h: String(x.kisiler.size), s: "admin-sayi" }]), "Cevap yok.");
        return {
            html: `<p class="admin-not">Pozisyondaki süre (1. bölüm) ile istenen deneyim (6.1) ve iş başı eğitimi (6.2) karşılaştırılır. Kişinin önceki deneyimi formda sorulmadığından "altında" bulgusu eğitim ihtiyacı adayıdır, kesin değildir.</p>
                ${tabloHtml(basliklar, tablo)}
                <div class="admin-iki-sutun">
                    <div>${altBaslik("İstenen eğitim düzeyi", "4.1")}${ozet(duzey, "Düzey")}</div>
                    <div>${altBaslik("İstenen lisans / sertifikalar", "4.2")}${ozet(sertifikalar, "Lisans / sertifika")}</div>
                </div>
                ${altBaslik("İstenen bilgi ve beceriler", "4.3; eğitim planlaması için en sık geçenler")}${ozet(beceriler, "Bilgi / beceri")}`,
            csv: csvVerisi(basliklar, tablo)
        };
    }

    // ---- analiz sekmeleri ----
    const ANALIZLER = {
        surec: [{ id: "akis", ad: "Bilgi akışı", fn: akisAnalizi }, { id: "tekrar", ad: "İş tekrarı", fn: tekrarAnalizi }, { id: "onay", ad: "Onay zinciri", fn: onayAnalizi }],
        risk: [{ id: "yedek", ad: "Yedeklilik", fn: yedekAnalizi }, { id: "hata", ad: "Hata ve kontrol boşluğu", fn: hataAnalizi }, { id: "yetki", ad: "Yetki uyumu", fn: yetkiAnalizi }],
        verim: [{ id: "otomasyon", ad: "Otomasyon potansiyeli", fn: otomasyonAnalizi }, { id: "profil", ad: "Görev profili", fn: profilAnalizi }, { id: "sistem", ad: "Sistem matrisi", fn: sistemAnalizi }],
        tanim: [{ id: "tanim", ad: "Görev tanımı taslağı", fn: tanimAnalizi }, { id: "yetkinlik", ad: "Yetkinlik ve eğitim", fn: yetkinlikAnalizi }]
    };

    function analizSekmesiCiz(sekme, liste) {
        const tanimlar = ANALIZLER[sekme];
        const alt = tanimlar.find((a) => a.id === durum.altSekme[sekme]) || tanimlar[0];
        document.querySelector(`[data-alt-cipler="${sekme}"]`).innerHTML = tanimlar.map((a) =>
            `<button type="button" class="admin-cip-btn${a === alt ? " secili" : ""}" data-alt-sekme="${sekme}:${a.id}">${esc(a.ad)}</button>`).join("");
        let sonuc;
        try {
            sonuc = liste.length ? alt.fn(liste) : { html: `<p class="admin-bos-satir">Filtrelere uyan kişi yok.</p>`, csv: null };
        } catch (e) {
            console.error(e);
            sonuc = { html: `<p class="admin-mesaj uyari">Bu analiz hesaplanırken hata oluştu: ${esc(e.message)}</p>`, csv: null };
        }
        document.querySelector(`[data-analiz-icerik="${sekme}"]`).innerHTML = sonuc.html;
        durum.analizCsv[sekme] = sonuc.csv ? { ...sonuc.csv, ad: `analiz-${alt.id}-${bugun()}.csv` } : null;
        const csvBtn = document.querySelector(`[data-analiz-csv="${sekme}"]`);
        csvBtn.disabled = !sonuc.csv;
        csvBtn.title = sonuc.csv ? "" : "Bu görünüm için CSV yok";
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
        const alt = e.target.closest("[data-alt-sekme]");
        if (alt) { const [sekme, id] = alt.dataset.altSekme.split(":"); durum.altSekme[sekme] = id; ciz(); return; }
        const analizCsv = e.target.closest("[data-analiz-csv]");
        if (analizCsv) {
            const v = durum.analizCsv[analizCsv.dataset.analizCsv];
            if (v) csvIndir(v.ad, v.basliklar, v.satirlar);
            return;
        }
        if (e.target.closest("[data-tanim-word]")) { tanimWordIndir(); return; }
        if (e.target.closest("[data-tanim-yazdir]")) { tanimYazdir(); return; }
        const satir = e.target.closest("tr[data-kisi]");
        if (satir && !e.target.closest("button")) detayAc(satir.dataset.kisi);
    });

    $("gorevAra").addEventListener("input", (e) => { durum.gorevAra = e.target.value; ciz(); });
    $("gorevGrupla").addEventListener("change", (e) => { durum.gorevGrupla = e.target.checked; ciz(); });
    document.querySelector("main").addEventListener("change", (e) => {
        if (e.target.matches("[data-tanim-sec]")) { durum.tanimSecim = e.target.value; ciz(); }
    });
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
