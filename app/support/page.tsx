"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  HelpCircle,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { type: "spring" as const, stiffness: 280, damping: 24, delay },
});

function SupportSkeleton() {
  return (
    <div className="flex-1 px-4 pt-5 pb-28 max-w-md mx-auto w-full space-y-5">
      <div className="rounded-3xl border border-border px-6 py-6 space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-60" />
      </div>

      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export default function SupportPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // ✅ single source of truth (same as Transactions)
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;

  const faqs = [
    {
      question: "How do I send an SMS?",
      answer:
        "Go to the Home page, enter the phone number and your message, then tap Send.",
    },
    {
      question: "How do I add funds to my wallet?",
      answer:
        "Navigate to the Wallet page and tap Add Funds. We support cards and crypto payments.",
    },
    {
      question: "Is my data secure?",
      answer:
        "Yes. We use strong encryption and never share your data with third parties.",
    },
    {
      question: "How much does it cost?",
      answer:
        "Pricing depends on the destination country. Visit the pricing section for detailed rates.",
    },
    {
      question: "Can I use this outside Telegram?",
      answer:
        "Currently, MeowSMS works as a Telegram Mini App. A full web version is coming soon.",
    },
  ];

  // ── Skeleton (consistent pattern)
  if (isPending && !user) return <SupportSkeleton />;

  // ── Not in Telegram (consistent error card)
  if (!user) {
    return (
      <div className="min-h-[calc(100vh-7rem)] flex items-center justify-center p-6">
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring" as const, stiffness: 300, damping: 22 }}
          className="bg-card border border-border rounded-3xl p-8 text-center max-w-sm w-full shadow-xl"
        >
          <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <Zap size={24} className="text-destructive" />
          </div>
          <p className="font-semibold text-foreground mb-1">Not available</p>
          <p className="text-sm text-muted-foreground">
            Open this app inside Telegram to continue.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-7rem)] flex flex-col">
      <div className="flex-1 px-4 pt-5 pb-28 max-w-md mx-auto w-full space-y-5">

        {/* Header / Hero */}
        <motion.div
          {...fadeUp(0)}
          className="relative overflow-hidden rounded-3xl bg-primary/10 dark:bg-primary/15 border border-primary/20 px-6 py-6"
        >
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
          <div className="relative text-center">
            <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-3">
              <HelpCircle size={22} className="text-primary" />
            </div>
            <h1 className="text-lg font-bold text-foreground mb-1">
              How can we help?
            </h1>
            <p className="text-xs text-muted-foreground">
              Find answers to common questions
            </p>
          </div>
        </motion.div>

        {/* FAQ List */}
        <motion.div {...fadeUp(0.06)} className="space-y-3">
          <AnimatePresence initial={false}>
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;

              return (
                <motion.div
                  key={index}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{
                    type: "spring",
                    stiffness: 280,
                    damping: 24,
                  }}
                  className="bg-card border border-border rounded-2xl overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setOpenFaq(isOpen ? null : index)
                    }
                    className="w-full px-4 py-4 flex items-center justify-between text-left hover:bg-muted/40 transition-colors"
                  >
                    <span className="text-sm font-semibold text-foreground pr-4">
                      {faq.question}
                    </span>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                  </button>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="px-4 pb-4 text-xs text-muted-foreground"
                      >
                        {faq.answer}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>

        {/* Contact Card */}
        <motion.div
          {...fadeUp(0.18)}
          className="bg-card border border-border rounded-2xl px-5 py-5 text-center"
        >
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <MessageCircle size={18} className="text-primary" />
          </div>

          <p className="text-sm font-semibold text-foreground mb-1">
            Still need help?
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            Our support team is ready to assist you.
          </p>

          <button className="px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors">
            Contact Support
          </button>
        </motion.div>
      </div>
    </div>
  );
}