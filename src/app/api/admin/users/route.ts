import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const users = await db
      .collection("users")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();
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
