import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { sendOTPSMS, isKaleyraConfigured } from "@/lib/kaleyra";

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const phone = String(body.phone ?? "")
      .trim()
      .replace(/\D/g, "");
    const name = body.name ? String(body.name).trim() : "";
    
    if (!phone) {
      return NextResponse.json(
        { success: false, message: "Phone number is required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    
    let user = await db.collection("users").findOne({ phone });
    
    if (user && name) {
      await db.collection("users").updateOne(
        { phone },
        { $set: { name, updatedAt: new Date() } }
      );
    } else if (!user) {
      const newUser = {
        phone,
        name: name || "",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const result = await db.collection("users").insertOne(newUser);
      user = { _id: result.insertedId, ...newUser };
    }

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.collection("otps").updateOne(
      { phone },
      {
        $set: {
          otp,
          expiresAt,
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    if (isKaleyraConfigured()) {
      const result = await sendOTPSMS(phone, otp);
      if (!result.success) {
        return NextResponse.json(
          { success: false, message: result.error || "Failed to send OTP" },
          { status: 502 }
        );
      }
    } else {
      console.log(`OTP for ${phone}: ${otp}`);
    }

    return NextResponse.json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (error) {
    console.error("Error sending registration OTP:", error);
    return NextResponse.json(
      { success: false, message: "Failed to send OTP" },
      { status: 500 }
    );
  }
}
