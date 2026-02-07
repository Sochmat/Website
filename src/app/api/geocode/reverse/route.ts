import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json(
      { error: "lat and lng required" },
      { status: 400 }
    );
  }

  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${latNum}&lon=${lngNum}&format=json`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "SochmatWebsite/1.0 (contact@sochmat.com)",
      },
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Geocoding failed" }, { status: 502 });
    }
    const data = (await res.json()) as {
      display_name?: string;
      address?: Record<string, string>;
    };
    const address = data.display_name ?? null;
    return NextResponse.json({ address });
  } catch (err) {
    console.error("Reverse geocode error:", err);
    return NextResponse.json(
      { error: "Failed to get address" },
      { status: 500 }
    );
  }
}
