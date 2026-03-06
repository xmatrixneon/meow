"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Check, Code, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ApiDocsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKey: string;
  baseUrl?: string;
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

export function ApiDocsDialog({ open, onOpenChange, apiKey, baseUrl }: ApiDocsDialogProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    toast.success("API Key copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const resolvedBaseUrl = baseUrl ?? (typeof window !== "undefined" ? window.location.origin : "https://yourdomain.com");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Match DepositDialog: rounded-3xl, w-[95vw], max-h-[90vh] overflow-y-auto */}
      <DialogContent className="rounded-3xl max-w-lg w-[95vw] max-h-[90vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3 border-b border-border flex-shrink-0">
          <DialogTitle className="text-base sm:text-lg">API Documentation</DialogTitle>
        </DialogHeader>

        {/* ScrollArea with responsive height */}
        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-5 space-y-5 sm:space-y-6">

            {/* API Key Section */}
            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-3 sm:p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs sm:text-sm font-medium text-foreground">Your API Key</span>
                <button
                  onClick={handleCopyKey}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-colors flex-shrink-0"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              {/* break-all so long key wraps on small screens */}
              <code className="block text-xs font-mono bg-card px-3 py-2 rounded-lg text-foreground/80 break-all">
                {apiKey}
              </code>
            </div>

            {/* Base URL */}
            <div>
              <h3 className="text-xs sm:text-sm font-semibold text-foreground mb-2">Base URL</h3>
              <div className="flex items-start gap-2 bg-card border border-border rounded-xl px-3 py-2">
                <Code size={14} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                {/* break-all for long URLs */}
                <code className="text-xs font-mono text-muted-foreground break-all">
                  {resolvedBaseUrl}/stubs/handler_api.php
                </code>
              </div>
            </div>

            {/* Reusable endpoint renderer */}
            {[
              {
                name: "getBalance",
                description: "Check your account balance.",
                params: [
                  { key: "action", value: '"getBalance"' },
                  { key: "api_key", value: apiKey },
                ],
                responses: [{ label: "Success", value: "ACCESS_BALANCE:100.50" }],
                responseType: "plain",
              },
              {
                name: "getCountries",
                description: "Get list of available countries.",
                params: [
                  { key: "action", value: '"getCountries"' },
                  { key: "api_key", value: apiKey },
                ],
                responses: [{ label: "Response (JSON)", value: '{"IN": "India", "US": "United States", ...}' }],
                responseType: "json",
              },
              {
                name: "getServices",
                description: "Get list of available services for a specific country.",
                params: [
                  { key: "action", value: '"getServices"' },
                  { key: "api_key", value: apiKey },
                  { key: "country", value: '"country_code"', note: "required" },
                ],
                responses: [{ label: "Response (JSON)", value: '{"tg_IN": "Telegram", "wa_IN": "WhatsApp", ...}' }],
                responseType: "json",
              },
              {
                name: "getNumber",
                description: "Purchase a virtual number for receiving SMS.",
                params: [
                  { key: "action", value: '"getNumber"' },
                  { key: "api_key", value: apiKey },
                  { key: "service", value: '"service_code"' },
                  { key: "country", value: '"country_code"' },
                ],
                responses: [{ label: "Success", value: "ACCESS_NUMBER:orderId:phoneNumber" }],
                responseType: "plain",
              },
            ].map((endpoint) => (
              <div key={endpoint.name}>
                <h3 className="text-xs sm:text-sm font-semibold text-foreground mb-2 sm:mb-3 flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-green-500/10 text-green-500 text-xs font-mono flex-shrink-0">GET</span>
                  {endpoint.name}
                </h3>
                <p className="text-xs text-muted-foreground mb-2 sm:mb-3">{endpoint.description}</p>

                <div className="space-y-2 sm:space-y-3">
                  <div>
                    <span className="text-xs font-medium text-foreground">Parameters:</span>
                    <div className="mt-2 space-y-1.5">
                      {endpoint.params.map((p) => (
                        <div key={p.key} className="flex flex-wrap items-center gap-1.5 text-xs">
                          <code className="bg-muted px-1.5 py-0.5 rounded">{p.key}</code>
                          <span className="text-muted-foreground">=</span>
                          {/* break-all for api_key value */}
                          <code className={cn("bg-muted px-1.5 py-0.5 rounded", p.key === "api_key" && "break-all max-w-full")}>
                            {p.value}
                          </code>
                          {p.note && <span className="text-muted-foreground">({p.note})</span>}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-medium text-foreground">
                      {endpoint.responseType === "json" ? "Response (JSON):" : "Response:"}
                    </span>
                    <div className="mt-2 bg-card border border-border rounded-xl p-2 sm:p-3">
                      <code className="text-xs font-mono text-foreground/90 break-all">
                        {endpoint.responses[0].value}
                      </code>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* getStatus */}
            <div>
              <h3 className="text-xs sm:text-sm font-semibold text-foreground mb-2 sm:mb-3 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-green-500/10 text-green-500 text-xs font-mono flex-shrink-0">GET</span>
                getStatus
              </h3>
              <p className="text-xs text-muted-foreground mb-2 sm:mb-3">
                Get the status of your activation and retrieve SMS messages.
              </p>
              <div className="space-y-2 sm:space-y-3">
                <div>
                  <span className="text-xs font-medium text-foreground">Parameters:</span>
                  <div className="mt-2 space-y-1.5">
                    {[
                      { key: "action", value: '"getStatus"' },
                      { key: "api_key", value: apiKey },
                      { key: "id", value: '"order_id"' },
                    ].map((p) => (
                      <div key={p.key} className="flex flex-wrap items-center gap-1.5 text-xs">
                        <code className="bg-muted px-1.5 py-0.5 rounded">{p.key}</code>
                        <span className="text-muted-foreground">=</span>
                        <code className={cn("bg-muted px-1.5 py-0.5 rounded", p.key === "api_key" && "break-all max-w-full")}>
                          {p.value}
                        </code>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-xs font-medium text-foreground">Responses:</span>
                  <div className="mt-2 space-y-2">
                    {[
                      { label: "Waiting for SMS:", value: "STATUS_WAIT_CODE" },
                      { label: "SMS Received:", value: "STATUS_OK:123456 is your OTP" },
                      { label: "Cancelled/Expired:", value: "STATUS_CANCEL" },
                    ].map((r) => (
                      <div key={r.label} className="bg-card border border-border rounded-xl p-2 sm:p-3">
                        <span className="text-[10px] font-medium text-muted-foreground block mb-1">{r.label}</span>
                        <code className="text-xs font-mono text-foreground/90 break-all">{r.value}</code>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* setStatus */}
            <div>
              <h3 className="text-xs sm:text-sm font-semibold text-foreground mb-2 sm:mb-3 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-green-500/10 text-green-500 text-xs font-mono flex-shrink-0">GET</span>
                setStatus
              </h3>
              <p className="text-xs text-muted-foreground mb-2 sm:mb-3">
                Cancel an activation or request next SMS (for multi-SMS services).
              </p>
              <div className="space-y-2 sm:space-y-3">
                <div>
                  <span className="text-xs font-medium text-foreground">Parameters:</span>
                  <div className="mt-2 space-y-1.5">
                    {[
                      { key: "action", value: '"setStatus"' },
                      { key: "api_key", value: apiKey },
                      { key: "id", value: '"order_id"' },
                      { key: "status", value: '"8" (cancel) or "3" (next SMS)' },
                    ].map((p) => (
                      <div key={p.key} className="flex flex-wrap items-center gap-1.5 text-xs">
                        <code className="bg-muted px-1.5 py-0.5 rounded">{p.key}</code>
                        <span className="text-muted-foreground">=</span>
                        <code className={cn(
                          "bg-muted px-1.5 py-0.5 rounded",
                          p.key === "api_key" && "break-all max-w-full",
                          p.key === "status" && "break-all"
                        )}>
                          {p.value}
                        </code>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-xs font-medium text-foreground">Responses:</span>
                  <div className="mt-2 space-y-2">
                    {[
                      { label: "Cancelled:", value: "STATUS_CANCEL" },
                      { label: "Next SMS Requested:", value: "ACCESS_RETRY_GET" },
                    ].map((r) => (
                      <div key={r.label} className="bg-card border border-border rounded-xl p-2 sm:p-3">
                        <span className="text-[10px] font-medium text-muted-foreground block mb-1">{r.label}</span>
                        <code className="text-xs font-mono text-foreground/90">{r.value}</code>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Error Codes */}
            <div>
              <h3 className="text-xs sm:text-sm font-semibold text-foreground mb-2 sm:mb-3 flex items-center gap-2">
                <AlertTriangle size={14} className="flex-shrink-0" />
                Error Codes
              </h3>
              <div className="border border-border rounded-2xl overflow-hidden">
                {errorCodes.map(({ code, description }) => (
                  <div
                    key={code}
                    className="flex items-start sm:items-center justify-between px-3 sm:px-4 py-2 sm:py-2.5 last:border-0 border-b border-border/60 gap-2"
                  >
                    <code className="text-xs font-mono text-foreground/90 flex-shrink-0">{code}</code>
                    {/* text-right so description wraps gracefully on small screens */}
                    <span className="text-xs text-muted-foreground text-right">{description}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>

      </DialogContent>
    </Dialog>
  );
}