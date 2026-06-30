import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { resolveTenantId } from "@/lib/apiTenant";
import { forTenant } from "@/lib/tenantDb";

export async function GET(request: NextRequest) {
  try {
    const r = await resolveTenantId();
    if ("error" in r) return r.error;
    const t = await forTenant(r.tenantId);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (id) {
      const user = await t.findOne("users", { _id: new ObjectId(id) });
      if (!user) {
        return NextResponse.json(
          { success: false, message: "User not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        user: {
          _id: user._id,
          phone: user.phone,
          name: user.name,
          email: user.email,
          address: user.address,
          addresses: user.addresses ?? [],
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      });
    }
    const users = await t.find("users", {}).sort({ createdAt: -1 }).toArray();
    return NextResponse.json({
      success: true,
      users: users.map((u) => ({
        _id: u._id,
        phone: u.phone,
        name: u.name,
        email: u.email,
        address: u.address,
        addresses: u.addresses ?? [],
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch users" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const r = await resolveTenantId();
    if ("error" in r) return r.error;
    const t = await forTenant(r.tenantId);

    const body = await request.json();
    const phone = String(body.phone ?? "")
      .trim()
      .replace(/\D/g, "");
    if (!phone) {
      return NextResponse.json(
        { success: false, message: "Phone number is required" },
        { status: 400 }
      );
    }
    const name = body.name ? String(body.name).trim() : undefined;

    let user = await t.findOne("users", { phone });
    if (user) {
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (name !== undefined) updates.name = name;
      if (Object.keys(updates).length > 1) {
        await t.updateOne("users", { phone }, { $set: updates });
        user = { ...user, ...updates };
      }
      return NextResponse.json({
        success: true,
        user: {
          _id: user._id,
          phone: user.phone,
          name: user.name,
          email: user.email,
          address: user.address,
          addresses: user.addresses ?? [],
          createdAt: user.createdAt,
          updatedAt: user.updatedAt ?? updates.updatedAt,
        },
      });
    }

    const newUser = {
      phone,
      name: name ?? "",
      addresses: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await t.insertOne("users", newUser);
    return NextResponse.json({
      success: true,
      user: {
        _id: result.insertedId,
        phone: newUser.phone,
        name: newUser.name,
        addresses: [],
        createdAt: newUser.createdAt,
        updatedAt: newUser.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error in users API:", error);
    return NextResponse.json(
      { success: false, message: "Failed to register user" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const r = await resolveTenantId();
    if ("error" in r) return r.error;
    const t = await forTenant(r.tenantId);

    const body = await request.json();
    const { _id, ...update } = body;
    if (!_id) {
      return NextResponse.json(
        { success: false, message: "_id is required" },
        { status: 400 }
      );
    }
    const allowed = [
      "name",
      "email",
      "address",
      "city",
      "state",
      "country",
      "pincode",
      "addresses",
    ];
    const set: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of allowed) {
      if (update[key] !== undefined) set[key] = update[key];
    }
    const result = await t.updateOne("users", { _id: new ObjectId(_id) }, { $set: set });
    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }
    const user = await t.findOne("users", { _id: new ObjectId(_id) });
    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({
      success: true,
      user: {
        _id: user._id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        address: user.address,
        addresses: user.addresses ?? [],
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update user" },
      { status: 500 }
    );
  }
}
