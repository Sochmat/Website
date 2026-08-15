// Browser-side file download helpers. Client-only — they touch document/URL.

/** Trigger a browser download from an already-fetched blob. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * The filename a response asked to be saved under, or null.
 *
 * Lets the server own the naming — the report stamps its own generation time,
 * and the client shouldn't be re-deriving it from a clock that may be minutes
 * off or in another timezone entirely. Handles both the quoted `filename=` and
 * RFC 5987 `filename*=`; falls back to null so callers can pick their own.
 */
export function filenameFromResponse(res: Response): string | null {
  const header = res.headers.get("Content-Disposition");
  if (!header) return null;

  const extended = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (extended) {
    try {
      return decodeURIComponent(extended[1].trim());
    } catch {
      // Malformed encoding — fall through to the plain form.
    }
  }

  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : null;
}
