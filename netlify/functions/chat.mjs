/* Brickwork — live human chat, visitor side.

   What this is, and what it deliberately is not:
   - The AI assistant (assistant.mjs) stays ephemeral: nothing it says is
     stored anywhere. THIS endpoint is the opposite by necessity — a human
     reply arrives minutes later, so the conversation has to outlive the
     request. The widget tells the visitor that at the moment they switch
     lanes. Do not blur the two.
   - No third-party chat vendor, no cookies set by us, no visitor tracking.
     The browser keeps its own conversation id in localStorage; that is the
     only client-side state and it is the visitor's own handle on their thread.

   Cost model, which is the whole design constraint:
   Polling is the only thing here that runs often, so it is the only thing that
   can cost real money. Every cap below exists to bound invocations, and the
   client backs off hard (see assistant.js). One engaged 10-minute conversation
   should cost roughly 60-80 invocations, not the ~200 a naive 3s poll burns.

   Storage layout — two blobs per conversation, one writer each, so the two
   sides can never overwrite one another (Blobs is last-write-wins with no
   locking):
     c/<id>/v  written ONLY here      { contact, msgs: [{t, at}] }
     c/<id>/s  written ONLY by studio { msgs: [{t, at}], readAt }
   The id embeds a base36 timestamp so plain key listing sorts by recency. */

import { getStore, getDeployStore } from "@netlify/blobs";

const PROD_ORIGIN = "https://brickworkstudio.net";

/* ---- Caps. Every one of these is a cost or abuse ceiling. ---- */
const MAX_CHARS = 1200;       // per message
const MAX_MSGS = 40;          // per conversation, both sides combined
const MAX_NEW_PER_IP = 3;     // new conversations per IP per day
const MAX_SENDS_PER_MIN = 6;  // messages per IP per minute
const MIN_POLL_MS = 2000;     // server floor; the client asks far less often
const CONVO_TTL_MS = 7 * 864e5; // conversations are unreachable after 7 days

const BUSY = "You're sending faster than I can read. Give it a moment — or skip the queue on WhatsApp: https://wa.me/447735785911";
const FULL = "This conversation has got long. Let's carry on properly on WhatsApp: https://wa.me/447735785911";

function originAllowed(origin) {
  if (!origin) return true;
  if (origin === PROD_ORIGIN) return true;
  if (/^https:\/\/([a-z0-9-]+--)?glittering-elf-6e046e\.netlify\.app$/.test(origin)) return true;
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;
  return false;
}

/* Production writes to the global store; anything else (deploy previews,
   netlify dev) gets a deploy-scoped store, so test chatter never lands in the
   real inbox and disappears with the deploy. */
function chatStore() {
  const isProd = process.env.CONTEXT === "production";
  return isProd
    ? getStore({ name: "chat", consistency: "strong" })
    : getDeployStore({ name: "chat", consistency: "strong" });
}

/* Poll floor only. Sends are rate-limited durably in blobs below; polls are
   too hot to spend a blob read on, so this in-memory floor plus the client's
   backoff is the control. A cold start resets it, which is harmless. */
const lastPoll = new Map();
function pollTooFast(id) {
  const now = Date.now();
  const prev = lastPoll.get(id) || 0;
  if (now - prev < MIN_POLL_MS) return true;
  if (lastPoll.size > 2000) lastPoll.clear();
  lastPoll.set(id, now);
  return false;
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/* IPs are never stored in the clear — only this short non-reversible digest,
   and only to count against the per-IP caps. */
async function ipKey(ip) {
  const bytes = new TextEncoder().encode("bw:" + ip);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].slice(0, 8).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}

/* Durable per-IP quota. Only sends pay for this, never polls. */
async function quotaExceeded(store, ip) {
  const key = "q/" + (await ipKey(ip));
  const now = Date.now();
  const q = (await store.get(key, { type: "json" })) || { day: 0, dayAt: 0, min: [], convos: 0 };
  if (now - q.dayAt > 864e5) { q.day = 0; q.convos = 0; q.dayAt = now; }
  q.min = (q.min || []).filter(function (t) { return now - t < 60000; });
  if (q.min.length >= MAX_SENDS_PER_MIN) return { blocked: true, reason: BUSY, q, key };
  q.min.push(now);
  q.day += 1;
  return { blocked: false, q, key };
}

function convoId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return Date.now().toString(36) + "-" + rand;
}

function validId(id) {
  return typeof id === "string" && /^[a-z0-9]{6,10}-[a-z0-9]{4,8}$/.test(id);
}

function expired(id) {
  const ts = parseInt(id.split("-")[0], 36);
  return !ts || Date.now() - ts > CONVO_TTL_MS;
}

/* Mirror the first message of a new conversation into Netlify Forms. That is
   the notification path: the studio already has verified form-email delivery,
   so this costs nothing extra and reuses something known to work. Failure here
   must never fail the visitor's send. */
async function notify(origin, id, text, contact) {
  try {
    const body = new URLSearchParams({
      "form-name": "chat",
      "conversation": id,
      "message": text.slice(0, 400),
      "contact": contact || "(none given)",
      "link": PROD_ORIGIN + "/studio#" + id,
    });
    await fetch(origin + "/", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (e) { /* notification is best effort */ }
}

export default async function handler(req, context) {
  const url = new URL(req.url);

  /* ---- Poll. The hot path: one blob read, tiny response, nothing written. -- */
  if (req.method === "GET") {
    const id = url.searchParams.get("id") || "";
    const since = Math.max(0, parseInt(url.searchParams.get("since") || "0", 10) || 0);
    if (!validId(id)) return json({ error: "bad id" }, 400);
    if (expired(id)) return json({ msgs: [], closed: true });
    if (pollTooFast(id)) return json({ msgs: [], throttled: true }, 429);

    const store = chatStore();
    const s = (await store.get("c/" + id + "/s", { type: "json" })) || { msgs: [] };
    const msgs = (s.msgs || []).slice(since);
    return json({ msgs: msgs, total: (s.msgs || []).length });
  }

  if (req.method !== "POST") return json({ error: "POST or GET only" }, 405);
  if (!originAllowed(req.headers.get("origin"))) return json({ error: "forbidden" }, 403);

  let body;
  try { body = await req.json(); } catch (e) { return json({ error: "bad json" }, 400); }

  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_CHARS) : "";
  if (!text) return json({ error: "empty" }, 400);

  const ip = (context && context.ip) || req.headers.get("x-nf-client-connection-ip") || "unknown";
  const store = chatStore();

  const quota = await quotaExceeded(store, ip);
  if (quota.blocked) return json({ reply: quota.reason, blocked: true });

  let id = typeof body.id === "string" ? body.id : "";
  const isNew = !validId(id) || expired(id);

  if (isNew) {
    if (quota.q.convos >= MAX_NEW_PER_IP) {
      return json({ reply: FULL, blocked: true });
    }
    quota.q.convos += 1;
    id = convoId();
  }

  const vKey = "c/" + id + "/v";
  const v = (await store.get(vKey, { type: "json" })) || { contact: "", msgs: [] };

  if (v.msgs.length >= MAX_MSGS) return json({ id: id, reply: FULL, blocked: true });

  if (typeof body.contact === "string" && body.contact.trim() && !v.contact) {
    v.contact = body.contact.trim().slice(0, 200);
  }
  v.msgs.push({ t: text, at: Date.now() });

  await store.setJSON(vKey, v);
  await store.setJSON(quota.key, quota.q);

  if (isNew) {
    await notify(process.env.URL || PROD_ORIGIN, id, text, v.contact);
  }

  return json({ id: id, ok: true, isNew: isNew });
}

export const config = { path: "/api/chat" };
