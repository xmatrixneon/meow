"use client";

import { useState } from "react";
import { Gift, Loader2 } from "lucide-react";
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
      // Provide better error messages
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift size={18} className="text-violet-500" />
            Redeem Promo Code
          </DialogTitle>
          <DialogDescription>
            Enter your 12-character promo code to get bonus balance
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          <Input
            placeholder="Enter promo code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={12}
            className="rounded-xl text-center font-mono text-lg tracking-widest"
          />

          <Button
            onClick={handleSubmit}
            disabled={redeemMutation.isPending || !code.trim()}
            className="w-full rounded-xl"
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
