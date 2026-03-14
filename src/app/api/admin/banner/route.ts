import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const slides = await db
      .collection("bannerSlides")
      .find({})
      .sort({ order: 1 })
      .toArray();
    return NextResponse.json({ success: true, slides });
  } catch (error) {
    console.error("Error fetching banner slides:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch banner slides" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const { url, order } = await request.json();
    if (!url) {
      return NextResponse.json(
        { success: false, message: "URL is required" },
        { status: 400 }
      );
    }
    const result = await db.collection("bannerSlides").insertOne({
      url,
      order: order ?? 0,
      createdAt: new Date(),
    });
    return NextResponse.json({ success: true, id: result.insertedId });
  } catch (error) {
    console.error("Error creating banner slide:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create banner slide" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const { _id, url, order } = await request.json();
    if (!_id) {
      return NextResponse.json(
        { success: false, message: "ID is required" },
        { status: 400 }
      );
    }
    await db
      .collection("bannerSlides")
      .updateOne(
        { _id: new ObjectId(_id) },
        { $set: { url, order: order ?? 0 } }
      );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating banner slide:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update banner slide" },
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
      .collection("bannerSlides")
      .deleteOne({ _id: new ObjectId(id) });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting banner slide:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete banner slide" },
      { status: 500 }
    );
  }
}
