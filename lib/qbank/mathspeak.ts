/**
 * Converts College Board's spoken-math `alt` text into MathML.
 *
 * Legacy disclosed items ship their equations as ~90px PNGs, which are 1x
 * rasters and go soft on any retina display. The only machine-readable form of
 * the expression is the image's `alt`, written for a screen reader: "4 x minus
 * one half, equals negative 5". This turns that back into markup the browser
 * renders as vector text, matching the newer items that ship MathML directly.
 *
 * The corpus is narrow — 153 distinct words across ~1,100 expressions — but it
 * also contains prose that is not an expression at all ("This answer choice
 * consists of two equations", "line segment N R", "110 centimeters cubed").
 * Since a wrong equation on a graded question is far worse than a blurry one,
 * the grammar is closed: **any** token or structure it does not recognise makes
 * the whole conversion fail and returns null, and the caller keeps the image.
 * Widening it is safe; loosening the failure rule is not.
 */

/* ------------------------------------------------------------------ tokens */

type Tok =
  | { t: "num"; v: string }
  | { t: "var"; v: string }
  | { t: "op"; v: string }
  | { t: "rel"; v: string }
  | { t: "kw"; v: Keyword };

type Keyword =
  | "lparen"
  | "rparen"
  | "sqrt"
  | "cbrt"
  | "frac"
  | "fracnum"
  | "fracden"
  | "endfrac"
  | "over"
  | "pow"
  | "powend"
  | "sub"
  | "endsub"
  | "endroot"
  | "rootn"
  | "of"
  | "negative"
  | "squared"
  | "cubed"
  | "comma"
  | "segment"
  | "line"
  | "ray"
  | "angle"
  | "triangle"
  | "side"
  | "arc";

/** Geometry names: a marker word, then a run of point letters. */
const GEOMETRY: Record<string, { over?: string; before?: string }> = {
  segment: { over: "¯" }, // AB with a bar
  line: { over: "↔" }, // PQ with a double arrow
  ray: { over: "→" },
  arc: { over: "⌒" },
  angle: { before: "∠" },
  triangle: { before: "△" },
  side: {}, // written plain
};

/**
 * Multi-word phrases collapsed before tokenising, longest first so that
 * "is less than or equal to" never matches as "is less than".
 */
const PHRASES: [RegExp, string][] = [
  // "0 is less than a, which is less than b" chains into 0 < a < b, so the
  // continuation reads as the same relation. Longest first throughout.
  [/\b(?:which\s+)?is\s+less\s+than\s+or\s+equal\s+to\b/gi, " ⟪le⟫ "],
  [/\b(?:which\s+)?is\s+greater\s+than\s+or\s+equal\s+to\b/gi, " ⟪ge⟫ "],
  [/\bis\s+not\s+equal\s+to\b/gi, " ⟪ne⟫ "],
  [/\b(?:which\s+)?is\s+less\s+than\b/gi, " ⟪lt⟫ "],
  [/\b(?:which\s+)?is\s+greater\s+than\b/gi, " ⟪gt⟫ "],
  [/\bis\s+equal\s+to\b/gi, " ⟪eq⟫ "],
  [/\bplus\s+or\s+minus\b/gi, " ⟪pm⟫ "],
  [/\bend\s+subscript\b/gi, " ⟪endsub⟫ "],
  [/\bend\s+root\b/gi, " ⟪endroot⟫ "],
  [/\bline\s+segment\b/gi, " ⟪segment⟫ "],
  [
    /\b(?:the\s+)?(fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+root\s+of\b/gi,
    " ⟪rootn⟫ $1 ",
  ],
  [/\bthe\s+fraction\s+with\s+numerator\b/gi, " ⟪fracnum⟫ "],
  [/\band\s+denominator\b/gi, " ⟪fracden⟫ "],
  [/\bend\s+fraction\b/gi, " ⟪endfrac⟫ "],
  [/\bthe\s+negative\s+fraction\b/gi, " negative ⟪frac⟫ "],
  [/\bthe\s+fraction\b/gi, " ⟪frac⟫ "],
  [/\b(?:the\s+)?square\s+root\s+of\b/gi, " ⟪sqrt⟫ "],
  [/\b(?:the\s+)?cube\s+root\s+of\b/gi, " ⟪cbrt⟫ "],
  [/\bopen\s+parenthesis\b/gi, " ⟪lparen⟫ "],
  [/\bclose\s+parenthesis\b/gi, " ⟪rparen⟫ "],
  [/\braised\s+to\s+the\s+power\b/gi, " ⟪pow⟫ "],
  [/\braised\s+to\s+the\b/gi, " ⟪poword⟫ "],
  [/\bto\s+the\s+power\b/gi, " ⟪pow⟫ "],
  [/\bto\s+the\b/gi, " ⟪poword⟫ "],
  [/\bsubscript\b/gi, " ⟪sub⟫ "],
  [/\bsub\b/gi, " ⟪sub⟫ "],
  // Bare comparatives, only reachable once every "is …" form above has been
  // consumed, so "is less than" can never fall through to these.
  [/\bless\s+than\s+or\s+equal\s+to\b/gi, " ⟪le⟫ "],
  [/\bgreater\s+than\s+or\s+equal\s+to\b/gi, " ⟪ge⟫ "],
  [/\bless\s+than\b/gi, " ⟪lt⟫ "],
  [/\bgreater\s+than\b/gi, " ⟪gt⟫ "],
];

const RELATIONS: Record<string, string> = {
  "⟪le⟫": "≤",
  "⟪ge⟫": "≥",
  "⟪ne⟫": "≠",
  "⟪lt⟫": "<",
  "⟪gt⟫": ">",
  "⟪eq⟫": "=",
  equals: "=",
};

const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7,
  eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13,
  fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17,
  eighteenth: 18, nineteenth: 19, twentieth: 20,
};

const CARDINALS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20,
};

/** Denominator words, singular and plural: "one half", "three halves". */
const DENOMS: Record<string, number> = {
  half: 2, halves: 2, third: 3, thirds: 3, fourth: 4, fourths: 4,
  quarter: 4, quarters: 4, fifth: 5, fifths: 5, sixth: 6, sixths: 6,
  seventh: 7, sevenths: 7, eighth: 8, eighths: 8, ninth: 9, ninths: 9,
  tenth: 10, tenths: 10, eleventh: 11, elevenths: 11, twelfth: 12,
  twelfths: 12, fourteenth: 14, fourteenths: 14,
};

const GREEK: Record<string, string> = { pi: "π", theta: "θ" };

const OPERATORS: Record<string, string> = {
  plus: "+",
  minus: "−",
  times: "×",
  "⟪pm⟫": "±",
};

function tokenize(input: string): Tok[] | null {
  // Case is *not* folded: `H` and `h`, `S` and `s` are different variables, and
  // the bank uses both. Keyword matching lowercases per token instead.
  let s = ` ${input} `;

  // Thousands separators first, so the prosody pass can drop every other comma.
  s = s.replace(/(\d),(?=\d{3}\b)/g, "$1");
  // Commas and sentence punctuation are read as pauses, not as structure. The
  // *word* "comma" is different — it separates coordinate pairs — and is left
  // in place to fail the parse below.
  s = s.replace(/[,.;:?!]/g, " ");
  // Spoken "zero" is the digit. Done before tokenising so "zero point 2 4"
  // reaches the decimal rule, which keys off a numeral before "point".
  s = s.replace(/\bzero\b/gi, " 0 ");
  // Hyphenated word fractions ("one-third") share the spaced form's handling.
  s = s.replace(/\b([a-zA-Z]+)-([a-zA-Z]+)\b/g, "$1 $2");

  for (const [re, to] of PHRASES) s = s.replace(re, to);

  const words = s.split(/\s+/).filter(Boolean);
  const out: Tok[] = [];

  const lower = words.map((w) => w.toLowerCase());

  for (let i = 0; i < words.length; i++) {
    // `w` keeps the source case and is only ever used for variable names;
    // every keyword and number lookup goes through `lw`.
    const w = words[i];
    const lw = lower[i];

    // "0 point 0 9" — a decimal spoken digit by digit.
    if (/^\d+$/.test(w) && lower[i + 1] === "point") {
      let digits = "";
      let j = i + 2;
      while (j < words.length && /^\d+$/.test(words[j])) digits += words[j++];
      if (!digits) return null;
      out.push({ t: "num", v: `${w}.${digits}` });
      i = j - 1;
      continue;
    }

    if (/^\d+(?:\.\d+)?$/.test(w)) {
      out.push({ t: "num", v: w });
      continue;
    }

    // "one half", "three halves" — a fraction spelled out.
    const lead = CARDINALS[lw];
    if (lead !== undefined && lower[i + 1] && DENOMS[lower[i + 1]] !== undefined) {
      out.push({ t: "kw", v: "frac" });
      out.push({ t: "num", v: String(lead) });
      out.push({ t: "kw", v: "over" });
      out.push({ t: "num", v: String(DENOMS[lower[i + 1]]) });
      out.push({ t: "kw", v: "endfrac" });
      i += 1;
      continue;
    }

    if (RELATIONS[lw] !== undefined) {
      out.push({ t: "rel", v: RELATIONS[lw] });
      continue;
    }
    if (OPERATORS[lw] !== undefined) {
      out.push({ t: "op", v: OPERATORS[lw] });
      continue;
    }
    if (GREEK[lw] !== undefined) {
      out.push({ t: "var", v: GREEK[lw] });
      continue;
    }

    switch (lw) {
      case "⟪lparen⟫": out.push({ t: "kw", v: "lparen" }); continue;
      case "⟪rparen⟫": out.push({ t: "kw", v: "rparen" }); continue;
      case "⟪sqrt⟫": out.push({ t: "kw", v: "sqrt" }); continue;
      case "⟪cbrt⟫": out.push({ t: "kw", v: "cbrt" }); continue;
      case "⟪frac⟫": out.push({ t: "kw", v: "frac" }); continue;
      case "⟪fracnum⟫": out.push({ t: "kw", v: "fracnum" }); continue;
      case "⟪fracden⟫": out.push({ t: "kw", v: "fracden" }); continue;
      case "⟪endfrac⟫": out.push({ t: "kw", v: "endfrac" }); continue;
      case "⟪pow⟫": out.push({ t: "kw", v: "pow" }); continue;
      // Trailing "power" in "2 to the x power"; the "to the power 5" form
      // swallowed the word in the phrase pass, so this is only the suffix.
      case "power": out.push({ t: "kw", v: "powend" }); continue;
      case "⟪sub⟫": out.push({ t: "kw", v: "sub" }); continue;
      case "⟪endsub⟫": out.push({ t: "kw", v: "endsub" }); continue;
      case "⟪endroot⟫": out.push({ t: "kw", v: "endroot" }); continue;
      case "over": out.push({ t: "kw", v: "over" }); continue;
      case "of": out.push({ t: "kw", v: "of" }); continue;
      case "negative": out.push({ t: "kw", v: "negative" }); continue;
      case "squared": out.push({ t: "kw", v: "squared" }); continue;
      case "cubed": out.push({ t: "kw", v: "cubed" }); continue;
      case "comma": out.push({ t: "kw", v: "comma" }); continue;
      case "⟪segment⟫": out.push({ t: "kw", v: "segment" }); continue;
      case "line": out.push({ t: "kw", v: "line" }); continue;
      case "ray": out.push({ t: "kw", v: "ray" }); continue;
      case "arc": out.push({ t: "kw", v: "arc" }); continue;
      case "angle": out.push({ t: "kw", v: "angle" }); continue;
      case "triangle": out.push({ t: "kw", v: "triangle" }); continue;
      case "side": out.push({ t: "kw", v: "side" }); continue;
      case "the": continue; // filler, e.g. "the fraction a over b"
    }

    // "to the fourth power" — an ordinal exponent, so the trailing "power"
    // folds in here. "to the x power" leaves the exponent to the parser and
    // the "power" suffix becomes a `powend` the parser eats.
    if (lw === "⟪rootn⟫") {
      const ord = ORDINALS[lower[i + 1]];
      if (ord === undefined) return null;
      out.push({ t: "kw", v: "rootn" });
      out.push({ t: "num", v: String(ord) });
      i += 1;
      continue;
    }

    if (lw === "⟪poword⟫") {
      const ord = ORDINALS[lower[i + 1]];
      if (ord !== undefined && lower[i + 2] === "power") {
        out.push({ t: "kw", v: "pow" });
        out.push({ t: "num", v: String(ord) });
        i += 2;
        continue;
      }
      out.push({ t: "kw", v: "pow" });
      continue;
    }

    if (/^[a-zA-Z]$/.test(w)) {
      out.push({ t: "var", v: w });
      continue;
    }

    // Point runs written closed up, as in "line segment NQ". Only all-caps, so
    // ordinary words can never be shredded into variables this way.
    if (/^[A-Z]{2,4}$/.test(w)) {
      for (const ch of w) out.push({ t: "var", v: ch });
      continue;
    }

    return null; // unknown word — refuse the whole expression
  }

  return out;
}

/* ------------------------------------------------------------------ parser */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeChar = esc;

const mn = (v: string) => `<mn>${esc(v)}</mn>`;
const mi = (v: string) => `<mi>${esc(v)}</mi>`;
const mo = (v: string) => `<mo>${esc(v)}</mo>`;
const row = (parts: string[]) => (parts.length === 1 ? parts[0] : `<mrow>${parts.join("")}</mrow>`);

class Parser {
  private i = 0;
  constructor(private readonly toks: Tok[]) {}

  private peek(): Tok | undefined {
    return this.toks[this.i];
  }

  private isKw(k: Keyword): boolean {
    const t = this.peek();
    return !!t && t.t === "kw" && t.v === k;
  }

  private eat(k: Keyword): boolean {
    if (!this.isKw(k)) return false;
    this.i++;
    return true;
  }

  done(): boolean {
    return this.i >= this.toks.length;
  }

  /**
   * list := relation ( ',' relation )*
   *
   * The word "comma" is spoken only where one is actually printed — coordinate
   * pairs like "0 comma 1". Brackets are never inferred: if the image had them
   * the alt would say "open parenthesis".
   */
  list(): string | null {
    const first = this.relation();
    if (first === null) return null;
    const parts = [first];
    while (this.isKw("comma")) {
      this.i++;
      parts.push(mo(","));
      const next = this.relation();
      if (next === null) return null;
      parts.push(next);
    }
    return row(parts);
  }

  /** relation := sum ( REL sum )* */
  relation(): string | null {
    const first = this.sum();
    if (first === null) return null;
    const parts = [first];
    while (this.peek()?.t === "rel") {
      parts.push(mo((this.toks[this.i++] as { v: string }).v));
      const next = this.sum();
      if (next === null) return null;
      parts.push(next);
    }
    return row(parts);
  }

  /** sum := product ( (+|−) product )* */
  private sum(): string | null {
    const first = this.product();
    if (first === null) return null;
    const parts = [first];
    while (this.peek()?.t === "op" && (this.peek() as { v: string }).v !== "×") {
      parts.push(mo((this.toks[this.i++] as { v: string }).v));
      const next = this.product();
      if (next === null) return null;
      parts.push(next);
    }
    return row(parts);
  }

  /**
   * product := unary ( ('times' | juxtaposition | 'over') unary )*
   *
   * Juxtaposition is multiplication — "4 x", "a x", "D E" — and binds tighter
   * than +/−. `over` sits at the same level, so "D E over D F" is (DE)/(DF).
   */
  private product(): string | null {
    let left = this.unary();
    if (left === null) return null;

    for (;;) {
      if (this.peek()?.t === "op" && (this.peek() as { v: string }).v === "×") {
        this.i++;
        const right = this.unary();
        if (right === null) return null;
        left = row([left, mo("×"), right]);
        continue;
      }
      if (this.eat("over")) {
        const right = this.unary();
        if (right === null) return null;
        left = `<mfrac>${left}${right}</mfrac>`;
        continue;
      }
      if (this.startsAtom()) {
        const right = this.unary();
        if (right === null) return null;
        left = row([left, `<mo>&#x2062;</mo>`, right]); // invisible times
        continue;
      }
      return left;
    }
  }

  /** unary := 'negative' unary | power */
  private unary(): string | null {
    if (this.eat("negative")) {
      const inner = this.unary();
      return inner === null ? null : row([mo("−"), inner]);
    }
    return this.power();
  }

  /** power := postfix ( 'squared' | 'cubed' | 'to the power' atom ) */
  private power(): string | null {
    const base = this.postfix();
    if (base === null) return null;
    if (this.eat("squared")) return `<msup>${base}${mn("2")}</msup>`;
    if (this.eat("cubed")) return `<msup>${base}${mn("3")}</msup>`;
    if (this.eat("pow")) {
      // A trailing "power" closes the exponent explicitly, so everything up to
      // it belongs upstairs: "2 raised to the x plus 1 power" is 2^(x+1). With
      // no terminator ("to the power 5") the exponent is a single term.
      const terminated = this.toks.slice(this.i).some((t) => t.t === "kw" && t.v === "powend");
      const exp = terminated ? this.sum() : this.unary();
      if (exp === null) return null;
      if (terminated && !this.eat("powend")) return null;
      return `<msup>${base}${exp}</msup>`;
    }
    return base;
  }

  /** postfix := atom ( 'sub' atom | 'of' atom ) */
  private postfix(): string | null {
    let base = this.atom();
    if (base === null) return null;
    for (;;) {
      if (this.eat("sub")) {
        const idx = this.atom();
        if (idx === null) return null;
        this.eat("endsub");
        base = `<msub>${base}${idx}</msub>`;
        continue;
      }
      // "f of x" is function application; "square root of" was consumed above.
      if (this.eat("of")) {
        const arg = this.atom();
        if (arg === null) return null;
        base = row([base, `<mo>&#x2061;</mo>`, mo("("), arg, mo(")")]);
        continue;
      }
      return base;
    }
  }

  /**
   * The bit under the root sign. A radicand spanning more than one term is
   * always closed with "end root" in this corpus, so the marker decides the
   * extent: with it, everything up to it belongs under the sign; without it,
   * the root covers a single term. Guessing here would silently change the
   * value — sqrt(25) + 168 is not sqrt(25 + 168).
   */
  private radicand(index: string | null): string | null {
    const terminated = this.toks.slice(this.i).some((t) => t.t === "kw" && t.v === "endroot");
    const inner = terminated ? this.sum() : this.unary();
    if (inner === null) return null;
    if (terminated && !this.eat("endroot")) return null;
    return index === null ? `<msqrt>${inner}</msqrt>` : `<mroot>${inner}${mn(index)}</mroot>`;
  }

  private startsAtom(): boolean {
    const t = this.peek();
    if (!t) return false;
    if (t.t === "num" || t.t === "var") return true;
    if (t.t !== "kw") return false;
    return ["lparen", "sqrt", "cbrt", "rootn", "frac", "fracnum", ...Object.keys(GEOMETRY)].includes(
      t.v,
    );
  }

  /**
   * A geometry name: the marker word, then the run of point letters it covers.
   * "line segment A B" is AB under a bar, "angle B A C" is ∠BAC.
   */
  private geometry(): string | null {
    const t = this.peek();
    if (!t || t.t !== "kw") return null;
    const shape = GEOMETRY[t.v];
    if (!shape) return null;
    this.i++;

    const points: string[] = [];
    while (this.peek()?.t === "var") {
      points.push(mi((this.toks[this.i++] as { v: string }).v));
    }
    if (points.length === 0) return null;

    const name = row(points);
    if (shape.over) {
      return `<mover accent="true"><mrow>${name}</mrow><mo stretchy="true">${escapeChar(
        shape.over,
      )}</mo></mover>`;
    }
    return shape.before ? row([mo(shape.before), name]) : name;
  }

  private atom(): string | null {
    const t = this.peek();
    if (!t) return null;

    if (t.t === "num") {
      this.i++;
      return mn(t.v);
    }
    if (t.t === "var") {
      this.i++;
      return mi(t.v);
    }
    if (t.t !== "kw") return null;

    if (GEOMETRY[t.v]) return this.geometry();

    if (this.eat("lparen")) {
      const inner = this.relation();
      if (inner === null || !this.eat("rparen")) return null;
      return row([mo("("), inner, mo(")")]);
    }
    if (this.eat("sqrt")) return this.radicand(null);
    if (this.eat("cbrt")) return this.radicand("3");
    if (this.isKw("rootn")) {
      this.i++;
      const idx = this.toks[this.i++];
      if (!idx || idx.t !== "num") return null;
      return this.radicand(idx.v);
    }
    // "the fraction with numerator <sum> and denominator <sum> [end fraction]"
    if (this.eat("fracnum")) {
      const num = this.sum();
      if (num === null || !this.eat("fracden")) return null;
      const den = this.sum();
      if (den === null) return null;
      this.eat("endfrac");
      return `<mfrac>${num}${den}</mfrac>`;
    }
    // "the fraction <x> over <y> [end fraction]", and the spelled-out fractions
    // the tokeniser rewrites into the same shape. `frac` is only a marker —
    // `product` already builds the mfrac when it reaches `over`, so consuming
    // the `over` here too would swallow it and fail the parse.
    if (this.eat("frac")) {
      const inner = this.product();
      if (inner === null) return null;
      this.eat("endfrac");
      return inner;
    }
    return null;
  }
}

/**
 * Returns MathML for `alt`, or null when it is not an expression this grammar
 * fully understands. Null is the safe answer and the caller must keep the
 * original image — never render a partial parse.
 */
export function speechToMathML(alt: string): string | null {
  const text = alt.trim();
  if (!text) return null;

  const toks = tokenize(text);
  if (!toks || toks.length === 0) return null;

  // A lone number or letter is not worth swapping and is usually a label.
  if (toks.length === 1) return null;

  const parser = new Parser(toks);
  const body = parser.list();
  if (body === null || !parser.done()) return null;

  return `<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow>${body}</mrow></math>`;
}
