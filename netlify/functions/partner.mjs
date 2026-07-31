/* Brickwork — self-serve partner signup.

   Why this exists: handing out referral codes by hand works up to a couple of
   dozen partners and then becomes the bottleneck it was meant to remove. This
   lets someone sign up, get their link on screen immediately, and start
   sending people — with no step that waits on the studio.

   Important: a code is NOT made valid by this endpoint. The site's referral
   tracking (script.js) validates the *format* of ?ref=, not membership, so any
   well-formed code has always worked. What this adds is a record of WHO owns
   which code, which is what decides who gets paid. An enquiry tagged with a
   code that isn't here has nobody to pay — the correct fail-closed behaviour.

   Storage — one blob per partner, keyed by code, so signup collision-checks
   with a single get() and there is no list to rewrite (Blobs is last-write-
   wins with no locking, so shared mutable indexes are avoided on purpose):
     p/<code>  { code, name, email, note, at }  */

import { getStore, getDeployStore } from "@netlify/blobs";

const PROD_ORIGIN = "https://brickworkstudio.net";

/* ---- Caps ---- */
const MAX_NAME = 80;
const MAX_EMAIL = 120;
const MAX_NOTE = 400;
const MAX_PER_IP_PER_DAY = 3;
const MAX_COLLISION_TRIES = 25;

/* Codes that would be confusing or misleading to hand out. */
const RESERVED = new Set([
  "admin", "studio", "brickwork", "brickworkstudio", "partners", "partner",
  "test", "api", "www", "chat", "assistant", "safa", "null", "undefined",
]);

function originAllowed(origin) {
  if (!origin) return true;
  if (origin === PROD_ORIGIN) return true;
  if (/^https:\/\/([a-z0-9-]+--)?glittering-elf-6e046e\.netlify\.app$/.test(origin)) return true;
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;
  return false;
}

function partnerStore() {
  const isProd = process.env.CONTEXT === "production";
  return isProd
    ? getStore({ name: "partners", consistency: "strong" })
    : getDeployStore({ name: "partners", consistency: "strong" });
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function secretMatches(given) {
  const want = process.env.STUDIO_KEY || "";
  if (!want || typeof given !== "string" || given.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

async function ipKey(ip) {
  const bytes = new TextEncoder().encode("bwp:" + ip);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].slice(0, 8)
    .map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}

/* Must produce something script.js will accept: /^[a-z0-9][a-z0-9_-]{1,23}$/ */
function slug(name) {
  const s = String(name)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/-+$/, "")
    .slice(0, 20);
  return s;
}

function validCode(c) {
  return /^[a-z0-9][a-z0-9_-]{1,23}$/.test(c);
}

export default async function handler(req, context) {
  const store = partnerStore();

  /* ---- Studio: list partners (authed) ---- */
  if (req.method === "GET") {
    if (!secretMatches(req.headers.get("x-studio-key"))) {
      return json({ error: "unauthorised" }, 401);
    }
    const { blobs } = await store.list({ prefix: "p/" });
    const partners = await Promise.all(blobs.map(async function (b) {
      return (await store.get(b.key, { type: "json" })) || null;
    }));
    const clean = partners.filter(Boolean).sort(function (a, b) { return b.at - a.at; });
    return json({ partners: clean });
  }

  /* ---- Studio: remove a partner (authed) ----
     Signup is open to anyone, so there has to be a way to undo one — a
     spammer, a duplicate, or a test row. Removing the record does not
     invalidate the code itself (referral tracking validates format, not
     membership), but it removes the claim to be paid, which is the part that
     matters. */
  if (req.method === "DELETE") {
    if (!secretMatches(req.headers.get("x-studio-key"))) {
      return json({ error: "unauthorised" }, 401);
    }
    let body;
    try { body = await req.json(); } catch (e) { return json({ error: "bad json" }, 400); }
    if (!validCode(body && body.code)) return json({ error: "bad code" }, 400);
    await store.delete("p/" + body.code);
    return json({ ok: true });
  }

  if (req.method !== "POST") return json({ error: "GET, POST or DELETE only" }, 405);
  if (!originAllowed(req.headers.get("origin"))) return json({ error: "forbidden" }, 403);

  let body;
  try { body = await req.json(); } catch (e) { return json({ error: "bad json" }, 400); }

  /* Honeypot — a real person never fills a hidden field. */
  if (typeof body.company === "string" && body.company.trim()) {
    return json({ error: "no" }, 400);
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, MAX_NAME) : "";
  const email = typeof body.email === "string" ? body.email.trim().slice(0, MAX_EMAIL) : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, MAX_NOTE) : "";

  if (!name) return json({ error: "Please give a name." }, 400);
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    return json({ error: "That email doesn't look right." }, 400);
  }

  const base = slug(name);
  if (base.length < 2) {
    return json({ error: "Please use a name with at least a couple of letters or numbers." }, 400);
  }
  if (RESERVED.has(base)) {
    return json({ error: "That name is reserved — try adding a surname or initial." }, 400);
  }

  const ip = (context && context.ip) || req.headers.get("x-nf-client-connection-ip") || "unknown";
  const qKey = "q/" + (await ipKey(ip));
  const now = Date.now();
  const q = (await store.get(qKey, { type: "json" })) || { n: 0, at: now };
  if (now - q.at > 864e5) { q.n = 0; q.at = now; }
  if (q.n >= MAX_PER_IP_PER_DAY) {
    return json({ error: "That's a few signups from here today. Message the studio on WhatsApp and it'll be sorted by hand: https://wa.me/447735785911" }, 429);
  }

  /* First free code wins. Suffixing keeps the link human — dan, dan-2, dan-3 —
     rather than falling back to something random the partner won't remember. */
  let code = "";
  for (let i = 1; i <= MAX_COLLISION_TRIES; i++) {
    const candidate = i === 1 ? base : (base + "-" + i).slice(0, 24);
    if (!validCode(candidate)) continue;
    const taken = await store.get("p/" + candidate, { type: "json" });
    if (!taken) { code = candidate; break; }
  }
  if (!code) {
    return json({ error: "Couldn't find a free code for that name — try adding an initial." }, 409);
  }

  await store.setJSON("p/" + code, {
    code: code, name: name, email: email, note: note, at: now,
  });
  q.n += 1;
  await store.setJSON(qKey, q);

  /* Notify the studio through the existing form-email path — same trick the
     live chat uses, so no outbound email service is needed. Best effort. */
  try {
    await fetch((process.env.URL || PROD_ORIGIN) + "/", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        "form-name": "partner",
        "partner": name,
        "code": code,
        "email": email,
        "note": note || "(none)",
      }).toString(),
    });
  } catch (e) { /* the partner is already saved; the email is a courtesy */ }

  return json({ ok: true, code: code, link: PROD_ORIGIN + "/?ref=" + code });
}

export const config = { path: "/api/partner" };
