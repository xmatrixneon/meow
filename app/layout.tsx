// app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/providers";
import { TRPCProvider } from "@/lib/trpc";
import { TelegramGate } from "@/components/telegram-gate";
import { MaintenanceModeGuard } from "@/components/maintenance-mode-guard";
import { Navbar } from "@/components/navbar";
import { BottomNavBar } from "@/components/bottom-nav-bar";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MeowSMS",
  description: "Secure virtual SMS numbers via Telegram",
};

// Disable pinch zoom — standard for Telegram Mini Apps
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/*
         * Provider tree (order matters):
         *
         * Providers              — TelegramAuthProvider loaded with ssr:false
         *   TRPCProvider         — React Query + tRPC
         *     MaintenanceModeGuard — checks maintenance mode before auth
         *       TelegramGate     — blocks UI until auth resolves
         *         Navbar
         *         main
         *         BottomNavBar
         *         Toaster
         *
         * NO <Script> tag for telegram-web-app.js — we use @telegram-apps/sdk-react
         * which reads initData from the URL hash synchronously. The script tag
         * caused the double-open race condition and is no longer needed.
         */}
        <Providers>
          <TRPCProvider>
            <MaintenanceModeGuard>
              <TelegramGate>
                <Navbar />
                <main className="pt-14 pb-16">{children}</main>
                <BottomNavBar />
                <Toaster position="top-center" />
              </TelegramGate>
            </MaintenanceModeGuard>
          </TRPCProvider>
        </Providers>
      </body>
    </html>
  );
}