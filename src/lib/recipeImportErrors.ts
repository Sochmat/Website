// Coercion for the error lists the import preview hands back for a report.
//
// The list round-trips through the browser, so nothing in it is trusted: every
// field is re-read as its own type and the length is capped.

import type { RecipeImportRowError } from "@/lib/recipeImport";

const MAX_ERRORS = 5000;

export function toRecipeImportErrors(input: unknown): RecipeImportRowError[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, MAX_ERRORS).map((e: Record<string, unknown>) => ({
    sheet: String(e?.sheet ?? ""),
    rowNumber: Number(e?.rowNumber) || 0,
    name: String(e?.name ?? ""),
    message: String(e?.message ?? ""),
  }));
}
