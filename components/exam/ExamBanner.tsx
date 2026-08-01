/**
 * The navy strip Bluebook shows under the header. Same geometry as the
 * reference screenshots (32px tall, inset 40px, rounded), repurposed to carry
 * the drill's own context.
 */
export function ExamBanner({ text }: { text: string }) {
  return (
    <div className="h-[32px] shrink-0 bg-white px-[40px]">
      <div className="flex h-full items-center justify-center rounded-[4px] bg-bb-navy text-[11px] font-bold uppercase tracking-[0.06em] text-white">
        {text}
      </div>
    </div>
  );
}
