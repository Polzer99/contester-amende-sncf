# Security Audit — contester-amende-sncf

**Date:** 2026-03-31
**Auditor:** Claude Code (automated)
**Scope:** Full codebase review (API, client-side, infrastructure, payment, data)

---

## CRITICAL FINDINGS

### 1. Hardcoded API Credentials in `send-reclamation.js` (COMMITTED TO GIT)

**Severity:** CRITICAL
**File:** `/send-reclamation.js` (tracked in git history)
**Issue:** The Merci Facteur `SERVICE_ID` and `SECRET_KEY` are hardcoded in plaintext:
```
const SERVICE_ID = 'public-e45e0301a9e312242be7b2430ed4776208f649e2b7067af25e926272654bf4d1...'
const SECRET_KEY = 'secret-417806980060ca913620ba2cb09a653de8a27a2bd10f56507609036b0a27cc58...'
```
This file also contains personal data: full name, home address, phone details.

**Status:** PARTIALLY FIXED
- Added `send-reclamation.js` to `.gitignore` to prevent future commits.
- **ACTION REQUIRED (manual):** These credentials are permanently in git history. You MUST:
  1. Rotate the Merci Facteur API keys immediately via their dashboard
  2. Consider using `git filter-branch` or BFG Repo Cleaner to purge the file from git history
  3. If this repo is public or was ever public, treat all keys as compromised

### 2. `node_modules/` Committed to Git

**Severity:** HIGH
**Issue:** The entire `node_modules/` directory is tracked in git (Stripe SDK and dependencies).
**Status:** PARTIALLY FIXED
- Added `node_modules/` to `.gitignore`.
- **ACTION REQUIRED (manual):** Run `git rm -r --cached node_modules/` to untrack, then commit.

---

## HIGH FINDINGS

### 3. No Payment Verification Before Sending Letter

**Severity:** HIGH
**File:** `/api/send-letter.js`
**Issue:** The `send-letter` endpoint had no mechanism to verify that a Stripe payment was completed before triggering the (paid) Merci Facteur LRAR send. Anyone could call `POST /api/send-letter` with form data and trigger a real letter send at your expense.

**Status:** FIXED
- Added `verifyStripePayment()` function that checks the Stripe session status via the API.
- The handler now requires a `stripe_session_id` in the request body and verifies `payment_status === "paid"` before proceeding.
- **ACTION REQUIRED:** Update the client-side flow (or webhook) to pass the `stripe_session_id` when calling `/api/send-letter`.

### 4. No Stripe Webhook for Reliable Payment Confirmation

**Severity:** HIGH
**Issue:** The current flow relies on the client redirecting to a success page after Stripe Checkout. There is no server-side webhook (`checkout.session.completed`) to reliably trigger the letter send. A user could close the browser before redirect and the letter would never send.

**Status:** NOT FIXED (requires external setup)
**ACTION REQUIRED:**
1. Create a `/api/stripe-webhook.js` endpoint
2. In Stripe Dashboard, configure a webhook for `checkout.session.completed` pointing to `https://contester-amende-sncf.vercel.app/api/stripe-webhook`
3. Verify the webhook signature using `STRIPE_WEBHOOK_SECRET`
4. On verified payment, call the Merci Facteur send logic
5. This is the **only reliable way** to ensure letters are sent after payment

### 5. No Rate Limiting on API Endpoints

**Severity:** HIGH
**Files:** All `/api/*.js` endpoints
**Issue:** No rate limiting is implemented. An attacker could:
- Spam `/api/extract-ticket` to burn through your Anthropic API credits
- Spam `/api/create-checkout` to create thousands of Stripe sessions
- Spam `/api/send-letter` (mitigated now by payment check, but still a concern)

**Status:** NOT FIXED (requires infrastructure)
**ACTION REQUIRED:**
- Option A: Use Vercel's built-in rate limiting (Vercel Firewall on Pro plan)
- Option B: Add `Upstash Redis`-based rate limiting (free tier available):
  ```
  npm install @upstash/ratelimit @upstash/redis
  ```
  Then wrap each handler with a per-IP rate limiter (e.g., 10 requests/minute for extract-ticket, 5/minute for create-checkout)

---

## MEDIUM FINDINGS

### 6. No CORS Configuration

**Severity:** MEDIUM
**Issue:** No CORS headers are set. While Vercel defaults to same-origin for serverless functions, explicit CORS configuration is recommended to prevent cross-origin API abuse.

**Status:** PARTIALLY ADDRESSED
- Security headers added to `vercel.json` and individual API handlers.
- **ACTION REQUIRED (optional):** If you want to restrict API calls to your domain only, add explicit CORS checking in each handler:
  ```js
  const origin = req.headers.origin;
  if (origin !== "https://contester-amende-sncf.vercel.app") {
      return res.status(403).json({ error: "Forbidden" });
  }
  ```

### 7. No Content-Security-Policy Headers

**Severity:** MEDIUM
**Issue:** No CSP headers were configured, leaving the site vulnerable to XSS via injected scripts.

**Status:** FIXED
- Added comprehensive CSP headers in `vercel.json`:
  - `default-src 'self'`
  - `script-src 'self' 'unsafe-inline' https://js.stripe.com`
  - `connect-src 'self' https://api.stripe.com`
  - `frame-src https://js.stripe.com`
  - Additional security headers: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy`

### 8. HTML Injection in Letter Template

**Severity:** MEDIUM
**File:** `/api/send-letter.js` - `generateLetterHtml()`
**Issue:** User-supplied data (name, address, etc.) was injected directly into an HTML template without sanitization. A malicious user could inject HTML/script tags into the generated letter.

**Status:** FIXED
- Added `sanitizeHtml()` function that escapes `&`, `<`, `>`, `"`, `'`
- Added `sanitizeInput()` function that strips HTML tags and limits field length to 500 chars
- All user inputs are now sanitized before HTML template injection and before processing

### 9. No Input Validation on `create-checkout.js`

**Severity:** MEDIUM
**File:** `/api/create-checkout.js`
**Issue:** No validation of required fields before creating a Stripe session.

**Status:** FIXED
- Added validation for required fields (`prenom`, `nom`, `email`)
- Returns 400 if missing

---

## LOW FINDINGS

### 10. No Image Size Validation on Upload

**Severity:** LOW
**File:** `/api/extract-ticket.js`
**Issue:** No validation of image size or media type, allowing arbitrarily large payloads or unexpected file types.

**Status:** FIXED
- Added 10MB max size check on base64 image data
- Added whitelist of allowed media types (`image/jpeg`, `image/png`, `image/webp`, `image/gif`)

### 11. Price Hardcoded Server-Side (Good)

**Severity:** INFO (no issue)
**File:** `/api/create-checkout.js`
**Finding:** The price (`unit_amount: 1490` = 14.90 EUR) is hardcoded server-side in `buildStripeParams()`. This is correct -- the client cannot manipulate the price. No fix needed.

### 12. No Data Persistence (Good for RGPD)

**Severity:** INFO (no issue)
**Finding:** The application does not store any personal data in a database. Data flows through the API endpoints in memory only:
- Photo is sent to Anthropic for extraction (not stored)
- Form data is passed to Stripe as metadata and to Merci Facteur for the letter
- No server-side storage of PII
This aligns with the RGPD claims in the mentions legales.

### 13. `.env` File Not Present (Good)

**Severity:** INFO (no issue)
**Finding:** No `.env` file exists in the project directory. Environment variables appear to be managed via Vercel dashboard. The `.env.example` file contains only placeholder values.

---

## SUMMARY OF FIXES APPLIED

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | Hardcoded credentials in send-reclamation.js | CRITICAL | Partially fixed (.gitignore updated) |
| 2 | node_modules/ in git | HIGH | Partially fixed (.gitignore updated) |
| 3 | No payment verification on send-letter | HIGH | FIXED (Stripe session check added) |
| 4 | No Stripe webhook | HIGH | Not fixed (requires external setup) |
| 5 | No rate limiting | HIGH | Not fixed (requires infrastructure) |
| 6 | No CORS config | MEDIUM | Partially addressed |
| 7 | No CSP headers | MEDIUM | FIXED (vercel.json) |
| 8 | HTML injection in letter | MEDIUM | FIXED (sanitization added) |
| 9 | No input validation on checkout | MEDIUM | FIXED |
| 10 | No image size validation | LOW | FIXED |

## MANUAL ACTIONS REQUIRED (Priority Order)

1. **IMMEDIATE:** Rotate Merci Facteur API keys (they are in git history)
2. **IMMEDIATE:** Run `git rm -r --cached node_modules/ send-reclamation.js` then commit
3. **IMMEDIATE:** Consider using BFG Repo Cleaner to purge secrets from git history
4. **HIGH:** Set up Stripe webhook endpoint for reliable payment-to-send flow
5. **HIGH:** Implement rate limiting (Upstash Redis or Vercel Firewall)
6. **MEDIUM:** Verify Vercel environment variables are scoped properly (production only for live keys)
7. **MEDIUM:** Add explicit CORS origin checking if desired

---

## FILES MODIFIED

- `.gitignore` — Added `node_modules/`, `send-reclamation.js`, `.env.*` patterns
- `vercel.json` — Added security headers (CSP, X-Frame-Options, etc.)
- `api/extract-ticket.js` — Added image size/type validation, security headers
- `api/create-checkout.js` — Added input validation, security headers
- `api/send-letter.js` — Added payment verification, input sanitization, HTML escaping, field validation, security headers
