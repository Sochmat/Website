"use client";

import { useState } from "react";
import { Divider, Select } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { UnitKind } from "@/lib/rawMaterials";

/**
 * Unit dropdown with an "add new" row underneath the options.
 *
 * The units it offers are a stored list rather than a hard-coded set, so a
 * kitchen that buys in "crate" or counts in "leaf" can say so once and have it
 * there next time. Adding happens in place, from the field that needed it —
 * the alternative was typing a free value into a tags-mode select, which stored
 * the unit on that one material and offered it to nobody else.
 */
export default function UnitSelect({
  value,
  onChange,
  kind,
  units,
  loading,
  onAdd,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  kind: UnitKind;
  /** Names already in this kind's list, in display order. */
  units: string[];
  loading: boolean;
  /** Persists the unit and returns it, or an error message to show. */
  onAdd: (name: string, kind: UnitKind) => Promise<{ error?: string }>;
  placeholder: string;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    const name = draft.replace(/\s+/g, " ").trim();
    if (!name || adding) return;

    setAdding(true);
    setError(null);
    try {
      const result = await onAdd(name, kind);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDraft("");
      // Select what was just added — nobody adds a unit they did not want.
      onChange(name);
    } finally {
      setAdding(false);
    }
  };

  return (
    <Select
      className="w-full mt-0.5"
      value={value || undefined}
      onChange={onChange}
      loading={loading}
      options={units.map((u) => ({ value: u, label: u }))}
      placeholder={placeholder}
      aria-label={ariaLabel}
      showSearch
      optionFilterProp="label"
      popupRender={(menu) => (
        <>
          {menu}
          <Divider className="!my-1.5" />
          {/* Kept out of the option list on purpose: an "add" row that can be
              arrowed onto is one keystroke away from being selected as a unit. */}
          <div className="px-2 pb-1.5">
            <div className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  // The dropdown's own key handling would otherwise move the
                  // highlight while typing, and Enter would pick an option.
                  e.stopPropagation();
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
                placeholder="New unit"
                aria-label={`Add a new ${kind} unit`}
                aria-invalid={!!error || undefined}
                className={`w-full rounded-lg border px-2 py-1 text-sm outline-none transition-colors ${
                  error
                    ? "border-red-400 ring-1 ring-red-300"
                    : "border-gray-300 focus:border-[#024731] focus:ring-1 focus:ring-[#024731]"
                }`}
              />
              <button
                type="button"
                // onMouseDown, not onClick: the select closes its dropdown on
                // blur, which would unmount this before a click ever landed.
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleAdd();
                }}
                disabled={adding || !draft.trim()}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#1c1c1c] px-3 py-1 text-sm font-medium text-white hover:bg-[#024731] disabled:opacity-50 transition-colors"
              >
                <PlusOutlined />
                {adding ? "Adding…" : "Add"}
              </button>
            </div>
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          </div>
        </>
      )}
    />
  );
}
