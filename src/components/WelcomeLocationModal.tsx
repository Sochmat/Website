"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Modal } from "antd";
import { useLocation } from "@/context/LocationContext";
import { SOCIETIES, type Society } from "@/lib/societies";
import SocietyNoticeModal, {
  markSocietyNoticeSeen,
} from "@/components/SocietyNoticeModal";

/** localStorage key set by LocationContext once a society is explicitly chosen. */
const SOCIETY_KEY = "sochmat_society_id";

/** Storage is only readable after hydration; nothing here ever re-subscribes. */
const noopSubscribe = () => () => {};

function hasStoredSociety(): boolean {
  try {
    return Boolean(localStorage.getItem(SOCIETY_KEY));
  } catch {
    // localStorage unavailable — default to showing the picker.
    return false;
  }
}

interface WelcomeLocationModalProps {
  /**
   * Fired once this flow is finished — after the picker and any chained launch
   * notice close, or immediately for a returning visitor who never sees it. Lets
   * a caller queue its own modal behind this one (see LocationPerkModals).
   */
  onDone?: () => void;
}

/**
 * First-visit location picker. Opens on the home page when the user has not yet
 * chosen a society (no persisted selection). It's a forced choice — there is no
 * dismiss — so every visitor lands with an explicit delivery location. Picking a
 * slot-based society (e.g. Zomato office) chains into its slot launch notice.
 */
export default function WelcomeLocationModal({
  onDone,
}: WelcomeLocationModalProps) {
  const { setSocietyId } = useLocation();
  const [picked, setPicked] = useState(false);
  const [noticeSociety, setNoticeSociety] = useState<Society | null>(null);
  // False during SSR and the first client render, so reading localStorage can
  // never cause a hydration mismatch.
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  // Only first-time visitors: show when no society has been chosen before.
  const open = hydrated && !picked && !hasStoredSociety();

  // The flow is finished once nothing of ours is on screen — immediately for a
  // returning visitor, otherwise after the picker and any chained notice close.
  const flowDone = hydrated && !open && !noticeSociety;
  useEffect(() => {
    if (flowDone) onDone?.();
  }, [flowDone, onDone]);

  const handleSelect = (s: Society) => {
    setSocietyId(s.id); // persists the choice → modal won't reopen next visit
    setPicked(true);
    if (s.slots.length > 0) {
      // Chain the launch notice, and mark it seen so the selector won't
      // re-show it later this session.
      markSocietyNoticeSeen(s.id);
      setNoticeSociety(s);
    }
    // No explicit onDone here — closing the picker (and the notice, if any) is
    // what completes the flow, and the effect above reports it.
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
        {/* Focusable so antd's focus trap lands here instead of ringing the
            first society button on open; `outline-none` keeps the container
            itself unmarked, and tabbing on from here rings buttons normally. */}
        <div tabIndex={0} className="pt-1 outline-none">
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
