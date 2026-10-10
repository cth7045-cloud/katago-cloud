// Shared client code: Supabase session + calls to the kgv Edge Function.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm";   // an exact version: a new 2.x is not picked up untested (2026-10-10)
import { API, SUPABASE_KEY, SUPABASE_URL } from "./config.js";

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// Opened in the KataGo Cloud PC app (katagovast pcsync, 2026-10-07): its 타이젬 기보 자동 동기화 uses this login. The
// app puts window.kgcAppSession on the page; only this page renews the login (supabase-js) and hands the app each new
// one, so the two never use the same refresh token twice.
if (typeof window.kgcAppSession === "function") {
  const tell = (s) => window.kgcAppSession(s ? { access_token: s.access_token, expires_at: s.expires_at, user_id: s.user.id, email: s.user.email || "" } : null).catch(() => {});
  sb.auth.onAuthStateChange((_event, session) => { tell(session); });
  window.__kgcAppRefresh = () => sb.auth.refreshSession().then(({ data }) => tell(data.session)).catch(() => {});
}

// A request that hangs (a phone switching Wi-Fi/LTE) gives up instead of leaving its button disabled; /start and
// /stop may take long on the server (offer retries, waiting for the delete), so they get the function's full time.
// A failed connection reads in Korean, and a GET (nothing changes on the server) is tried once more (2026-10-10).
export async function api(path, body) {
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  const get = body === undefined, slow = /^\/(start|stop|batch|admin\/(stop|engine-test))/.test(path);
  let response;
  for (let attempt = 0; ; attempt++) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), slow ? 150_000 : 60_000);
    try {
      response = await fetch(`${API}${path}`, {
        method: get ? "GET" : "POST", signal: ctl.signal,
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: get ? undefined : JSON.stringify(body),
      });
      break;
    } catch (err) {
      if (ctl.signal.aborted) throw new Error("서버 응답이 너무 늦습니다. 잠시 후 화면을 확인하고 다시 시도해 주세요.");
      if (get && attempt === 0) { await new Promise((r) => setTimeout(r, 800)); continue; }
      throw new Error(navigator.onLine === false ? "인터넷에 연결되어 있지 않습니다. 연결을 확인하고 다시 시도해 주세요."
        : "서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally { clearTimeout(timer); }
  }
  let payload = {};
  try { payload = await response.json(); } catch { /* empty */ }
  if (!response.ok) throw new Error(payload.error || `요청 실패 (${response.status})`);
  return payload;
}

export const won = (n) => `${Math.round(Number(n) || 0).toLocaleString("ko-KR")}원`;
export const $ = (id) => document.getElementById(id);
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export function when(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
export function toast(message, bad = false) {
  let el = document.getElementById("toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; document.body.appendChild(el); }
  el.textContent = message; el.className = bad ? "show bad" : "show";
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.className = ""; }, 4200);
}
