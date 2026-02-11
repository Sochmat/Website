import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/context/CartContext";
import { LocationProvider } from "@/context/LocationContext";
import { UserProvider } from "@/context/UserContext";
import { LoginPopupProvider } from "@/context/LoginPopupContext";
import LocationPrompt from "@/components/LocationPrompt";
import LoginPopup from "@/components/LoginPopup";

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
        <UserProvider>
          <LoginPopupProvider>
            <CartProvider>
              <LocationProvider>
                <LocationPrompt />
                {children}
                <LoginPopup />
              </LocationProvider>
            </CartProvider>
          </LoginPopupProvider>
        </UserProvider>
      </body>
    </html>
  );
}
