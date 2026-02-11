"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

type LoginPopupContextType = {
  isOpen: boolean;
  openLoginPopup: () => void;
  closeLoginPopup: () => void;
};

const LoginPopupContext = createContext<LoginPopupContextType | undefined>(undefined);

export function LoginPopupProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const openLoginPopup = useCallback(() => setIsOpen(true), []);
  const closeLoginPopup = useCallback(() => setIsOpen(false), []);

  return (
    <LoginPopupContext.Provider value={{ isOpen, openLoginPopup, closeLoginPopup }}>
      {children}
    </LoginPopupContext.Provider>
  );
}

export function useLoginPopup() {
  const ctx = useContext(LoginPopupContext);
  if (!ctx) throw new Error("useLoginPopup must be used within LoginPopupProvider");
  return ctx;
}
