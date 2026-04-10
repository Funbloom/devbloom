"use client";

/** Hover/focus “i” info control — uses `.imagegen-tooltip` styles in globals.css (same as Image Gen). */
export function ImagegenTooltip({ text }: { text: string }) {
  return (
    <span className="imagegen-tooltip">
      <button type="button" className="imagegen-tooltip-trigger" aria-label={text}>
        i
      </button>
      <span className="imagegen-tooltip-content" role="tooltip">
        {text}
      </span>
    </span>
  );
}
