# Nine2Five — Session Handover

> State as of 2026-06-15. Pick up from here in the next session.

---

## 2026-06-15 — Affiliate system fixes (LIVE repo: `scaledsolutionsnz-sketch/nine2five-store`)

> The affiliate system lives in the **nine2five-store** Next.js repo (serves nine2five.nz), NOT this static prototype. The work below was done there and is **now live in production** (merged PR #1 → `main`, commit `3d421e1`, prod build green).

### Click counter fix (symptom: dashboard showed 0 clicks despite real traffic)
- **Root cause:** `src/app/api/affiliates/track/route.ts` fired the click insert + `increment_affiliate_clicks` RPC *after* the HTTP response (fire-and-forget `.then()`), so Vercel froze the function before it ran → `affiliates.total_clicks` never incremented. Both the affiliate dashboard and admin displayed that broken counter (16 real `affiliate_clicks` rows, counters all 0).
- **Fix:**
  - `track/route.ts`: **awaited** the insert + increment before responding.
  - `affiliate/dashboard/page.tsx` + `api/admin/affiliates/route.ts`: display clicks/conversions/commission **derived from the actual `affiliate_clicks` / `affiliate_conversions` rows** (single source of truth), overriding the cached counter server-side.
  - **Backfill** (idempotent, on prod data): `total_clicks` set to real counts — `wiremubartlett 0→12`, `moo 0→3`; conversions/commission all 0 (none yet).

### Checkout attribution hardening (dual-path)
- `create-payment-intent`: now reads the `n2f_ref` cookie **server-side** and sets `metadata.affiliate_code` at PaymentIntent **creation** (not only the client PATCH), so Stripe Link / wallet express checkout can't bypass attribution. PATCH prefers the server cookie too.
- `affiliate-tracker.tsx`: `n2f_ref` cookie now `Domain=.nine2five.nz` + `Secure` in prod (carries across **www ↔ apex**); host-only on preview/localhost. `SameSite=Lax`, 30-day unchanged.

### NEW OPEN ITEM (NOT fixed — recorded so it isn't lost)
**Pure express / Stripe Link checkout produces orders missing line items, email, and shipping address.** The order-building metadata (`items`, `email`, `shippingAddress`) is only set by the client `handleSubmit` PATCH, not at PI creation. If a buyer confirms via an express/Link button that skips `handleSubmit`, the webhook builds an order with no `order_items`, empty `guest_email`, and empty `shipping_address`. (Affiliate `affiliate_code` + `subtotal` *are* now set at creation, so attribution/commission survive — but the order record is incomplete.) Fix: set items/email/shipping server-side at creation or via a dedicated express-checkout handler. Same class as the prototype's old Stripe Link bypass.

---

## 2026-06-15 — Visitor tracking fix: `site_sessions` table was missing in prod (nine2five-store)

> Symptom: admin dashboard showed **0 LIVE / 0 visitors today** and a blank conversion rate ("awaiting session data").

- **Root cause:** `api/analytics/ping` (visitor write, via `sendBeacon` from `components/storefront/visitor-tracker.tsx`) upserts into `public.site_sessions`, and `api/admin/live-stats` reads counts from it — but **`site_sessions` was never created by any migration**. Every ping returned 500 ("Could not find the table 'public.site_sessions'"), so no rows were ever written and the dashboard counts fell back to 0 / `tracking_error`. (The write itself was correctly *awaited* — NOT the fire-and-forget pattern.)
- **Fix:** new migration **`supabase/migrations/014_site_sessions.sql`** creates `site_sessions (session_id text PK, page text, last_seen timestamptz default now(), created_at timestamptz default now())` + indexes on `last_seen` and `created_at`. Columns match the ping upsert + live-stats counts exactly; **no app code changed**. Applied to prod `wfbwnkqevjibfdjqoifp` via the Management API; migration file on branch `fix-site-sessions-table` (PR #2).
- **Verified:** live `POST /api/analytics/ping` went 500 → **200 `{ok:true}`**, a row was written (defaults populated), and the live-stats count queries returned `live_now/today/month` with no error. Test row cleaned up (table back to 0, ready for real traffic).

### ⚠️ Recurring pattern: "code shipped ahead of schema"
This is the **third** instance of frontend/code referencing a DB column/table that was never migrated to prod:
1. `/join` signup → `affiliates.terms_accepted_at` missing (fixed, migration 013).
2. Visitor tracking → `site_sessions` table missing (fixed, migration 014).
3. (Watch) any new column/table a feature writes — **confirm it exists in prod `wfbwnkqevjibfdjqoifp` before shipping.** Migrations in `nine2five-store/supabase/migrations/` are NOT auto-applied by Vercel; they must be run against prod manually (Management API / `sbp_` token).

---

## 2026-06-15 — Admin Affiliates: delete (soft-delete) + dashboard RLS fix + layout (nine2five-store)

> All live in prod. Earlier 2026-06-15 fix: the affiliate **dashboard** showed 0 clicks because the row-count read ran through `createServiceClient` (@supabase/ssr), which inherits the logged-in user's JWT and runs under RLS — `affiliate_clicks` has no SELECT policy for a regular affiliate. Fixed by reading counts via a **true service-role client** (no cookies) + added a Refresh button (prod commit `c9c22de`). See the `createServiceClient` footgun note in memory.

### Affiliate delete = SOFT-DELETE (archive), not hard-delete
- The admin Affiliates page (`/admin/affiliates`) had a `DELETE` that **hard-deleted**. That's unsafe: `affiliate_clicks` FK is **ON DELETE CASCADE** (would destroy the affiliate's tracked clicks), and `affiliate_conversions`/`affiliate_payouts` are **ON DELETE RESTRICT** (blocks deletion). 
- Now **soft-delete**: the per-row **Archive** action opens a confirm dialog showing the affiliate's **attached clicks + conversions counts**, then sets `affiliates.archived_at` (migration **`015_affiliate_archived_at.sql`**, applied to prod). The list GET filters `archived_at is null`. Tracking data is **preserved**; reversible (clear `archived_at`). Admin-only + audit-logged (`affiliate.archived`). Verified: archiving kept the click rows intact and hid the row. Prod commit `b302114`.

### Layout polish
- Affiliates table: consistent 20px horizontal padding (header + cells align), taller/comfortable rows (18px vertical), tidied header + KPI-card padding. Visual only — data/columns unchanged.

### ⚠️ Still TODO (separate admin decision): dedupe duplicate affiliates
There are duplicate affiliate records — **two Gene Bartlett** (`gbartlett`, `genebartlett`) and **two Wiremu** (`moo` ~9 clicks, `wiremubartlett` 12 clicks). NOT merged/deleted automatically. Decide which to keep; archiving the other now preserves its clicks (no orphaning). True merge (reassigning clicks/conversions to the kept affiliate) would need a separate migration/script.

---

## What Was Completed This Session

### 1. Stripe Link shipping bypass fix
**Problem:** Stripe Link (express checkout) has its own confirmation flow that bypasses the pay button click handler in `checkout.html`. When a customer used Stripe Link, the shipping and contact data in `confirmPayment()` never ran — so `pi.shipping` was null when the webhook fired, and orders landed in Supabase with no name, email, or address.

**Fix:**
- `checkout.html` — added `syncCustomerData()` function. Fires debounced (1500ms) on any contact/address field `input` event, and immediately when a shipping rate is selected. Calls `POST /api/update-payment-intent?action=shipping` to write customer data server-side to the PI before any payment method can confirm.
- `api/update-payment-intent.js` — added `?action=shipping` handler. Writes `pi.shipping`, `pi.receipt_email`, and full metadata (`shippingAddress` JSON, `customer_email`, `customer_name`, `country`, `shipping`, `subtotal`, `discount_amount`) to the PI via `stripe.paymentIntents.update()`.
- `api/stripe-webhook.js` — updated to read `pi.shipping` (server-side) as source of truth, with `pi.metadata.*` as fallback. Fixed column names (`stripe_payment_intent_id`, `guest_email`, `total` in cents, `subtotal`, `shipping_cost`, `discount_amount_cents`, `shipping_address`). Adds `notes` field when address not captured.

### 2. NZ Post eShip order import fix
**Problem:** Orders imported into eShip (eship.nzpost.co.nz) showed unit price $0.00, weight 1.000g, and the wrong (large) package was checked instead of the Default preset.

**Fix:**
- `api/stripe-webhook.js` — now auto-pushes each new order to eShip immediately after Stripe payment succeeds, via `POST https://api.myeship.co/rest/order`. Hardcoded: `price: '20.00'`, `weight: '65'` (grams), parcel `18×28×5 cm, 0.12 kg` (Default package).
- `api/nzpost.js` — added `?action=push_orders` handler + `buildEshipPayload()` helper. Fetches all `status=processing` orders from Supabase and pushes each to eShip. Same hardcoded values.
- `admin.html` — added "Push to eShip" button in the header that calls `?action=push_orders` and alerts with results.

### 3. Follow-up fixes and verification

- **NZ free shipping for 7+ pairs** — `api/shipping-quote.js` `nzRate()` now returns `{ service: 'Free Standard', price: 0.00 }` for 7+ pairs (was a fallthrough returning undefined). `checkout.html` updated to render `$0` as "Free" in both the rate selector and order summary.
- **`nzpost.js` order_num bug** — `buildEshipPayload()` was using `String(order.id)` as the eShip order number. Fixed to `String(order.order_number || order.id)` so the displayed order number in eShip matches the Supabase order number.
- **Custom domain verified** — `nine2five.nz` → Vercel via Cloudflare DNS (A `76.76.21.21`). Updated in `PROJECT_CONTEXT.md`.
- **`checkout.js` status confirmed** — Active, used for gift card purchases in `index.html`. Not legacy. Do not remove.
- **CRM table schemas** — Could not verify (production Supabase project not accessible via MCP). Still UNKNOWN — ask Moo.

---

## Manual Steps Still Pending (for Moo)

### Re-import orders 1065–1068 into eShip with correct data

The 4 existing eShip orders were imported with wrong unit price ($0) and wrong weight (1g). They need to be re-imported.

**Steps:**
1. Go to [eship.nzpost.co.nz](https://eship.nzpost.co.nz)
2. Delete orders **1065, 1066, 1067, 1068** from the eShip portal (use the Actions menu or checkboxes on each order)
3. Go to the Nine2Five admin panel
4. Click **"Push to eShip"** button (top right of admin, next to Refresh)
5. Confirm the alert shows 4 orders pushed successfully

### Email Ben O'Donovan for his shipping address

Order #1059 was placed via Stripe Link — no address was captured.
- Customer: **Ben O'Donovan**
- Email: **benodonovannz@hotmail.com**
- Items: White Kahotea ×1, Grey Kahotea ×2, Toa Whenua ×1, Tino Rangatiratanga ×1 (all size 10–13)
- The Supabase order record (#1059) was manually updated this session with the correct email and notes, but `shipping_address` is still `{}` — it needs his actual address before the order can be fulfilled.

---

## Known Gotchas Discovered This Session

### Stripe Link bypass pattern
Stripe Link auto-confirms without going through `confirmPayment()`. Any data you set in `confirmPayment()` (shipping, billing, receipt_email) is silently ignored. The only reliable way to capture this data is to write it to the PaymentIntent server-side **before** the customer reaches the payment step. The `syncCustomerData()` debounce approach is now in place.

### Two Supabase projects
- `wfbwnkqevjibfdjqoifp` — Nine2Five store (orders, inventory, CRM). This is on the Pro org under `nine2fiveconz-max`.
- `bffddgypusotsdwpaliy` — Scaled Solutions CRM (separate project). The Supabase MCP is connected to the Scaled Solutions org — it cannot access the Nine2Five Supabase directly. Use REST API calls with the service key for Nine2Five Supabase operations.

### Two GitHub accounts
Default `gh` auth is `scaledsolutionsnz-sketch`. Pushing to `nine2fiveconz-max/Nine2Five` requires:
```bash
GITHUB_TOKEN=$(gh auth token --user nine2fiveconz-max) git push origin main
```

### eShip unit price / weight are duplicated
The hardcoded values (`$20`, `65g`, `18×28×5cm`) exist in **two places**:
- `api/nzpost.js` lines 8–11 (constants `UNIT_PRICE_NZD`, `ITEM_WEIGHT_G`, `DEFAULT_PARCEL`)
- `api/stripe-webhook.js` inline in the eShip push block (~lines 88–128)

If prices change, update both files.

### Vercel Hobby function limit
Exactly 12 serverless functions in `api/`. Cannot add more top-level `.js` files without removing one. Subdirectories (e.g. `api/lib/`) do not count as functions and can be used for shared helpers.

### macOS Desktop inaccessible via Bash
Shell cannot `cd` to `~/Desktop` or read files there via Bash due to macOS privacy restrictions. Use `Read`/`Edit` tools directly for files on Desktop, or clone repos to `/tmp` or `~/projects`.

### `checkout.js` vs `payment-intent.js`
There are two Stripe-related checkout initialisation files. `checkout.js` creates a Checkout Session and is **active** — used for gift card purchases linked from `index.html`. `payment-intent.js` creates a Payment Intent (current main checkout flow used by `checkout.html`). Do not remove `checkout.js`.

---

### Supabase project discrepancy
The Supabase MCP connects to project `dquwyyczsrxzbdtdemcc`, which has a completely different schema from what the deployed Nine2Five app expects (UUID `id` on orders instead of integer, no `inventory` table, no CRM tables). The production app uses `wfbwnkqevjibfdjqoifp` (configured via the `SUPABASE_URL` env var in Vercel). The MCP cannot access the production project. **Always use direct REST API calls with the service key** for any Nine2Five Supabase work — do not use the Supabase MCP tool for this repo.

---

## Anything Half-Done / Decided But Not Built

Nothing known half-done. The CRM (Scaled Solutions, separate repo) had a `saveField` false-success toast fix and Gemini 503 retry logic updated this session — those are separate from Nine2Five.

---

## Repo Location

```
~/projects/nine2five   ← permanent copy (moved from /tmp/Nine2Five this session)
```
