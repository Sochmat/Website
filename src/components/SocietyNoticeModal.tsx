"use client";

import { Modal } from "antd";
import type { Society } from "@/lib/societies";
import { formatSlot } from "@/lib/societySlots";

/** sessionStorage key prefix for the once-per-session launch notice. */
const NOTICE_SEEN_PREFIX = "sochmat_society_notice_";

/** Whether the launch notice for this society has already shown this session. */
export function hasSeenSocietyNotice(id: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !!sessionStorage.getItem(`${NOTICE_SEEN_PREFIX}${id}`);
  } catch {
    return false;
  }
}

/** Mark the launch notice for this society as shown for this session. */
export function markSocietyNoticeSeen(id: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(`${NOTICE_SEEN_PREFIX}${id}`, "1");
  } catch {
    // sessionStorage unavailable (e.g. private mode) — ignore.
  }
}

interface SocietyNoticeModalProps {
  /** The slot-based society to announce, or null when nothing to show. */
  society: Society | null;
  onClose: () => void;
}

/**
 * One-time launch notice shown when a user selects a society that delivers only
 * within fixed time-slots (e.g. Zomato office). Societies without slots never
 * trigger this — the caller passes `null` for them.
 */
export default function SocietyNoticeModal({
  society,
  onClose,
}: SocietyNoticeModalProps) {
  const open = !!society && society.slots.length > 0;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={onClose}
      okText="Got it"
      cancelButtonProps={{ style: { display: "none" } }}
      okButtonProps={{
        style: {
          background: "#f56215",
          borderColor: "#f56215",
          borderRadius: 10,
        },
      }}
      centered
      title={null}
    >
      {society && (
        <div className="pt-1">
          <p className="text-lg font-semibold text-[#1c1c1c]">
            🎉 Exclusively launched for {society.name}
          </p>
          <p className="mt-2 text-sm text-[#595959]">
            Delivery is currently offered in these slots only:
          </p>
          <ul className="mt-3 space-y-2">
            {society.slots.map((slot) => (
              <li
                key={slot.orderBefore}
                className="flex items-start gap-2 rounded-xl bg-[#fff4ec] px-3 py-2 text-sm text-[#1c1c1c]"
              >
                <span className="mt-0.5 text-[#f56215]">•</span>
                <span>{formatSlot(slot)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
