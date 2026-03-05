import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import BottomNavBar from "@/components/ui/bottom-nav-bar";
import { TelegramAuthProvider } from "@/providers/telegram-auth-provider";
import { TRPCProvider } from "@/lib/trpc";
import { Toaster } from "@/components/ui/sonner";
import { TelegramGate } from "@/components/telegram-gate";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MeowSMS",
  description: "Secure SMS service with Telegram authentication",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <TelegramGate>
          <TelegramAuthProvider>
            <TRPCProvider>
              <Navbar />
              <main className="pt-14 pb-16">{children}</main>
              <BottomNavBar />
              <Toaster position="top-center" />
            </TRPCProvider>
          </TelegramAuthProvider>
        </TelegramGate>
      </body>
    </html>
  );
}
