"use client";
import { useState } from "react";
import { Gift, Loader2, Info } from "lucide-react";
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

interface PromoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function PromoDialog({ open, onOpenChange, onSuccess }: PromoDialogProps) {
  const [code, setCode] = useState("");
  const [tooltipOpen, setTooltipOpen] = useState(false);

  const redeemMutation = trpc.wallet.redeemPromo.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`₹${data.amount?.toFixed(2)} credited!`);
        setCode("");
        onSuccess();
        onOpenChange(false);
      }
    },
    onError: (error) => {
      let errorMessage = error.message || "Failed to redeem promo code";
      if (errorMessage.includes("invalid") || errorMessage.includes("NOT_FOUND")) {
        errorMessage = "Invalid promo code. Please check and try again.";
      } else if (errorMessage.includes("expired")) {
        errorMessage = "This promo code has expired.";
      } else if (errorMessage.includes("used") || errorMessage.includes("USAGE")) {
        errorMessage = "You have already used this promo code.";
      }
      toast.error(errorMessage);
    },
  });

  const handleSubmit = () => {
    if (!code.trim()) {
      toast.error("Please enter a promo code");
      return;
    }
    redeemMutation.mutate({ code: code.trim().toUpperCase() });
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { setTooltipOpen(false); onOpenChange(val); }}>
      <DialogContent className="rounded-3xl max-w-sm w-[95vw]">
        <DialogHeader className="space-y-2">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Gift size={18} className="text-violet-500 flex-shrink-0" />
            Redeem Code
            <button
              type="button"
              className="ml-1 text-muted-foreground hover:text-violet-500 transition-colors focus:outline-none rounded-full"
              aria-label="Promo code info"
              onClick={(e) => {
                e.stopPropagation();
                setTooltipOpen((prev) => !prev);
              }}
            >
              <Info size={15} />
            </button>
          </DialogTitle>
          <DialogDescription className="text-sm">
            Enter your promo code to get bonus balance
          </DialogDescription>
        </DialogHeader>

        {/* Inline info panel - toggles on click, matches dialog theme */}
        {tooltipOpen && (
          <div className="rounded-2xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/40 px-4 py-3 text-xs leading-relaxed -mt-1">
            <p className="font-semibold mb-1.5 text-violet-700 dark:text-violet-300">How it works</p>
            <ul className="space-y-1 text-violet-600 dark:text-violet-400">
              <li>• Each code can only be used once per account</li>
              <li>• Balance is credited instantly on success</li>
              <li>• Codes are case-insensitive (up to 12 chars)</li>
              <li>• Expired codes cannot be redeemed</li>
            </ul>
          </div>
        )}

        <div className="space-y-4 pt-2">
          <Input
            placeholder="ENTER CODE"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={12}
            className="rounded-xl h-11 sm:h-12 text-center font-mono text-base sm:text-lg tracking-widest"
          />
          <Button
            onClick={handleSubmit}
            disabled={redeemMutation.isPending || !code.trim()}
            className="w-full rounded-xl h-11 sm:h-12 text-sm sm:text-base font-medium"
          >
            {redeemMutation.isPending ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Redeeming...
              </>
            ) : (
              "Redeem Code"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}