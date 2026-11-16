// Ingredient lines are free text ("1 1/2 cups plain flour", "400 g can chickpeas",
// "Pinch salt"). This module reads the quantity and unit out of a line so we can
// scale it, merge it on the shopping list and file it into a supermarket section.
// The original text is always kept: if a line can't be understood it is shown unchanged.

import { norm, esc } from './util.js';

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

const UNI = { '½': 1 / 2, '¼': 1 / 4, '¾': 3 / 4, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8 };
const UNI_CHARS = Object.keys(UNI).join('');

// One number: "1 1/2", "3/4", "1.5", "1½", "½", "2"
const NUM = `(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d*\\.\\d+|\\d+\\s*[${UNI_CHARS}]|\\d+|[${UNI_CHARS}])`;
// A number or a range: "2–3", "2-3", "2 to 3"
const QTY_RE = new RegExp(`^(${NUM})(?:\\s*(?:–|—|-|to)\\s*(${NUM}))?(?![\\d/])`);

export function toNumber(s) {
  s = s.trim();
  let m;
  if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return +m[1] + m[2] / m[3];
  if ((m = s.match(/^(\d+)\/(\d+)$/))) return m[1] / m[2];
  if ((m = s.match(new RegExp(`^(\\d*)\\s*([${UNI_CHARS}])$`)))) return (+m[1] || 0) + UNI[m[2]];
  return parseFloat(s);
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

// fam: units in the same family can be added together (g + kg, ml + L).
const UNIT_DEFS = [
  { key: 'kg', re: 'kg|kgs|kilograms?|kilos?', fam: 'mass', f: 1000 },
  { key: 'g', re: 'g|gm|gms|grams?', fam: 'mass', f: 1 },
  { key: 'L', re: 'l|ltrs?|litres?|liters?', fam: 'vol', f: 1000 },
  { key: 'ml', re: 'ml|mls|millilitres?|milliliters?', fam: 'vol', f: 1 },
  { key: 'cup', re: 'cups?', one: 'cup', many: 'cups' },
  { key: 'Tbsp', re: 'tbsps?|tbs|tablespoons?', one: 'Tbsp', many: 'Tbsp' },
  { key: 'tsp', re: 'tsps?|teaspoons?', one: 'tsp', many: 'tsp' },
  { key: 'pinch', re: 'pinch(?:es)?', one: 'pinch', many: 'pinches' },
  { key: 'dash', re: 'dash(?:es)?', one: 'dash', many: 'dashes' },
  { key: 'clove', re: 'cloves?', one: 'clove', many: 'cloves' },
  { key: 'bunch', re: 'bunch(?:es)?', one: 'bunch', many: 'bunches' },
  { key: 'sprig', re: 'sprigs?', one: 'sprig', many: 'sprigs' },
  { key: 'slice', re: 'slices?', one: 'slice', many: 'slices' },
  { key: 'rasher', re: 'rashers?', one: 'rasher', many: 'rashers' },
  { key: 'sheet', re: 'sheets?', one: 'sheet', many: 'sheets' },
  { key: 'stick', re: 'sticks?', one: 'stick', many: 'sticks' },
  { key: 'stalk', re: 'stalks?', one: 'stalk', many: 'stalks' },
  { key: 'stem', re: 'stems?', one: 'stem', many: 'stems' },
  { key: 'handful', re: 'handfuls?', one: 'handful', many: 'handfuls' },
  { key: 'packet', re: 'packets?|pkts?|packs?|packages?', one: 'packet', many: 'packets' },
  { key: 'can', re: 'cans?|tins?', one: 'can', many: 'cans' },
  { key: 'jar', re: 'jars?', one: 'jar', many: 'jars' },
  { key: 'bottle', re: 'bottles?', one: 'bottle', many: 'bottles' },
  { key: 'punnet', re: 'punnets?', one: 'punnet', many: 'punnets' },
  { key: 'bundle', re: 'bundles?', one: 'bundle', many: 'bundles' },
  { key: 'head', re: 'heads?', one: 'head', many: 'heads' },
  { key: 'piece', re: 'pieces?|pcs?', one: 'piece', many: 'pieces' },
  { key: 'fillet', re: 'fillets?', one: 'fillet', many: 'fillets' },
  { key: 'loaf', re: 'loaf|loaves', one: 'loaf', many: 'loaves' },
  { key: 'serving', re: 'servings?', one: 'serving', many: 'servings' },
  { key: 'cm', re: 'cm', fam: 'len', f: 1 },
  { key: 'inch', re: 'inch(?:es)?', one: 'inch', many: 'inches' },
  { key: 'lb', re: 'lbs?|pounds?', one: 'lb', many: 'lb' },
  { key: 'oz', re: 'oz|ounces?', one: 'oz', many: 'oz' },
  { key: 'pint', re: 'pints?', one: 'pint', many: 'pints' }
];
const UNIT_BY_KEY = Object.fromEntries(UNIT_DEFS.map((u) => [u.key, u]));
const UNIT_RE = new RegExp(`^(${UNIT_DEFS.map((u) => u.re).join('|')})\\.?(?=[\\s,(]|$)`, 'i');
const CONTAINERS = ['can', 'packet', 'jar', 'bottle', 'punnet'];
const COUNT_UNITS = ['clove', 'stick', 'stalk', 'sprig', 'rasher', 'sheet', 'slice', 'bunch', 'head', 'fillet'];

function unitFor(word) {
  const w = word.toLowerCase().replace(/\.$/, '');
  return UNIT_DEFS.find((u) => new RegExp(`^(?:${u.re})$`, 'i').test(w)) || null;
}

// ---------------------------------------------------------------------------
// Parsing a line
// ---------------------------------------------------------------------------

/**
 * Read one ingredient line.
 * Returns { original, parsed, prefix, min, max, unit, unitText, size, rest, note, name }
 *  - parsed: false when no leading quantity was found (line shown unchanged)
 *  - size:   for "400 g can chickpeas", size is "400 g" and unit is "can" (count = 1)
 *  - note:   text in [square brackets] at the end, e.g. "[double: 3 cups]"
 *  - name:   simplified ingredient name used for merging, sections and pantry staples
 */
export function parseLine(text) {
  const original = String(text ?? '');
  let s = original.trim();
  let note = '';
  const nb = s.match(/\s*\[([^\]]*)\]\s*$/);
  if (nb) { note = nb[1]; s = s.slice(0, nb.index).trim(); }

  let prefix = '';
  const pm = s.match(/^(about|approx\.?|approximately|around|up to)\s+(?=[\d½¼¾⅓⅔⅛])/i);
  if (pm) { prefix = pm[0]; s = s.slice(pm[0].length); }

  const base = { original, prefix, note, parsed: false, min: null, max: null, unit: null, unitText: '', size: '', rest: s };

  const qm = s.match(QTY_RE);
  if (!qm) return { ...base, name: nameOf(s) };

  let min = toNumber(qm[1]);
  let max = qm[2] ? toNumber(qm[2]) : null;
  let rest = s.slice(qm[0].length).trim();
  let unit = null, unitText = '', size = '';

  // "2 x 400 g cans tomatoes"  →  2 cans, each 400 g
  const xm = rest.match(new RegExp(`^[x×]\\s*(${NUM})\\s*([a-zA-Z]+)\\.?\\s+`, 'i'));
  if (xm && unitFor(xm[2])) {
    size = `${xm[1]} ${xm[2]}`;
    rest = rest.slice(xm[0].length);
    const cm = rest.match(UNIT_RE);
    if (cm && CONTAINERS.includes(unitFor(cm[1])?.key)) {
      unit = unitFor(cm[1]).key; unitText = cm[0]; rest = rest.slice(cm[0].length).trim();
    } else {
      unit = 'packet'; unitText = '';
    }
    return finish();
  }

  const um = rest.match(UNIT_RE);
  if (um) {
    const def = unitFor(um[1]);
    const after = rest.slice(um[0].length).trim();
    // "400 g can chickpeas"  →  1 can of 400 g
    const cm = after.match(UNIT_RE);
    const cdef = cm && unitFor(cm[1]);
    if (def.fam && cdef && CONTAINERS.includes(cdef.key) && max == null) {
      size = `${qm[1]} ${um[1]}`;
      min = 1;
      unit = cdef.key; unitText = cm[0];
      rest = after.slice(cm[0].length).trim();
      return finish();
    }
    unit = def.key; unitText = um[0]; rest = after;
  }
  return finish();

  function finish() {
    let name = nameOf(rest);
    // "2 garlic cloves" → unit clove, name garlic (so it merges with "3 cloves garlic")
    if (!unit) {
      const words = name.split(' ');
      const last = UNIT_BY_KEY[words[words.length - 1]];
      if (words.length > 1 && last && COUNT_UNITS.includes(last.key)) {
        unit = last.key; name = words.slice(0, -1).join(' ');
      }
    }
    return { ...base, parsed: Number.isFinite(min) && min > 0, min, max, unit, unitText, size, rest, name };
  }
}

// ---------------------------------------------------------------------------
// Ingredient names (for merging, sections and pantry staples)
// ---------------------------------------------------------------------------

const DESCRIPTORS = /\b(optional|each|about|approx|fresh|freshly|finely|roughly|thinly|coarsely|chopped|sliced|diced|minced|crushed|grated|ground|large|small|medium|extra|lightly|beaten|softened|melted|cold|warm|hot|room temperature|ripe|good quality|quality|packed|heaped|level|whole|boneless|skinless|shredded|peeled|halved|quartered|drained|rinsed|dried|dry|frozen|plus|for|of|a|an|the|some|good|big|few|enough)\b/g;

function singular(w) {
  if (/(ss|us|is)$/.test(w)) return w;
  if (w === 'leaves') return 'leaf';
  if (/ies$/.test(w)) return w.slice(0, -3) + 'y';
  if (/(oes|ches|shes|xes)$/.test(w)) return w.slice(0, -2);
  if (/s$/.test(w) && w.length > 3) return w.slice(0, -1);
  return w;
}

/** "2 onions, finely chopped (or 1 leek)" → "onion" */
export function nameOf(text) {
  let n = norm(text)
    // "minced beef" / "ground beef" → "beef mince", so they merge with "beef mince"
    .replace(/\b(?:minced|ground)\s+(beef|pork|chicken|lamb|veal|turkey)\b/g, '$1 mince')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/^[a-z ]{2,20}:\s*/, ''); // "Garnish: sesame seeds" → "sesame seeds"
  n = n.split(/,|;|\s[–—-]\s|\bto serve\b|\bto taste\b|\bfor (?:serving|garnish|frying|deep frying|rolling|glazing|dusting)\b|\bif desired\b|\bor more\b/)[0];
  n = n.replace(/['’]s\b/g, '').replace(DESCRIPTORS, ' ').replace(/[^a-z&/ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!n) return '';
  const words = n.split(' ');
  words[words.length - 1] = singular(words[words.length - 1]);
  return words.join(' ');
}

// ---------------------------------------------------------------------------
// Formatting quantities
// ---------------------------------------------------------------------------

const FRACTIONS = [[1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'], [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞']];

/** 1.5 → "1 ½", 0.333 → "⅓", 2 → "2" */
export function fmtFraction(v) {
  if (!Number.isFinite(v)) return '';
  let whole = Math.floor(v + 1e-9);
  let frac = v - whole;
  let char = '';
  if (frac > 0.06) {
    if (frac > 0.94) { whole += 1; } else {
      let best = FRACTIONS[0];
      for (const f of FRACTIONS) if (Math.abs(f[0] - frac) < Math.abs(best[0] - frac)) best = f;
      char = best[1];
    }
  }
  if (!whole && !char) return fmtDecimal(v, 2); // very small amounts
  return whole ? (char ? `${whole} ${char}` : String(whole)) : char;
}

function fmtDecimal(v, places) {
  return String(+v.toFixed(places));
}

/** Round metric amounts sensibly: 333.3 g → 335 g, 12.4 g → 12 g, 1.25 kg → 1.25 kg */
function fmtMetric(v, unit) {
  if (unit === 'kg' || unit === 'L') return fmtDecimal(v, 2);
  if (v >= 100) return String(Math.round(v / 5) * 5);
  if (v >= 10) return String(Math.round(v));
  return fmtDecimal(v, 1);
}

/** Convert g→kg or ml→L when big, and back when small. */
function tidyMetric(v, unit) {
  if (unit === 'g' && v >= 1000) return [v / 1000, 'kg'];
  if (unit === 'kg' && v < 1) return [v * 1000, 'g'];
  if (unit === 'ml' && v >= 1000) return [v / 1000, 'L'];
  if (unit === 'L' && v < 1) return [v * 1000, 'ml'];
  return [v, unit];
}

/** Format an amount and its unit: (1.5, 'cup') → "1 ½ cups" */
export function fmtAmount(min, max, unit, unitText = '') {
  const def = unit ? UNIT_BY_KEY[unit] : null;
  if (def?.fam === 'mass' || def?.fam === 'vol') {
    let [a, u] = tidyMetric(min, unit);
    let b = max != null ? tidyMetric(max, unit) : null;
    if (b && b[1] !== u) { b = [max / UNIT_BY_KEY[u].f * UNIT_BY_KEY[unit].f, u]; } // keep both ends in same unit
    return `${fmtMetric(a, u)}${b ? '–' + fmtMetric(b[0], u) : ''} ${u}`;
  }
  const qty = `${fmtFraction(min)}${max != null ? '–' + fmtFraction(max) : ''}`;
  if (!unit) return qty;
  if (def?.fam === 'len') return `${qty} ${unit}`;
  if (def?.one) {
    const big = (max ?? min) > 1 + 1e-9;
    // Keep "(US)" style suffixes from the original wording
    return `${qty} ${big ? def.many : def.one}`;
  }
  return `${qty} ${unitText.trim() || unit}`;
}

// ---------------------------------------------------------------------------
// Scaling
// ---------------------------------------------------------------------------

const PAREN_QTY = new RegExp(`\\((about |approx\\.? )?(${NUM})(?:\\s*(?:–|-)\\s*(${NUM}))?\\s*(g|kg|ml|l|litres?)\\b`, 'gi');

/** Scale quantities inside brackets like "(1 L)" or "(215 g if using tangzhong)". */
function scaleParens(text, k) {
  return text.replace(PAREN_QTY, (m, about, a, b, u) => {
    const def = unitFor(u);
    return `(${about || ''}${fmtAmount(toNumber(a) * k, b ? toNumber(b) * k : null, def.key)}`;
  });
}

/**
 * Scale a parsed line by factor k.
 * Returns { text, scaled } — scaled is false for lines we couldn't read (shown unchanged).
 * At k = 1 the original wording is returned exactly.
 */
export function scaleLine(p, k) {
  if (typeof p === 'string') p = parseLine(p);
  const main = p.original.replace(/\s*\[[^\]]*\]\s*$/, '');
  if (k === 1) return { text: main, note: p.note, scaled: p.parsed };
  if (!p.parsed) return { text: main, note: p.note, scaled: false };
  const min = p.min * k;
  const max = p.max != null ? p.max * k : null;
  let amount;
  if (p.size) {
    const def = UNIT_BY_KEY[p.unit];
    const count = fmtFraction(min) + (max != null ? '–' + fmtFraction(max) : '');
    amount = `${count} × ${p.size} ${(max ?? min) > 1 ? def.many : def.one}`;
  } else if (p.unit && !p.unitText) {
    // Unit found inside the name ("2 garlic cloves"): keep the original word order
    amount = fmtAmount(min, max, null);
  } else {
    amount = fmtAmount(min, max, p.unit, p.unitText);
  }
  const rest = scaleParens(p.rest, k);
  return { text: `${p.prefix}${amount}${rest ? ' ' + rest : ''}`, note: p.note, scaled: true };
}

// ---------------------------------------------------------------------------
// Merging (shopping list)
// ---------------------------------------------------------------------------

/** Which lines can be added together: same name and compatible unit. */
export function mergeKey(p) {
  if (!p.parsed) return null;
  const def = p.unit ? UNIT_BY_KEY[p.unit] : null;
  if (p.size) return `${p.unit}:${norm(p.size).replace(/\s+/g, '')}`;
  if (def?.fam) return def.fam;
  return p.unit || 'count';
}

/**
 * Combine many lines of the same ingredient name.
 * items: [{ parsed, scale }]  →  [{ text, members[] }] (one entry per compatible unit,
 * plus one entry per line that couldn't be merged)
 */
export function combine(items) {
  const byKey = new Map();
  const out = [];
  for (const it of items) {
    const key = mergeKey(it.parsed);
    if (!key) { out.push({ text: scaleLine(it.parsed, it.scale).text, members: [it], merged: false }); continue; }
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(it);
  }
  for (const [, group] of byKey) {
    if (group.length === 1) {
      const it = group[0];
      out.unshift({ text: scaleLine(it.parsed, it.scale).text, members: group, merged: false });
      continue;
    }
    // Add up quantities in a common base unit
    const first = group[0].parsed;
    const def = first.unit ? UNIT_BY_KEY[first.unit] : null;
    let min = 0, max = 0, anyRange = false;
    for (const it of group) {
      const f = def?.fam ? UNIT_BY_KEY[it.parsed.unit].f : 1;
      min += it.parsed.min * it.scale * f;
      max += (it.parsed.max ?? it.parsed.min) * it.scale * f;
      if (it.parsed.max != null) anyRange = true;
    }
    let unit = first.unit;
    if (def?.fam) { unit = def.fam === 'mass' ? 'g' : def.fam === 'vol' ? 'ml' : unit; }
    let amount;
    if (first.size) {
      const cdef = UNIT_BY_KEY[first.unit];
      amount = `${fmtFraction(min)}${anyRange ? '–' + fmtFraction(max) : ''} × ${first.size} ${max > 1 ? cdef.many : cdef.one}`;
    } else {
      amount = fmtAmount(min, anyRange ? max : null, unit, first.unitText);
    }
    // Use wording from a line where the unit was written up front ("3 cloves garlic"),
    // otherwise the simplified name, so we never get "5 cloves garlic cloves".
    const tidy = group.find((it) => it.parsed.unitText || !it.parsed.unit)?.parsed;
    const label = tidy ? displayName(tidy.rest, max > 1 && !tidy.unit) : first.name;
    out.unshift({ text: `${amount} ${label}`, members: group, merged: true });
  }
  return out;
}

/** Tidy name for a merged line: "onions, thinly sliced" → "onions" */
function displayName(rest, plural) {
  let n = rest.replace(/\([^)]*\)/g, '').split(/,|;/)[0].replace(/\s+/g, ' ').trim();
  if (plural && /[a-z]$/i.test(n) && !/s$/i.test(n)) {
    n = /(ch|sh|x|o)$/i.test(n) ? n + 'es' : n + 's';
  }
  return n;
}

// ---------------------------------------------------------------------------
// Supermarket sections
// ---------------------------------------------------------------------------

export const SECTIONS = [
  ['produce', 'Fruit & veg'],
  ['meat', 'Meat & seafood'],
  ['dairy', 'Dairy & eggs'],
  ['bakery', 'Bakery'],
  ['pantry', 'Pantry'],
  ['spices', 'Spices & sauces'],
  ['frozen', 'Frozen'],
  ['other', 'Other']
];

// Keyword map (comma-separated). When several keywords match, the longest
// (most specific) wins, so "coconut milk" goes to pantry rather than dairy.
// Add words here if an ingredient keeps landing in the wrong section —
// or just move it in the app, which remembers your choice.
const KEYWORDS = {
  produce: 'onion, garlic, ginger, carrot, potato, sweet potato, zucchini, capsicum, tomato, cherry tomato, lettuce, cucumber, avocado, spring onion, scallion, shallot, leek, celery, mushroom, broccoli, broccolini, cauliflower, cabbage, bok choy, pak choy, choy sum, spinach, kale, beansprout, bean sprout, snow pea, sugar snap pea, green bean, corn cob, pumpkin, beetroot, beet, lemon, lime, orange, apple, banana, berry, blueberry, strawberry, raspberry, fig, passionfruit, parsley, coriander, basil, mint, rosemary, thyme, chive, chilli, asparagus, daikon, radish, eggplant, herb, salad, rocket, kiwi, mango, grape, pear, lemongrass, mitsuba, vegetable, veg, red pepper, green pepper, yellow pepper, bell pepper',
  meat: 'chicken, beef, pork, lamb, mince, sausage, bacon, ham, pancetta, prawn, shrimp, fish, salmon, meatball, steak, schnitzel, silverside, chorizo, salami, turkey, veal, hambone, brisket, thigh, breast, drumstick, wing, chuck, shoulder, tenderloin, rump',
  dairy: 'milk, butter, cheese, cheddar, parmesan, mozzarella, feta, ricotta, cream, sour cream, thickened cream, yoghurt, yogurt, egg, egg yolk, cream cheese, buttermilk, custard, tasty cheese',
  bakery: 'bread, roll, bun, wrap, tortilla, pita, flatbread, crumpet, baguette, english muffin',
  frozen: 'ice cream, frozen pea, pea, frozen berry, frozen vegetable, puff pastry, shortcrust pastry, pastry, edamame',
  spices: 'salt, pepper, cumin, paprika, cinnamon, nutmeg, turmeric, curry powder, curry paste, garam masala, chilli powder, chilli flake, red pepper flake, oregano, mixed herb, bay leaf, cardamom, clove, allspice, five spice, star anise, sesame seed, mustard, soy sauce, oyster sauce, hoisin, fish sauce, sweet chilli sauce, tomato sauce, bbq sauce, barbecue sauce, worcestershire, sriracha, vinegar, mirin, sake, shaoxing, ketchup, mayonnaise, tomato paste, pizza sauce, sauce, seasoning, stock cube, gravy, vanilla, essence, extract, garlic salt, onion powder, garlic powder, togarashi, gochujang, chilli sauce, peppercorn, tikka masala, masala',
  pantry: 'flour, plain flour, self-raising flour, bread flour, wholemeal flour, cornflour, cornstarch, sugar, caster sugar, brown sugar, icing sugar, raw sugar, rice, pasta, spaghetti, fettuccine, linguine, penne, risoni, noodle, udon, soba, gnocchi, oat, oil, olive oil, sesame oil, vegetable oil, stock, broth, chickpea, lentil, kidney bean, bean, coconut, coconut milk, coconut cream, condensed milk, evaporated milk, milk powder, cocoa, chocolate, choc chip, chocolate chip, baking powder, bicarbonate, bicarb, baking soda, yeast, bread improver, golden syrup, maple syrup, honey, jam, peanut butter, nut, almond, walnut, peanut, cashew, pretzel, biscuit, sultana, raisin, dried fruit, breadcrumb, panko, tomato puree, passata, tuna, wrapper, gelatine, jelly, marshmallow, lolly, sprinkle, custard powder, cornflake, rice paper, glass noodle, nori, corn chip, chip, crunchie, mixed peel, water',
  other: 'foil, baking paper, skewer'
};

const KEYWORDS_FINAL = Object.entries(KEYWORDS)
  .flatMap(([section, list]) => list.split(',').map((w) => [w.trim(), section]))
  .sort((a, b) => b[0].length - a[0].length);

/** Guess the supermarket section for an ingredient. */
export function sectionFor(parsed, overrides = {}) {
  const name = parsed.name;
  if (overrides[name]) return overrides[name];
  const hay = ` ${name} `;
  let found = null;
  for (const [kw, section] of KEYWORDS_FINAL) {
    if (hay.includes(` ${kw} `) || hay.includes(` ${kw}s `)) { found = section; break; }
  }
  if (/\bfrozen\b/i.test(parsed.original) && found !== 'spices') found = 'frozen';
  // "1 tsp dried thyme", "ground ginger" are jars on the spice shelf, not fresh produce
  if (found === 'produce' && /\b(dried|ground)\b/i.test(parsed.original) && ['tsp', 'Tbsp', 'pinch', null].includes(parsed.unit)) found = 'spices';
  // Canned and packaged things live in the pantry aisle
  if (['can', 'jar', 'bottle', 'packet'].includes(parsed.unit) && ['produce', 'meat'].includes(found)) found = 'pantry';
  return found || 'other';
}

/** Is this ingredient one of my pantry staples? */
export function isStaple(parsed, staples) {
  const name = parsed.name;
  if (!name) return false;
  const set = new Set(staples.map((s) => nameOf(s)));
  if (set.has(name)) return true;
  // "salt and pepper", "salt/pepper": staple if every part is
  const parts = name.split(/\s+and\s+|\/|\s+or\s+/).map((x) => x.trim()).filter(Boolean);
  return parts.length > 1 && parts.every((x) => set.has(x));
}

// ---------------------------------------------------------------------------
// Unit helper: approximate grams for 1 Australian cup (250 ml)
// ---------------------------------------------------------------------------

const GRAMS_PER_CUP = [
  ['self-raising flour', 150], ['plain flour', 150], ['bread flour', 150], ['wholemeal flour', 160], ['flour', 150],
  ['caster sugar', 220], ['brown sugar', 200], ['icing sugar', 125], ['raw sugar', 220], ['sugar', 220],
  ['butter', 240], ['rolled oat', 90], ['oat', 90], ['desiccated coconut', 80], ['coconut', 80],
  ['cocoa', 110], ['rice', 200], ['grated cheese', 100], ['cheese', 100], ['choc chip', 190], ['chocolate chip', 190],
  ['sultana', 160], ['honey', 350], ['golden syrup', 350], ['breadcrumb', 110], ['milk powder', 120]
];

/** "≈ 225 g" hint for cup measures of common dry ingredients, or '' */
export function gramsHint(p, k = 1) {
  if (!p.parsed || p.unit !== 'cup' || p.size) return '';
  if (/\d\s*(g|kg|grams?)\b/i.test(p.rest)) return ''; // the line already gives grams
  const hay = ` ${p.name} `;
  const hit = GRAMS_PER_CUP.find(([w]) => hay.includes(` ${w} `) || hay.includes(` ${w}s `));
  if (!hit) return '';
  const g = p.min * k * hit[1];
  const g2 = p.max != null ? p.max * k * hit[1] : null;
  return `≈ ${fmtMetric(g, 'g')}${g2 ? '–' + fmtMetric(g2, 'g') : ''} g`;
}

/** HTML for one ingredient line at scale k, with the bracket note dimmed. */
export function lineHtml(text, k, linkify = (s) => esc(s)) {
  const p = parseLine(text);
  const r = scaleLine(p, k);
  const hint = gramsHint(p, k);
  return {
    html: `${linkify(r.text)}${r.note ? ` <span class="dim">[${esc(r.note)}]</span>` : ''}` +
      (hint ? ` <span class="hint">${esc(hint)}</span>` : ''),
    scaled: r.scaled,
    parsed: p
  };
}
