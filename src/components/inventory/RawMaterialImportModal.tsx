"use client";

import { useEffect, useRef, useState } from "react";
import { Modal, Table } from "antd";
import { DownloadOutlined, InboxOutlined } from "@ant-design/icons";
import type { ImportRowError } from "@/lib/rawMaterials";

interface ImportSummary {
  total: number;
  toCreate: number;
  toUpdate: number;
  errors: number;
}

interface ImportPreview {
  summary: ImportSummary;
  creates: unknown[];
  updates: unknown[];
  errors: ImportRowError[];
  /** Lookup names the sheet introduces — added when the import is committed. */
  newCategories: string[];
  newBrands: string[];
  newUnits: { name: string; kind: string }[];
}

type Stage = "choose" | "preview" | "committing";

/** Trigger a browser download from an already-fetched blob. */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function RawMaterialImportModal({
  open,
  onClose,
  onCommitted,
}: {
  open: boolean;
  onClose: () => void;
  onCommitted: (message: string) => void;
}) {
  const [stage, setStage] = useState<Stage>("choose");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setStage("choose");
      setFileName("");
      setPreview(null);
      setError(null);
      setParsing(false);
    }
  }, [open]);

  const handleFile = async (file: File) => {
    setParsing(true);
    setError(null);
    setFileName(file.name);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/inventory/raw-materials/import", {
        method: "POST",
        body,
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message ?? "Could not read that file");
        return;
      }
      setPreview({
        summary: data.summary,
        creates: data.creates ?? [],
        updates: data.updates ?? [],
        errors: data.errors ?? [],
        newCategories: data.newCategories ?? [],
        newBrands: data.newBrands ?? [],
        newUnits: data.newUnits ?? [],
      });
      setStage("preview");
    } catch {
      setError("Network error — please try again");
    } finally {
      setParsing(false);
    }
  };

  const handleCommit = async () => {
    if (!preview) return;
    setStage("committing");
    setError(null);
    try {
      const res = await fetch("/api/inventory/raw-materials/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creates: preview.creates,
          updates: preview.updates,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message ?? "Import failed");
        setStage("preview");
        return;
      }
      const parts = [`${data.created} created`, `${data.updated} updated`];
      // Rows the server refused after the preview passed them — surfaced
      // rather than swallowed, since it means the two disagreed.
      if (data.rejected?.length) parts.push(`${data.rejected.length} rejected`);
      // What the sheet added to the lookup lists. Reported from the server's
      // own count, so this says what actually happened rather than what the
      // preview predicted.
      const added: string[] = [];
      if (data.addedCategories?.length) {
        added.push(`${data.addedCategories.length} new categor${data.addedCategories.length === 1 ? "y" : "ies"}`);
      }
      if (data.addedBrands?.length) {
        added.push(`${data.addedBrands.length} new brand${data.addedBrands.length === 1 ? "" : "s"}`);
      }
      if (data.addedUnits) {
        added.push(`${data.addedUnits} new unit${data.addedUnits === 1 ? "" : "s"}`);
      }
      onCommitted(
        added.length
          ? `${parts.join(", ")} · added ${added.join(", ")}`
          : parts.join(", "),
      );
    } catch {
      setError("Network error — please try again");
      setStage("preview");
    }
  };

  const downloadTemplate = async () => {
    try {
      const res = await fetch("/api/inventory/raw-materials/template");
      if (!res.ok) {
        setError("Could not download the template");
        return;
      }
      downloadBlob(await res.blob(), "raw-materials-template.xlsx");
    } catch {
      setError("Could not download the template");
    }
  };

  const downloadErrorReport = async () => {
    if (!preview?.errors.length) return;
    try {
      const res = await fetch("/api/inventory/raw-materials/error-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ errors: preview.errors }),
      });
      if (!res.ok) return;
      downloadBlob(await res.blob(), "raw-material-import-errors.xlsx");
    } catch {
      // Non-critical — the errors are already listed on screen.
    }
  };

  const summary = preview?.summary;
  const nothingToDo = !!summary && summary.toCreate + summary.toUpdate === 0;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Upload raw materials"
      width={720}
      footer={
        stage === "choose"
          ? null
          : [
              <button
                key="back"
                onClick={() => setStage("choose")}
                disabled={stage === "committing"}
                className="mr-2 rounded-lg border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Choose another file
              </button>,
              <button
                key="commit"
                onClick={handleCommit}
                disabled={stage === "committing" || nothingToDo}
                className="rounded-lg bg-[#1c1c1c] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#024731] disabled:opacity-50"
              >
                {stage === "committing"
                  ? "Importing…"
                  : nothingToDo
                    ? "Nothing to import"
                    : `Import ${summary!.toCreate + summary!.toUpdate} rows`}
              </button>,
            ]
      }
    >
      {stage === "choose" && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={parsing}
            className="w-full rounded-xl border-2 border-dashed border-gray-300 px-6 py-10 text-center hover:border-[#024731] hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            <InboxOutlined className="text-3xl text-gray-400" />
            <span className="mt-2 block text-sm font-medium text-gray-700">
              {parsing ? "Reading file…" : "Click to choose an .xlsx file"}
            </span>
            <span className="mt-1 block text-xs text-gray-500">
              Rows are matched to existing raw materials by name
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Reset so picking the same file twice re-triggers onChange.
              e.target.value = "";
              if (file) handleFile(file);
            }}
          />
          {/* A plain <a> would trip @next/next/no-html-link-for-pages, and
              next/link would client-navigate instead of downloading — so fetch
              the workbook and save the blob, same as the export button. */}
          <button
            type="button"
            onClick={downloadTemplate}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#024731] hover:underline"
          >
            <DownloadOutlined />
            Download template
          </button>
        </div>
      )}

      {stage !== "choose" && summary && (
        <div className="mt-4">
          <p className="text-sm text-gray-600">
            <span className="font-medium text-gray-900">{fileName}</span> —{" "}
            {summary.total} data row{summary.total === 1 ? "" : "s"}
          </p>

          <div className="mt-3 grid grid-cols-3 gap-3">
            <Stat label="Will be created" value={summary.toCreate} tone="green" />
            <Stat label="Will be updated" value={summary.toUpdate} tone="blue" />
            <Stat label="Have errors" value={summary.errors} tone="red" />
          </div>

          {/* Categories, brands and units the sheet brings with it. Named
              rather than counted: adding a list entry by accident (a typo in
              one cell) is worth catching before the import, not after. */}
          {preview &&
            (preview.newCategories.length > 0 ||
              preview.newBrands.length > 0 ||
              preview.newUnits.length > 0) && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <h4 className="text-sm font-semibold text-amber-900">
                  Will also be added to your lists
                </h4>
                <dl className="mt-1.5 space-y-1 text-sm">
                  {preview.newCategories.length > 0 && (
                    <div className="flex flex-wrap gap-x-2">
                      <dt className="text-amber-800">Categories:</dt>
                      <dd className="font-medium text-amber-900">
                        {preview.newCategories.join(", ")}
                      </dd>
                    </div>
                  )}
                  {preview.newBrands.length > 0 && (
                    <div className="flex flex-wrap gap-x-2">
                      <dt className="text-amber-800">Brands:</dt>
                      <dd className="font-medium text-amber-900">
                        {preview.newBrands.join(", ")}
                      </dd>
                    </div>
                  )}
                  {preview.newUnits.length > 0 && (
                    <div className="flex flex-wrap gap-x-2">
                      <dt className="text-amber-800">Units:</dt>
                      <dd className="font-medium text-amber-900">
                        {preview.newUnits
                          .map((u) => `${u.name} (${u.kind})`)
                          .join(", ")}
                      </dd>
                    </div>
                  )}
                </dl>
                <p className="mt-1.5 text-xs text-amber-700">
                  Check for typos — each of these becomes a new entry you can
                  pick from later.
                </p>
              </div>
            )}

          {summary.errors > 0 && preview && (
            <div className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-gray-900">
                  Rows that will be skipped
                </h4>
                <button
                  onClick={downloadErrorReport}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[#024731] hover:underline"
                >
                  <DownloadOutlined />
                  Download error report
                </button>
              </div>
              <Table
                className="mt-2"
                size="small"
                rowKey={(r) => `${r.rowNumber}-${r.name}`}
                dataSource={preview.errors}
                pagination={preview.errors.length > 5 ? { pageSize: 5 } : false}
                columns={[
                  { title: "Row", dataIndex: "rowNumber", width: 70 },
                  { title: "Name", dataIndex: "name" },
                  { title: "Problem", dataIndex: "message" },
                ]}
              />
            </div>
          )}

          {nothingToDo && (
            <p className="mt-4 rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-800">
              Every row in this file has an error, so there is nothing to import.
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
    </Modal>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "green" | "blue" | "red";
}) {
  const tones = {
    green: "bg-green-50 border-green-200 text-green-800",
    blue: "bg-blue-50 border-blue-200 text-blue-800",
    red: "bg-red-50 border-red-200 text-red-800",
  } as const;
  return (
    <div className={`rounded-lg border px-3 py-2 ${tones[tone]}`}>
      <div className="text-xl font-bold leading-tight">{value}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}
