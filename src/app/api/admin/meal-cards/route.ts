import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const cards = await db
      .collection("mealCards")
      .find({})
      .sort({ order: 1 })
      .toArray();
    return NextResponse.json({ success: true, cards });
  } catch (error) {
    console.error("Error fetching meal cards:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch meal cards" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const { title, subtitle, images, startingPrice, category, link, order, active } =
      await request.json();
    if (!title || !images || !Array.isArray(images) || images.length === 0 || startingPrice === undefined) {
      return NextResponse.json(
        { success: false, message: "title, images (non-empty array) and startingPrice are required" },
        { status: 400 }
      );
    }
    const result = await db.collection("mealCards").insertOne({
      title,
      subtitle: subtitle ?? "",
      images,
      startingPrice: Number(startingPrice),
      category: category ?? "",
      link: link ?? "/menu",
      order: order ?? 0,
      active: active ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return NextResponse.json({ success: true, id: result.insertedId });
  } catch (error) {
    console.error("Error creating meal card:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create meal card" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const { _id, title, subtitle, images, startingPrice, category, link, order, active } =
      await request.json();
    if (!_id) {
      return NextResponse.json(
        { success: false, message: "ID is required" },
        { status: 400 }
      );
    }
    await db.collection("mealCards").updateOne(
      { _id: new ObjectId(_id) },
      {
        $set: {
          title,
          subtitle,
          images,
          startingPrice: Number(startingPrice),
          category,
          link,
          order,
          active,
          updatedAt: new Date(),
        },
      }
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating meal card:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update meal card" },
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
      .collection("mealCards")
      .deleteOne({ _id: new ObjectId(id) });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting meal card:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete meal card" },
      { status: 500 }
    );
  }
}
