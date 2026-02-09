export interface CurrentLocationResult {
  lat: number;
  lng: number;
  address?: string;
  pincode?: string;
}

export function getCurrentLocation(): Promise<CurrentLocationResult> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("Location is not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        let address: string | undefined;
        let pincode: string | undefined;
        try {
          const res = await fetch(
            `/api/geocode/reverse?lat=${encodeURIComponent(
              lat
            )}&lng=${encodeURIComponent(lng)}`
          );
          const data = await res.json();
          if (data.address) address = data.address;
          if (data.pincode) pincode = data.pincode;
        } catch {
          // keep address/pincode undefined
        }
        resolve({ lat, lng, address, pincode });
      },
      () => reject(new Error("Could not get location"))
    );
  });
}
