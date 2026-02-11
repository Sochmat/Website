"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLoginPopup } from "@/context/LoginPopupContext";

export default function LoginPage() {
  const router = useRouter();
  const { openLoginPopup } = useLoginPopup();

  useEffect(() => {
    openLoginPopup();
    router.replace("/");
  }, [openLoginPopup, router]);

  return null;
}
