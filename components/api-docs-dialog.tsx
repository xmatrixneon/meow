"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Check, Code2, AlertTriangle, TerminalSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ApiDocsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKey: string;
  baseUrl?: string;
}

const errorCodes = [
  { code: "BAD_KEY",              description: "Invalid API key" },
  { code: "ACCOUNT_BLOCKED",      description: "Account is blocked" },
  { code: "WRONG_ACTION",         description: "Invalid action parameter" },
  { code: "BAD_SERVICE",          description: "Service not found or inactive" },
  { code: "BAD_COUNTRY",          description: "Country not provided or invalid" },
  { code: "NO_BALANCE",           description: "Insufficient wallet balance" },
  { code: "NO_ACTIVATION",        description: "Activation not found or expired" },
  { code: "BAD_ACTION",           description: "Invalid action/status" },
  { code: "NO_NUMBER",           description: "No numbers available from provider" },
  { code: "SERVER_ERROR",         description: "Internal server error" },
  { code: "EARLY_CANCEL_DENIED",  description: "Cancel cooldown not elapsed" },
  { code: "ACCESS_ACTIVATION",    description: "SMS already received" },
  { code: "BAD_STATUS",           description: "Invalid status code" },
];

const endpoints = [
  {
    name: "getBalance",
    description: "Check your current wallet balance.",
    params: [
      { key: "action",  value: "getBalance" },
      { key: "api_key", value: "__KEY__" },
    ],
    responses: [{ label: "Success", value: "ACCESS_BALANCE:100.50" }],
  },
  {
    name: "getCountries",
    description: "List all available countries.",
    params: [
      { key: "action",  value: "getCountries" },
      { key: "api_key", value: "__KEY__" },
    ],
    responses: [{ label: "JSON", value: '{"IN": "India", "US": "United States", ...}' }],
  },
  {
    name: "getServices",
    description: "List services available for a country.",
    params: [
      { key: "action",  value: "getServices" },
      { key: "api_key", value: "__KEY__" },
      { key: "country", value: "country_code", required: true },
    ],
    responses: [{ label: "JSON", value: '{"tg_IN": "Telegram", "wa_IN": "WhatsApp", ...}' }],
  },
  {
    name: "getNumber",
    description: "Purchase a virtual number for SMS.",
    params: [
      { key: "action",  value: "getNumber" },
      { key: "api_key", value: "__KEY__" },
      { key: "service", value: "service_code", required: true },
      { key: "country", value: "country_code", required: true },
    ],
    responses: [{ label: "Success", value: "ACCESS_NUMBER:orderId:phoneNumber" }],
  },
  {
    name: "getStatus",
    description: "Poll activation status and retrieve SMS.",
    params: [
      { key: "action",  value: "getStatus" },
      { key: "api_key", value: "__KEY__" },
      { key: "id",      value: "order_id", required: true },
    ],
    responses: [
      { label: "Waiting",   value: "STATUS_WAIT_CODE" },
      { label: "Received",  value: "STATUS_OK:123456 is your OTP" },
      { label: "Cancelled", value: "STATUS_CANCEL" },
    ],
  },
  {
    name: "setStatus",
    description: "Cancel an activation or request the next SMS.",
    params: [
      { key: "action",  value: "setStatus" },
      { key: "api_key", value: "__KEY__" },
      { key: "id",      value: "order_id", required: true },
      { key: "status",  value: "8 (cancel) | 3 (next SMS)", required: true },
    ],
    responses: [
      { label: "Cancelled",       value: "STATUS_CANCEL" },
      { label: "Next SMS queued", value: "ACCESS_RETRY_GET" },
    ],
  },
];

function ParamRow({ k, v, isKey }: { k: string; v: string; isKey?: boolean }) {
  return (
    <div className="flex items-start gap-1.5 text-xs flex-wrap">
      <code className="bg-muted px-1.5 py-0.5 rounded-md text-foreground font-mono shrink-0">{k}</code>
      <span className="text-muted-foreground mt-0.5">=</span>
      <code className={cn("bg-muted px-1.5 py-0.5 rounded-md font-mono break-all", isKey ? "text-primary" : "text-foreground/80")}>
        {v}
      </code>
    </div>
  );
}

export function ApiDocsDialog({ open, onOpenChange, apiKey, baseUrl }: ApiDocsDialogProps) {
  const [copied, setCopied] = useState(false);

  const resolvedBase = baseUrl ?? (typeof window !== "undefined" ? window.location.origin : "https://yourdomain.com");
  const fullBase = `${resolvedBase}/stubs/handler_api.php`;

  const copyKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    toast.success("API key copied");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-lg w-[95vw] max-h-[88vh] p-0 overflow-hidden flex flex-col">

        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border shrink-0 text-left">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
              <TerminalSquare size={16} className="text-blue-500" />
            </div>
            <DialogTitle className="text-base font-bold">API Documentation</DialogTitle>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="px-5 py-5 space-y-6">

            {/* API Key */}
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Your API Key</span>
                <button
                  onClick={copyKey}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <code className="block text-xs font-mono bg-card px-3 py-2 rounded-lg text-foreground/80 break-all">
                {apiKey}
              </code>
            </div>

            {/* Base URL */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-foreground">Base URL</p>
              <div className="flex items-start gap-2 bg-muted/40 border border-border/60 rounded-xl px-3 py-2.5">
                <Code2 size={13} className="text-muted-foreground shrink-0 mt-0.5" />
                <code className="text-xs font-mono text-muted-foreground break-all">{fullBase}</code>
              </div>
            </div>

            {/* Endpoints */}
            <div className="space-y-4">
              <p className="text-xs font-semibold text-foreground">Endpoints</p>
              {endpoints.map((ep) => {
                const resolvedParams = ep.params.map((p) => ({
                  ...p,
                  value: p.value === "__KEY__" ? apiKey : p.value,
                  isKey: p.value === "__KEY__",
                }));
                return (
                  <div key={ep.name} className="bg-card border border-border/70 rounded-xl overflow-hidden">
                    {/* Endpoint name row */}
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-muted/30">
                      <span className="px-2 py-0.5 rounded-md bg-green-500/10 text-green-500 text-[10px] font-mono font-bold shrink-0">GET</span>
                      <span className="text-xs font-semibold text-foreground">{ep.name}</span>
                    </div>
                    <div className="px-4 py-3 space-y-3">
                      <p className="text-xs text-muted-foreground">{ep.description}</p>
                      {/* Params */}
                      <div className="space-y-1.5">
                        {resolvedParams.map((p) => (
                          <ParamRow key={p.key} k={p.key} v={p.value} isKey={p.isKey} />
                        ))}
                      </div>
                      {/* Responses */}
                      <div className="space-y-1.5 pt-1">
                        {ep.responses.map((r) => (
                          <div key={r.label} className="bg-muted/40 rounded-lg px-3 py-2">
                            <span className="text-[10px] font-semibold text-muted-foreground block mb-1">{r.label}</span>
                            <code className="text-xs font-mono text-foreground/90 break-all">{r.value}</code>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Error Codes */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle size={13} className="text-muted-foreground shrink-0" />
                <p className="text-xs font-semibold text-foreground">Error Codes</p>
              </div>
              <div className="bg-card border border-border/70 rounded-xl overflow-hidden divide-y divide-border/60">
                {errorCodes.map(({ code, description }) => (
                  <div key={code} className="flex items-center justify-between px-4 py-2.5 gap-3">
                    <code className="text-xs font-mono text-foreground/90 shrink-0">{code}</code>
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