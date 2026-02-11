"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MenuIcon, X, Home, UtensilsCrossed, LogIn, LogOut, User } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { useLoginPopup } from "@/context/LoginPopupContext";

export default function ExpandableMenu() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { user, logout: userLogout, isAuthenticated } = useUser();
  const { openLoginPopup } = useLoginPopup();

  const handleUserLogout = () => {
    userLogout();
    setOpen(false);
    router.push("/");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-[#02583f] rounded-full p-4 cursor-pointer hover:bg-[#024731] transition-colors"
        aria-label="Open menu"
      >
        <MenuIcon className="w-6 h-6 text-white" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] bg-[#02583f] flex flex-col items-center justify-center gap-6 p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute top-6 right-6 p-2 text-white hover:bg-white/10 rounded-full transition-colors"
            aria-label="Close menu"
          >
            <X className="w-8 h-8" />
          </button>

          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 w-full max-w-[280px] py-4 px-5 bg-white/10 hover:bg-white/20 rounded-xl text-white font-medium text-lg transition-colors"
          >
            <Home className="w-6 h-6 shrink-0" />
            Home
          </Link>

          <Link
            href="/menu"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 w-full max-w-[280px] py-4 px-5 bg-white/10 hover:bg-white/20 rounded-xl text-white font-medium text-lg transition-colors"
          >
            <UtensilsCrossed className="w-6 h-6 shrink-0" />
            Menu
          </Link>

          {isAuthenticated && (
            <div className="flex items-center gap-3 w-full max-w-[280px] py-4 px-5 bg-white/10 rounded-xl text-white">
              <User className="w-6 h-6 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-lg truncate">{user?.name || "User"}</p>
                <p className="text-sm text-white/80 truncate">{user?.phone}</p>
              </div>
            </div>
          )}

          {isAuthenticated ? (
            <button
              type="button"
              onClick={handleUserLogout}
              className="flex items-center gap-3 w-full max-w-[280px] py-4 px-5 bg-white/10 hover:bg-white/20 rounded-xl text-white font-medium text-lg transition-colors text-left"
            >
              <LogOut className="w-6 h-6 shrink-0" />
              Logout
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                openLoginPopup();
              }}
              className="flex items-center gap-3 w-full max-w-[280px] py-4 px-5 bg-white/10 hover:bg-white/20 rounded-xl text-white font-medium text-lg transition-colors text-left"
            >
              <LogIn className="w-6 h-6 shrink-0" />
              Login
            </button>
          )}
        </div>
      )}
    </>
  );
}
