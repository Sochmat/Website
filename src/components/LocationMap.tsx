"use client";

import { useCallback, useRef, useEffect, useState } from "react";
import { GoogleMap, MarkerF, useJsApiLoader } from "@react-google-maps/api";

interface LocationMapProps {
  center: [number, number];
  onPinMove: (lat: number, lng: number) => void;
}

const containerStyle = { width: "100%", height: "100%" };

export default function LocationMap({ center, onPinMove }: LocationMapProps) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "",
  });

  const mapRef = useRef<google.maps.Map | null>(null);
  const initialCenter = useRef({ lat: center[0], lng: center[1] });
  const [markerPos, setMarkerPos] = useState<{ lat: number; lng: number }>({
    lat: center[0],
    lng: center[1],
  });

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  // Pan map + update marker when center changes externally (search/GPS)
  useEffect(() => {
    const newPos = { lat: center[0], lng: center[1] };
    setMarkerPos(newPos);
    if (mapRef.current) {
      mapRef.current.panTo(newPos);
    }
  }, [center]);

  const handleDragEnd = useCallback(
    (e: google.maps.MapMouseEvent) => {
      if (e.latLng) {
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();
        setMarkerPos({ lat, lng });
        onPinMove(lat, lng);
      }
    },
    [onPinMove],
  );

  if (!isLoaded) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <div className="w-6 h-6 border-2 border-[#1c1c1c] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={initialCenter.current}
      zoom={15}
      onLoad={onLoad}
      options={{
        zoomControl: false,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
        gestureHandling: "greedy",
      }}
    >
      <MarkerF
        position={markerPos}
        draggable
        onDragEnd={handleDragEnd}
      />
    </GoogleMap>
  );
}
