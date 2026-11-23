/**
 * Strict Semantic Anti-Repetition Engine for Infinite Slice 3D (@atomslice3d)
 *
 * Guarantees that NO object (nor same-species variant like "Vintage Pokeball" vs
 * "Mirror Pokeball" or "food_avocado_01" vs "Ripe Avocado") can EVER be rendered
 * or published twice. Also optionally cross-checks live Instagram captions!
 */

const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'with', 'and', 'or', 'in', 'on', 'to', 'for', 'from', 'by', 'at', 'as', 'is', 'it',
  'de', 'do', 'da', 'dos', 'das', 'com', 'em', 'na', 'no', 'um', 'uma', 'para', 'que', 'e',
  'ripe', 'juicy', 'sweet', 'giant', 'glossy', 'fresh', 'mirror', 'vintage', 'antique', 'artisan', 'classic',
  'hyper', 'real', 'solid', 'molten', 'glowing', 'vibrant', 'exotic', 'stacked', 'gourmet', 'crystal', 'core',
  'secret', 'hiding', 'packed', 'filled', 'stuffed', 'covered', 'cracked', 'striped', 'fuzzy', 'marbled',
  'seared', 'melted', 'golden', 'emerald', 'ruby', 'sapphire', 'amethyst', 'cyan', 'neon', 'pastel', 'bright',
  'dark', 'deep', 'warm', 'cool', 'hot', 'cold', 'raw', 'cut', 'cuts', 'sliced', 'slicing', 'infinite',
  'red', 'green', 'blue', 'pink', 'yellow', 'purple', 'white', 'black', 'brown', 'silver', 'gold', 'copper',
  'bronze', 'metallic', 'wooden', 'wood', 'plastic', 'ceramic', 'glass', 'stone', 'marble', 'brass', 'iron',
  'metal', 'rubber', 'concrete', 'leather', 'mini', 'small', 'large', 'big', 'old', 'new', 'retro', 'modern',
  'luxury', 'pro', 'oled', 'hd', '3d', '24k', '100', '1000', '1000c', 'a5', 'v2', 'v3', 'v4', '01', '02', '03',
  '04', '05', '16', '8mm', '6v', 'food', 'fruit', 'object', 'model', 'toy', 'statue', 'set', 'pack', 'kit',
  'block', 'bar', 'roll', 'slice', 'piece', 'stack', 'tower', 'inside', 'outside', 'skin', 'flesh', 'seeds',
  'seed', 'pit', 'leaves', 'leaf', 'layer', 'layers', 'strata', 'veins', 'holes', 'real', 'hollow', 'plasma',
  'jeweled', 'arils', 'pith', 'spicy', 'crisp', 'fine', 'marbling', 'rainbow', 'glazed', 'frosted', 'sprinkle',
  'sprinkles', 'butter', 'maple', 'syrup', 'caramel', 'sesame', 'rice', 'nori', 'mozzarella', 'crust', 'band',
  'bound', 'teardown', 'circuit', 'board', 'melted', 'melting', 'frozen', 'translucent', 'radiant', 'blush',
  'sunset', 'tropical', 'valencia', 'citrus', 'atlantic', 'swiss', 'asian', 'korean', 'russian', 'american',
  'chinese', 'japanese', 'italian', 'french', 'medieval', 'ornate', 'dirty', 'rusted', 'broken', 'damaged',
  'portable', 'standing', 'hanging', 'wall', 'mounted', 'hand', 'electric', 'digital', 'analog', 'pocket',
  'wrist', 'table', 'floor', 'multi', 'all', 'purpose', 'long', 'life', 'medium', 'dry', 'wet', 'clear',
  'shiny', 'matte', 'smooth', 'rough', 'curved', 'round', 'square', 'flat', 'tall', 'wide', 'thin', 'thick',
  'prompt', 'custom', 'unknown', 'null', 'undefined', 'watch', 'what', 'happens', 'wait', 'turns', 'dust',
  'like', 'until', 'final', 'count', 'cubes', 'impossible', 'should', 'atomslice3d', 'next', 'comment', 'below',
  'want', 'create', 'your', 'own', 'videos', 'tap', 'link', 'bio', 'satisfying', '3dart', 'asmr', 'oddlysatisfying',
  'kineticsand', '3danimation', 'reels', 'shorts', 'viral',
  'ball', 'bola', 'cube', 'cubo', 'rock', 'ring', 'hollo', 'clay', 'colorful', 'seeded', 'segment', 'radial',
  'incandescent', 'arco', 'iris', 'magico', 'ouro', 'barra', 'gelo', 'fresco', 'ametista', 'bilhar',
]);

// Canonical concept aliases (PT + EN + variations -> single canonical family token)
const CANONICAL_MAP = {
  pokeball: 'pokeball',
  pokebola: 'pokeball',
  pokemon: 'pokeball',

  avocado: 'avocado',
  abacate: 'avocado',

  strawberry: 'strawberry',
  morango: 'strawberry',

  watermelon: 'watermelon',
  melancia: 'watermelon',

  pomegranate: 'pomegranate',
  roma: 'pomegranate',

  apple: 'apple',
  maca: 'apple',

  orange: 'orange',
  laranja: 'orange',
  tangerine: 'orange',
  tangerina: 'orange',

  chili: 'chili-pepper',
  chilli: 'chili-pepper',
  pepper: 'chili-pepper',
  pimenta: 'chili-pepper',

  kiwi: 'kiwi',

  donut: 'donut',
  doughnut: 'donut',
  rosquinha: 'donut',

  burger: 'burger',
  hamburger: 'burger',
  hamburguer: 'burger',
  buns: 'burger',

  pizza: 'pizza',
  pepperoni: 'pizza',

  sushi: 'sushi',
  uramaki: 'sushi',

  salmon: 'salmon',
  salmao: 'salmon',

  wagyu: 'steak',
  steak: 'steak',
  bife: 'steak',

  cheese: 'cheese',
  queijo: 'cheese',
  cheesebox: 'cheese',

  chocolate: 'chocolate',
  cacau: 'chocolate',

  pancake: 'pancake',
  panqueca: 'pancake',

  dollar: 'cash',
  bill: 'cash',
  cash: 'cash',
  money: 'cash',
  dinheiro: 'cash',

  iphone: 'smartphone',
  smartphone: 'smartphone',
  celular: 'smartphone',

  nintendo: 'nintendo-switch',
  switch: 'nintendo-switch',
  joycon: 'nintendo-switch',

  geode: 'geode',
  geodo: 'geode',

  rubik: 'rubiks-cube',
  rubiks: 'rubiks-cube',

  billiard: 'billiard-ball',
  '8ball': 'billiard-ball',
  sinuca: 'billiard-ball',

  honeycomb: 'honeycomb',
  favo: 'honeycomb',

  rose: 'ice-rose',
  rosa: 'ice-rose',

  dragonfruit: 'dragon-fruit',
  pitaya: 'dragon-fruit',
  dragon: 'dragon-fruit',

  brick: 'brick',
  tijolo: 'brick',

  obsidian: 'volcano-magma',
  volcano: 'volcano-magma',
  magma: 'volcano-magma',
  lava: 'volcano-magma',

  goldbar: 'gold-bar',
  ingot: 'gold-bar',

  cake: 'cake',
  bolo: 'cake',

  banana: 'banana',
  lemon: 'lemon',
  limao: 'lemon',
  lime: 'lime',
  pear: 'pear',
  pera: 'pear',
  lychee: 'lychee',
  lichia: 'lychee',
  ginger: 'ginger',
  gengibre: 'ginger',
  onion: 'onion',
  cebola: 'onion',
  potato: 'sweet-potato',
  croissant: 'croissant',
  duck: 'rubber-duck',
  pato: 'rubber-duck',
  football: 'football',
  soccer: 'football',
  baseball: 'baseball',
  camera: 'camera',
  gamepad: 'gamepad',
  controller: 'gamepad',
  console: 'gaming-console',
  laptop: 'laptop',
  notebook: 'notebook',
  boombox: 'boombox',
  cassette: 'cassette-player',
  television: 'television',
  tv: 'television',
  ukulele: 'ukulele',
  guitar: 'guitar',
  shoe: 'sneaker',
  sneaker: 'sneaker',
  tenis: 'sneaker',
  boot: 'boot',
  helmet: 'helmet',
  sunglass: 'sunglasses',
  sunglasses: 'sunglasses',
  spectacle: 'glasses',
  clock: 'clock',
  relogio: 'clock',
  chronograph: 'wristwatch',
  wristwatch: 'wristwatch',
  treasure: 'treasure-chest',
  chest: 'treasure-chest',
  bau: 'treasure-chest',
  bust: 'marble-bust',
  shark: 'shark-statue',
  whale: 'whale-statue',
  elephant: 'elephant-statue',
  gnome: 'garden-gnome',
  cat: 'cat-statue',
  horse: 'horse-statue',
  lion: 'lion-statue',
  bull: 'bull-statue',
  shell: 'seashell',
  lifebuoy: 'lifebuoy',
  dartboard: 'dartboard',
  compass: 'compass',
  lighter: 'lighter',
  kettle: 'kettle',
  teapot: 'teapot',
  teacup: 'teacup',
  mug: 'mug',
  megaphone: 'megaphone',
  binocular: 'binoculars',
  binoculars: 'binoculars',
  extinguisher: 'fire-extinguisher',
  microwave: 'microwave',
  suitcase: 'suitcase',
  lantern: 'lantern',
  flashlight: 'flashlight',
  drill: 'power-drill',
  hammer: 'hammer',
  wrench: 'wrench',
  axe: 'axe',
  vase: 'ceramic-vase',
  goblet: 'goblet',
  bottle: 'bottle',
  fish: 'fish',
  barramundi: 'fish',
  mosquito: 'amber-fossil',
  amber: 'amber-fossil',
  car: 'toy-car',
  cone: 'traffic-cone',
  skull: 'crystal-skull',
  soap: 'soap',
  diamond: 'diamond',
  diamante: 'diamond',
  mango: 'mango',
  manga: 'mango',
};

export function normalizeText(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function singularize(word) {
  if (word.length <= 3) return word;
  if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y';
  if (word.endsWith('es') && /(sh|ch|x|z|s)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && !word.endsWith('is')) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Extract canonical core object concepts from any name, slug, asset ID, or caption.
 */
export function extractConceptTokens(text) {
  const norm = normalizeText(text);
  if (!norm) return new Set();

  const out = new Set();

  // Multi-word compound concepts first
  if (/\bgold\s+bar\b|\bgold-bar\b/.test(norm)) out.add('gold-bar');
  if (/\bdragon\s+fruit\b|\bpitaya\b/.test(norm)) out.add('dragon-fruit');
  if (/\bice\s+rose\b|\bfrozen\s+rose\b/.test(norm)) out.add('ice-rose');
  if (/\bamerican\s+football\b/.test(norm)) out.add('american-football');
  if (/\bhot\s+dog\b|\bhotdog\b/.test(norm)) out.add('hotdog');
  if (/\bice\s+cream\b/.test(norm)) out.add('ice-cream');
  if (/\bcredit\s+card\b/.test(norm)) out.add('credit-card');
  if (/\bcash\s+register\b/.test(norm)) out.add('cash-register');
  if (/\btraffic\s+cone\b/.test(norm)) out.add('traffic-cone');
  if (/\bgas\s+mask\b/.test(norm)) out.add('gas-mask');
  if (/\bpayphone\b|\btelephone\b/.test(norm)) out.add('telephone');
  if (/\bwater\s+bottle\b/.test(norm)) out.add('water-bottle');
  if (/\bwine\s+bottle\b/.test(norm)) out.add('wine-bottle');
  if (/\bpropane\s+tank\b|\blpg\s+tank\b/.test(norm)) out.add('propane-tank');
  if (/\bspray\s+paint\b/.test(norm)) out.add('spray-paint');
  if (/\bmeasuring\s+tape\b/.test(norm)) out.add('measuring-tape');
  if (/\bmagnifying\s+glass\b/.test(norm)) out.add('magnifying-glass');
  if (/\bchess\s+set\b/.test(norm)) out.add('chess-set');
  if (/\bpocket\s+watch\b/.test(norm)) out.add('pocket-watch');
  if (/\bwrist\s+watch\b|\bchronograph\s+watch\b/.test(norm)) out.add('wristwatch');
  if (/\balarm\s+clock\b/.test(norm)) out.add('alarm-clock');
  if (/\bmagic\s+cube\b|\brubik/.test(norm)) out.add('rubiks-cube');
  if (/\bsweet\s+potato\b/.test(norm)) out.add('sweet-potato');
  if (/\bcarrot\s+cake\b/.test(norm)) out.add('cake');

  for (const raw of norm.split(/\s+/)) {
    if (!raw || raw.length < 2) continue;
    if (/^\d+$/.test(raw)) continue;
    const base = singularize(raw);
    if (STOPWORDS.has(raw) || STOPWORDS.has(base)) continue;

    const mapped = CANONICAL_MAP[raw] || CANONICAL_MAP[base];
    if (mapped) {
      out.add(mapped);
    } else if (base.length >= 4) {
      out.add(base);
    }
  }
  return out;
}

/**
 * Extract ONLY the hero object phrase from an Instagram Reel caption (first line before newline).
 */
export function extractObjectFromCaption(caption) {
  const firstLine = String(caption || '').split(/\r?\n/)[0] || '';
  return firstLine
    .replace(/10\s*(?:→|->)+\s*1,?000\s+cuts\s+on\s+(?:a|an)\s+/i, '')
    .replace(/\.?\s*Final count:.*$/i, '')
    .replace(/^Cutting\s+(?:a|an)\s+/i, '')
    .replace(/\s+like butter.*$/i, '')
    .replace(/^Slicing\s+(?:a|an)\s+/i, '')
    .replace(/\s+1,?000\s+times.*$/i, '')
    .replace(/^Watch what happens to\s+(?:a|an)\s+/i, '')
    .replace(/\s+at\s+1,?000\s+cuts.*$/i, '')
    .trim();
}

/**
 * Optionally fetch the last 100 live Instagram captions so even out-of-sync posts
 * can NEVER be repeated. Fails gracefully (returns []) if offline or token absent.
 */
export async function fetchLiveInstagramCaptions() {
  const token = process.env.IG_ACCESS_TOKEN;
  const igUserId = process.env.IG_USER_ID || '17841480527981340';
  if (!token) return [];

  try {
    const url = `https://graph.facebook.com/v22.0/${encodeURIComponent(igUserId)}/media?fields=caption,timestamp&limit=100&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data || []).map((m) => m.caption || '').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Build the complete locked set of used asset IDs, slugs, and canonical concept tokens
 * from both data/history.json AND live Instagram posts.
 */
export function buildAntiRepeatIndex(historyEntries = [], liveCaptions = []) {
  const usedAssetIds = new Set();
  const usedSlugs = new Set();
  const usedConcepts = new Set();

  for (const e of historyEntries) {
    if (e.modelAssetId) usedAssetIds.add(String(e.modelAssetId).toLowerCase());
    if (e.slug) usedSlugs.add(String(e.slug).toLowerCase());
    const sources = [e.englishName, e.name, e.slug, e.modelAssetId];
    for (const s of sources) {
      for (const tok of extractConceptTokens(s)) usedConcepts.add(tok);
    }
  }

  for (const cap of liveCaptions) {
    const hero = extractObjectFromCaption(cap);
    for (const tok of extractConceptTokens(hero)) usedConcepts.add(tok);
  }

  return { usedAssetIds, usedSlugs, usedConcepts };
}

/**
 * Check if a candidate object (string or catalog asset object) collides with ANY past video.
 */
export function checkRepetition(candidate, index) {
  const assetId = typeof candidate === 'object' ? (candidate.assetId || candidate.id || '') : '';
  const slug = typeof candidate === 'object' ? (candidate.slug || '') : '';
  const label = typeof candidate === 'object'
    ? [candidate.englishName, candidate.name, candidate.slug, ...(candidate.tags || [])].filter(Boolean).join(' ')
    : String(candidate || '');

  if (assetId && index.usedAssetIds.has(String(assetId).toLowerCase())) {
    return { repeated: true, reason: `exact assetId "${assetId}" already posted` };
  }
  if (slug && index.usedSlugs.has(String(slug).toLowerCase())) {
    return { repeated: true, reason: `exact slug "${slug}" already posted` };
  }

  const candidateTokens = extractConceptTokens(label);
  for (const tok of candidateTokens) {
    if (index.usedConcepts.has(tok)) {
      return { repeated: true, reason: `core concept "${tok}" already posted` };
    }
  }
  return { repeated: false, reason: null, tokens: [...candidateTokens] };
}
