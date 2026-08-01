import DOMPurify from "isomorphic-dompurify";

/**
 * Question HTML comes straight from College Board and contains MathML, tables,
 * and data: images. DOMPurify keeps MathML and SVG by default; we only need to
 * allow the data: URIs the bank uses for rendered equations.
 */
export function sanitizeQuestionHtml(html: string | null | undefined): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, mathMl: true, svg: true },
    ADD_ATTR: ["align", "border", "scope", "colspan", "rowspan", "alttext", "role"],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });
}
