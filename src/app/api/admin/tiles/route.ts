import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const tiles = await db
      .collection("categoryTiles")
      .find({})
      .sort({ order: 1 })
      .toArray();
    return NextResponse.json({ success: true, tiles });
  } catch (error) {
    console.error("Error fetching tiles:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch tiles" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const body = await request.json();
    const { label, sublabel, href, emoji, bgStyle, order } = body;
    if (!label || !href) {
      return NextResponse.json(
        { success: false, message: "label and href are required" },
        { status: 400 }
      );
    }
    const result = await db.collection("categoryTiles").insertOne({
      label,
      sublabel: sublabel ?? "",
      href,
      emoji: emoji ?? "",
      bgStyle: bgStyle ?? "bordered",
      order: order ?? 0,
      createdAt: new Date(),
    });
    return NextResponse.json({ success: true, id: result.insertedId });
  } catch (error) {
    console.error("Error creating tile:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create tile" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const { _id, label, sublabel, href, emoji, bgStyle, order } =
      await request.json();
    if (!_id) {
      return NextResponse.json(
        { success: false, message: "ID is required" },
        { status: 400 }
      );
    }
    await db.collection("categoryTiles").updateOne(
      { _id: new ObjectId(_id) },
      { $set: { label, sublabel, href, emoji, bgStyle, order: order ?? 0 } }
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating tile:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update tile" },
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
        { success: false, message: "ID is required" },
        { status: 400 }
      );
    }
    await db
      .collection("categoryTiles")
      .deleteOne({ _id: new ObjectId(id) });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting tile:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete tile" },
      { status: 500 }
    );
  }
}
