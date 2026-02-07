import { NextRequest, NextResponse } from "next/server";

const ADMIN_CREDENTIALS = {
  user: "sochmat",
  password: "sochmat@777",
};

export async function POST(request: NextRequest) {
  try {
    const { user, password } = await request.json();

    if (
      user === ADMIN_CREDENTIALS.user &&
      password === ADMIN_CREDENTIALS.password
    ) {
      const token = Buffer.from(`${user}:${Date.now()}`).toString("base64");
      return NextResponse.json({ success: true, token });
    }

    return NextResponse.json(
      { success: false, message: "Invalid credentials" },
      { status: 401 }
    );
  } catch {
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}
