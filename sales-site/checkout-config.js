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
  checkoutUrlUSD: 'https://icaroweasley.gumroad.com/l/atomslice3d',

  // Fallback Checkout URL
  checkoutUrlBRL: 'https://icaroweasley.gumroad.com/l/atomslice3d',

  pricing: {
    en: {
      currency: '$',
      price: '29',
      compareAt: '$79',
      badge: 'LAUNCH OFFER — 63% OFF',
    },
    pt: {
      currency: 'US$\u00A0',
      price: '29',
      compareAt: 'US$\u00A079',
      badge: 'OFERTA DE LANÇAMENTO — 63% OFF',
    },
  },
};
