const CHECKOUT_SDK = "https://checkout.razorpay.com/v1/checkout.js";
const CUSTOM_SDK = "https://checkout.razorpay.com/v1/razorpay.js";

const loadedScripts = new Set<string>();

const loadScript = (src: string): Promise<boolean> => {
  if (loadedScripts.has(src)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => {
      loadedScripts.add(src);
      resolve(true);
    };
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

interface RazorpayPrefill {
  name: string;
  email: string;
  contact: string;
}

export type UpiApp = "google_pay" | "phonepe" | "paytm" | "bhim";

interface RazorpayOptions {
  amount: number;
  currency?: string;
  prefill?: RazorpayPrefill;
  name?: string;
  description?: string;
  image?: string;
  orderId?: string;
  upiApp?: UpiApp;
  onSuccess?: (response: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void;
  onError?: (error: any) => void;
}

async function createRazorpayOrder(amount: number, currency: string) {
  const res = await fetch("/api/payment/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount, currency }),
  });
  if (!res.ok) throw new Error("Failed to create payment order");
  return res.json();
}

async function verifyPayment(
  response: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  },
  orderId?: string,
) {
  const res = await fetch("/api/payment/verify-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...response, orderId }),
  });
  return res.json();
}

/**
 * UPI Intent flow via Razorpay Custom Checkout (razorpay.js).
 * Opens the UPI app directly on the user's phone; Razorpay monitors payment status.
 */
async function handleUpiIntent(options: RazorpayOptions, order: any) {
  const loaded = await loadScript(CUSTOM_SDK);
  if (!loaded) throw new Error("Razorpay SDK failed to load.");

  const rzp = new (window as any).Razorpay({
    key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    image: options.image,
  });

  rzp.on("payment.success", async (resp: any) => {
    const r = resp.detail ?? resp;
    const verifyData = await verifyPayment(
      {
        razorpay_order_id: r.razorpay_order_id,
        razorpay_payment_id: r.razorpay_payment_id,
        razorpay_signature: r.razorpay_signature,
      },
      options.orderId,
    );
    if (verifyData.success) {
      options.onSuccess?.(r);
    } else {
      options.onError?.(new Error("Payment verification failed"));
    }
  });

  rzp.on("payment.error", (resp: any) => {
    const desc = resp;
    resp?.error?.description ??
      resp?.detail?.error?.description ??
      "Payment failed";
    options.onError?.(desc);
  });

  rzp.createPayment({
    amount: order.amount,
    currency: order.currency,
    order_id: order.id,
    email: options.prefill?.email || "",
    contact: options.prefill?.contact || "",
    method: "upi",
    upi: { flow: "intent" },
  });
}

/**
 * Standard Razorpay Checkout modal (checkout.js).
 */
async function handleStandardCheckout(options: RazorpayOptions, order: any) {
  const loaded = await loadScript(CHECKOUT_SDK);
  if (!loaded) throw new Error("Razorpay SDK failed to load.");

  const rzp = new (window as any).Razorpay({
    key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    amount: order.amount,
    currency: order.currency,
    name: options.name || "Sochmat",
    description: options.description || "Order Payment",
    order_id: order.id,
    image: options.image,
    prefill: options.prefill,
    theme: { color: "#f56215" },
    handler: async (response: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    }) => {
      const verifyData = await verifyPayment(response, options.orderId);
      if (verifyData.success) {
        options.onSuccess?.(response);
      } else {
        options.onError?.(new Error("Payment verification failed"));
      }
    },
    modal: {
      ondismiss: () => {
        options.onError?.(new Error("Payment cancelled"));
      },
    },
  });

  rzp.open();
}

export const handleRazorpayPayment = async (options: RazorpayOptions) => {
  console.log({ options });
  const order = await createRazorpayOrder(
    options.amount,
    options.currency || "INR",
  );

  const isSecureOrigin =
    typeof window !== "undefined" && window.location.protocol === "https:";

  if (options.upiApp && isSecureOrigin) {
    await handleUpiIntent(options, order);
  } else {
    await handleStandardCheckout(options, order);
  }
};
