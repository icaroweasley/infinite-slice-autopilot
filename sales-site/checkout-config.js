/**
 * ============================================================================
 *  INFINITE SLICE 3D — CHECKOUT & BRAND CONFIG (EDIT ONLY THIS FILE!)
 * ============================================================================
 *  1. Upload `dist-buyer/infinite-slice-skill-buyer-edition.zip` to Gumroad,
 *     Lemon Squeezy, Stripe Payment Link (Global USD) and/or Kiwify (Brazil BRL).
 *  2. Paste your checkout link(s) below.
 *  3. Drag & drop the `sales-site/` folder into https://app.netlify.com/drop
 *     to go live with free HTTPS in 10 seconds!
 */
window.SITE_CONFIG = {
  brandHandle: '@atomslice3d',
  instagramUrl: 'https://instagram.com/atomslice3d',
  supportEmail: 'hello@atomslice3d.com',

  // Global Checkout URL (USD — Gumroad / Lemon Squeezy / Stripe Payment Link)
  // Example: 'https://atomslice3d.gumroad.com/l/infinite-slice-3d'
  checkoutUrlUSD: '',

  // Brazil Checkout URL (BRL — Kiwify / Hotmart / Stripe BRL; falls back to checkoutUrlUSD if empty)
  // Example: 'https://pay.kiwify.com.br/SEU-CODIGO'
  checkoutUrlBRL: '',

  pricing: {
    en: {
      currency: '$',
      price: '29',
      compareAt: '$79',
      badge: 'LAUNCH OFFER — 63% OFF',
    },
    pt: {
      currency: 'R$ ',
      price: '97',
      compareAt: 'R$ 247',
      badge: 'OFERTA DE LANÇAMENTO — 60% OFF',
    },
  },
};
