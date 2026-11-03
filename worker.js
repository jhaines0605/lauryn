/* =====================================================================
   Lauryn Haines — checkout worker (Cloudflare Workers, free plan)

   The site sends:  { items: [{id, qty}], delivery: "ship"|"local", zip }
   This sends back: { url }  — a Stripe Checkout page.

   Prices are NEVER taken from the browser. Every price, sale and shipping
   rule is read from the live works.js, so what Lauryn sets in admin is
   exactly what gets charged.

   Settings (Cloudflare → this worker → Settings → Variables and Secrets):
     STRIPE_SECRET_KEY  (Secret)  sk_live_... or sk_test_...
     SITE_URL           (Text)    https://laurynhaines.com
     ALLOWED_ORIGINS    (Text)    optional, comma list. Default: SITE_URL + www.
     AUTO_TAX           (Text)    "true" (default) or "false"
   ===================================================================== */

const LOCAL_ZIP = /^(8950\d|8951\d|8952[0-3]|8953[34]|8943[1-6]|8944[01])$/;   // Reno + Sparks
const SCOPE_WORDS = { prints: 'all prints', originals: 'all original paintings', all: 'all artwork' };

export default {
  async fetch(req, env) {
    const site = (env.SITE_URL || 'https://laurynhaines.com').replace(/\/+$/, '');
    const allowed = (env.ALLOWED_ORIGINS || `${site},${site.replace('://', '://www.')}`)
      .split(',').map(s => s.trim()).filter(Boolean);
    const origin = req.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method === 'GET') return json({ ok: true, service: 'lauryn-checkout' });
    if (req.method !== 'POST') return json({ error: 'Not allowed.' }, 405);
    if (!env.STRIPE_SECRET_KEY) return json({ error: 'Checkout is not set up yet.' }, 500);

    try {
      return json(await checkout(await req.json(), env, site));
    } catch (e) {
      const known = e instanceof UserError;
      if (!known) console.error(e && e.stack || e);
      return json({ error: known ? e.message : 'Checkout hit a snag.' }, known ? 400 : 502);
    }
  },
};

class UserError extends Error {}

/* ---------------- the order ---------------- */
async function checkout(body, env, site) {
  const D = await loadWorks(site);
  const S = D.settings || {}, SH = S.shop || {};
  const byId = Object.fromEntries((D.pieces || []).map(p => [p.id, p]));
  const sale = saleState(S);

  // 1. Validate the cart against the live data
  const raw = Array.isArray(body.items) ? body.items.slice(0, 25) : [];
  const lines = [];
  for (const it of raw) {
    const p = byId[String(it.id)];
    const qty = Math.floor(Number(it.qty));
    if (!p || !(qty >= 1)) continue;
    if (p.visible === false || p.inShop === false || p.type === 'mural' || p.status !== 'available' || toCents(p.price) == null)
      throw new UserError(`"${p.title || 'A piece'}" is no longer available. Refresh the page and try again.`);
    lines.push({ p, qty: Math.min(qty, p.type === 'print' ? 10 : 1) });
  }
  if (!lines.length) throw new UserError('Your cart is empty.');

  // 2. Delivery
  const delivery = body.delivery === 'local' ? 'local' : 'ship';
  const zip = String(body.zip || '').trim();
  if (delivery === 'local') {
    if (SH.localDelivery === false) throw new UserError('Local delivery is not available right now.');
    if (!LOCAL_ZIP.test(zip)) throw new UserError('Local delivery covers Reno and Sparks ZIP codes.');
  }
  let shipCents = 0;
  if (delivery === 'ship') {
    if (lines.some(l => l.p.type === 'print')) shipCents += toCents(SH.printShipping) || 0;
    for (const l of lines) if (l.p.type !== 'print') {
      const s = toCents(l.p.shipping) ?? toCents(SH.originalShipping);
      if (s == null) throw new UserError(`"${l.p.title || 'A piece'}" needs a shipping quote. Choose local delivery or use Inquire.`);
      shipCents += s * l.qty;
    }
  }

  // 3. Make sure each piece exists as a Stripe product (so the sale can target it)
  const stripe = stripeClient(env.STRIPE_SECRET_KEY);
  for (const l of lines) l.product = await upsertProduct(stripe, l.p, site);

  // 4. The sale: one coupon, limited to exactly the discounted pieces.
  //    Stripe then shows its own "Print sale −$8.00" line on the checkout page.
  const discounted = sale ? lines.filter(l => onSale(l.p, sale)).map(l => l.product) : [];
  let discounts;
  if (discounted.length) {
    const name = (sale.text || `${sale.pct}% off ${SCOPE_WORDS[sale.scope] || 'all artwork'}`).slice(0, 40);
    const ids = [...new Set(discounted)].sort();
    const couponId = `lh_${sale.pct}_${hash(name + '|' + ids.join(','))}`;
    let c = await stripe('GET', `/v1/coupons/${couponId}`, null, true);
    if (!c) c = await stripe('POST', '/v1/coupons', {
      id: couponId, name, percent_off: sale.pct, duration: 'once',
      applies_to: { products: ids },
    });
    discounts = [{ coupon: c.id }];
  }

  // 5. The session
  const autoTax = String(env.AUTO_TAX || 'true') !== 'false';
  const shipName = delivery === 'local'
    ? (SH.localLabel || 'Free local delivery · Reno / Sparks')
    : (shipCents ? 'Standard shipping' : 'Free shipping');

  const params = {
    mode: 'payment',
    success_url: `${site}/?paid=1#shop`,
    cancel_url: `${site}/#shop`,
    line_items: lines.map(l => ({
      quantity: l.qty,
      price_data: {
        currency: 'usd',
        product: l.product,
        unit_amount: toCents(l.p.price),
        ...(autoTax ? { tax_behavior: 'exclusive' } : {}),
      },
    })),
    shipping_address_collection: { allowed_countries: ['US'] },
    shipping_options: [{
      shipping_rate_data: {
        type: 'fixed_amount',
        display_name: shipName.slice(0, 100),
        fixed_amount: { amount: delivery === 'local' ? 0 : shipCents, currency: 'usd' },
        ...(autoTax ? { tax_behavior: 'exclusive', tax_code: 'txcd_92010001' } : {}),
      },
    }],
    phone_number_collection: { enabled: true },
    automatic_tax: { enabled: autoTax },
    metadata: {
      delivery, zip: delivery === 'local' ? zip : '',
      items: lines.map(l => `${l.p.id}x${l.qty}`).join(',').slice(0, 500),
    },
    payment_intent_data: {
      description: lines.map(l => `${l.p.title || 'Untitled'}${l.qty > 1 ? ' ×' + l.qty : ''}`).join(', ').slice(0, 300),
    },
    ...(delivery === 'local' ? { custom_text: { shipping_address: {
      message: 'Free local delivery in Reno / Sparks. I’ll reach out to schedule a drop-off.' } } } : {}),
    ...(discounts ? { discounts } : { allow_promotion_codes: true }),
  };

  const session = await stripe('POST', '/v1/checkout/sessions', params);
  return { url: session.url };
}

/* ---------------- the same rules the site uses ---------------- */
function toCents(s) {
  const n = parseFloat(String(s == null ? '' : s).replace(/[^0-9.]/g, ''));
  return isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}
function saleState(S) {
  const s = S.sale || {};
  const pct = Math.min(90, Math.max(0, parseInt(s.percent, 10) || 0));
  if (!s.on || !pct) return null;
  // End date is inclusive, Reno time (a few hours of grace either side of DST is fine)
  if (s.ends && Date.now() > new Date(s.ends + 'T23:59:59-08:00').getTime()) return null;
  return { pct, scope: s.scope || 'prints', text: String(s.text || '').trim() };
}
function onSale(p, sale) {
  return !!sale && p.type !== 'mural' &&
    (sale.scope === 'all' || (sale.scope === 'prints' ? p.type === 'print' : p.type !== 'print'));
}

/* ---------------- helpers ---------------- */
async function loadWorks(site) {
  const r = await fetch(`${site}/works.js?v=${Date.now()}`, { cf: { cacheTtl: 0 } });
  if (!r.ok) throw new Error('Could not load works.js: ' + r.status);
  const t = await r.text();
  return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
}

async function upsertProduct(stripe, p, site) {
  const id = 'lh_' + String(p.id).replace(/[^A-Za-z0-9_]/g, '_');
  const img = p.image && !String(p.image).startsWith('data:')
    ? (/^https?:/.test(p.image) ? p.image : `${site}/${String(p.image).replace(/^\/+/, '')}`) : null;
  const fields = {
    name: (p.title || 'Untitled') + (p.type === 'print' ? ' — Print' : ' — Original'),
    description: [p.medium, p.size, p.note].filter(Boolean).join(' · ').slice(0, 300) || undefined,
    images: img ? [img] : undefined,
    tax_code: 'txcd_99999999',          // general tangible goods
    metadata: { site_id: p.id, type: p.type },
  };
  const updated = await stripe('POST', `/v1/products/${id}`, fields, true);
  if (updated) return updated.id;
  return (await stripe('POST', '/v1/products', { id, ...fields })).id;
}

function stripeClient(key) {
  // returns null instead of throwing on 404 when soft=true
  return async (method, path, data, soft = false) => {
    const r = await fetch('https://api.stripe.com' + path, {
      method,
      headers: {
        Authorization: 'Bearer ' + key,
        ...(data ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: data ? form(data) : undefined,
    });
    const body = await r.json();
    if (r.ok) return body;
    if (soft && r.status === 404) return null;
    throw new Error(`Stripe ${method} ${path}: ${body.error && body.error.message || r.status}`);
  };
}

function form(obj, prefix, out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out);
    else out.push(encodeURIComponent(key) + '=' + encodeURIComponent(v));
  }
  return out.join('&');
}

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
