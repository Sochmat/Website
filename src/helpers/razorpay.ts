const loadRazorpay = (src: string): Promise<boolean> => {
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

interface RazorpayPrefill {
  name: string;
  email: string;
  contact: string;
}

interface RazorpayOptions {
  amount: number;
  currency?: string;
  prefill?: RazorpayPrefill;
  name?: string;
  description?: string;
  image?: string;
  orderId?: string;
  onSuccess?: (response: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void;
  onError?: (error: any) => void;
}

export const handleRazorpayPayment = async (options: RazorpayOptions) => {
  const loadRazorpaySDK = await loadRazorpay(
    "https://checkout.razorpay.com/v1/checkout.js"
  );

  if (!loadRazorpaySDK) {
    throw new Error("Razorpay SDK failed to load. Check your internet connection.");
  }

  const res = await fetch("/api/payment/create-order", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: options.amount,
      currency: options.currency || "INR",
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to create payment order");
  }

  const order = await res.json();

  const razorpayOptions = {
    key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    amount: order.amount,
    currency: order.currency,
    name: options.name || "Sochmat",
    description: options.description || "Order Payment",
    order_id: order.id,
    image: options.image,
    prefill: options.prefill,
    theme: { color: "#3399cc" },
    handler: async (response: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    }) => {
      const verifyRes = await fetch("/api/payment/verify-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...response,
          orderId: options.orderId,
        }),
      });

      const verifyData = await verifyRes.json();

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
  };

  const rzp = new (window as any).Razorpay(razorpayOptions);
  rzp.open();
};
