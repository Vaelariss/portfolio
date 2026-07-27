# Brickwork Studio

Marketing site for **Brickwork Studio** — an independent UK studio building
Shopify stores, local-business websites and AI receptionists for small
businesses.

🔗 **Live:** https://brickworkstudio.net
📸 **Instagram:** [@brickworkstudio_](https://www.instagram.com/brickworkstudio_)

## Deploying

⚠️ **This repo is NOT connected to Netlify.** Pushing to GitHub does not deploy
anything. The site is published by manual CLI deploy:

```bash
npx netlify-cli deploy --prod --dir=. --site=9ed499f3-899c-46d1-bc32-5a0b87529e04
```

Always draft-deploy first (drop `--prod`) and check the preview URL — redirect
rules in particular do not fail loudly.

Netlify project: `glittering-elf-6e046e` · account: robinmarwa44@gmail.com

> This disconnect is why several pages vanished once: an earlier deploy
> contained `guides.html` and the four service pages, and a later CLI deploy
> from this folder — which never had them — silently removed them. Google still
> had them indexed. If you rebuild those pages, remove the matching 301s from
> `_redirects`.

## Structure

| File | Purpose |
|------|---------|
| `index.html` | The entire landing page |
| `styles.css` / `script.js` | Shared styles + behaviour |
| `thanks.html` | Post-submission page. The conversion signal — a pageview here means a lead arrived |
| `404.html` | Branded not-found page that routes back into the funnel |
| `demo/bloom-ember.html` | Demo build — handmade candle brand (Shopify concept) |
| `demo/aurum-jewels.html` | Demo build — jewellery brand (Shopify concept) |
| `demo/fade-district.html` | Demo build — barbershop (brochure concept) |
| `privacy.html` / `terms.html` | Legal pages (both `noindex`) |
| `_redirects` | 301s for every dead path, demo relocation, `/hi` outreach link |
| `_headers` | CSP + security headers, and `noindex` for `/demo/*` |
| `robots.txt`, `sitemap.xml` | Crawl / indexing |

"Parallax" (linked from the Work section) is a real live Shopify store; the
three `demo/` pages are concept builds for fictional brands.

## Two things that will bite you

**1. The CSP lives in four files.** Any new script, endpoint or embed must be
allowed in *all* of them or it is silently blocked — the header and meta
policies intersect, and the most restrictive wins:

- `_headers` (line 2) — applies site-wide
- `index.html` (line 5), `privacy.html` (line 5), `terms.html` (line 5)
- plus `404.html` and `thanks.html`, and each `demo/*.html` (`script-src 'none'`)

**2. The demo pages are deliberately `noindex`.** They were pulling ~86% of the
site's search impressions for queries like "bloom candles" and "aurum norwich" —
people shopping for candles and jewellery, who convert at zero and who taught
Google this domain is about those things rather than web design. They stay
fully browsable from the Work section. Do **not** add `Disallow: /demo/` to
`robots.txt`: blocking the crawl stops Google seeing the `noindex`, and the
indexed URLs would linger indefinitely.

## Where leads go

The contact form posts natively to **Netlify Forms** (form name: `contact`) and
lands the visitor on `/thanks`. Submissions are stored in the Netlify dashboard
under Forms, independent of email delivery.

⚠️ **Set up a form notification** in Netlify → Forms → Settings, otherwise
submissions sit in the dashboard with nothing telling you they arrived.

Alternative contact paths on the page: WhatsApp (07735 785911), email, and
Instagram DM.

## Tech

Hand-written static HTML/CSS/JS — no build step, no dependencies, self-hosted
fonts in `fonts/`. No analytics is installed yet.

## Still to do

- **Analytics.** Nothing is tracked, so there is no way to know how many people
  reach the form and abandon it. Plan: Umami/Plausible proxied through
  `_redirects` (`/js/script.js` → the vendor) so the same-origin `script-src
  'self'` policy needs no change. Stub rules are already commented in
  `_redirects`.
- **`hello@brickworkstudio.net`.** The domain has no MX records, so it cannot
  receive mail. A personal Gmail is published in the meantime.
- **Service and guide pages.** `/shopify-store-design`, `/local-business-websites`,
  `/ai-receptionist`, `/custom-built-systems` and `/guides` currently 301 to
  homepage sections.
- **Testimonials.** None shown; add once there is genuine client feedback.
