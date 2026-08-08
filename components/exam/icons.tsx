/** Inline SVGs traced from the Bluebook chrome in /public. */

export function BookmarkIcon({ filled = false, className = "" }: { filled?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M6 3.5h12a1 1 0 0 1 1 1v16.2a.6.6 0 0 1-.95.49L12 16.8l-6.05 4.39A.6.6 0 0 1 5 20.7V4.5a1 1 0 0 1 1-1Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HighlightIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M4 20.5h5.2l1.7-1.7 8.4-8.4a2 2 0 0 0 0-2.83l-1.9-1.9a2 2 0 0 0-2.83 0l-8.4 8.4L4.5 15.8 4 20.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="m13.9 6.9 3.2 3.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function NotesIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect
        x="4"
        y="3.5"
        width="16"
        height="17"
        rx="1.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M7.6 8.5h8.8M7.6 12h8.8M7.6 15.5h5.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function MoreIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <circle cx="12" cy="5" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="12" cy="19" r="1.7" />
    </svg>
  );
}

export function ChevronDown({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="m5 9 7 7 7-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChevronUp({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="m5 15 7-7 7 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GrabberIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M6.2 6.4 2.4 12l3.8 5.6V6.4Z" />
      <path d="M9.8 6.4 13.6 12l-3.8 5.6V6.4Z" />
    </svg>
  );
}

export function PinIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 22s7-7.1 7-12a7 7 0 1 0-14 0c0 4.9 7 12 7 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="10" r="2.4" fill="currentColor" />
    </svg>
  );
}

export function FlagIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M7 3.5h10a.8.8 0 0 1 .8.8v15.4a.5.5 0 0 1-.8.4L12 16.4l-5 3.7a.5.5 0 0 1-.8-.4V4.3a.8.8 0 0 1 .8-.8Z" />
    </svg>
  );
}

export function CalculatorIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="4.5" y="2.8" width="15" height="18.4" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <rect x="7.4" y="5.7" width="9.2" height="3.4" rx="0.7" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <g fill="currentColor">
        <circle cx="8.4" cy="12.6" r="1.05" />
        <circle cx="12" cy="12.6" r="1.05" />
        <circle cx="15.6" cy="12.6" r="1.05" />
        <circle cx="8.4" cy="16.4" r="1.05" />
        <circle cx="12" cy="16.4" r="1.05" />
        <circle cx="15.6" cy="16.4" r="1.05" />
      </g>
    </svg>
  );
}

export function AbcIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 24" className={className} aria-hidden="true">
      <text
        x="16"
        y="17"
        textAnchor="middle"
        fontSize="12.5"
        fontWeight="700"
        fill="currentColor"
        fontFamily="Helvetica, Arial, sans-serif"
      >
        ABC
      </text>
      <path d="M3 12.4h26" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function CloseIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ---------------------------------------------------------------- */
/* More-menu glyphs — outline, 24px grid, matching the header icons.  */
/* ---------------------------------------------------------------- */

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export function HelpIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g {...stroke}>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.4 9.2a2.7 2.7 0 1 1 3.4 2.6c-.6.2-.9.7-.9 1.3v.6" />
      </g>
      <circle cx="12" cy="16.8" r="1" fill="currentColor" />
    </svg>
  );
}

export function KeyboardIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g {...stroke}>
        <rect x="2.5" y="6" width="19" height="12" rx="2" />
        <path d="M8 15h8" />
      </g>
      <g fill="currentColor">
        <circle cx="6" cy="9.5" r="0.9" />
        <circle cx="9.4" cy="9.5" r="0.9" />
        <circle cx="12.8" cy="9.5" r="0.9" />
        <circle cx="16.2" cy="9.5" r="0.9" />
        <circle cx="6" cy="12.5" r="0.9" />
        <circle cx="18" cy="9.5" r="0.9" />
      </g>
    </svg>
  );
}

export function EraserIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g {...stroke}>
        <path d="M8.6 19.5 3.9 14.8a1.6 1.6 0 0 1 0-2.3l8-8a1.6 1.6 0 0 1 2.3 0l5.1 5.1a1.6 1.6 0 0 1 0 2.3l-7.6 7.6z" />
        <path d="M7.9 8.6 15.4 16" />
        <path d="M9 19.5h11" />
      </g>
    </svg>
  );
}

export function ListIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g {...stroke}>
        <path d="M9 7h11M9 12h11M9 17h11" />
        <path d="M4.5 7h.01M4.5 12h.01M4.5 17h.01" />
      </g>
    </svg>
  );
}

export function ExitIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g {...stroke}>
        <path d="M12 4.3 2.8 20.2h18.4z" />
        <path d="M12 10v4.2" />
      </g>
      <circle cx="12" cy="17.3" r="1" fill="currentColor" />
    </svg>
  );
}

/**
 * The droplet Bluebook puts inside the swatch that is currently armed, so the
 * toolbar shows which colour a selection will get.
 */
export function DropletIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 3.4c3.5 4.1 5.5 6.8 5.5 9.4a5.5 5.5 0 0 1-11 0c0-2.6 2-5.3 5.5-9.4Z"
        fill="currentColor"
        stroke="#1e1e1e"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A U over the three line styles, for the underline menu's button. */
export function UnderlineStylesIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        <path d="M7 2.8v6.4a5 5 0 0 0 10 0V2.8" strokeWidth="1.9" />
        <path d="M5.6 14.6h12.8" strokeWidth="1.6" />
        <path d="M5.6 18.2h12.8" strokeWidth="1.6" strokeDasharray="3.2 2.4" />
        <path d="M5.6 21.8h12.8" strokeWidth="1.6" strokeDasharray="0.1 3" />
      </g>
    </svg>
  );
}

/** A U with one line under it, in the style being offered or applied. */
export function UnderlineIcon({
  kind = "solid",
  className = "",
}: {
  kind?: "solid" | "dashed" | "dotted";
  className?: string;
}) {
  const dashes = kind === "dashed" ? "3.2 2.4" : kind === "dotted" ? "0.1 3" : undefined;
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        <path d="M7 3.6v7a5 5 0 0 0 10 0v-7" strokeWidth="1.9" />
        <path d="M5.6 19.4h12.8" strokeWidth="1.8" strokeDasharray={dashes} />
      </g>
    </svg>
  );
}

/**
 * Bluebook's add-note button: a sticky note with a turned-up corner, in the
 * colour of the highlight the note would be attached to.
 */
export function StickyNoteIcon({
  fill = "#fdf0b4",
  className = "",
}: {
  fill?: string;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M4.6 4.6h14.8v10.2l-4.6 4.6H4.6z"
        fill={fill}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M19.4 14.8h-4.6v4.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M11.7 8v6M8.7 11h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** The trash can on the selection toolbar. */
export function TrashIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g {...stroke}>
        <path d="M4 6.5h16" />
        <path d="M9.5 6.5V4.6h5v1.9" />
        <path d="M6.3 6.5 7.2 20h9.6l.9-13.5" />
        <path d="M10.3 10v6M13.7 10v6" />
      </g>
    </svg>
  );
}
