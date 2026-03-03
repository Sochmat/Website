"use client";

import { useState, useEffect } from "react";
import { Table, Button, Popconfirm, message } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";

interface UserAddress {
  id?: string;
  address: string;
  lat: number;
  long: number;
  pincode: string;
}

interface UserRow {
  key: string;
  phone: string;
  name: string;
  email: string;
  address: string;
  addresses: UserAddress[];
  createdAt: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchUsers();
  }, []);

  function fetchUsers() {
    setLoading(true);
    fetch("/api/admin/users")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.users)) {
          setUsers(
            data.users.map((u: Record<string, unknown>) => {
              const addrs = (u.addresses as UserAddress[] | undefined) ?? [];
              const addrDisplay =
                addrs.length > 0
                  ? addrs.map((a) => a.address).join("; ")
                  : String(u.address ?? "-");
              return {
                key: String(u._id),
                phone: String(u.phone ?? ""),
                name: String(u.name ?? "-"),
                email: String(u.email ?? "-"),
                address: addrDisplay,
                addresses: addrs,
                createdAt: u.createdAt
                  ? new Date(u.createdAt as string).toLocaleString()
                  : "-",
              };
            })
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  async function handleDelete(id: string) {
    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.success) {
        setUsers((prev) => prev.filter((u) => u.key !== id));
        message.success("User deleted");
      } else {
        message.error(data.message || "Delete failed");
      }
    } catch {
      message.error("Delete failed");
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  const columns: ColumnsType<UserRow> = [
    { title: "Phone", dataIndex: "phone", key: "phone", width: 120 },
    { title: "Name", dataIndex: "name", key: "name", ellipsis: true },
    { title: "Email", dataIndex: "email", key: "email", ellipsis: true },
    { title: "Address", dataIndex: "address", key: "address", ellipsis: true },
    { title: "Created", dataIndex: "createdAt", key: "createdAt", width: 160 },
    {
      title: "Action",
      key: "action",
      width: 80,
      render: (_: unknown, record: UserRow) => (
        <Popconfirm
          title="Delete user?"
          description="This action cannot be undone."
          onConfirm={() => handleDelete(record.key)}
          okText="Delete"
          okButtonProps={{ danger: true }}
        >
          <Button
            type="text"
            danger
            size="small"
            icon={<DeleteOutlined />}
            loading={deletingIds.has(record.key)}
          />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h2 className="text-lg font-bold text-gray-800 mb-4">
        Users ({users.length})
      </h2>
      <Table
        columns={columns}
        dataSource={users}
        loading={loading}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (t) => `Total ${t} users`,
        }}
        scroll={{ x: 800 }}
      />
    </div>
  );
}
