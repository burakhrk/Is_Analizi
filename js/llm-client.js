// BYOK LLM istemcisi: anahtar tarayıcıda durur, istek doğrudan sağlayıcıya gider.
// Hiçbir anahtar dosyaya/repoya yazılmaz (yalnızca localStorage).
(function () {
    "use strict";

    var AYAR_ANAHTARI = "is_analizi_llm_ayarlar";
    var KULLANIM_ANAHTARI = "is_analizi_llm_kullanim";

    var SAGLAYICILAR = {
        openrouter: {
            ad: "OpenRouter",
            url: "https://openrouter.ai/api/v1/chat/completions",
            modeller: ["openai/gpt-4.1-mini", "openai/gpt-4.1-nano", "openai/gpt-5-nano", "openai/gpt-5-mini", "openai/gpt-4o-mini", "anthropic/claude-3-5-haiku", "google/gemini-flash-1.5"],
            varsayilanModel: "openai/gpt-4.1-mini"
        },
        openai: {
            ad: "OpenAI",
            url: "https://api.openai.com/v1/chat/completions",
            modeller: ["gpt-4.1-mini", "gpt-4.1-nano", "gpt-5-nano", "gpt-5-mini", "gpt-4o-mini", "gpt-4.1"],
            varsayilanModel: "gpt-4.1-mini"
        },
        gemini: {
            ad: "Gemini",
            url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
            modeller: ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"],
            varsayilanModel: "gemini-2.5-flash"
        },
        anthropic: {
            ad: "Anthropic",
            url: "https://api.anthropic.com/v1/messages",
            modeller: ["claude-3-5-haiku-20241022", "claude-sonnet-4-20250514"],
            varsayilanModel: "claude-3-5-haiku-20241022"
        }
    };

    function varsayilanAyar() {
        return { saglayici: "openrouter", model: SAGLAYICILAR.openrouter.varsayilanModel, apiKey: "", anonim: true, limit: 1000 };
    }

    function ayarGetir() {
        try {
            var ham = JSON.parse(localStorage.getItem(AYAR_ANAHTARI)) || {};
            var d = varsayilanAyar();
            // Eski varsayılan limitler (20/50) tek seferlik 1000'e yükseltilir
            if (ham.limit === 20 || ham.limit === 50 || ham.limit === "20" || ham.limit === "50") {
                ham.limit = 1000;
                try { localStorage.setItem(AYAR_ANAHTARI, JSON.stringify(ham)); } catch (e) { /* yoksay */ }
            }
            return {
                saglayici: SAGLAYICILAR[ham.saglayici] ? ham.saglayici : d.saglayici,
                model: typeof ham.model === "string" && ham.model ? ham.model : d.model,
                apiKey: typeof ham.apiKey === "string" ? ham.apiKey : "",
                anonim: ham.anonim !== false,
                limit: Math.min(10000, Math.max(1, parseInt(ham.limit, 10) || d.limit))
            };
        } catch (e) {
            return varsayilanAyar();
        }
    }

    function ayarKaydet(a) {
        localStorage.setItem(AYAR_ANAHTARI, JSON.stringify(a));
    }

    function anahtariSil() {
        var a = ayarGetir();
        a.apiKey = "";
        ayarKaydet(a);
    }

    function anahtarVar() {
        return !!ayarGetir().apiKey;
    }

    function bugun() {
        return new Date().toISOString().slice(0, 10);
    }

    function kullanimOku() {
        try {
            var k = JSON.parse(localStorage.getItem(KULLANIM_ANAHTARI)) || {};
            if (k.tarih !== bugun()) return { tarih: bugun(), adet: 0 };
            return { tarih: k.tarih, adet: parseInt(k.adet, 10) || 0 };
        } catch (e) {
            return { tarih: bugun(), adet: 0 };
        }
    }

    function kotaDurumu() {
        var a = ayarGetir();
        var k = kullanimOku();
        return { kullanilan: k.adet, limit: a.limit, kalan: Math.max(0, a.limit - k.adet) };
    }

    function kullanimIsle() {
        var k = kullanimOku();
        k.adet += 1;
        k.tarih = bugun();
        localStorage.setItem(KULLANIM_ANAHTARI, JSON.stringify(k));
        return k;
    }

    function sistemdenKullaniciya(mesajlar) {
        // Anthropic: system ayrı alanda gider.
        var sistem = [];
        var diger = [];
        mesajlar.forEach(function (m) {
            if (m.role === "system") sistem.push(m.content);
            else diger.push(m);
        });
        return { sistem: sistem.join("\n"), diger: diger };
    }

    async function hamIstek(mesajlar, jsonModu) {
        var a = ayarGetir();
        if (!a.apiKey) throw new Error("Önce Asistan Ayarları'na API anahtarınızı girin.");
        var kota = kotaDurumu();
        if (kota.kalan <= 0) throw new Error("Günlük istek limiti doldu (" + kota.limit + ").");

        var saglayici = SAGLAYICILAR[a.saglayici] ? a.saglayici : "openrouter";
        var govde, basliklar = { "Content-Type": "application/json" };
        var cfg = SAGLAYICILAR[saglayici];

        if (saglayici === "anthropic") {
            var ayrilmis = sistemdenKullaniciya(mesajlar);
            basliklar["x-api-key"] = a.apiKey;
            basliklar["anthropic-version"] = "2023-06-01";
            basliklar["anthropic-dangerous-direct-browser-access"] = "true";
            govde = { model: a.model, max_tokens: 2000, system: ayrilmis.sistem, messages: ayrilmis.diger };
        } else {
            basliklar["Authorization"] = "Bearer " + a.apiKey;
            if (saglayici === "openrouter") {
                basliklar["HTTP-Referer"] = location.origin;
                basliklar["X-Title"] = "Is Analizi Asistani";
            }
            govde = { model: a.model, temperature: 0.2, messages: mesajlar };
            if (jsonModu && saglayici !== "gemini") govde.response_format = { type: "json_object" };
        }

        var yanit = await fetch(cfg.url, { method: "POST", headers: basliklar, body: JSON.stringify(govde) });
        if (!yanit.ok) {
            var detay = "";
            try { detay = await yanit.text(); } catch (e) { /* yoksay */ }
            if (yanit.status === 401 || yanit.status === 403) throw new Error("Anahtar reddedildi (401/403). Sağlayıcı/model eşleşmesini kontrol edin.");
            if (yanit.status === 429) throw new Error("Sağlayıcı kotası doldu (429). Biraz bekleyip tekrar deneyin.");
            throw new Error("LLM isteği başarısız (" + yanit.status + "). " + detay.slice(0, 200));
        }
        kullanimIsle();
        var veri = await yanit.json();
        if (saglayici === "anthropic") {
            var parcalar = (veri.content || []).map(function (b) { return b.text || ""; });
            return parcalar.join("");
        }
        if (!veri.choices || !veri.choices[0] || !veri.choices[0].message) throw new Error("Sağlayıcıdan boş yanıt geldi.");
        return veri.choices[0].message.content || "";
    }

    function jsonAyikla(metin) {
        // Model bazen ```json fences ile döner; tolere et.
        var temiz = String(metin || "").replace(/```json|```/g, "").trim();
        var basla = temiz.indexOf("{");
        var bit = temiz.lastIndexOf("}");
        if (basla !== -1 && bit !== -1) temiz = temiz.slice(basla, bit + 1);
        return JSON.parse(temiz);
    }

    async function baglantiTest() {
        var metin = await hamIstek([
            { role: "system", content: "Sadece JSON döndür." },
            { role: "user", content: "{\"ping\": true} testine {\"pong\": true} yanıtı ver." }
        ], true);
        jsonAyikla(metin);
        return true;
    }

    window.LlmIstemci = {
        SAGLAYICILAR: SAGLAYICILAR,
        ayarGetir: ayarGetir,
        ayarKaydet: ayarKaydet,
        anahtariSil: anahtariSil,
        anahtarVar: anahtarVar,
        kotaDurumu: kotaDurumu,
        sohbet: hamIstek,
        jsonAyikla: jsonAyikla,
        baglantiTest: baglantiTest
    };
})();
