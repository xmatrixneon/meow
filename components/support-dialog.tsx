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
import { ChevronDown, ChevronUp, MessageCircle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

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

export function SupportDialog({ open, onOpenChange, telegramHelpUrl }: SupportDialogProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Help & FAQ</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-4">
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
                  className="bg-muted/30 border border-border rounded-xl overflow-hidden"
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-sm font-medium text-foreground pr-4">
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
                        className="px-4 pb-3 text-xs text-muted-foreground leading-relaxed"
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

        {/* Contact Options */}
        <div className="mt-6 space-y-2">
          {telegramHelpUrl && (
            <a
              href={telegramHelpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <MessageCircle size={16} />
              Contact on Telegram
              <ExternalLink size={14} />
            </a>
          )}

          <DialogClose asChild>
            <button className="w-full px-4 py-3 rounded-xl border border-border text-sm font-medium hover:bg-muted/50 transition-colors">
              Close
            </button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
