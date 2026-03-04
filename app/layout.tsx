import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import BottomNavBar from "@/components/ui/bottom-nav-bar";
import { TelegramAuthProvider } from "@/providers/telegram-auth-provider";
import { TRPCProvider } from "@/lib/trpc";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MeowSMS",
  description: "Secure SMS service with Telegram authentication",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script src="https://telegram.org/js/telegram-web-app.js" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <TRPCProvider>
          <TelegramAuthProvider>
            <Navbar />
            <main className="pt-14 pb-16">{children}</main>
            <BottomNavBar />
            <Toaster position="top-center" />
          </TelegramAuthProvider>
        </TRPCProvider>
      </body>
    </html>
  );
}