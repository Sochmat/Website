"use client";

import { useEffect, useState } from "react";
import { Modal } from "antd";
import { useLocation } from "@/context/LocationContext";
import { SOCIETIES, type Society } from "@/lib/societies";
import SocietyNoticeModal, {
  markSocietyNoticeSeen,
} from "@/components/SocietyNoticeModal";

/** localStorage key set by LocationContext once a society is explicitly chosen. */
const SOCIETY_KEY = "sochmat_society_id";

/**
 * First-visit location picker. Opens on the home page when the user has not yet
 * chosen a society (no persisted selection). It's a forced choice — there is no
 * dismiss — so every visitor lands with an explicit delivery location. Picking a
 * slot-based society (e.g. Zomato office) chains into its slot launch notice.
 */
export default function WelcomeLocationModal() {
  const { setSocietyId } = useLocation();
  const [open, setOpen] = useState(false);
  const [noticeSociety, setNoticeSociety] = useState<Society | null>(null);

  // Only first-time visitors: show when no society has been chosen before.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (!localStorage.getItem(SOCIETY_KEY)) setOpen(true);
    } catch {
      // localStorage unavailable — default to showing the picker.
      setOpen(true);
    }
  }, []);

  const handleSelect = (s: Society) => {
    setSocietyId(s.id); // persists the choice → modal won't reopen next visit
    setOpen(false);
    if (s.slots.length > 0) {
      // Chain the launch notice, and mark it seen so the selector won't
      // re-show it later this session.
      markSocietyNoticeSeen(s.id);
      setNoticeSociety(s);
    }
  };

  return (
    <>
      <Modal
        open={open}
        closable={false}
        maskClosable={false}
        keyboard={false}
        footer={null}
        centered
        title={null}
      >
        <div className="pt-1">
          <p className="text-lg font-semibold text-[#1c1c1c]">
            Where should we deliver?
          </p>
          <p className="mt-1 text-sm text-[#595959]">
            Choose your location to start ordering.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            {SOCIETIES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSelect(s)}
                className="flex items-center gap-3 rounded-2xl border border-[#e5e5e5] px-4 py-3 text-left transition-colors hover:border-[#f56215] hover:bg-[#fff4ec]"
              >
                <svg
                  className="h-5 w-5 shrink-0 text-[#f56215]"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
                </svg>
                <span className="flex-1">
                  <span className="block text-sm font-medium text-[#1c1c1c]">
                    {s.name}
                  </span>
                  <span className="block text-xs text-[#959595]">
                    {s.sector}
                  </span>
                </span>
                <svg
                  className="h-5 w-5 shrink-0 text-[#595959]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            ))}
          </div>
        </div>
      </Modal>

      <SocietyNoticeModal
        society={noticeSociety}
        onClose={() => setNoticeSociety(null)}
      />
    </>
  );
}
