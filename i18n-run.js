// 화면 번역기 (i18n.js가 사전 다음에 붙인다; 한국어를 고른 브라우저에서는 읽히지 않음). 설명은 i18n.js.
(function () {
  const L = window.kgvLang;
  const pack = window.KGV_I18N || { d: {}, p: [] };
  const D = Object.assign(Object.create(null), pack.d || {});
  const N = Object.assign(Object.create(null), window.KGV_I18N_NAMES || {});      // 기사·대회 이름
  const G = window.KGV_I18N_GUIDE || null;                                        // 가이드 문단(태그 포함)
  const P = [];
  for (const [k, r] of (pack.p || []).concat(window.KGV_I18N_NAME_PAT || [])) { try { P.push([new RegExp("^" + k + "$"), r]); } catch {} }
  const KO = /[가-힣]/;
  const memo = new Map();
  const space = L.lang === "ja" || L.lang === "zh-CN" || L.lang === "zh-TW" ? "" : " ";

  // one Korean run (no digits/latin inside): the dictionary, else word by word when every word is known
  function run(s) {
    if (s in D) return D[s];
    if (s in N) return N[s];
    const words = s.split(/\s+/);
    if (words.length > 1) {
      const out = words.map((w) => (w in D ? D[w] : w in N ? N[w] : null));
      if (out.every((x) => x !== null)) return out.join(space);
    }
    return null;
  }
  function pat(core) {
    for (const [re, r] of P) {
      const m = re.exec(core);
      if (!m) continue;
      return r.replace(/\$(\d)/g, (_, i) => { const g = m[+i] || ""; return KO.test(g) ? tr(g) : g; });
    }
    return null;
  }
  // a text: exact → pattern → Korean runs one by one (numbers, latin and punctuation between them stay)
  function tr(s) {
    if (typeof s !== "string" || !KO.test(s)) return s;
    const hit = memo.get(s);
    if (hit !== undefined) return hit;
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    const core = m[2];
    let r = core in D ? D[core] : core in N ? N[core] : pat(core);
    if (r == null && /\n/.test(core)) r = core.split("\n").map((x) => tr(x)).join("\n");
    if (r == null && core.includes(" · ")) r = core.split(" · ").map((x) => tr(x)).join(" · ");   // "A · B · C": each part
    if (r == null) { const d = /^(·\s*)?([\s\S]+?)(\s*·)?$/.exec(core); if (d && (d[1] || d[3]) && KO.test(d[2])) { const x = tr(d[2]); if (x !== d[2]) r = (d[1] || "") + x + (d[3] || ""); } }
    if (r == null) {
      r = core.replace(/[가-힣][가-힣 ·]*[가-힣]|[가-힣]/g, (k) => {
        const t = run(k);
        if (t != null) return t;
        const p = pat(k);
        return p != null ? p : k;
      });
    }
    r = m[1] + r + m[3];
    if (memo.size > 20000) memo.clear();
    memo.set(s, r);
    return r;
  }
  L.t = tr;

  // ---- the page
  const SKIP = /^(SCRIPT|STYLE|TEXTAREA|CODE|PRE|NOSCRIPT|INPUT|SELECT)$/;
  const ATTRS = ["placeholder", "title", "aria-label", "alt", "data-tip", "data-empty"];
  const skipped = (el) => !el || (el.closest && el.closest('[translate="no"],.notranslate,[contenteditable="true"]'));
  function text(n) {
    const p = n.parentNode;
    if (!p || SKIP.test(p.nodeName) || skipped(p)) return;
    const v = n.nodeValue;
    if (!KO.test(v)) return;
    const t = tr(v);
    if (t !== v) n.nodeValue = t;
  }
  function attrs(el) {
    if (skipped(el)) return;
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v && KO.test(v)) { const t = tr(v); if (t !== v) el.setAttribute(a, t); }
    }
    if (el.nodeName === "INPUT" && /^(button|submit|reset)$/i.test(el.type) && KO.test(el.value)) el.value = tr(el.value);
    if (el.nodeName === "OPTION" && KO.test(el.label || "") && el.getAttribute("label")) el.setAttribute("label", tr(el.getAttribute("label")));
  }
  function guide(root) {
    if (!G) return;
    const sel = "[data-i18n-block], .guide p, .guide li, .guide h1, .guide h2, .guide h3, .guide figcaption, .guide td, .guide th, .guide dt, .guide dd";
    const els = root.nodeType === 1 && root.matches && root.matches(sel) ? [root] : [];
    if (root.querySelectorAll) els.push(...root.querySelectorAll(sel));
    for (const el of els) {
      if (el.dataset.i18nDone) continue;
      const key = el.innerHTML.replace(/\s+/g, " ").trim();
      if (key in G) { el.innerHTML = G[key]; el.dataset.i18nDone = "1"; }
    }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) return text(root);
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1 && (SKIP.test(root.nodeName) && root.nodeName !== "INPUT" && root.nodeName !== "SELECT")) return;
    guide(root);
    if (root.nodeType === 1) attrs(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { if (n.nodeType === 3) text(n); else attrs(n); }
  }
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "characterData") text(m.target);
      else if (m.type === "attributes") attrs(m.target);
      else for (const n of m.addedNodes) walk(n);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS.concat(["value"]) });
  function css() {
    const each = (rules) => { for (const r of rules) {
      if (r.cssRules) each(r.cssRules);
      const c = r.style && r.style.content;
      if (c && KO.test(c) && /^".*"$/.test(c)) { const t = tr(c.slice(1, -1).replace(/\\"/g, '"')); r.style.content = JSON.stringify(t); }
    } };
    for (const sh of document.styleSheets) { try { each(sh.cssRules); } catch {} }
  }
  const titleOnce = () => { if (KO.test(document.title)) document.title = tr(document.title); };
  walk(document.documentElement); titleOnce();
  document.addEventListener("DOMContentLoaded", () => { walk(document.body); titleOnce(); css(); });
  new MutationObserver(titleOnce).observe(document.querySelector("title") || document.head, { childList: true, characterData: true, subtree: true });

  // ---- dialogs, canvas text, dates
  for (const k of ["alert", "confirm", "prompt"]) {
    const f = window[k];
    window[k] = function (msg, ...rest) { return f.call(window, tr(String(msg ?? "")), ...rest); };
  }
  const C = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
  if (C) for (const k of ["fillText", "strokeText", "measureText"]) {
    const f = C[k];
    C[k] = function (s, ...rest) { return f.call(this, typeof s === "string" ? tr(s) : s, ...rest); };
  }
  const loc = (x) => (x === "ko-KR" || x === "ko" ? L.locale : x);
  for (const k of ["toLocaleString", "toLocaleDateString", "toLocaleTimeString"]) {
    const f = Date.prototype[k];
    Date.prototype[k] = function (l, o) { return f.call(this, loc(l), o); };
  }
  const NF = Intl.NumberFormat, DF = Intl.DateTimeFormat;
  Intl.DateTimeFormat = function (l, o) { return new DF(loc(l), o); };
  Intl.DateTimeFormat.prototype = DF.prototype; Intl.DateTimeFormat.supportedLocalesOf = DF.supportedLocalesOf;
  void NF;
})();
