/* Brickwork — live chat, studio side. Reads the inbox and posts replies.

   Auth: a single shared secret in the STUDIO_KEY environment variable, sent as
   an x-studio-key header. Deliberately fails CLOSED — if the variable is unset
   every request is refused, so a missing env var can never leave the inbox
   world-readable. Set it with:
     npx.cmd netlify-cli env:set STUDIO_KEY <a long random string> --site <id>

   Writer discipline: this file writes ONLY c/<id>/s. The visitor endpoint
   writes ONLY c/<id>/v. Netlify Blobs is last-write-wins with no locking, so
   keeping one writer per blob is what stops a reply and an incoming message
   from clobbering each other. Do not consolidate them. */

import { getStore, getDeployStore } from "@netlify/blobs";

const MAX_CHARS = 4000;   // studio replies can be longer than visitor messages
const MAX_LIST = 30;      // most recent conversations returned to the inbox
const MAX_MSGS = 60;      // hard ceiling per conversation, studio side

function chatStore() {
  const isProd = process.env.CONTEXT === "production";
  return isProd
    ? getStore({ name: "chat", consistency: "strong" })
    : getDeployStore({ name: "chat", consistency: "strong" });
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/* Length-independent comparison. The key travels over HTTPS and is long and
   random, so this is belt-and-braces rather than load-bearing. */
function secretMatches(given) {
  const want = process.env.STUDIO_KEY || "";
  if (!want || typeof given !== "string" || given.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

function validId(id) {
  return typeof id === "string" && /^[a-z0-9]{6,10}-[a-z0-9]{4,8}$/.test(id);
}

export default async function handler(req) {
  if (!secretMatches(req.headers.get("x-studio-key"))) {
    return json({ error: "unauthorised" }, 401);
  }

  const store = chatStore();

  /* ---- Inbox ---- */
  if (req.method === "GET") {
    const { blobs } = await store.list({ prefix: "c/" });
    /* Ids carry a base36 timestamp prefix, so a plain reverse sort is
       newest-first without reading a single blob. */
    const ids = [...new Set(
      blobs
        .map(function (b) { return b.key.split("/")[1]; })
        .filter(validId)
    )].sort().reverse().slice(0, MAX_LIST);

    const convos = await Promise.all(ids.map(async function (id) {
      const v = (await store.get("c/" + id + "/v", { type: "json" })) || { msgs: [] };
      const s = (await store.get("c/" + id + "/s", { type: "json" })) || { msgs: [], readAt: 0 };
      const merged = []
        .concat((v.msgs || []).map(function (m) { return { who: "visitor", t: m.t, at: m.at }; }))
        .concat((s.msgs || []).map(function (m) { return { who: "studio", t: m.t, at: m.at }; }))
        .sort(function (a, b) { return a.at - b.at; });
      const lastVisitorAt = (v.msgs || []).reduce(function (max, m) { return Math.max(max, m.at); }, 0);
      return {
        id: id,
        contact: v.contact || "",
        msgs: merged,
        unread: lastVisitorAt > (s.readAt || 0),
        updatedAt: merged.length ? merged[merged.length - 1].at : 0,
      };
    }));

    convos.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
    return json({ convos: convos });
  }

  if (req.method !== "POST") return json({ error: "GET or POST only" }, 405);

  let body;
  try { body = await req.json(); } catch (e) { return json({ error: "bad json" }, 400); }

  const id = body.id;
  if (!validId(id)) return json({ error: "bad id" }, 400);

  const sKey = "c/" + id + "/s";
  const s = (await store.get(sKey, { type: "json" })) || { msgs: [], readAt: 0 };

  /* A bare mark-as-read carries no text. */
  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_CHARS) : "";
  if (text) {
    if (s.msgs.length >= MAX_MSGS) return json({ error: "conversation full" }, 409);
    s.msgs.push({ t: text, at: Date.now() });
  }
  s.readAt = Date.now();

  await store.setJSON(sKey, s);
  return json({ ok: true, total: s.msgs.length });
}

export const config = { path: "/api/studio" };
