"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** Give up and hide if a navigation never resolves (offline, dead route). */
const STALL_TIMEOUT_MS = 10_000;
/** How long the finished bar stays at 100% before fading out. */
const FINISH_MS = 220;

/**
 * A thin progress bar across the top during route changes.
 *
 * The App Router exposes no navigation events, so the start is inferred from a
 * click on an internal link and the end from the URL actually changing. That is
 * the only pairing available, and it is honest about the thing users care about
 * — the gap between "I tapped" and "the new page is here".
 *
 * Every page in the app is a client component that fetches in an effect, so
 * this bar covers the transition itself; the per-page skeletons cover the data
 * that arrives after it.
 */
export default function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const stallTimer = useRef<number | undefined>(undefined);
  const doneTimer = useRef<number | undefined>(undefined);

  // Start on any click that will actually navigate this app.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      // A modified click opens a tab instead of navigating; a non-primary
      // button isn't a navigation at all.
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || anchor.target === "_blank" || anchor.hasAttribute("download")) {
        return;
      }

      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // Same page, or a jump to an anchor on it — no navigation to report.
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }

      setState("running");
    }

    function onPopState() {
      setState("running");
    }

    // Capture phase, so a handler that stops propagation can't hide the click.
    document.addEventListener("click", onClick, true);
    // Back/forward is a navigation the user is equally entitled to see.
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  // The URL changed — whatever was in flight has landed.
  useEffect(() => {
    setState((s) => (s === "running" ? "done" : s));
    // pathname/searchParams are the completion signal, so they belong here even
    // though the body doesn't read them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  // Timers: hold the finished bar briefly, and never let a stalled one linger.
  useEffect(() => {
    window.clearTimeout(stallTimer.current);
    window.clearTimeout(doneTimer.current);

    if (state === "running") {
      stallTimer.current = window.setTimeout(
        () => setState("idle"),
        STALL_TIMEOUT_MS,
      );
    } else if (state === "done") {
      doneTimer.current = window.setTimeout(() => setState("idle"), FINISH_MS);
    }

    return () => {
      window.clearTimeout(stallTimer.current);
      window.clearTimeout(doneTimer.current);
    };
  }, [state]);

  if (state === "idle") return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[100] h-[3px] bg-transparent"
      role="progressbar"
      aria-hidden="true"
    >
      <div
        // Remounted per navigation so the crawl restarts rather than resuming
        // wherever the previous one left off.
        key={state === "running" ? `${pathname}-running` : "done"}
        className={`h-full bg-[#f56215] ${
          state === "running" ? "animate-route-progress" : ""
        }`}
        style={
          state === "done"
            ? {
                transform: "scaleX(1)",
                transformOrigin: "0 50%",
                transition: `transform ${FINISH_MS}ms ease-out, opacity ${FINISH_MS}ms ease-out`,
                opacity: 0,
              }
            : undefined
        }
      />
    </div>
  );
}
