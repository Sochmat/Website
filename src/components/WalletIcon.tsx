"use client";

import { useId } from "react";

/**
 * Flat multi-colour wallet: amber billfold with a navy outline, a green note
 * tucked behind it, and a card slot on the right.
 *
 * Inline rather than an <Image> so it inherits the pill's sizing and can be
 * animated as a single element — and so it costs no extra request in the
 * header, which is on the critical path of the homepage.
 *
 * Drawn on a 64-unit grid with heavy strokes: this renders at 16px, where thin
 * detail turns to mush.
 */
export default function WalletIcon({ className }: { className?: string }) {
  // SVG ids are global to the document, so a second instance would otherwise
  // reuse the first one's clip path.
  const clipId = `wallet-body-${useId()}`;

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id="wallet-body-clip">
          <rect x="10" y="25" width="44" height="31" rx="6" />
        </clipPath>
      </defs>

      {/* Back panel, visible above the billfold's top-left corner. */}
      <rect
        x="10"
        y="17.5"
        width="20"
        height="12"
        rx="6"
        fill="#FFFFFF"
        stroke="#0B2C7A"
        strokeWidth="3.2"
      />

      {/* Note poking out of the top. Drawn before the body so the body's edge
          crops it, which is what makes it read as *inside* the wallet. */}
      <path
        d="M37 6.5 L53.5 23.5 H20.5 Z"
        fill="#A6D64B"
        stroke="#0B2C7A"
        strokeWidth="3.2"
        strokeLinejoin="round"
      />
      <circle cx="37" cy="24.5" r="7.5" fill="#FFFFFF" />

      {/* Billfold. The offset circle is the darker left-hand shading; clipping
          keeps it inside the rounded corners. */}
      <g clipPath={`url(#${clipId})`}>
        <rect x="10" y="25" width="44" height="31" fill="#FDC13F" />
        <circle cx="4" cy="41" r="23" fill="#F98E19" />
      </g>
      <rect
        x="10"
        y="25"
        width="44"
        height="31"
        rx="6"
        stroke="#0B2C7A"
        strokeWidth="3.2"
      />

      {/* Card slot, flush with the right edge. */}
      <g clipPath={`url(#${clipId})`}>
        <path
          d="M56 36 H40.25 a5.75 5.75 0 0 0 0 11.5 H56"
          fill="#FBE0BE"
          stroke="#F98E19"
          strokeWidth="3"
        />
      </g>
      <rect x="43" y="40.25" width="6.5" height="3" rx="1.5" fill="#0B2C7A" />
    </svg>
  );
}
