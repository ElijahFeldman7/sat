"use client";

import { useMemo } from "react";
import { sanitizeQuestionHtml } from "@/lib/sanitize";

/** Renders sanitized question-bank HTML (MathML, tables, images included). */
export function QuestionHtml({ html, className = "" }: { html: string | null; className?: string }) {
  const clean = useMemo(() => sanitizeQuestionHtml(html), [html]);
  if (!clean) return null;
  return <div className={`qbank ${className}`} dangerouslySetInnerHTML={{ __html: clean }} />;
}

/** Inline variant for answer choices, which are single paragraphs. */
export function QuestionHtmlInline({ html }: { html: string }) {
  const clean = useMemo(() => sanitizeQuestionHtml(html), [html]);
  return <span className="qbank" dangerouslySetInnerHTML={{ __html: clean }} />;
}
