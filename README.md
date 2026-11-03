# Checkout — setup

The site's cart sends orders here; this worker checks every price against the live
`works.js`, applies the sale, and hands the buyer to a Stripe checkout page.
The Stripe secret key lives only in Cloudflare — never in the repo.

## 1. Stripe (Lauryn's account)
1. Sign up at stripe.com, then finish **Activate payments**: business details, bank account, identity.
   Business type "Individual / sole proprietor" is normal for an artist.
2. **Settings → Business → Public details**: statement descriptor (e.g. `LAURYN HAINES ART`), support email.
3. **Settings → Tax**: set the origin address (where art ships from), then **Registrations → Add → Nevada**.
   Only add Nevada. Stripe then collects Nevada tax on Nevada orders and nothing elsewhere.
4. **Settings → Customer emails**: turn on *Successful payments* so buyers get receipts.
5. **Developers → API keys**: copy the **Secret key**. Start with the **test** key (`sk_test_…`).

## 2. Cloudflare (John's account, free plan)
1. dash.cloudflare.com → **Workers & Pages → Create → Create Worker** → name it `lauryn-checkout` → Deploy.
2. **Edit code** → delete the sample → paste all of `worker.js` → **Deploy**.
3. Worker → **Settings → Variables and Secrets**:
   - `STRIPE_SECRET_KEY` — type **Secret** — the `sk_test_…` key
   - `SITE_URL` — Text — `https://laurynhaines.com`
4. Copy the worker's address (`https://lauryn-checkout.<you>.workers.dev`). Opening it should show `{"ok":true…}`.

## 3. Turn on the cart
Admin → **Shop & checkout** → paste the worker address → set print shipping → **Publish**.
"Add to cart" appears on the site about a minute later.

## 4. Test, then go live
- Buy a print with card `4242 4242 4242 4242`, any future date, any CVC, a Nevada address.
  Check the Stripe page shows the sale line, $5.99 shipping, and tax. Payment lands in Stripe → Payments (test mode).
- Try local delivery with a Reno ZIP.
- Then swap `STRIPE_SECRET_KEY` for the live `sk_live_…` key. Nothing else changes.

## After each sale
- **Originals:** mark the piece **sold** in admin and Publish, so nobody else can buy it.
- **Local delivery orders:** the buyer's address and phone are on the payment in Stripe.
- **Shipped orders:** ship to the address on the payment.

## Variables
| Name | Default | |
|---|---|---|
| `STRIPE_SECRET_KEY` | — | required |
| `SITE_URL` | `https://laurynhaines.com` | where `works.js` and images are read from |
| `ALLOWED_ORIGINS` | site + www | comma list, only if the site moves |
| `AUTO_TAX` | `true` | `false` turns off Stripe Tax |
