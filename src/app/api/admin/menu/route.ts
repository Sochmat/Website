import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { MenuItem } from "@/lib/types";

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const items = await db.collection("menuItems").find({}).toArray();
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
    const { db } = await connectToDatabase();
    const data: MenuItem = await request.json();

    const menuItem: MenuItem = {
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("menuItems").insertOne({
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
    const { db } = await connectToDatabase();
    const data = await request.json();
    const { _id, ...updateData } = data;

    if (!_id) {
      return NextResponse.json(
        { success: false, message: "Item ID is required" },
        { status: 400 }
      );
    }

    const result = await db.collection("menuItems").updateOne(
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
    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Item ID is required" },
        { status: 400 }
      );
    }

    const result = await db
      .collection("menuItems")
      .deleteOne({ _id: new ObjectId(id) });

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
