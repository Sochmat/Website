import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { MenuItem } from "@/lib/types";
import { resolveTenantId } from "@/lib/apiTenant";
import { forTenant } from "@/lib/tenantDb";

export async function GET() {
  try {
    const r = await resolveTenantId();
    if ("error" in r) return r.error;
    const t = await forTenant(r.tenantId);
    const items = await t.find("menuItems", {}).toArray();
    return NextResponse.json({ success: true, items });
  } catch (error) {
    console.error("Error fetching menu items:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch menu items" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const r = await resolveTenantId();
    if ("error" in r) return r.error;
    const t = await forTenant(r.tenantId);
    const data: MenuItem = await request.json();

    const menuItem: MenuItem = {
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await t.insertOne("menuItems", {
      ...menuItem,
      _id: new ObjectId(menuItem._id),
    });
    return NextResponse.json({
      success: true,
      item: { ...menuItem, _id: result.insertedId },
    });
  } catch (error) {
    console.error("Error creating menu item:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create menu item" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const r = await resolveTenantId();
    if ("error" in r) return r.error;
    const t = await forTenant(r.tenantId);
    const data = await request.json();
    const { _id, ...updateData } = data;

    if (!_id) {
      return NextResponse.json(
        { success: false, message: "Item ID is required" },
        { status: 400 }
      );
    }

    const result = await t.updateOne(
      "menuItems",
      { _id: new ObjectId(_id) },
      {
        $set: {
          ...updateData,
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Item not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating menu item:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update menu item" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const r = await resolveTenantId();
    if ("error" in r) return r.error;
    const t = await forTenant(r.tenantId);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Item ID is required" },
        { status: 400 }
      );
    }

    const result = await t.deleteOne("menuItems", { _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Item not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting menu item:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete menu item" },
      { status: 500 }
    );
  }
}
