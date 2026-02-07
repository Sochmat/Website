import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/context/CartContext";
import { LocationProvider } from "@/context/LocationContext";
import LocationPrompt from "@/components/LocationPrompt";

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
        <CartProvider>
          <LocationProvider>
            <LocationPrompt />
            {children}
          </LocationProvider>
        </CartProvider>
      </body>
    </html>
  );
}
