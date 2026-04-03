import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const cards = await db
      .collection("featuredCards")
      .find({})
      .sort({ order: 1 })
      .toArray();
    return NextResponse.json({ success: true, cards });
  } catch (error) {
    console.error("Error fetching featured cards:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch featured cards" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const { title, subtitle, image, startingPrice, link, order, active } =
      await request.json();
    if (!title || !image || startingPrice === undefined) {
      return NextResponse.json(
        { success: false, message: "title, image and startingPrice are required" },
        { status: 400 }
      );
    }
    const result = await db.collection("featuredCards").insertOne({
      title,
      subtitle: subtitle ?? "",
      image,
      startingPrice: Number(startingPrice),
      link: link ?? "/menu",
      order: order ?? 0,
      active: active ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return NextResponse.json({ success: true, id: result.insertedId });
  } catch (error) {
    console.error("Error creating featured card:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create featured card" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const { _id, title, subtitle, image, startingPrice, link, order, active } =
      await request.json();
    if (!_id) {
      return NextResponse.json(
        { success: false, message: "ID is required" },
        { status: 400 }
      );
    }
    await db.collection("featuredCards").updateOne(
      { _id: new ObjectId(_id) },
      {
        $set: {
          title,
          subtitle,
          image,
          startingPrice: Number(startingPrice),
          link,
          order,
          active,
          updatedAt: new Date(),
        },
      }
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating featured card:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update featured card" },
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
      .collection("featuredCards")
      .deleteOne({ _id: new ObjectId(id) });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting featured card:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete featured card" },
      { status: 500 }
    );
  }
}
