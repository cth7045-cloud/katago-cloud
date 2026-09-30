// 화면 밝기(2026-09-30): 내 정보에서 고른 값(localStorage "kc-theme" = "light" | "dark", 없으면 기기 설정)을 적용한다.
// 다크 색은 CSS의 @media (prefers-color-scheme: dark) 안에 있으므로, 고른 값이 있으면 그 조건을 all / not all로 바꿔 끼운다.
// head의 스타일시트 뒤에 두어야 한다(그래야 시트가 다 읽힌 뒤, 화면이 그려지기 전에 돈다). analysis.html에는 같은 코드가 들어 있다.
(function () {
  const sys = matchMedia("(prefers-color-scheme: dark)"), seen = new Set(), rules = [], subs = [];
  const pref = () => { try { const v = localStorage.getItem("kc-theme"); return v === "light" || v === "dark" ? v : ""; } catch { return ""; } };
  const dark = () => { const p = pref(); return p ? p === "dark" : sys.matches; };
  function apply() {
    const p = pref(), d = dark();
    document.documentElement.dataset.theme = d ? "dark" : "light";
    for (const sh of document.styleSheets) {
      let list; try { list = sh.cssRules; } catch { continue; }   // 다른 곳(글꼴)의 시트는 읽을 수 없음
      for (const r of list) if (r instanceof CSSMediaRule && !seen.has(r) && /prefers-color-scheme:\s*dark/.test(r.media.mediaText)) { seen.add(r); rules.push([r, r.media.mediaText]); }
    }
    for (const [r, orig] of rules) r.media.mediaText = p ? (d ? "all" : "not all") : orig;
    for (const el of document.querySelectorAll('meta[name="theme-color"][media], link[rel~="icon"][media]')) {
      const orig = el.dataset.media || (el.dataset.media = el.media), isDark = orig.includes("dark");
      el.media = p ? (isDark === d ? "all" : "not all") : orig;
    }
  }
  const changed = () => { apply(); for (const f of subs) f(); };
  window.kcTheme = {
    pref, dark,
    set(v) { try { v ? localStorage.setItem("kc-theme", v) : localStorage.removeItem("kc-theme"); } catch {} changed(); },
    onChange(f) { subs.push(f); },
  };
  sys.addEventListener("change", () => { if (!pref()) changed(); });
  addEventListener("storage", (e) => { if (e.key === "kc-theme") changed(); });   // 다른 탭에서 바꿨을 때
  apply();
})();
