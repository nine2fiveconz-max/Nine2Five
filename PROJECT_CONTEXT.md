# Nine2Five — Project Context

> Verified by reading files and running commands. Anything unverifiable is marked **UNKNOWN — ask Moo**.

> ⚠️ **This file documents the static prototype (`nine2fiveconz-max/Nine2Five`), which is NOT the live store.** The live customer site nine2five.nz is the Next.js repo **`scaledsolutionsnz-sketch/nine2five-store`** (Vercel project `nine2five-store`, scaled-solutions). Do affiliate/store work there. See HANDOVER.md.

> **2026-06-15 — Affiliate fixes shipped to prod (nine2five-store, commit `3d421e1`):** (1) Click counter fixed — dashboard/admin now count real `affiliate_clicks`/`affiliate_conversions` rows instead of the drift-prone `total_clicks` counter, the track route awaits its increment, and counters were backfilled (`wiremubartlett→12`, `moo→3`). (2) `affiliate_code` is now set on the PaymentIntent **server-side at creation** from the `n2f_ref` cookie (express/Link can't bypass it), and the cookie is scoped `Domain=.nine2five.nz` (carries www↔apex). (3) **Open bug:** pure express/Link checkout still creates orders missing items/email/shipping (order metadata only set by the client PATCH) — see HANDOVER.md.

---

## Repo

| Field | Value |
|---|---|
| Remote | `https://github.com/nine2fiveconz-max/Nine2Five.git` |
| Default branch | `main` |
| Local copy | `~/projects/nine2five` |
| Push auth | `gh auth token --user nine2fiveconz-max` (two GitHub accounts on this machine) |

### Last 10 commits (as of this session)
```
b15dfc3 Fix eShip order import — $20 unit price, 65g weight, Default package
5f6c664 Fix: write shipping address to PI server-side to prevent Stripe Link bypass
9bcc8ed Consolidate APIs to stay within Vercel Hobby 12-function limit
995878b Add CRM: contacts, notes, pipeline API + frontend
1886cb6 Add qty stepper controls to checkout order summary
76af60b Add discount code support to checkout
e1083d3 Tier AU shipping — 1-3 pairs $16, 4-6 pairs $18, 7+ pairs $22
0eae777 Add qty column left of price in checkout order summary
95c701a Show pair counts in checkout order summary
ea0ee08 Remove packaging size names from NZ shipping labels
```

---

## Deployment

- **Host:** Vercel (Hobby plan — hard limit of 12 serverless functions)
- **Domain:** `nine2five.nz` (custom) + `nine2five-sage.vercel.app` (Vercel default). DNS via Cloudflare (ns: `kolton.ns.cloudflare.com` / `april.ns.cloudflare.com`), A record → `76.76.21.21` (Vercel).
- **Deploy trigger:** push to `main` auto-deploys via Vercel GitHub integration.
- **Function count:** exactly 12 files in `api/` — do not add more top-level API files without removing one first.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Static HTML/CSS/JS (`index.html`, `checkout.html`, `admin.html`, `crm.html`, `success.html`) |
| Backend | Vercel Serverless Functions (Node.js, CommonJS `module.exports`) |
| Payments | Stripe (Payment Intents API + Stripe.js Payment Element) |
| Database | Supabase (REST API, service-role key) |
| Shipping quotes | Flat-rate lookup table in `api/shipping-quote.js` (replaced live eShip quotes) |
| Shipping labels | NZ Post eShip API (`https://api.myeship.co/rest`) |
| Cart | `localStorage` key `n2f-cart` |
| Stripe publishable key | Hardcoded in `checkout.html` — `pk_live_51QQHA4CA9Ax2Etsl...` (live key, not a secret) |

---

## File Map

### Frontend pages

| File | Purpose |
|---|---|
| `index.html` | Storefront — product listing, cart drawer, size picker |
| `checkout.html` | Full checkout: contact → address → shipping rate → discount → Stripe payment |
| `admin.html` | Admin dashboard: orders, Stripe payments, inventory, POS sale logging, ship modal |
| `crm.html` | CRM: contacts, notes, pipeline (uses `/api/crm`) |
| `success.html` | Post-payment confirmation page |

### API functions (`api/`)

| File | Method(s) | Auth | Purpose |
|---|---|---|---|
| `payment-intent.js` | POST | none | Creates Stripe PaymentIntent from cart items; stores `items_json` in PI metadata |
| `update-payment-intent.js` | POST | none | Three actions via `?action=`: (default) update PI amount; `discount` validate code; `shipping` write customer/address to PI server-side before confirmation |
| `stripe-webhook.js` | POST | Stripe signature | Handles `payment_intent.succeeded`: pushes order to eShip, inserts into Supabase `orders`, decrements `inventory` |
| `shipping-quote.js` | POST | none | Returns flat-rate shipping options by country + qty. NZ: $6/$7/$9 tiered. AU: $16/$18/$22 tiered. International: flat per country table |
| `nzpost.js` | POST | `X-Admin-Token` | Three actions: `quote` (get NZ Post rates), `ship` (create label + update Supabase), `push_orders` (re-push all `processing` orders to eShip) |
| `admin-orders.js` | GET | `X-Admin-Token` | Returns all orders from Supabase ordered by `created_at desc` |
| `admin-stripe.js` | GET | `X-Admin-Token` | Returns recent Stripe PaymentIntents |
| `admin-inventory.js` | GET+POST | `X-Admin-Token` | GET: fetch all inventory. POST `?action=update`: update stock level by ID |
| `admin-pos-order.js` | POST | `X-Admin-Token` | Log a POS (in-person) sale to Supabase, optionally decrement stock |
| `crm.js` | GET+POST | `X-Admin-Token` | CRM actions: `contacts`, `contact_detail`, `pipeline`, `add_note`, `update_stage` |
| `stock.js` | GET | none | Public endpoint — returns current stock levels from `inventory` (cached 60s) |
| `checkout.js` | POST | none | Stripe Checkout Session creator — **active**, used for gift card purchases linked from `index.html` (separate flow from the Payment Element in `checkout.html`) |

---

## Full Order Flow (as it exists in code right now)

### 1. Checkout (`checkout.html`)

1. Cart loaded from `localStorage` (`n2f-cart`).
2. `initStripe()` → `POST /api/payment-intent` → creates Stripe PI, stores `items_json` in PI metadata.
3. As customer fills contact/address fields, `syncCustomerData()` fires (debounced 1500ms) → `POST /api/update-payment-intent?action=shipping` — writes name, email, address, amounts to PI server-side **before** any payment method confirms.
   - This prevents Stripe Link from bypassing address capture (Stripe Link has its own confirmation flow that skips the pay button).
4. When shipping rate selected → `syncPaymentIntent()` updates PI amount + `syncCustomerData()` fires immediately.
5. Pay button → `stripe.confirmPayment()` with `return_url: /success.html`.

### 2. Stripe Webhook (`api/stripe-webhook.js`)

Triggered by `payment_intent.succeeded` event.

**Source of truth for customer data:** `pi.shipping` (written server-side in step 3 above), fallback to `pi.metadata.*`.

**Actions in order:**
1. Parse `items` from `pi.metadata.items_json`.
2. Extract `customerName`, `customerEmail`, `shippingAddress` from `pi.shipping` / `pi.metadata`.
3. Extract amounts: `subtotalCents`, `shippingCents`, `discountCents` from `pi.metadata`.
4. **Push to NZ Post eShip** via `POST https://api.myeship.co/rest/order` with:
   - `price: '20.00'` per item (hardcoded in `stripe-webhook.js:~95`)
   - `weight: '65'` per item (hardcoded in `stripe-webhook.js:~96`)
   - Parcel: `{ length: 18, width: 28, height: 5, distance_unit: 'cm', weight: 0.12, mass_unit: 'kg' }` (Default package preset)
5. **Insert to Supabase `orders`** table with all fields (see Database section).
6. Decrement `inventory` stock for each item.
7. If no address captured → sets `notes: 'Address not captured — customer used express checkout'`.

### 3. Admin Panel (`admin.html`)

- **Push to eShip button** → `POST /api/nzpost?action=push_orders` — fetches all `status=processing` orders from Supabase and pushes each to eShip. Same hardcoded values as webhook.
- **Ship button** → opens modal → `POST /api/nzpost?action=quote` → select rate → `POST /api/nzpost?action=ship` → creates label, writes `tracking_number`, `label_url`, `status=shipped` to Supabase order.

---

## Hardcoded eShip Values (defined in two places)

| Value | Where |
|---|---|
| Unit price `'20.00'` NZD | `api/nzpost.js:8` (`UNIT_PRICE_NZD`) and `api/stripe-webhook.js:~95` |
| Item weight `'65'` (grams) | `api/nzpost.js:9` (`ITEM_WEIGHT_G`) and `api/stripe-webhook.js:~96` |
| Default parcel `18×28×5 cm, 0.12 kg` | `api/nzpost.js:11` (`DEFAULT_PARCEL`) and `api/stripe-webhook.js:~112` |

> **Note:** These values are duplicated. If you change them, update **both** files.

---

## Environment Variables

All set in Vercel project settings. No `.env` file in repo. No `.gitignore` exists — **add one if env files are ever created locally**.

| Variable | Service | Used in |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe | `payment-intent.js`, `update-payment-intent.js`, `stripe-webhook.js`, `admin-stripe.js`, `checkout.js` |
| `STRIPE_WEBHOOK_SECRET` | Stripe | `stripe-webhook.js` |
| `SUPABASE_URL` | Supabase | `stripe-webhook.js`, `admin-orders.js`, `admin-inventory.js`, `admin-pos-order.js`, `crm.js`, `nzpost.js`, `stock.js` |
| `SUPABASE_SERVICE_KEY` | Supabase | same as above |
| `ADMIN_PASSWORD` | Nine2Five | all `admin-*`, `nzpost.js`, `crm.js` — checked via `X-Admin-Token` header |
| `NZPOST_ESHIP_API_KEY` | NZ Post eShip | `nzpost.js`, `stripe-webhook.js` |
| `NZPOST_SENDER_NAME` | NZ Post eShip | `nzpost.js`, `stripe-webhook.js` |
| `NZPOST_SENDER_STREET` | NZ Post eShip | `nzpost.js`, `stripe-webhook.js` |
| `NZPOST_SENDER_CITY` | NZ Post eShip | `nzpost.js`, `stripe-webhook.js` |
| `NZPOST_SENDER_POSTCODE` | NZ Post eShip | `nzpost.js`, `stripe-webhook.js` |
| `NZPOST_SENDER_PHONE` | NZ Post eShip | `nzpost.js`, `stripe-webhook.js` |
| `DISCOUNT_CODES` | Nine2Five | `update-payment-intent.js` — JSON object `{"CODE": {"type": "percent"/"fixed", "value": number}}` |

---

## Database (Supabase)

**Project:** `wfbwnkqevjibfdjqoifp` (Nine2Five store — separate from Scaled Solutions CRM).

### Tables referenced in code

#### `orders`
| Column | Type | Source |
|---|---|---|
| `id` | integer (auto-increment, used as order number in eShip) | auto |
| `stripe_payment_intent_id` | text | webhook |
| `guest_email` | text | webhook |
| `status` | text | `'processing'` on create; `'shipped'` after label |
| `subtotal` | integer (cents) | webhook (from PI metadata) |
| `shipping_cost` | integer (cents) | webhook |
| `total` | integer (cents) | webhook (`pi.amount_received`) |
| `discount_amount_cents` | integer | webhook |
| `shipping_address` | jsonb | webhook — `{first_name, last_name, line1, line2, city, region, postcode, phone, country}` |
| `items` | jsonb | webhook — array of `{name, size, qty, price, img}` |
| `notes` | text | webhook — set when address not captured |
| `tracking_number` | text | nzpost `?action=ship` |
| `label_url` | text | nzpost `?action=ship` |
| `shipping_carrier` | text | nzpost `?action=ship` |
| `shipped_at` | timestamptz | nzpost `?action=ship` |
| `created_at` | timestamptz | auto |

> **Legacy columns** still referenced in `admin-pos-order.js` and `admin.html`: `stripe_pi_id`, `customer_name`, `customer_email`, `amount_nzd`, `source`, `payment_method`. POS orders use these. The table likely has both old and new columns.

#### `inventory`
| Column | Used as |
|---|---|
| `id` | PK |
| `product_name` | match key |
| `size` | match key |
| `stock` | decremented on order |

#### `crm_contacts`
Referenced in `crm.js`. Schema — **UNKNOWN — ask Moo**. Not present in the Supabase project visible via MCP (`dquwyyczsrxzbdtdemcc`); likely lives in the production project `wfbwnkqevjibfdjqoifp` which the MCP cannot reach.

#### `crm_notes`
Referenced in `crm.js` — `contact_email`, `created_at`. Full schema — **UNKNOWN — ask Moo**. Same project caveat as above.

#### `crm_pipeline`
Referenced in `crm.js`. Schema — **UNKNOWN — ask Moo**. Same project caveat as above.

> **Supabase project note:** The MCP tool connects to `dquwyyczsrxzbdtdemcc` (a different project with a different schema — no `inventory` table, UUID `id` on orders, no CRM tables). The production app uses `wfbwnkqevjibfdjqoifp` (set via `SUPABASE_URL` env var in Vercel). Always use REST API calls with the service key for any Nine2Five Supabase operations — do not use the MCP tool for this project.

---

## Shipping Rates (flat table in `api/shipping-quote.js`)

### NZ (qty-based)
| Pairs | Price |
|---|---|
| 1–2 | $6.00 |
| 3 | $7.00 |
| 4–6 | $9.00 |
| 7+ | Free Standard $0.00 |

### AU (qty-based)
| Pairs | Price |
|---|---|
| 1–3 | $16.00 |
| 4–6 | $18.00 |
| 7+ | $22.00 |

### International
Flat rates per country defined at top of `shipping-quote.js`. Range roughly $24–$40 NZD depending on destination.

---

## GitHub Accounts on This Machine

```
scaledsolutionsnz-sketch  — active default (used for CRM repo)
nine2fiveconz-max         — Nine2Five store repo owner (push requires explicit token)
wiremubartlett72-debug    — debug account
```

To push Nine2Five changes:
```bash
GITHUB_TOKEN=$(gh auth token --user nine2fiveconz-max) git push origin main
```
