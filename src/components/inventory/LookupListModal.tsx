"use client";

import { useEffect, useState } from "react";
import { Modal, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckOutlined,
  CloseOutlined,
} from "@ant-design/icons";

/** Shape shared by categories and brands — a name plus a usage count. */
export interface LookupEntry {
  _id?: string;
  name: string;
  materialCount?: number;
}

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-[#024731] focus:ring-1 focus:ring-[#024731]";

/**
 * List, add, rename and delete for a simple lookup table.
 *
 * Categories and brands are the same screen with different nouns, so this is
 * parameterised rather than duplicated. Renaming needs no cascade — materials
 * reference these by id and the name is resolved on read. Deleting one still
 * in use is refused by the API, and disabled here too so the failure is
 * visible before the click rather than after it.
 */
export default function LookupListModal({
  open,
  onClose,
  onChanged,
  title,
  endpoint,
  responseKey,
  label,
  addPlaceholder,
}: {
  open: boolean;
  onClose: () => void;
  /** Fired after any successful mutation so the page can refresh its copy. */
  onChanged: () => void;
  /** Modal heading, e.g. "Category list". */
  title: string;
  /** Collection endpoint, e.g. "/api/inventory/categories". */
  endpoint: string;
  /** Key the list arrives under, e.g. "categories". */
  responseKey: string;
  /** Lowercase singular noun for messages, e.g. "category". */
  label: string;
  addPlaceholder: string;
}) {
  const [entries, setEntries] = useState<LookupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [modal, modalContextHolder] = Modal.useModal();
  const [messageApi, messageContextHolder] = message.useMessage();

  const Label = label.charAt(0).toUpperCase() + label.slice(1);

  const load = async () => {
    try {
      const res = await fetch(endpoint, { cache: "no-store" });
      const data = await res.json();
      if (data.success) setEntries(data[responseKey] ?? []);
    } catch {
      // Keep whatever is on screen rather than blanking it.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setNewName("");
    setEditingId(null);
    setEditingName("");
    load();
    // `load` is stable for a given endpoint; re-running on every render would
    // refetch in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, endpoint]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!data.success) {
        messageApi.error(data.message ?? `Could not add ${label}`);
        return;
      }
      setNewName("");
      messageApi.success(`${Label} added`);
      await load();
      onChanged();
    } catch {
      messageApi.error("Network error — please try again");
    } finally {
      setAdding(false);
    }
  };

  const handleRename = async (id: string) => {
    const name = editingName.trim();
    if (!name) return;
    setSavingId(id);
    try {
      const res = await fetch(`${endpoint}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!data.success) {
        messageApi.error(data.message ?? `Could not rename ${label}`);
        return;
      }
      setEditingId(null);
      messageApi.success(`${Label} renamed`);
      await load();
      onChanged();
    } catch {
      messageApi.error("Network error — please try again");
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = (entry: LookupEntry) => {
    modal.confirm({
      title: `Delete this ${label}?`,
      content: (
        <span>
          <strong>{entry.name}</strong> will be removed permanently.
        </span>
      ),
      okText: "Delete",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: async () => {
        try {
          const res = await fetch(`${endpoint}/${entry._id}`, {
            method: "DELETE",
          });
          const data = await res.json();
          if (!data.success) {
            messageApi.error(data.message ?? `Could not delete ${label}`);
            return;
          }
          messageApi.success(`${Label} deleted`);
          await load();
          onChanged();
        } catch {
          messageApi.error("Network error — please try again");
        }
      },
    });
  };

  const columns: ColumnsType<LookupEntry> = [
    {
      title: Label,
      dataIndex: "name",
      sorter: (a, b) => a.name.localeCompare(b.name),
      defaultSortOrder: "ascend",
      render: (name: string, row) => {
        const id = String(row._id);
        if (editingId !== id) {
          return <span className="font-medium text-gray-900">{name}</span>;
        }
        return (
          <input
            className={inputClass}
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename(id);
              if (e.key === "Escape") setEditingId(null);
            }}
            autoFocus
          />
        );
      },
    },
    {
      title: "Used by",
      dataIndex: "materialCount",
      align: "right",
      width: 130,
      sorter: (a, b) => (a.materialCount ?? 0) - (b.materialCount ?? 0),
      render: (count: number = 0) => (
        <span className="whitespace-nowrap text-sm text-gray-600 tabular-nums">
          {count} material{count === 1 ? "" : "s"}
        </span>
      ),
    },
    {
      title: "Actions",
      key: "actions",
      align: "right",
      width: 100,
      render: (_, row) => {
        const id = String(row._id);
        const inUse = (row.materialCount ?? 0) > 0;

        if (editingId === id) {
          return (
            <div className="flex items-center justify-end gap-1">
              <button
                onClick={() => handleRename(id)}
                disabled={savingId === id || !editingName.trim()}
                aria-label="Save name"
                title="Save"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-green-600 hover:bg-green-50 disabled:opacity-40 transition-colors"
              >
                <CheckOutlined />
              </button>
              <button
                onClick={() => setEditingId(null)}
                aria-label="Cancel rename"
                title="Cancel"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
              >
                <CloseOutlined />
              </button>
            </div>
          );
        }

        return (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={() => {
                setEditingId(id);
                setEditingName(row.name);
              }}
              aria-label={`Edit ${row.name}`}
              title="Edit"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-[#024731] transition-colors"
            >
              <EditOutlined />
            </button>
            <button
              onClick={() => handleDelete(row)}
              disabled={inUse}
              aria-label={`Delete ${row.name}`}
              title={
                inUse
                  ? "In use by raw materials — reassign them first"
                  : "Delete"
              }
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-500 disabled:cursor-not-allowed transition-colors"
            >
              <DeleteOutlined />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <Modal open={open} onCancel={onClose} title={title} width={620} footer={null}>
      {modalContextHolder}
      {messageContextHolder}

      <div className="mt-4 flex items-center gap-2">
        <input
          className={inputClass}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          placeholder={addPlaceholder}
          aria-label={addPlaceholder}
        />
        <button
          onClick={handleAdd}
          disabled={adding || !newName.trim()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#1c1c1c] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#024731] disabled:opacity-50 transition-colors"
        >
          <PlusOutlined />
          {adding ? "Adding…" : "Add"}
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-gray-200 overflow-hidden">
        <Table<LookupEntry>
          rowKey={(row) => String(row._id)}
          columns={columns}
          dataSource={entries}
          loading={loading}
          size="small"
          pagination={
            entries.length > 8 ? { pageSize: 8, showSizeChanger: false } : false
          }
          locale={{
            emptyText: (
              <div className="py-8 text-center">
                <p className="text-sm font-medium text-gray-900">
                  No {label === "category" ? "categories" : `${label}s`} yet
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Add one above to start using it on raw materials.
                </p>
              </div>
            ),
          }}
        />
      </div>

      <p className="mt-3 text-xs text-gray-500">
        A {label} in use can&apos;t be deleted — reassign its raw materials
        first. Renaming is safe and updates everywhere immediately.
      </p>
    </Modal>
  );
}
