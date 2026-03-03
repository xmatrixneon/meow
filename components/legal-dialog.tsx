"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface LegalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LegalDialog({ open, onOpenChange }: LegalDialogProps) {
  const [tab, setTab] = useState<"terms" | "privacy">("terms");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] p-0">
        {/* Header with tabs */}
        <div className="border-b border-border">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="text-lg">Terms & Privacy</DialogTitle>
          </DialogHeader>
          <div className="flex px-4 pb-2 gap-1">
            <button
              onClick={() => setTab("terms")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                tab === "terms"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              Terms of Service
            </button>
            <button
              onClick={() => setTab("privacy")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                tab === "privacy"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              Privacy Policy
            </button>
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="h-[400px] px-4 py-4">
          {tab === "terms" ? (
            <div className="space-y-4 text-xs text-muted-foreground leading-relaxed">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">1. Acceptance of Terms</h3>
                <p>
                  By accessing and using MeowSMS services, you agree to be bound by these Terms of Service.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">2. Service Description</h3>
                <p>
                  MeowSMS provides virtual phone number services for receiving SMS messages. We do not guarantee
                  the delivery of SMS messages or the availability of phone numbers.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">3. User Responsibilities</h3>
                <p>
                  You agree to use our services for lawful purposes only. You are responsible for maintaining
                  the confidentiality of your account credentials.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">4. Payment & Refunds</h3>
                <p>
                  All purchases are final. Refunds are only processed for unused services or at our discretion.
                  Prices are subject to change without notice.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">5. Limitation of Liability</h3>
                <p>
                  MeowSMS shall not be liable for any indirect, incidental, special, or consequential damages
                  arising from the use of our services.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">6. Termination</h3>
                <p>
                  We reserve the right to suspend or terminate your account at any time for violation of these
                  terms or for any other reason at our sole discretion.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-xs text-muted-foreground leading-relaxed">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">1. Data Collection</h3>
                <p>
                  We collect information you provide directly, such as your Telegram profile data and wallet
                  information. We also collect usage data to improve our services.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">2. How We Use Your Data</h3>
                <p>
                  Your data is used to provide our services, process payments, and communicate with you about
                  your account. We do not sell your personal data to third parties.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">3. SMS Messages</h3>
                <p>
                  SMS messages received through our virtual numbers are stored temporarily and are deleted
                  after the number expires. We do not access or read message content for any purpose other
                  than delivering them to you.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">4. Data Security</h3>
                <p>
                  We implement industry-standard security measures to protect your data. However, no method
                  of transmission over the Internet is 100% secure.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">5. Third-Party Services</h3>
                <p>
                  We may use third-party services for payment processing and SMS delivery. These services
                  have their own privacy policies which we encourage you to review.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">6. Your Rights</h3>
                <p>
                  You have the right to access, correct, or delete your personal data. To exercise these
                  rights, please contact our support team.
                </p>
              </div>
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="border-t border-border p-4">
          <DialogClose asChild>
            <button className="w-full px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
              I Understand
            </button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
