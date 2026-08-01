/** Plain white panel used across the non-exam pages. */
export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-[8px] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.10)] ${className}`}>
      {children}
    </div>
  );
}
