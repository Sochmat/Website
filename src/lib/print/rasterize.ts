import type { ReceiptLine } from "@/lib/print/receiptLines";
import { billLines, kotLines } from "@/lib/print/receiptLines";
import type { ReceiptOrder, ShopConfig } from "@/lib/print/types";

/**
 * Bitmap receipt rendering for the browser print station.
 *
 * The retired Python agent printed the KOT/bill as a 1-bit image at the print
 * head's native dot width, which is why it stayed crisp — a thermal head is a
 * 1-bit device, so anti-aliased (gray) browser text prints faint and fuzzy.
 * We reproduce that here: draw the monospace line model onto a canvas at the
 * printable dot width, threshold every pixel to pure black/white, and print the
 * PNG sized to the printable area so nothing is clipped on the right.
 */

const FONT_STACK = '"Consolas", "Courier New", monospace';

/** 80mm head: 576 printable dots at 203 dpi = ~72mm of paper. */
const PRINTABLE_DOTS = 576;
const PRINTABLE_MM = 72;
/** Supersample factor for smoother glyph shapes before thresholding. */
const SCALE = 2;

export interface RasterOpts {
  /** Printable width in device dots. */
  widthDots: number;
  /** Monospace columns to fit across the printable width. */
  cols: number;
}

/** Render receipt lines to a 1-bit-black PNG data URL sized for a thermal head. */
export function rasterizeLines(lines: ReceiptLine[], opts: RasterOpts): string {
  const W = Math.round(opts.widthDots * SCALE);
  const pad = Math.round(6 * SCALE);
  const inner = W - pad * 2;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // Size the base font so `cols` monospace chars exactly fill the inner width.
  ctx.font = `100px ${FONT_STACK}`;
  const charWAt100 = ctx.measureText("0".repeat(20)).width / 20;
  const baseFont = Math.floor(inner / opts.cols / (charWAt100 / 100));
  const bigFont = Math.round(baseFont * 1.7);
  const lineGap = Math.round(baseFont * 0.32);
  const ruleH = Math.round(baseFont * 0.8);

  // First pass: measure total height.
  let height = pad * 2;
  for (const l of lines) {
    height += l.rule ? ruleH : (l.large ? bigFont : baseFont) + lineGap;
  }

  canvas.width = W;
  canvas.height = height;

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, height);
  ctx.fillStyle = "#000";
  ctx.textBaseline = "top";

  let y = pad;
  for (const l of lines) {
    if (l.rule) {
      drawDashed(ctx, pad, Math.round(y + ruleH / 2), W - pad, SCALE);
      y += ruleH;
      continue;
    }
    const fs = l.large ? bigFont : baseFont;
    ctx.font = `${l.bold ? "bold " : ""}${fs}px ${FONT_STACK}`;
    const tw = ctx.measureText(l.text).width;
    const x = l.align === "center" ? Math.max(pad, (W - tw) / 2) : pad;
    ctx.fillText(l.text, x, y);
    y += fs + lineGap;
  }

  threshold(ctx, W, height);
  return canvas.toDataURL("image/png");
}

/** Draw a dashed horizontal divider across the printable width. */
function drawDashed(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y: number,
  x1: number,
  scale: number,
): void {
  const dash = Math.round(3 * scale);
  ctx.fillStyle = "#000";
  for (let x = x0; x < x1; x += dash * 2) {
    ctx.fillRect(x, y, dash, Math.max(1, Math.round(scale)));
  }
}

/** Force every pixel to pure black or white so the thermal head prints crisply. */
function threshold(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = lum < 170 ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/** Wrap a PNG data URL in a printable document sized to the printable area. */
function imageDoc(dataUrl: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: 80mm auto; margin: 0; }
    html, body { margin: 0; padding: 0; }
    img { display: block; width: ${PRINTABLE_MM}mm; }
  </style></head><body><img src="${dataUrl}"></body></html>`;
}

/** Render a KOT as a printable 1-bit image document. */
export function renderKotImageDoc(order: ReceiptOrder, cfg: ShopConfig): string {
  return imageDoc(
    rasterizeLines(kotLines(order, cfg), { widthDots: PRINTABLE_DOTS, cols: 32 }),
  );
}

/** Render a customer bill as a printable 1-bit image document. */
export function renderBillImageDoc(order: ReceiptOrder, cfg: ShopConfig): string {
  return imageDoc(
    rasterizeLines(billLines(order, cfg), { widthDots: PRINTABLE_DOTS, cols: 42 }),
  );
}
