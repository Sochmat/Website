/**
 * Indian mobile numbers, normalised to the single 10-digit form that the unique
 * index on `users.phone` is built over.
 *
 * Every write path must go through `normalizePhone`. Without it "+91 98765
 * 43210", "098765 43210" and "9876543210" are three distinct strings, and the
 * uniqueness constraint they are supposed to share becomes trivially evadable.
 */

/** Indian mobile numbers start 6–9; 10 digits, no leading zero. */
const TEN_DIGIT = /^[6-9]\d{9}$/;

/**
 * The canonical 10-digit form of `raw`, or null when it isn't a plausible
 * Indian mobile number. Strips spaces, dashes, brackets and a `+`, then peels a
 * `91` country code or a trunk `0` when doing so leaves exactly ten digits.
 */
export function normalizePhone(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;

  // Peel the trunk prefix before the country code, so the legacy "091 XXXXX
  // XXXXX" spelling reduces the same way "+91" and a plain "0" do.
  let bare = digits.replace(/^0+/, "");
  if (bare.length === 12 && bare.startsWith("91")) bare = bare.slice(2);

  return TEN_DIGIT.test(bare) ? bare : null;
}

/** Whether a stored user document carries a usable phone number. */
export function hasPhone(
  user: Record<string, unknown> | null | undefined,
): boolean {
  const phone = user?.phone;
  return typeof phone === "string" && phone.trim() !== "";
}
