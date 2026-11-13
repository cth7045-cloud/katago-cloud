// 화면 언어 (2026-11-12, 사용자 "해외로 보낼거라 설정에 언어도 바꿀 수 있는 기능도 넣어줘" — 한국어·영어·일본어·중국어 간체·번체·러시아어).
// 사이트 글은 한국어로 쓰여 있고, 다른 언어를 고르면 이 파일이 화면의 한국어를 사전(i18n/<언어>.js, 한국어 원문 → 번역)으로 바꾼다:
// 글자·속성(placeholder·title·aria-label·alt)·알림창(alert/confirm/prompt)·캔버스 글자, 나중에 그려지는 것도(MutationObserver).
// 사전에 없는 문장은 한국어 덩어리별로 다시 찾아 보고, 그래도 없으면 한국어 그대로 둔다. 고른 언어는 이 브라우저에 (localStorage kgv.lang),
// 처음엔 브라우저 언어로. head에서 스타일시트 뒤, 다른 스크립트보다 먼저 읽는다(사전을 document.write로 바로 붙임).
// <script src="i18n.js" data-names> = 기보실 기사·대회 이름 사전도, data-guide = 가이드 문단 사전도.
(function () {
  const LANGS = [["ko", "한국어"], ["en", "English"], ["ja", "日本語"], ["zh-CN", "简体中文"], ["zh-TW", "繁體中文"], ["ru", "Русский"]];
  const LOCALE = { ko: "ko-KR", en: "en-US", ja: "ja-JP", "zh-CN": "zh-CN", "zh-TW": "zh-TW", ru: "ru-RU" };
  const ok = (l) => LANGS.some(([c]) => c === l);
  function detect() {
    const list = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "ko"]).map((x) => String(x).toLowerCase());
    for (const l of list) {
      if (l.startsWith("ko")) return "ko";
      if (l.startsWith("ja")) return "ja";
      if (/^zh-(tw|hk|mo)|^zh-hant/.test(l)) return "zh-TW";
      if (l.startsWith("zh")) return "zh-CN";
      if (l.startsWith("ru") || l.startsWith("uk") || l.startsWith("be") || l.startsWith("kk")) return "ru";
      if (l.startsWith("en")) return "en";
    }
    return "en";
  }
  let lang = "ko";
  try {
    const q = new URLSearchParams(location.search).get("lang");
    if (ok(q)) localStorage.setItem("kgv.lang", q);
    const saved = localStorage.getItem("kgv.lang");
    lang = ok(saved) ? saved : detect();
  } catch { lang = detect(); }
  const me = document.currentScript, base = me ? me.src.replace(/[^/]*$/, "") : "";
  const api = {
    lang, locale: LOCALE[lang], list: LANGS,
    set(l) { if (!ok(l)) return; try { localStorage.setItem("kgv.lang", l); } catch {} location.reload(); },
    t: (s) => s, untr: (s) => s,
    // a <select> (or any element: filled with one) that switches the language
    picker(el) {
      if (!el) return;
      el.setAttribute("translate", "no");
      el.innerHTML = LANGS.map(([c, n]) => `<option value="${c}"${c === lang ? " selected" : ""}>${n}</option>`).join("");
      el.addEventListener("change", () => api.set(el.value));
    },
  };
  window.kgvLang = api;
  document.documentElement.lang = lang;
  addEventListener("storage", (e) => { if (e.key === "kgv.lang" && e.newValue !== lang) location.reload(); });
  if (lang === "ko") return;

  // dictionaries, before the page's own scripts run
  const v = "20261113d";
  document.write(`<script src="${base}i18n/${lang}.js?v=${v}"><\/script>`);
  if (me && me.hasAttribute("data-names")) document.write(`<script src="${base}i18n/names-${lang}.js?v=${v}"><\/script>`);
  if (me && me.hasAttribute("data-guide")) document.write(`<script src="${base}i18n/guide-${lang}.js?v=${v}"><\/script>`);
  document.write(`<script src="${base}i18n-run.js?v=${v}"><\/script>`);   // the translator, after the dictionaries
})();
