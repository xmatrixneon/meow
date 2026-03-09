"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, ExternalLink, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SupportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  telegramHelpUrl?: string | null;
}

const faqs = [
  {
    question: "How do I get a number?",
    answer: "Go to the Home tab, search for the service you need (e.g. Telegram, Google), tap it, choose a server, and tap Buy. The number is assigned instantly.",
  },
  {
    question: "How do I add funds to my wallet?",
    answer: "Go to the Wallet tab and tap Add Funds. We support UPI (Google Pay, Paytm, PhonePe). Pay and submit your UTR to get balance instantly.",
  },
  {
    question: "How long does a number last?",
    answer: "Numbers are active for up to 20 minutes. If no SMS is received within that time, you can cancel and receive a refund (after the cancel cooldown).",
  },
  {
    question: "Can I cancel an order?",
    answer: "Yes, you can cancel a waiting number after a short cooldown (usually 2 minutes). The cancel button becomes active once the cooldown ends.",
  },
  {
    question: "What is the UTR number?",
    answer: "UTR (Unique Transaction Reference) is a 12-digit number found in your payment app under transaction details. It's used to verify your UPI payment.",
  },
  {
    question: "Is my data secure?",
    answer: "Yes. We only store what is needed to provide the service. SMS content is temporarily stored and deleted after the number expires.",
  },
];

function TelegramIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

export function SupportDialog({ open, onOpenChange, telegramHelpUrl }: SupportDialogProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-lg w-[95vw] max-h-[88vh] p-0 overflow-hidden flex flex-col">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border shrink-0 text-left">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <HelpCircle size={16} className="text-primary" />
            </div>
            <DialogTitle className="text-base font-bold">Help & FAQ</DialogTitle>
          </div>
        </DialogHeader>

        {/* FAQ list */}
        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-2">
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div key={index} className="bg-card border border-border/70 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-sm font-medium text-foreground pr-3 leading-snug">
                      {faq.question}
                    </span>
                    <ChevronDown
                      size={15}
                      className={cn(
                        "text-muted-foreground shrink-0 transition-transform duration-200",
                        isOpen && "rotate-180",
                      )}
                    />
                  </button>
                  {/* CSS grid-rows for smooth expand */}
                  <div className={cn("grid transition-all duration-200 ease-in-out", isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                    <div className="overflow-hidden">
                      <div className="px-4 pb-3.5 pt-2 text-xs text-muted-foreground leading-relaxed border-t border-border/60">
                        {faq.answer}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Footer */}
        {telegramHelpUrl && (
          <div className="border-t border-border px-5 py-4 shrink-0">
            <a
              href={telegramHelpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              <TelegramIcon size={15} />
              Contact Support on Telegram
              <ExternalLink size={13} className="opacity-60" />
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}