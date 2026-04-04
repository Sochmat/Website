import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json(
      { error: "lat and lng required" },
      { status: 400 },
    );
  }

  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_MAPS_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing API key" }, { status: 500 });
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latNum},${lngNum}&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ error: "Geocoding failed" }, { status: 502 });
    }
    const data = await res.json();
    const result = data.results?.[0];
    const address = result?.formatted_address ?? null;
    const components = result?.address_components ?? [];
    const pincodeComp = components.find((c: { types: string[] }) =>
      c.types.includes("postal_code"),
    );
    const pincode: string | null = pincodeComp?.long_name ?? null;

    return NextResponse.json({ address, pincode });
  } catch (err) {
    console.error("Reverse geocode error:", err);
    return NextResponse.json(
      { error: "Failed to get address" },
      { status: 500 },
    );
  }
}
