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
import { Copy, Check, ExternalLink, Code, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ApiDocsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKey: string;
}

const errorCodes = [
  { code: "BAD_KEY", description: "Invalid API key" },
  { code: "ACCOUNT_BLOCKED", description: "Your account is blocked" },
  { code: "WRONG_ACTION", description: "Invalid action parameter" },
  { code: "BAD_SERVICE", description: "Service not found or inactive" },
  { code: "BAD_COUNTRY", description: "Country not provided or invalid" },
  { code: "NO_BALANCE", description: "Insufficient wallet balance" },
  { code: "NO_ACTIVATION", description: "Activation not found or expired" },
  { code: "BAD_ACTION", description: "Invalid action/status" },
  { code: "NO_API_NUMBER", description: "No numbers available from provider" },
  { code: "SERVER_ERROR", description: "Server error occurred" },
  { code: "EARLY_CANCEL_DENIED", description: "Cancel cooldown not over yet" },
  { code: "ACCESS_ACTIVATION", description: "Cannot perform action (SMS already received)" },
  { code: "BAD_STATUS", description: "Invalid status code" },
];

export function ApiDocsDialog({ open, onOpenChange, apiKey }: ApiDocsDialogProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    toast.success("API Key copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://yourdomain.com";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="text-base">API Documentation</DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[500px]">
          <div className="p-5 space-y-6">
            {/* API Key Section */}
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">Your API Key</span>
                <button
                  onClick={handleCopyKey}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-colors"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <code className="block text-xs font-mono bg-card px-3 py-2 rounded-lg text-foreground/80">
                {apiKey}
              </code>
            </div>

            {/* Base URL */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Base URL</h3>
              <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
                <Code size={14} className="text-muted-foreground" />
                <code className="text-xs font-mono text-muted-foreground">
                  {baseUrl}/api/stubs/handler_api.php
                </code>
              </div>
            </div>

            {/* Endpoint 1: getBalance */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-green-500/10 text-green-500 text-xs font-mono">GET</span>
                getBalance
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Check your account balance.
              </p>

              <div className="space-y-2">
                <div>
                  <span className="text-xs font-medium text-foreground">Parameters:</span>
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <code className="bg-muted px-1.5 py-0.5 rounded">action</code>
                      <span className="text-muted-foreground">=</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded">"getBalance"</code>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <code className="bg-muted px-1.5 py-0.5 rounded">api_key</code>
                      <span className="text-muted-foreground">=</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded">{apiKey}</code>
                    </div>
                  </div>
                </div>

                <div>
                  <span className="text-xs font-medium text-foreground">Response:</span>
                  <div className="mt-2 bg-card border border-border rounded-lg p-3">
                    <code className="text-xs font-mono text-foreground/90">
                      ACCESS_BALANCE:100.50
                    </code>
                  </div>
                </div>
              </div>
            </div>

            {/* Endpoint 2: getCountries */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-green-500/10 text-green-500 text-xs font-mono">GET</span>
                getCountries
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Get list of available countries.
              </p>

              <div className="space-y-2">
                <div>
                  <span className="text-xs font-medium text-foreground">Parameters:</span>
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <code className="bg-muted px-1.5 py-0.5 rounded">action</code>
                      <span className="text-muted-foreground">=</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded">"getCountries"</code>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <code className="bg-muted px-1.5 py-0.5 rounded">api_key</code>
                      <span className="text-muted-foreground">=</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded">{apiKey}</code>
                    </div>
                  </div>
                </div>

                <div>
                  <span className="text-xs font-medium text-foreground">Response (JSON):</span>
                  <div className="mt-2 bg-card border border-border rounded-lg p-3">
                    <code className="text-xs font-mono text-foreground/90">
                      {`{"IN": "India", "US": "United States", ...}`}
                    </code>
                  </div>
                </div>
              </div>
            </div>

            {/* Endpoint 3: getServices */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-green-500/10 text-green-500 text-xs font-mono">GET</span>
                getServices
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Get list of available services for a specific country.
              </p>

              <div className="space-y-2">
                <div>
                  <span className="text-xs font-medium text-foreground">Parameters:</span>
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <code className="bg-muted px-1.5 py-0.5 rounded">action</code>
                      <span className="text-muted-foreground">=</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded">"getServices"</code>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <code className="bg-muted px-1.5 py-0.5 rounded">api_key</code>
                      <span className="text-muted-foreground">=</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded">{apiKey}</code>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <code className="bg-muted px-1.5 py-0.5 rounded">country</code>
                      <span className="text-muted-foreground">=</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded">"country_code"</code>
                      <span className="text-muted-foreground">(required)</span>
                    </div>
                  </div>
                </div>

                <div>
                  <span className="text-xs font-medium text-foreground">Response (JSON):</span>
                  <div className="mt-2 bg-card border border-border rounded-lg p-3">
                    <code className="text-xs font-mono text-foreground/90">
                      {`{"tg_IN": "Telegram", "wa_IN": "WhatsApp", ...}`}
                    </code>
                  </div>
                </div>
              </div>
            </div>

            {/* Endpoint 4: getNumber */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-green-500/10 text-green-500 text-xs font-mono">GET</span>
                getNumber
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Purchase a virtual number for receiving SMS.
              </p>

              <div className="space-y-2">
                <div>
                  <span className="text-xs font-medium text-foreground">Parameters:</span>
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <code className="bg-muted px-1.5 py-0.5 rounded">action</code>
                      <span className="text-muted-foreground">=</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded">"getNumber"</code>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <code className="bg-muted px-1.5 py-0.5 rounded">api_key</code>
                      <span className="text-muted-foreground">=</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded">{apiKey}</code>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <code className="bg-muted px-1.5 py-0.5 rounded">service</code>
                      <span className="text-muted-foreground">=</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded">"service_code"</code>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <code className="bg-muted px-1.5 py-0.5 rounded">country</code>
                      <span className="text-muted-foreground">=</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded">"country_code"</code>
                    </div>
                  </div>
                </div>

                <div>
                  <span className="text-xs font-medium text-foreground">Response:</span>
                  <div className="mt-2 bg-card border border-border rounded-lg p-3">
                    <code className="text-xs font-mono text-foreground/90">
                      ACCESS_NUMBER:orderId:phoneNumber
                    </code>
                  </div>
                </div>
              </div>
            </div>

            {/* Endpoint 5: getStatus */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-green-500/10 text-green-500 text-xs font-mono">GET</span>
                getStatus
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Get the status of your activation and retrieve SMS messages.
              </p>

              <div className="space-y-2">
                <div>
                  <span className="text-xs font-medium text-foreground">Parameters:</span>
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <code className="bg-muted px-1.5 py-0.5 rounded">action</code>
                      <span className="text-muted-foreground">=</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded">"getStatus"</code>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <code className="bg-muted px-1.5 py-0.5 rounded">api_key</code>
                      <span className="text-muted-foreground">=</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded">{apiKey}</code>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <code className="bg-muted px-1.5 py-0.5 rounded">id</code>
                      <span className="text-muted-foreground">=</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded">"order_id"</code>
                    </div>
                  </div>
                </div>

                <div>
                  <span className="text-xs font-medium text-foreground">Responses:</span>
                  <div className="mt-2 space-y-2">
                    <div className="bg-card border border-border rounded-lg p-2">
                      <span className="text-[10px] font-medium text-muted-foreground block mb-1">Waiting for SMS:</span>
                      <code className="text-xs font-mono text-foreground/90">STATUS_WAIT_CODE</code>
                    </div>
                    <div className="bg-card border border-border rounded-lg p-2">
                      <span className="text-[10px] font-medium text-muted-foreground block mb-1">SMS Received:</span>
                      <code className="text-xs font-mono text-foreground/90">STATUS_OK:123456 is your OTP</code>
                    </div>
                    <div className="bg-card border border-border rounded-lg p-2">
                      <span className="text-[10px] font-medium text-muted-foreground block mb-1">Cancelled/Expired:</span>
                      <code className="text-xs font-mono text-foreground/90">STATUS_CANCEL</code>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Endpoint 6: setStatus */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-green-500/10 text-green-500 text-xs font-mono">GET</span>
                setStatus
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Cancel an activation or request next SMS (for multi-SMS services).
              </p>

              <div className="space-y-2">
                <div>
                  <span className="text-xs font-medium text-foreground">Parameters:</span>
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <code className="bg-muted px-1.5 py-0.5 rounded">action</code>
                      <span className="text-muted-foreground">=</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded">"setStatus"</code>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <code className="bg-muted px-1.5 py-0.5 rounded">api_key</code>
                      <span className="text-muted-foreground">=</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded">{apiKey}</code>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <code className="bg-muted px-1.5 py-0.5 rounded">id</code>
                      <span className="text-muted-foreground">=</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded">"order_id"</code>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <code className="bg-muted px-1.5 py-0.5 rounded">status</code>
                      <span className="text-muted-foreground">=</span>
                      <code className="bg-muted px-1.5 py-0.5 rounded">"8"</code>
                      <span className="text-muted-foreground">(cancel) or "3" (next SMS)</span>
                    </div>
                  </div>
                </div>

                <div>
                  <span className="text-xs font-medium text-foreground">Responses:</span>
                  <div className="mt-2 space-y-2">
                    <div className="bg-card border border-border rounded-lg p-2">
                      <span className="text-[10px] font-medium text-muted-foreground block mb-1">Cancelled:</span>
                      <code className="text-xs font-mono text-foreground/90">STATUS_CANCEL</code>
                    </div>
                    <div className="bg-card border border-border rounded-lg p-2">
                      <span className="text-[10px] font-medium text-muted-foreground block mb-1">Next SMS Requested:</span>
                      <code className="text-xs font-mono text-foreground/90">ACCESS_RETRY_GET</code>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Error Codes */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <AlertTriangle size={14} />
                Error Codes
              </h3>
              <div className="border border-border rounded-xl overflow-hidden">
                {errorCodes.map(({ code, description }) => (
                  <div key={code} className="flex items-center justify-between px-4 py-2.5 last:border-0 border-b border-border/60">
                    <code className="text-xs font-mono text-foreground/90">{code}</code>
                    <span className="text-xs text-muted-foreground">{description}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="border-t border-border p-4">
          <DialogClose asChild>
            <button className="w-full px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
              Close
            </button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
