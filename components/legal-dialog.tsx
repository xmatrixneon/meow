"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

interface LegalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const terms = [
  { title: "1. Acceptance of Terms", body: "By accessing and using MeowSMS services, you agree to be bound by these Terms of Service." },
  { title: "2. Service Description", body: "MeowSMS provides virtual phone number services for receiving SMS messages. We do not guarantee the delivery of SMS messages or the availability of phone numbers." },
  { title: "3. User Responsibilities", body: "You agree to use our services for lawful purposes only. You are responsible for maintaining the confidentiality of your account credentials." },
  { title: "4. Payment & Refunds", body: "All purchases are final. Refunds are only processed for unused services or at our discretion. Prices are subject to change without notice." },
  { title: "5. Limitation of Liability", body: "MeowSMS shall not be liable for any indirect, incidental, special, or consequential damages arising from the use of our services." },
  { title: "6. Termination", body: "We reserve the right to suspend or terminate your account at any time for violation of these terms or for any other reason at our sole discretion." },
];

const privacy = [
  { title: "1. Data Collection", body: "We collect information you provide directly, such as your Telegram profile data and wallet information. We also collect usage data to improve our services." },
  { title: "2. How We Use Your Data", body: "Your data is used to provide our services, process payments, and communicate with you about your account. We do not sell your personal data to third parties." },
  { title: "3. SMS Messages", body: "SMS messages received through our virtual numbers are stored temporarily and deleted after the number expires. We do not read message content for any purpose other than delivering them to you." },
  { title: "4. Data Security", body: "We implement industry-standard security measures to protect your data. However, no method of transmission over the Internet is 100% secure." },
  { title: "5. Third-Party Services", body: "We may use third-party services for payment processing and SMS delivery. These services have their own privacy policies which we encourage you to review." },
  { title: "6. Your Rights", body: "You have the right to access, correct, or delete your personal data. To exercise these rights, please contact our support team." },
];

const TABS = [
  { value: "terms" as const, label: "Terms of Service", icon: FileText },
  { value: "privacy" as const, label: "Privacy Policy", icon: Shield },
];

export function LegalDialog({ open, onOpenChange }: LegalDialogProps) {
  const [tab, setTab] = useState<"terms" | "privacy">("terms");
  const content = tab === "terms" ? terms : privacy;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-lg w-[95vw] max-h-[88vh] p-0 overflow-hidden flex flex-col">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border shrink-0 text-left">
          <DialogTitle className="text-base font-bold mb-3">Terms & Privacy</DialogTitle>
          {/* Tab switcher */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-xl">
            {TABS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={cn(
                  "flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200",
                  tab === value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>
        </DialogHeader>

        {/* Content */}
        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-2.5">
            {content.map((section) => (
              <div key={section.title} className="bg-card border border-border/70 rounded-xl p-3.5">
                <h3 className="text-xs font-semibold text-foreground mb-1.5">{section.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{section.body}</p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}