// Shared client code: Supabase session + calls to the kgv Edge Function.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { API, SUPABASE_KEY, SUPABASE_URL } from "./config.js";

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

export async function api(path, body) {
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  const response = await fetch(`${API}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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
