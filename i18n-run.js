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
  // words left to right, longest known run of words first (names and tournaments have spaces); null unless all are known
  function tokens(s) {
    const t = s.split(/\s+/), out = [];
    for (let i = 0; i < t.length;) {
      let hit = null, j = Math.min(t.length, i + 8);
      for (; j > i; j--) {
        const span = t.slice(i, j).join(" ");
        if (!KO.test(span)) { if (j === i + 1) { hit = span; break; } continue; }
        let v = span in D ? D[span] : span in N ? N[span] : G && ("@" + span) in G ? G["@" + span] : null;
        if (v == null && (j === i + 1 || (j === i + 2 && /\d/.test(span)))) v = pat(span);
        if (v != null) { hit = v; break; }
      }
      if (hit == null) return null;
      out.push(hit); i = j;
    }
    return out.join(" ");
  }
  // a text: exact → pattern → Korean runs one by one (numbers, latin and punctuation between them stay)
  function tr(s) {
    if (typeof s !== "string" || !KO.test(s)) return s;
    const hit = memo.get(s);
    if (hit !== undefined) return hit;
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    const core = m[2];
    let r = core in D ? D[core] : core in N ? N[core] : G && ("@" + core) in G ? G["@" + core] : pat(core);
    if (r == null && /\n/.test(core)) r = core.split("\n").map((x) => tr(x)).join("\n");
    if (r == null && core.includes(" · ")) r = core.split(" · ").map((x) => tr(x)).join(" · ");   // "A · B · C": each part
    if (r == null) { const d = /^(·\s*)?([\s\S]+?)(\s*·)?$/.exec(core); if (d && (d[1] || d[3]) && KO.test(d[2])) { const x = tr(d[2]); if (x !== d[2]) r = (d[1] || "") + x + (d[3] || ""); } }
    if (r == null && /\s/.test(core)) r = tokens(core);   // "제28회 LG배 조선일보 기왕전 결승 제3국", "이창호 9단": every word known
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
  // a name typed in this language (Shin Jinseo, 申真谞, Син Чинсо) → the Korean name the DB searches by; whole name or a unique start
  let REV = null;
  const nk = (x) => String(x).toLowerCase().replace(/[\s\-'’·.]/g, "");
  L.untr = (q) => {
    const k = nk(q || "");
    if (!k || KO.test(q)) return q;
    if (!REV) { REV = new Map(); for (const ko in N) if (!/\d/.test(ko)) { const v = nk(N[ko]); if (v && !REV.has(v)) REV.set(v, ko); } }
    if (REV.has(k)) return REV.get(k);
    if (k.length < (/[a-zа-я]/.test(k) ? 3 : 2)) return q;
    let hit = null;
    for (const [v, ko] of REV) if (v.startsWith(k)) { if (hit && hit !== ko) return q; hit = ko; }
    return hit || q;
  };

  // ---- the page
  const SKIP = /^(SCRIPT|STYLE|TEXTAREA|CODE|PRE|NOSCRIPT|INPUT|SELECT)$/;
  const ATTRS = ["placeholder", "title", "aria-label", "alt", "data-tip", "data-empty"];
  // the guide: its body waits until the whole page is parsed, so whole paragraphs (G) are swapped before word-level fallback
  let ready = !G;
  const skipped = (el) => !el || (!ready && el.closest && el.closest("body")) || (el.closest && el.closest('[translate="no"],.notranslate,[contenteditable="true"]'));
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
  // guide paragraphs: inside each block, a run of inline content (text, b, a, span, kbd …) is one unit, keyed by its HTML
  // (whitespace collapsed) — the same units katagovast tools/i18n/guide_units.mjs pulls out of guide.html
  const INLINE = new Set(["a", "b", "i", "em", "strong", "span", "kbd", "code", "br", "small", "sup", "sub", "mark", "u", "s", "abbr", "wbr"]);
  const esc = (x) => x.replace(/&/g, "&amp;").replace(/\u00a0/g, "&nbsp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const isInline = (n) => n.nodeType === 3 || (n.nodeType === 1 && INLINE.has(n.localName) && ![...n.childNodes].some((c) => c.nodeType === 1 && !isInline(c)));
  function guide(el) {
    if (!G || el.nodeType !== 1 || /^(SCRIPT|STYLE|HEAD)$/.test(el.nodeName)) return;
    let run = [];
    const flush = () => {
      if (run.length) {
        const key = run.map((n) => (n.nodeType === 3 ? esc(n.nodeValue) : n.outerHTML)).join("").replace(/\s+/g, " ").trim();
        if (KO.test(key) && key in G) {
          const t = document.createElement("template");
          t.innerHTML = G[key];
          run[0].parentNode.insertBefore(t.content, run[0]);
          for (const n of run) n.remove();
        }
      }
      run = [];
    };
    for (const c of [...el.childNodes]) {
      if (c.nodeType === 8) continue;
      if (isInline(c)) run.push(c);
      else { flush(); guide(c); }
    }
    flush();
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) return text(root);
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1 && (SKIP.test(root.nodeName) && root.nodeName !== "INPUT" && root.nodeName !== "SELECT")) return;
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
  let hide = null;
  if (G) {   // no flash of Korean on the guide: the body shows once its paragraphs are swapped (or after 4 s whatever happens)
    hide = document.createElement("style"); hide.textContent = "body{visibility:hidden}";
    document.head.appendChild(hide); setTimeout(() => hide.remove(), 4000);
  }
  walk(document.documentElement); titleOnce();
  document.addEventListener("DOMContentLoaded", () => {
    try { if (G) guide(document.body); } finally { ready = true; if (hide) hide.remove(); }
    walk(document.body); titleOnce(); css();
  });
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
