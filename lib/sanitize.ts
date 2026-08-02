import DOMPurify from "isomorphic-dompurify";
import { speechToMathML } from "@/lib/qbank/mathspeak";

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&nbsp;": " ",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&[a-z]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

const escapeText = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Splits an element's inner markup into its top-level child subtrees. */
function topLevelChildren(content: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  const tag = /<(\/?)[a-zA-Z][\w:-]*[^>]*?(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(content))) {
    if (m[2] === "/") {
      if (depth === 0) out.push(m[0]);
      continue;
    }
    if (m[1] === "/") {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push(content.slice(start, m.index + m[0].length));
        start = -1;
      }
    } else {
      if (depth === 0) start = m.index;
      depth++;
    }
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

/**
 * Rewrites the MathML 3 elements that MathML Core dropped.
 *
 * Browsers do not fail loudly on these — they render the children and discard
 * the element, which quietly changes what the maths says. `<mfenced>` is the
 * serious one: `10<mfenced>15x-9</mfenced>` loses its brackets and reads as
 * `1015x-9`, turning a correct equation into a different, wrong one. The bank
 * uses it 569 times. `<menclose notation="top">` is the overbar in segment
 * names like XY, and vanishes the same way.
 *
 * Both are rewritten innermost-first so nesting resolves correctly.
 */
function modernizeMathML(html: string): string {
  let out = html;

  const MFENCED = /<mfenced\b([^>]*)>((?:(?!<mfenced\b)[\s\S])*?)<\/mfenced>/i;
  for (let guard = 0; guard < 500; guard++) {
    const m = MFENCED.exec(out);
    if (!m) break;
    const attrs = m[1];
    const open = /\bopen\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? "(";
    const close = /\bclose\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? ")";
    const separators = (/\bseparators\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? ",").replace(/\s+/g, "");

    const kids = topLevelChildren(m[2]);
    // Per the spec the separator list is index-matched, with the last entry
    // reused once it runs out.
    const inner = kids
      .map((kid, i) => {
        if (i === 0) return kid;
        const sep = separators[Math.min(i - 1, separators.length - 1)] ?? ",";
        return `<mo>${escapeText(sep)}</mo>${kid}`;
      })
      .join("");

    const fenced =
      `<mrow>${open ? `<mo>${escapeText(open)}</mo>` : ""}` +
      `${inner}${close ? `<mo>${escapeText(close)}</mo>` : ""}</mrow>`;
    out = out.slice(0, m.index) + fenced + out.slice(m.index + m[0].length);
  }

  const MENCLOSE = /<menclose\b([^>]*)>((?:(?!<menclose\b)[\s\S])*?)<\/menclose>/i;
  for (let guard = 0; guard < 500; guard++) {
    const m = MENCLOSE.exec(out);
    if (!m) break;
    const notation = /\bnotation\s*=\s*"([^"]*)"/i.exec(m[1])?.[1] ?? "";
    const replacement = /\btop\b/i.test(notation)
      ? `<mover accent="true"><mrow>${m[2]}</mrow><mo stretchy="true">&#x00AF;</mo></mover>`
      : // No Core equivalent for box/circle/strike — an mrow is what the
        // browser already renders, so this is no worse and keeps the content.
        `<mrow>${m[2]}</mrow>`;
    out = out.slice(0, m.index) + replacement + out.slice(m.index + m[0].length);
  }

  return out;
}

/**
 * Swaps the legacy bank's rasterised equations for MathML.
 *
 * Those items ship each expression as a ~90px PNG, which is a 1x asset and goes
 * soft wherever the device pixel ratio is above 1. The image's `alt` holds the
 * expression as speech, and `speechToMathML` turns the ones it fully
 * understands back into markup that renders as vector text. Anything it will
 * not vouch for comes back null and the original image is left exactly as it
 * was, so this can only ever improve a question, never corrupt one.
 */
function inlineMathImages(html: string): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    if (!/\bclass\s*=\s*"[^"]*\bmath-img\b[^"]*"/i.test(tag)) return tag;
    const alt = /\balt\s*=\s*"([^"]*)"/i.exec(tag)?.[1];
    if (!alt) return tag;
    return speechToMathML(decodeEntities(alt)) ?? tag;
  });
}

/**
 * Question HTML comes straight from College Board and contains MathML, tables,
 * and data: images. DOMPurify keeps MathML and SVG by default; we only need to
 * allow the data: URIs the bank uses for rendered equations.
 */
export function sanitizeQuestionHtml(html: string | null | undefined): string {
  if (!html) return "";
  // Before sanitising, not after: the generated MathML is built from bank text
  // and goes through DOMPurify like everything else.
  return DOMPurify.sanitize(modernizeMathML(inlineMathImages(html)), {
    USE_PROFILES: { html: true, mathMl: true, svg: true },
    // data-hl / data-note carry the student's highlight colour and note.
    ADD_ATTR: ["align", "border", "scope", "colspan", "rowspan", "alttext", "role", "data-hl", "data-note"],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });
}
