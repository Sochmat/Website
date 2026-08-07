import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/context/CartContext";
import { LocationProvider } from "@/context/LocationContext";
import { UserProvider } from "@/context/UserContext";
import { LoginPopupProvider } from "@/context/LoginPopupContext";
import { StoreStatusProvider } from "@/context/StoreStatusContext";
import LocationPrompt from "@/components/LocationPrompt";
import LoginPopup from "@/components/LoginPopup";
import OrderPromptModal from "@/components/OrderPromptModal";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sochmat - Healthy Food Ordering",
  description:
    "Order healthy, high-protein meals. No added sugar, natural ingredients.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} antialiased`}>
        {/* <script
          src="http://localhost:8899/embed.js"
          data-env="development"
        ></script> */}
        <UserProvider>
          <LoginPopupProvider>
            <CartProvider>
              {/* Location wraps StoreStatus: store/delivery availability is now
                  per-location, so the status provider reads the selected
                  society. LocationProvider has no store-status dependency, so
                  this nesting cannot cycle. */}
              <LocationProvider>
                <StoreStatusProvider>
                  {/* <LocationPrompt /> */}
                  {children}
                  <LoginPopup />
                  {/* <OrderPromptModal /> */}
                </StoreStatusProvider>
              </LocationProvider>
            </CartProvider>
          </LoginPopupProvider>
        </UserProvider>
      </body>
    </html>
  );
}
