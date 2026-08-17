/**
 * The loading placeholder primitive: a grey block with a sweeping highlight.
 *
 * Page skeletons are built by composing these into the *shape* of the content
 * that is coming. Matching that shape is the point — a skeleton laid out like
 * the real thing keeps the page from jumping when the data lands, which is the
 * jolt that makes a fast page still feel slow.
 *
 * Server-safe: no hooks, no client boundary. Renders inside client components
 * and server ones alike.
 */
export default function Shimmer({
  className = "",
  rounded = "rounded-lg",
}: {
  /** Size and position — always give it a height. */
  className?: string;
  /** Overridable so pills and circles don't have to fight the default. */
  rounded?: string;
}) {
  return (
    <div
      className={`animate-shimmer ${rounded} ${className}`}
      // Placeholders are decorative; a screen reader should hear the real
      // content when it lands, not an inventory of empty grey boxes.
      aria-hidden="true"
    />
  );
}

/** A run of text lines, the last one short like a real paragraph's tail. */
export function ShimmerText({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Shimmer
          key={i}
          rounded="rounded"
          className={`h-3 ${i === lines - 1 ? "w-2/3" : "w-full"}`}
        />
      ))}
    </div>
  );
}
