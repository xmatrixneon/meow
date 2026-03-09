"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { IndianRupee, Copy, CheckCheck, Loader2, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DepositDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  upiId?: string | null;
  qrImage?: string | null;
  onSuccess: () => void;
}

export function DepositDialog({ open, onOpenChange, upiId, qrImage, onSuccess }: DepositDialogProps) {
  const [utr, setUtr] = useState("");
  const [copied, setCopied] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  const depositMutation = trpc.wallet.deposit.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`₹${data.amount?.toFixed(2)} added to wallet!`);
        setUtr("");
        onSuccess();
        onOpenChange(false);
      } else {
        toast.error(data.message || "Failed to verify payment");
      }
    },
    onError: (error) => {
      const msg = error.message || "";
      if (msg.includes("already")) {
        toast.error("This UTR has already been used.");
      } else if (msg.includes("not found") || msg.includes("NOT_FOUND")) {
        toast.error("UTR not found. Check the number and try again.");
      } else if (msg.includes("Network") || msg.includes("connection")) {
        toast.error("Connection error. Check your internet and try again.");
      } else {
        toast.error(msg || "Failed to verify payment");
      }
    },
  });

  const copyUpiId = () => {
    if (upiId) {
      navigator.clipboard.writeText(upiId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSubmit = () => {
    if (!utr.trim()) {
      toast.error("Please enter UTR number");
      return;
    }
    depositMutation.mutate({ utr: utr.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { setTooltipOpen(false); onOpenChange(val); }}>
      <DialogContent className="rounded-3xl max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-2 pb-4">
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <IndianRupee size={20} className="text-amber-500 flex-shrink-0" />
            <span className="truncate">Add Funds via UPI</span>
            <button
              type="button"
              className="ml-1 text-muted-foreground hover:text-amber-500 transition-colors focus:outline-none rounded-full"
              aria-label="Deposit info"
              onClick={(e) => {
                e.stopPropagation();
                setTooltipOpen((prev) => !prev);
              }}
            >
              <Info size={15} />
            </button>
          </DialogTitle>
          <DialogDescription className="text-sm">
            Scan QR or send payment to the UPI ID below
          </DialogDescription>
        </DialogHeader>

        {/* Inline info panel */}
        {tooltipOpen && (
          <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-xs leading-relaxed -mt-2">
            <p className="font-semibold mb-1.5 text-amber-700 dark:text-amber-300">How to deposit</p>
            <ul className="space-y-1 text-amber-600 dark:text-amber-400">
              <li>• Scan the QR or copy the UPI ID to pay</li>
              <li>• Enter the 12-digit UTR from your payment app</li>
              <li>• Funds are credited after verification</li>
              <li>• Each UTR can only be used once</li>
            </ul>
          </div>
        )}

        <div className="space-y-4 sm:space-y-5">
          {/* QR Code Image */}
          {qrImage && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex justify-center"
            >
              <div className="bg-white p-2 sm:p-4 rounded-2xl border border-border">
                <img
                  src={qrImage}
                  alt="UPI QR Code"
                  className="w-40 h-40 sm:w-52 sm:h-52 object-contain"
                />
              </div>
            </motion.div>
          )}

          {/* UPI ID Display */}
          <div className="bg-muted/50 rounded-2xl p-3 sm:p-4">
            <p className="text-xs text-muted-foreground mb-2 text-center">Pay to</p>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <p className={cn(
                "font-mono font-semibold text-xs sm:text-sm break-all max-w-[85%]",
                !upiId && "text-muted-foreground"
              )}>
                {upiId || "Not configured"}
              </p>
              {upiId && (
                <button
                  type="button"
                  onClick={copyUpiId}
                  className="p-1.5 hover:bg-muted rounded-lg transition-colors flex-shrink-0"
                  aria-label="Copy UPI ID"
                >
                  {copied ? (
                    <CheckCheck size={16} className="text-green-500" />
                  ) : (
                    <Copy size={16} className="text-muted-foreground" />
                  )}
                </button>
              )}
            </div>
          </div>

          {/* UTR Input */}
          <div className="space-y-2">
            <label className="text-xs sm:text-sm font-medium text-muted-foreground">
              Enter UTR Number
            </label>
            <Input
              placeholder="12-digit UTR from payment app"
              value={utr}
              onChange={(e) => setUtr(e.target.value)}
              maxLength={12}
              className="rounded-xl h-11 sm:h-12 text-sm sm:text-base"
            />
          </div>

          {/* Submit Button */}
          <Button
            onClick={handleSubmit}
            disabled={depositMutation.isPending || !utr.trim()}
            className="w-full rounded-xl h-11 sm:h-12 text-sm sm:text-base font-medium"
          >
            {depositMutation.isPending ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Verifying...
              </>
            ) : (
              "Verify & Add Funds"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}