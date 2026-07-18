"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Must match the keys/path used by the admin layout's notification audio.
const SOUND_ENABLED_KEY = "admin_sound_enabled";
const SOUND_PATH = "/sounds/new-order.mp3";

// Unlock browser autoplay using the login click (a genuine user gesture) so the
// order-notification sound works as soon as the admin lands on the dashboard.
// Plays the clip muted, then marks sound enabled. Best-effort: if the browser
// still blocks it, the layout's "Enable sound" banner remains as a fallback.
async function unlockNotificationSound() {
  try {
    const audio = new Audio(SOUND_PATH);
    audio.muted = true;
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    localStorage.setItem(SOUND_ENABLED_KEY, "1");
  } catch {
    // Autoplay still blocked — fall back to the banner prompt in the layout.
  }
}

export default function AdminLoginPage() {
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, password }),
      });
      const data = await res.json();
      if (data.success) {
        // The real session lives in an httpOnly cookie set by the server. These
        // localStorage values are only UI markers (which dashboard to render).
        localStorage.setItem("adminToken", "1");
        localStorage.setItem("adminRole", data.role);
        await unlockNotificationSound();
        router.replace(data.role === "shop" ? "/admin/orders" : "/admin/menu");
      } else {
        setError(data.message);
      }
    } catch {
      setError("Login failed");
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-center text-[#1c1c1c] mb-6">
          Admin Login
        </h1>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Username
            </label>
            <input
              type="text"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            className="w-full bg-[#1c1c1c] text-white py-2 rounded-lg font-medium hover:bg-[#024731] transition-colors"
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
}
