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
