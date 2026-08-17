import Shimmer from "@/components/ui/Shimmer";

/**
 * The stand-in for a whole customer page while its first fetch is out.
 *
 * The customer routes all share one shell — a 430px column on grey — so they
 * can share one placeholder. It deliberately shows a header strip and a stack
 * of cards rather than a centred spinner: a spinner says "wait", a page-shaped
 * skeleton says "this is what is coming", and it holds the scroll position so
 * the real content doesn't shove the viewport when it lands.
 */
export default function PageSkeleton({
  cards = 3,
  cardHeight = "h-28",
  showHeader = true,
}: {
  cards?: number;
  /** Tailwind height for each card — match the real content where it differs. */
  cardHeight?: string;
  showHeader?: boolean;
}) {
  return (
    <main className="min-h-screen bg-[#f5f5f5] max-w-[430px] mx-auto">
      {showHeader && (
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
          <Shimmer rounded="rounded-full" className="h-6 w-6 shrink-0" />
          <Shimmer rounded="rounded" className="h-4 w-40" />
        </div>
      )}
      <div className="p-4 space-y-3">
        {Array.from({ length: cards }).map((_, i) => (
          <Shimmer key={i} rounded="rounded-xl" className={cardHeight} />
        ))}
      </div>
    </main>
  );
}
