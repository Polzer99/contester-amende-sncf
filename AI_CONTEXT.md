# AI_CONTEXT.md — contester-amende-sncf
> First reflex every session: read this first. Doctrine: Parrit AI Playbook (REGLES-DOR §33).

## 1. Architecture state
Static landing site (`contester-amende-sncf/index.html` + `static/css`,`static/js/main.js`) + 3 Vercel serverless functions in `api/` (ESM, Node). Stack: `pdf-lib` + `stripe`-style raw `fetch` calls; no DB, no framework. Flow: user uploads a photo → `POST /api/extract-ticket` (Anthropic Claude vision → JSON fields) → form → `POST /api/create-checkout` (Stripe Checkout, price hardcoded server-side at `unit_amount: 1490`) → Stripe redirects to `contester-amende-sncf/merci/index.html`, which calls `POST /api/send-letter` with the `session_id`. `send-letter.js` re-verifies `payment_status === "paid"` on the Stripe session, generates the contestation PDF, and sends a real registered letter (LRAR) via Merci Facteur. Routing/headers in `vercel.json` (CSP + security headers, `/` → `/contester-amende-sncf/`). **This is live, money-moving, paid-action code.**

## 2. Risk zones — DO NOT TOUCH without care
- **Letter-send is triggered only by the client success page**, not a server webhook. `contester-amende-sncf/merci/index.html:124` fires `POST /api/send-letter` with `session_id` from the URL. If the user closes the browser before the Stripe redirect, the paid letter never sends (paid-but-undelivered data-loss path). Audit finding #4 — still open.
- **No rate limiting on any `api/*.js`** (audit #5, open). `extract-ticket.js` burns Anthropic credits per call; `create-checkout.js` can spawn unlimited Stripe sessions. Both are public, unauthenticated POST endpoints.
- **`api/send-letter.js`** is the most sensitive file: it spends real money (Merci Facteur LRAR). It is gated only by `session.payment_status !== "paid"`. The replay guard is a Stripe metadata flag (`letter_sent === "true"` at `:190`) set via `markSessionAsSent` — not transactional, so a race / concurrent calls on the same `session_id` could double-send.
- **Secrets live only in `process.env`** (`STRIPE_SECRET_KEY`, `MF_PUB_KEY`/`MF_SEC_KEY`, `ANTHROPIC_API_KEY`) — DO NOT inline any value. `MF_ID_USER = 31590` and the SNCF recipient address in `send-letter.js` are non-secret constants and intentional.
- **Git-history secret (out-of-repo action):** `send-reclamation.js` (now `.gitignore`d, absent from this snapshot) historically contained **full Merci Facteur `SERVICE_ID`/`SECRET_KEY` plus personal data, committed to git history** (see `SECURITY-AUDIT.md` #1). Rotation + history purge is a manual action that **must be confirmed done** (global audit §2 flags it as unverifiable from this snapshot). Never reintroduce keys into source.
- **No env fail-fast:** `extract-ticket.js` returns 500 if `ANTHROPIC_API_KEY` missing (ok); `send-letter.js` throws if MF keys missing (ok); but Stripe calls don't pre-check `STRIPE_SECRET_KEY` and will silently produce a Stripe error — verify env before edits.

## 3. Established rules — what's already true/enforced
- **Server-side price** (`unit_amount: 1490` in `create-checkout.js`) — client cannot manipulate amount. Keep it server-side.
- **Server-side payment verification** before any paid action: `send-letter.js` re-fetches the Stripe session and requires `payment_status === "paid"` (audit #3, fixed).
- **No PII persistence** — data flows in-memory only (photo → Anthropic, fields → Stripe metadata → Merci Facteur). No DB, aligned with the RGPD claim in `mentions-legales/`. Keep it that way.
- **Input sanitization** in `send-letter.js` (`s()` strips HTML tags + 500-char cap) before PDF/letter injection (audit #8, fixed); `extract-ticket.js` enforces 10MB cap + media-type whitelist (#10, fixed); `create-checkout.js` validates `prenom`/`nom`/`email` (#9, fixed).
- **Security headers / CSP** centralized in `vercel.json` + per-handler `X-Content-Type-Options`/`X-Frame-Options`.
- **`.gitignore`** excludes `.env*` (except `.env.example`), `node_modules/`, `*.pdf`, and `send-reclamation.js`.
- **Intentional exception:** `send-letter.js` reads `req.body.session_id` whereas `SECURITY-AUDIT.md` #3 wrote `stripe_session_id` — the running contract is `session_id` (matches the merci page); the doc wording is stale, the code is the source of truth.

## 4. Open debt (per `docs/ai-playbook/audits/GLOBAL-AUDIT-2026-06-21.md`)
- **Stripe webhook missing (audit #4, HIGH, open):** add `api/stripe-webhook.js` handling `checkout.session.completed` with `STRIPE_WEBHOOK_SECRET` signature check, and move the letter-send trigger there so it no longer depends on the browser reaching `/merci/`.
- **Rate limiting missing (audit #5, HIGH, open):** add per-IP limits (Upstash Redis or Vercel Firewall) to all three endpoints — tightest on `extract-ticket` and `send-letter`.
- **No CI barrier (E12):** repo has **no `.github/`** — no lint/secret-scan/build gate. Add the Playbook 4-gate CI (Codex lane).
- **No `AI_CONTEXT.md` (E11)** — this file closes that gap; keep it current.
- **No Dependabot (E13):** add `dependabot.yml` (npm + github-actions ecosystems).
- **Confirm Merci Facteur key rotation + git-history purge** (BFG/`filter-branch`) for the historically leaked `send-reclamation.js` credentials — manual, out-of-repo, status unverified.