"use client";

import { useEffect, useState } from "react";
import { Modal, Select } from "antd";
import {
  formatUnitConversion,
  formatCurrency,
  pricePerConsumptionUnit,
  type RawMaterial,
  type RawMaterialBrand,
  type RawMaterialCategory,
} from "@/lib/rawMaterials";
import UnitSelect from "./UnitSelect";
import { useUnits } from "./useUnits";


interface FormState {
  name: string;
  categoryId: string;
  brandId: string;
  consumptionUnit: string;
  purchaseUnit: string;
  unitConversion: string;
  pricePerPurchaseUnit: string;
  alertQty: string;
}

const EMPTY: FormState = {
  name: "",
  categoryId: "",
  brandId: "",
  consumptionUnit: "gm",
  purchaseUnit: "kg",
  unitConversion: "",
  pricePerPurchaseUnit: "",
  alertQty: "",
};

function toForm(material: RawMaterial): FormState {
  return {
    name: material.name,
    categoryId: material.categoryId,
    brandId: material.brandId ?? "",
    consumptionUnit: material.consumptionUnit,
    purchaseUnit: material.purchaseUnit,
    unitConversion: String(material.unitConversion),
    pricePerPurchaseUnit: String(material.pricePerPurchaseUnit),
    // 0 means "no threshold", so it opens blank rather than as a literal 0 —
    // matching what the production-item form does with the same field.
    alertQty: material.alertQty ? String(material.alertQty) : "",
  };
}

/**
 * Client-side mirror of sanitizeRawMaterial, for instant feedback. The server
 * re-validates on every write — this only saves a round trip, it is not the
 * authority.
 */
function validate(form: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};
  if (!form.name.trim()) errors.name = "Name is required";
  if (!form.categoryId) errors.categoryId = "Category is required";
  // brandId is intentionally unvalidated — blank means unbranded.
  if (!form.consumptionUnit.trim())
    errors.consumptionUnit = "Consumption unit is required";
  if (!form.purchaseUnit.trim())
    errors.purchaseUnit = "Purchase unit is required";

  const conversion = Number(form.unitConversion.replace(/,/g, ""));
  if (!form.unitConversion.trim()) errors.unitConversion = "Required";
  else if (!Number.isFinite(conversion)) errors.unitConversion = "Must be a number";
  else if (conversion <= 0) errors.unitConversion = "Must be greater than 0";

  const price = Number(form.pricePerPurchaseUnit.replace(/,/g, ""));
  if (!form.pricePerPurchaseUnit.trim()) errors.pricePerPurchaseUnit = "Required";
  else if (!Number.isFinite(price)) errors.pricePerPurchaseUnit = "Must be a number";
  else if (price < 0) errors.pricePerPurchaseUnit = "Cannot be negative";

  // Optional — only checked when something was actually typed. Blank means
  // "no low-stock threshold", which is a normal thing to want.
  if (form.alertQty.trim()) {
    const alert = Number(form.alertQty.replace(/,/g, ""));
    if (!Number.isFinite(alert)) errors.alertQty = "Must be a number";
    else if (alert < 0) errors.alertQty = "Cannot be negative";
  }

  return errors;
}

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#024731] focus:ring-1 focus:ring-[#024731]";

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-gray-500">{hint}</span>
      ) : null}
    </label>
  );
}

export default function RawMaterialFormModal({
  open,
  material,
  categories,
  brands,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** null = create mode. */
  material: RawMaterial | null;
  categories: RawMaterialCategory[];
  brands: RawMaterialBrand[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  // The unit lists are stored, not hard-coded, so a unit invented here is
  // there for the next material too — see UnitSelect.
  const { unitsByKind, addUnit, loading: loadingUnits } = useUnits();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Re-seed whenever the modal is opened for a different row. Keyed on the id
  // and the open flag so reopening the same row discards a half-finished edit.
  useEffect(() => {
    if (!open) return;
    setForm(material ? toForm(material) : EMPTY);
    setErrors({});
    setServerError(null);
  }, [open, material]);

  const set = (key: keyof FormState) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    setServerError(null);
  };

  const handleSubmit = async () => {
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    setServerError(null);
    try {
      const payload = {
        name: form.name.trim(),
        categoryId: form.categoryId,
        brandId: form.brandId,
        consumptionUnit: form.consumptionUnit.trim(),
        purchaseUnit: form.purchaseUnit.trim(),
        unitConversion: form.unitConversion,
        pricePerPurchaseUnit: form.pricePerPurchaseUnit,
        alertQty: form.alertQty,
      };
      const res = await fetch(
        material?._id
          ? `/api/inventory/raw-materials/${material._id}`
          : "/api/inventory/raw-materials",
        {
          method: material?._id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!data.success) {
        setServerError(data.message ?? "Could not save");
        return;
      }
      onSaved(material?._id ? "Raw material updated" : "Raw material added");
    } catch {
      setServerError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  };

  // Live preview of what the numbers mean, so a mistyped conversion is obvious
  // before saving rather than after it corrupts recipe costing.
  const conversion = Number(form.unitConversion.replace(/,/g, ""));
  const price = Number(form.pricePerPurchaseUnit.replace(/,/g, ""));
  const showPreview =
    Number.isFinite(conversion) &&
    conversion > 0 &&
    !!form.consumptionUnit.trim() &&
    !!form.purchaseUnit.trim();

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      okText={material ? "Save changes" : "Add raw material"}
      confirmLoading={saving}
      title={material ? "Edit raw material" : "Add raw material"}
      width={640}
      destroyOnHidden
    >
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Field label="Name" error={errors.name}>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => set("name")(e.target.value)}
              placeholder="Toor Dal"
              autoFocus
            />
          </Field>
        </div>

        <Field label="Category" error={errors.categoryId}>
          <Select
            className="w-full mt-0.5"
            value={form.categoryId || undefined}
            onChange={(v) => set("categoryId")(v)}
            placeholder="Select category"
            options={categories.map((c) => ({
              value: String(c._id),
              label: c.name,
            }))}
            showSearch
            optionFilterProp="label"
          />
        </Field>

        <Field label="Brand" hint="Optional">
          <Select
            className="w-full mt-0.5"
            value={form.brandId || undefined}
            onChange={(v) => set("brandId")(v ?? "")}
            placeholder={brands.length ? "No brand" : "No brands defined yet"}
            options={brands.map((b) => ({
              value: String(b._id),
              label: b.name,
            }))}
            disabled={brands.length === 0}
            showSearch
            optionFilterProp="label"
            // Clearable because unbranded is a normal state, and an accidental
            // pick must be undoable without reopening the form.
            allowClear
          />
        </Field>

        <Field
          label="Consumption unit"
          hint="Unit used in recipes"
          error={errors.consumptionUnit}
        >
          <UnitSelect
            kind="consumption"
            value={form.consumptionUnit}
            onChange={set("consumptionUnit")}
            units={unitsByKind.consumption}
            loading={loadingUnits}
            onAdd={addUnit}
            placeholder="gm"
            ariaLabel="Consumption unit"
          />
        </Field>

        <Field
          label="Purchase unit"
          hint="Unit bought from vendors"
          error={errors.purchaseUnit}
        >
          <UnitSelect
            kind="purchase"
            value={form.purchaseUnit}
            onChange={set("purchaseUnit")}
            units={unitsByKind.purchase}
            loading={loadingUnits}
            onAdd={addUnit}
            placeholder="kg"
            ariaLabel="Purchase unit"
          />
        </Field>

        <Field
          label="Unit conversion"
          hint={`How many ${form.consumptionUnit || "consumption units"} in 1 ${form.purchaseUnit || "purchase unit"}`}
          error={errors.unitConversion}
        >
          <input
            className={inputClass}
            value={form.unitConversion}
            onChange={(e) => set("unitConversion")(e.target.value)}
            placeholder="1000"
            inputMode="decimal"
          />
        </Field>

        <Field
          label="Price per purchase unit"
          hint={`Cost of 1 ${form.purchaseUnit || "purchase unit"}`}
          error={errors.pricePerPurchaseUnit}
        >
          <input
            className={inputClass}
            value={form.pricePerPurchaseUnit}
            onChange={(e) => set("pricePerPurchaseUnit")(e.target.value)}
            placeholder="120"
            inputMode="decimal"
          />
        </Field>

        <Field
          label="Alert qty"
          hint={`Optional low-stock threshold, in ${form.consumptionUnit || "consumption units"}`}
          error={errors.alertQty}
        >
          <input
            className={inputClass}
            value={form.alertQty}
            onChange={(e) => set("alertQty")(e.target.value)}
            placeholder="Leave blank for none"
            inputMode="decimal"
          />
        </Field>
      </div>

      {showPreview && (
        <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-600">
          {formatUnitConversion({
            purchaseUnit: form.purchaseUnit,
            unitConversion: conversion,
            consumptionUnit: form.consumptionUnit,
          })}
          {Number.isFinite(price) && price > 0 && (
            <>
              {" · "}
              {formatCurrency(
                pricePerConsumptionUnit({
                  pricePerPurchaseUnit: price,
                  unitConversion: conversion,
                }),
              )}{" "}
              per {form.consumptionUnit}
            </>
          )}
        </div>
      )}

      {serverError && (
        <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {serverError}
        </div>
      )}
    </Modal>
  );
}
