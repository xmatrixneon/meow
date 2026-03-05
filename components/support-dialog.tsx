"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, ChevronUp, ExternalLink, X } from "lucide-react";

interface SupportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  telegramHelpUrl?: string | null;
}

const faqs = [
  {
    question: "How do I send an SMS?",
    answer: "Go to Home page, enter the phone number and your message, then tap Send.",
  },
  {
    question: "How do I add funds to my wallet?",
    answer: "Navigate to Wallet page and tap Add Funds. We support UPI deposits.",
  },
  {
    question: "Is my data secure?",
    answer: "Yes. We use strong encryption and never share your data with third parties.",
  },
  {
    question: "How much does it cost?",
    answer: "Pricing depends on destination country and service. Check the pricing on the home page.",
  },
  {
    question: "Can I use this outside Telegram?",
    answer: "Currently, MeowSMS works as a Telegram Mini App. A full web version is coming soon.",
  },
];

// Inline Telegram SVG icon
function TelegramIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

export function SupportDialog({ open, onOpenChange, telegramHelpUrl }: SupportDialogProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl max-w-lg w-[95vw] max-h-[90vh] p-0 overflow-hidden flex flex-col">
        {/* Header */}
        <DialogHeader className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base sm:text-lg">Help & FAQ</DialogTitle>
            <DialogClose asChild>
              <button className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                <X size={16} />
              </button>
            </DialogClose>
          </div>
        </DialogHeader>

        {/* FAQ list */}
        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-5 space-y-2 sm:space-y-3">
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
                    transition={{ type: "spring", stiffness: 280, damping: 24 }}
                    className="bg-card border border-border rounded-2xl overflow-hidden"
                  >
                    <button
                      onClick={() => setOpenFaq(isOpen ? null : index)}
                      className="w-full px-3 sm:px-4 py-3 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
                    >
                      <span className="text-xs sm:text-sm font-medium text-foreground pr-3">
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
                          className="px-3 sm:px-4 pb-3 text-xs text-muted-foreground leading-relaxed border-t border-border/60 pt-2"
                        >
                          {faq.answer}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </ScrollArea>

        {/* Footer — Telegram support button */}
        {telegramHelpUrl && (
          <div className="border-t border-border p-3 sm:p-4 flex-shrink-0">
            <a
              href={telegramHelpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 sm:py-3 rounded-xl bg-primary text-primary-foreground text-sm sm:text-base font-medium hover:bg-primary/90 transition-colors"
            >
              <TelegramIcon size={16} />
              Contact Support on Telegram
              <ExternalLink size={14} className="opacity-70" />
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}