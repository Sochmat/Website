"use client";

import { useMemo, useState } from "react";
import { Drawer, Select, Tree } from "antd";
import type {
  AddOnCategory,
  AddOnCategoryMember,
  AddOnSelectionType,
  Category,
  MenuItem,
} from "@/lib/types";
import FoodTypeDot from "@/components/FoodTypeDot";
import {
  addOnCategoryAppliesTo,
  resolveSelectionType,
  splitCheckedMapping,
} from "@/lib/addOnGroups";

/**
 * Editor for one add-on category — a named group of add-ons offered on many
 * menu items at once, instead of picking the same add-ons item by item.
 *
 * Everything about the group lives here: which add-ons are in it, what each one
 * costs in it, and which items it is offered on. Pricing belongs here because a
 * price only means something relative to the group it sits in — the same add-on
 * may sit in several groups at different prices. The mapping belongs here
 * because the group owns it; menu items hold no reference back.
 *
 * The member list is the display order the customer sees, reordered with the
 * arrow buttons.
 */

type MemberForm = { addOnId: string; price: string; defaultSelected: boolean };

/**
 * Tree keys are namespaced so one flat `checkedKeys` array can carry both
 * kinds of node. `ALL_KEY` is the "Select all" root — pure UI, never stored.
 */
const ALL_KEY = "__all";
const catKey = (id: string) => `cat:${id}`;
const itemKey = (id: string) => `item:${id}`;
const isCatKey = (key: string) => key.startsWith("cat:");
const isItemKey = (key: string) => key.startsWith("item:");
const idFromKey = (key: string) => key.slice(key.indexOf(":") + 1);

/** How the customer picks from the group. New groups start on `multi` — the
 *  common case — while groups created before types existed resolve to `add`,
 *  which is how they have always behaved. */
const SELECTION_TYPES: {
  value: AddOnSelectionType;
  label: string;
  hint: string;
}[] = [
  {
    value: "single",
    label: "Single select",
    hint: "Radio — customer picks one add-on, e.g. choice of sauce.",
  },
  {
    value: "multi",
    label: "Multi select",
    hint: "Checkbox — customer ticks any number of add-ons, one of each.",
  },
  {
    value: "add",
    label: "Add quantity",
    hint: "Stepper — customer can take several of the same add-on, e.g. 2x cheese.",
  },
];

const inputClass =
  "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent";

function membersFor(editing: AddOnCategory | null): MemberForm[] {
  return (editing?.members ?? []).map((m) => ({
    addOnId: m.addOnId,
    price: m.price === undefined || m.price === null ? "" : String(m.price),
    defaultSelected: Boolean(m.defaultSelected),
  }));
}

interface AddOnCategoryDrawerProps {
  /** The category being edited, or null when creating a new one. */
  editing: AddOnCategory | null;
  /** Every add-on that can be put in a category. */
  addOns: MenuItem[];
  /** Every orderable menu item this group can be offered on (never add-ons). */
  items: MenuItem[];
  /** Menu categories, for offering the group on a whole category at once. */
  menuCategories: Category[];
  onClose: () => void;
  onSaved: () => void;
}

/** Mounted only while open, so the form starts from `editing` every time. */
export default function AddOnCategoryDrawer({
  editing,
  addOns,
  items,
  menuCategories,
  onClose,
  onSaved,
}: AddOnCategoryDrawerProps) {
  const [name, setName] = useState(editing?.name ?? "");
  const [hidden, setHidden] = useState(Boolean(editing?.hidden));
  const [required, setRequired] = useState(Boolean(editing?.required));
  const [selectionType, setSelectionType] = useState<AddOnSelectionType>(() =>
    editing ? resolveSelectionType(editing) : "multi",
  );
  const [members, setMembers] = useState<MemberForm[]>(() =>
    membersFor(editing),
  );
  const [itemIds, setItemIds] = useState<string[]>(editing?.itemIds ?? []);
  const [menuCategoryIds, setMenuCategoryIds] = useState<string[]>(
    editing?.menuCategoryIds ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  const itemsById = useMemo(
    () => new Map(items.map((i) => [String(i._id), i])),
    [items],
  );

  const itemsByMenuCategory = useMemo(() => {
    const grouped = new Map<string, MenuItem[]>();
    for (const item of items) {
      const list = grouped.get(item.category) ?? [];
      list.push(item);
      grouped.set(item.category, list);
    }
    return grouped;
  }, [items]);

  /**
   * The tree shows what is stored, and the two are not the same shape: a menu
   * category in `menuCategoryIds` means "every item in here, including ones
   * added later", so it renders as the parent *and* all of its children ticked.
   */
  const checkedKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const menuCategoryId of menuCategoryIds) {
      keys.add(catKey(menuCategoryId));
      for (const item of itemsByMenuCategory.get(menuCategoryId) ?? []) {
        keys.add(itemKey(String(item._id)));
      }
    }
    for (const id of itemIds) keys.add(itemKey(id));
    return Array.from(keys);
  }, [menuCategoryIds, itemIds, itemsByMenuCategory]);

  /** Read the ticks back into the two stored lists (see splitCheckedMapping
   *  for what a fully ticked category means). */
  const handleCheck = (keys: React.Key[] | { checked: React.Key[] }) => {
    const checked = (Array.isArray(keys) ? keys : keys.checked).map(String);
    const next = splitCheckedMapping(
      {
        menuCategoryIds: checked.filter(isCatKey).map(idFromKey),
        itemIds: checked.filter(isItemKey).map(idFromKey),
      },
      (id) => itemsById.get(id)?.category,
    );
    setMenuCategoryIds(next.menuCategoryIds);
    setItemIds(next.itemIds);
  };

  // Searching filters the tree and opens what survives, so a match three
  // categories down is not hidden behind a collapsed parent.
  const query = itemSearch.trim().toLowerCase();
  const treeData = useMemo(() => {
    const children = menuCategories.flatMap((cat) => {
      const catItems = itemsByMenuCategory.get(cat.id) ?? [];
      const catMatches = cat.name.toLowerCase().includes(query);
      const visibleItems =
        !query || catMatches
          ? catItems
          : catItems.filter((i) => i.name.toLowerCase().includes(query));
      if (query && !catMatches && visibleItems.length === 0) return [];
      return [
        {
          key: catKey(cat.id),
          title: `${cat.name} (${catItems.length})`,
          children: visibleItems.map((item) => ({
            key: itemKey(String(item._id)),
            title: item.name,
          })),
        },
      ];
    });
    return [{ key: ALL_KEY, title: "Select all", children }];
  }, [menuCategories, itemsByMenuCategory, query]);

  const searchExpandedKeys = useMemo(
    () =>
      query
        ? [
            ALL_KEY,
            ...treeData[0].children.map((child) => String(child.key)),
          ]
        : expandedKeys,
    [query, treeData, expandedKeys],
  );

  // What the picker adds up to. An item ticked directly *and* covered by its
  // menu category is still one item, which is exactly what a customer sees — so
  // count the items rather than adding the two selections together.
  const reach = useMemo(
    () =>
      items.filter((item) =>
        addOnCategoryAppliesTo(
          { name, members: [], itemIds, menuCategoryIds },
          String(item._id ?? ""),
          item.category,
        ),
      ),
    [items, itemIds, menuCategoryIds, name],
  );

  const addOnsById = useMemo(
    () => new Map(addOns.map((a) => [String(a._id), a])),
    [addOns],
  );

  const chosen = new Set(members.map((m) => m.addOnId));
  const pickable = addOns.filter((a) => !chosen.has(String(a._id)));

  const addMember = (addOnId: string) =>
    setMembers((prev) => [
      ...prev,
      { addOnId, price: "", defaultSelected: false },
    ]);

  const removeMember = (index: number) =>
    setMembers((prev) => prev.filter((_, i) => i !== index));

  const setPrice = (index: number, price: string) =>
    setMembers((prev) =>
      prev.map((m, i) => (i === index ? { ...m, price } : m)),
    );

  /** Only one add-on per category opens pre-selected, so ticking one unticks
   *  whichever held it; ticking the ticked one clears the default entirely. */
  const setDefaultSelected = (index: number, defaultSelected: boolean) =>
    setMembers((prev) =>
      prev.map((m, i) => ({ ...m, defaultSelected: defaultSelected && i === index })),
    );

  /** Swap with the neighbour in `direction`; the ends simply don't move. */
  const move = (index: number, direction: -1 | 1) =>
    setMembers((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // A blank price box means "charge the add-on's own price", so it must go
      // over the wire as absent — not as 0, which is a real free-extra price.
      const payloadMembers: AddOnCategoryMember[] = members.map((m) => ({
        addOnId: m.addOnId,
        ...(m.price.trim() === "" ? {} : { price: Number(m.price) || 0 }),
        ...(m.defaultSelected ? { defaultSelected: true } : {}),
      }));
      const body = {
        name: name.trim(),
        hidden,
        required,
        selectionType,
        members: payloadMembers,
        itemIds,
        menuCategoryIds,
        ...(editing?._id ? { _id: String(editing._id) } : {}),
      };

      await fetch("/api/admin/addon-categories", {
        method: editing?._id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      onSaved();
      onClose();
    } catch (err) {
      console.error("Failed to save add-on category:", err);
    }
    setSaving(false);
  };

  return (
    <Drawer
      title={editing ? "Edit Addon Category" : "Add New Addon Category"}
      open
      onClose={onClose}
      width="min(560px, 100vw)"
      destroyOnHidden
    >
      <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Sauces"
            className={inputClass}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Selection type
          </label>
          {/* One row of radios: the three types are one choice, and the full
              explanation of each lives in its tooltip rather than on screen. */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {SELECTION_TYPES.map((type) => (
              <label
                key={type.value}
                title={type.hint}
                className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer"
              >
                <input
                  type="radio"
                  name="selectionType"
                  checked={selectionType === type.value}
                  onChange={() => setSelectionType(type.value)}
                  className="w-4 h-4"
                />
                {type.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Add-ons in this category
            </label>
            <span className="text-xs text-gray-400">
              {members.length} selected
            </span>
          </div>

          {members.length === 0 ? (
            <p className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg px-3 py-6 text-center">
              No add-ons yet. Pick one below to get started.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1 text-xs text-gray-400">
                <span className="flex-1">Add-on</span>
                <span className="w-[88px]">Price (₹)</span>
                <span className="w-[60px] text-center">Default</span>
                <span className="w-[76px]" />
              </div>
              {members.map((member, index) => {
                const addOn = addOnsById.get(member.addOnId);
                const basePrice = addOn?.price ?? 0;
                return (
                  <div
                    key={member.addOnId}
                    className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        {addOn && <FoodTypeDot item={addOn} size={14} dotSize={6} />}
                        <span className="text-sm text-gray-800 truncate">
                          {addOn?.name ?? "(deleted add-on)"}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">
                        base ₹{basePrice}
                      </span>
                    </div>

                    <input
                      type="number"
                      min={0}
                      value={member.price}
                      onChange={(e) => setPrice(index, e.target.value)}
                      placeholder={String(basePrice)}
                      className="w-[88px] px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
                    />

                    <div className="w-[60px] flex justify-center">
                      <input
                        type="checkbox"
                        checked={member.defaultSelected}
                        onChange={(e) =>
                          setDefaultSelected(index, e.target.checked)
                        }
                        aria-label={`Pre-select ${addOn?.name ?? "add-on"}`}
                        title="Pre-selected when the customer opens the item (one per category)"
                        className="w-4 h-4"
                      />
                    </div>

                    <div className="flex items-center gap-1 w-[76px] justify-end">
                      <button
                        type="button"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        aria-label="Move up"
                        className="w-6 h-6 rounded border border-gray-300 text-gray-600 text-xs leading-none disabled:opacity-30 hover:bg-gray-50"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={index === members.length - 1}
                        aria-label="Move down"
                        className="w-6 h-6 rounded border border-gray-300 text-gray-600 text-xs leading-none disabled:opacity-30 hover:bg-gray-50"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeMember(index)}
                        aria-label="Remove"
                        className="w-6 h-6 rounded border border-gray-300 text-red-500 text-xs leading-none hover:bg-red-50"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-3">
            <Select
              showSearch
              // Controlled at null so the box clears itself after each pick —
              // it is an "add" action, not a selection that stays put.
              value={null}
              onChange={(addOnId: string) => addMember(addOnId)}
              placeholder="+ Add an add-on to this category"
              className="w-full"
              optionFilterProp="label"
              notFoundContent={
                addOns.length === 0
                  ? "No add-ons exist yet"
                  : "Every add-on is already in this category"
              }
              options={pickable.map((a) => ({
                label: `${a.name} — ₹${a.price}`,
                value: String(a._id),
              }))}
            />
          </div>
        </div>

        <div className="border-t border-gray-100 pt-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Offered on
          </label>
          <input
            type="text"
            value={itemSearch}
            onChange={(e) => setItemSearch(e.target.value)}
            placeholder="Search categories and items"
            className={`${inputClass} mb-2`}
          />

          <div className="border border-gray-200 rounded-lg p-2 max-h-[360px] overflow-y-auto">
            {treeData[0].children.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-6">
                {query ? "Nothing matches that search." : "No menu items yet."}
              </p>
            ) : (
              <Tree
                checkable
                selectable={false}
                treeData={treeData}
                checkedKeys={checkedKeys}
                onCheck={handleCheck}
                expandedKeys={searchExpandedKeys}
                onExpand={(keys) => {
                  setItemSearch("");
                  setExpandedKeys(keys.map(String));
                }}
              />
            )}
          </div>

          <p className="mt-2 text-xs text-gray-500">
            {reach.length === 0
              ? "Not offered on any item yet — nobody will see this group."
              : `Offered on ${reach.length} item${
                  reach.length === 1 ? "" : "s"
                }.`}
          </p>
        </div>

        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            className="w-4 h-4 mt-0.5"
          />
          <span>
            Compulsory — the customer must pick at least one add-on from this
            group before the item can go in the cart
          </span>
        </label>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={hidden}
            onChange={(e) => setHidden(e.target.checked)}
            className="w-4 h-4"
          />
          Hidden — keep this group off the website without deleting it
        </label>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-[#1c1c1c] text-white py-2 rounded-lg font-medium hover:bg-[#024731] transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : editing ? "Update Category" : "Add Category"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </Drawer>
  );
}
