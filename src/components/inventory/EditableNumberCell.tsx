"use client";

import { useState } from "react";
import { LoadingOutlined } from "@ant-design/icons";

/**
 * A table cell that is always an input.
 *
 * Enter or blur commits, Escape reverts to the stored value. Committing an
 * unchanged value is a no-op so tabbing across the table doesn't fire a
 * request per cell.
 *
 * `onSave` returns whether the write succeeded — on failure the field keeps
 * the user's text so a rejected value isn't silently discarded.
 */
export default function EditableNumberCell({
  value,
  onSave,
  ariaLabel,
  prefix,
  suffix,
  min = 0,
  placeholder,
}: {
  /** undefined renders an empty field — "never counted", not zero. */
  value: number | undefined;
  onSave: (next: number) => Promise<boolean>;
  ariaLabel: string;
  /** Rendered inside the field's left edge, e.g. "₹". */
  prefix?: React.ReactNode;
  /** Rendered after the field, e.g. the consumption unit. */
  suffix?: React.ReactNode;
  min?: number;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(() =>
    typeof value === "number" ? String(value) : "",
  );
  const [saving, setSaving] = useState(false);
  const [invalid, setInvalid] = useState(false);
  // State, not a ref: this is read during render below, and refs may not be.
  const [focused, setFocused] = useState(false);

  // Adjust state when the row's value changes underneath us (a refresh, an
  // import, an edit from the modal). Done during render rather than in an
  // effect — the documented React pattern, and it keeps this component clear
  // of the repo's set-state-in-effect rule. Skipped while focused so it can't
  // overwrite what someone is mid-way through typing.
  const [syncedValue, setSyncedValue] = useState(value);
  if (syncedValue !== value) {
    setSyncedValue(value);
    if (!focused) {
      setDraft(typeof value === "number" ? String(value) : "");
      setInvalid(false);
    }
  }

  const commit = async () => {
    if (saving) return;
    const parsed = Number(draft.replace(/,/g, "").trim());
    if (!draft.trim() || !Number.isFinite(parsed) || parsed < min) {
      setInvalid(true);
      return;
    }
    if (parsed === value) {
      setInvalid(false);
      return;
    }
    setSaving(true);
    const ok = await onSave(parsed);
    setSaving(false);
    if (ok) setInvalid(false);
  };

  return (
    <span className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
      <span className="relative inline-flex items-center">
        {prefix && (
          <span className="pointer-events-none absolute left-2 text-sm text-gray-500">
            {prefix}
          </span>
        )}
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          onFocus={(e) => {
            setFocused(true);
            e.target.select();
          }}
          onBlur={() => {
            setFocused(false);
            commit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDraft(typeof value === "number" ? String(value) : "");
              setInvalid(false);
              e.currentTarget.blur();
            }
          }}
          disabled={saving}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          placeholder={placeholder}
          inputMode="decimal"
          className={`w-24 rounded-lg border py-1 text-right text-sm tabular-nums outline-none transition-colors disabled:opacity-60 ${
            prefix ? "pl-6 pr-2" : "px-2"
          } ${
            invalid
              ? "border-red-400 ring-1 ring-red-300"
              : "border-gray-300 hover:border-gray-400 focus:border-[#024731] focus:ring-1 focus:ring-[#024731]"
          }`}
        />
        {saving && (
          <LoadingOutlined className="absolute -right-4 text-xs text-gray-400" />
        )}
      </span>
      {suffix && <span className="text-sm text-gray-600">{suffix}</span>}
    </span>
  );
}
