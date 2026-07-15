/** Escape user/product text before embedding it in receipt HTML. */
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Left-aligned line. */
export function left(text: string, bold = false): string {
  return `<div class="ln${bold ? " b" : ""}">${escapeHtml(text)}</div>`;
}

/** Centered line. */
export function center(text: string, bold = false): string {
  return `<div class="ln c${bold ? " b" : ""}">${escapeHtml(text)}</div>`;
}

/** Emphasised (large, bold, centered) line — shop name, KOT number. */
export function emph(text: string): string {
  return `<div class="ln c b xl">${escapeHtml(text)}</div>`;
}

/** Two-column line: label left, value right. */
export function row(label: string, value: string, bold = false): string {
  return `<div class="ln rowln${bold ? " b" : ""}"><span>${escapeHtml(
    label,
  )}</span><span>${escapeHtml(value)}</span></div>`;
}

/** Horizontal divider. */
export function hr(): string {
  return `<div class="hr"></div>`;
}

const RECEIPT_CSS = `
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { width: 80mm; font-family: "Courier New", monospace; color: #000;
         background: #fff; font-size: 12px; line-height: 1.25; padding: 4px 6px; }
  .ln { white-space: pre-wrap; word-break: break-word; }
  .c { text-align: center; }
  .b { font-weight: 700; }
  .xl { font-size: 18px; line-height: 1.2; }
  .rowln { display: flex; justify-content: space-between; gap: 8px; }
  .rowln > span:last-child { text-align: right; white-space: nowrap; }
  .hr { border-top: 1px dashed #000; margin: 2px 0; }
`;

/** Wrap the receipt body lines in a full printable HTML document. */
export function receiptDocument(bodyHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${RECEIPT_CSS}</style></head><body>${bodyHtml}</body></html>`;
}
