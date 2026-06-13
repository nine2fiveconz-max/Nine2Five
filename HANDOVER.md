# Nine2Five — Session Handover

> State as of 2026-06-11. Pick up from here in the next session.

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

### Supabase project discrepancy (corrected 2026-06-14)
The plugin Supabase MCP connects to project `dquwyyczsrxzbdtdemcc` (a different org) and **cannot reach production** (`wfbwnkqevjibfdjqoifp`, set via `SUPABASE_URL` in Vercel).

**Earlier handover notes about production were wrong.** Verified directly against production on 2026-06-14:
- `orders.id` is **`uuid`** (`gen_random_uuid()`), NOT integer. The integer human order number is a separate column, **`order_number`** (`nextval('order_number_seq')`, latest ~1071).
- Production **does** contain CRM-style tables (`customers`, `customer_notes`, `customer_tags`) and a **full affiliate schema** (`affiliates`, `affiliate_conversions`, `affiliate_clicks`, `affiliate_payouts`, `ambassador_applications`). See PROJECT_CONTEXT.md.
- Note: `crm.js` references `crm_contacts`/`crm_notes`/`crm_pipeline`, which **do not exist** under those names — likely a latent bug, separate from the affiliate work.

For production DDL use the **Management API** with a Supabase personal access token (`sbp_…`). For CRUD use REST with the service key. Do not rely on the Supabase MCP for this repo.

---

## Anything Half-Done / Decided But Not Built

Nothing known half-done. The CRM (Scaled Solutions, separate repo) had a `saveField` false-success toast fix and Gemini 503 retry logic updated this session — those are separate from Nine2Five.

---

## Repo Location

```
~/projects/nine2five   ← permanent copy (moved from /tmp/Nine2Five this session)
```
