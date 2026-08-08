"use client";

import { memo, useMemo } from "react";
import { sanitizeQuestionHtml } from "@/lib/sanitize";

/*
 * Both of these are memoized, and both hand React a memoized
 * `dangerouslySetInnerHTML` object rather than a fresh literal.
 *
 * That is load-bearing, not a micro-optimisation. React diffs props by
 * reference and then writes `innerHTML` unconditionally, so a new `{__html}`
 * object rebuilds the entire subtree — even when the markup is identical. The
 * exam clock re-renders ExamShell four times a second, which was rebuilding the
 * passage under the student: a mouse selection made between two ticks collapsed
 * within 250ms, and the pane lost its scroll position and snapped back to the
 * top of the passage.
 */

/** Renders sanitized question-bank HTML (MathML, tables, images included). */
export const QuestionHtml = memo(function QuestionHtml({
  html,
  className = "",
}: {
  html: string | null;
  className?: string;
}) {
  const inner = useMemo(() => ({ __html: sanitizeQuestionHtml(html) }), [html]);
  if (!inner.__html) return null;
  return <div className={`qbank ${className}`} dangerouslySetInnerHTML={inner} />;
});

/** Inline variant for answer choices, which are single paragraphs. */
export const QuestionHtmlInline = memo(function QuestionHtmlInline({ html }: { html: string }) {
  const inner = useMemo(() => ({ __html: sanitizeQuestionHtml(html) }), [html]);
  return <span className="qbank" dangerouslySetInnerHTML={inner} />;
});
