import SubscriptionHeader from "@/components/subscription/SubscriptionHeader";

/**
 * Shared chrome for the subscription app. The account bar sits above every
 * /subscription page; each page keeps its own contextual sub-header, which
 * sticks just below this bar (top-14).
 */
export default function SubscriptionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SubscriptionHeader />
      {children}
    </>
  );
}
