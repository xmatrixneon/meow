"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Clock,
  Save,
  Loader2,
  Image as ImageIcon,
  WalletCards,
  Users,
  ArrowUpFromDot,
  Coins,
  Power,
  QrCode,
  IndianRupee,
  DollarSign,
  Map,
  Flag,
  CheckCircle2,
  Key,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { type: "spring" as const, stiffness: 280, damping: 24, delay },
});

function getCountryFlagEmoji(isoCode: string): string {
  if (!isoCode || isoCode.length !== 2) return "🌍";
  const codePoints = isoCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

// ─── Section Wrapper ──────────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  children,
  delay = 0,
  highlight = false,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  delay?: number;
  highlight?: boolean;
}) {
  return (
    <motion.div {...fadeUp(delay)}>
      <div
        className={`bg-card border rounded-2xl p-5 space-y-5 ${
          highlight ? "border-orange-500/50 bg-orange-500/5" : "border-border"
        }`}
      >
        <div className="flex items-center gap-2">
          <Icon
            size={18}
            className={highlight ? "text-orange-500" : "text-primary"}
          />
          <h2 className="font-bold text-foreground">{title}</h2>
        </div>
        {children}
      </div>
    </motion.div>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  icon: Icon,
  children,
}: {
  label: string;
  hint?: string;
  icon?: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        {Icon && <Icon size={12} className="text-primary" />}
        {label}
      </label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminSettingsPage() {
  const utils = trpc.useUtils();

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: settings, isLoading: settingsLoading } =
    trpc.admin.settings.get.useQuery();
  const { data: servers, isLoading: serversLoading } =
    trpc.admin.server.list.useQuery();

  // ── Mutations ──────────────────────────────────────────────────────────────
  const settingsMutation = trpc.admin.settings.update.useMutation({
    onSuccess: () => {
      toast.success("Settings saved");
      utils.admin.settings.get.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const serverMutation = trpc.admin.server.update.useMutation({
    onSuccess: () => {
      toast.success("Server flag updated");
      setEditingServerId(null);
      utils.admin.server.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // ── General settings state ─────────────────────────────────────────────────
  const [currency, setCurrency] = useState("INR");
  const [minCancelMinutes, setMinCancelMinutes] = useState(2);
  const [numberExpiryMinutes, setNumberExpiryMinutes] = useState(20);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  // UPI / BharatPe
  const [upiId, setUpiId] = useState("");
  const [bharatpeQrImage, setBharatpeQrImage] = useState("");
  const [bharatpeMerchantId, setBharatpeMerchantId] = useState("");
  const [bharatpeToken, setBharatpeToken] = useState("");

  // Payment limits
  const [minRechargeAmount, setMinRechargeAmount] = useState("10.00");

  // Referral
  const [referralPercent, setReferralPercent] = useState(0);
  const [minRedeem, setMinRedeem] = useState("50.00");

  // Server flags
  const [editingServerId, setEditingServerId] = useState<string | null>(null);
  const [serverFlagUrls, setServerFlagUrls] = useState<Record<string, string>>({});
  const [savingServerId, setSavingServerId] = useState<string | null>(null);

  // ── Populate form when settings load (FIX: useEffect not render body) ──────
  useEffect(() => {
    if (!settings) return;
    setCurrency(settings.currency ?? "INR");
    setMinCancelMinutes(settings.minCancelMinutes ?? 2);
    setNumberExpiryMinutes(settings.numberExpiryMinutes ?? 20);
    setMaintenanceMode(settings.maintenanceMode ?? false);
    setUpiId(settings.upiId ?? "");
    setBharatpeQrImage(settings.bharatpeQrImage ?? "");
    setBharatpeMerchantId(settings.bharatpeMerchantId ?? "");
    setBharatpeToken(settings.bharatpeToken ?? "");
    setMinRechargeAmount(
      settings.minRechargeAmount
        ? Number(settings.minRechargeAmount).toFixed(2)
        : "10.00"
    );
    setReferralPercent(settings.referralPercent ?? 0);
    setMinRedeem(
      settings.minRedeem ? Number(settings.minRedeem).toFixed(2) : "50.00"
    );
  }, [settings]);

  // ── Populate server flag URLs when servers load ────────────────────────────
  useEffect(() => {
    if (!servers) return;
    const urls: Record<string, string> = {};
    servers.forEach((s) => {
      urls[s.id] = s.flagUrl ?? "";
    });
    setServerFlagUrls(urls);
  }, [servers]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSaveAll = () => {
    const minRecharge = parseFloat(minRechargeAmount);
    const minRedeemVal = parseFloat(minRedeem);

    if (isNaN(minRecharge) || minRecharge < 1) {
      toast.error("Minimum recharge must be at least ₹1");
      return;
    }
    if (isNaN(minRedeemVal) || minRedeemVal < 1) {
      toast.error("Minimum redeem must be at least ₹1");
      return;
    }

    settingsMutation.mutate({
      currency,
      minCancelMinutes,
      numberExpiryMinutes,
      upiId: upiId || undefined,
      bharatpeQrImage: bharatpeQrImage || "",
      bharatpeMerchantId: bharatpeMerchantId || undefined,
      bharatpeToken: bharatpeToken || undefined,
      minRechargeAmount: minRecharge,
      referralPercent,
      minRedeem: minRedeemVal,
      // maintenanceMode is saved instantly via toggle — not included here
    });
  };

  const handleMaintenanceToggle = (checked: boolean) => {
    setMaintenanceMode(checked);
    settingsMutation.mutate(
      { maintenanceMode: checked },
      {
        onSuccess: () =>
          toast.success(
            checked ? "Maintenance mode enabled" : "App is back online"
          ),
      }
    );
  };

  const handleServerSave = (serverId: string) => {
    setSavingServerId(serverId);
    serverMutation.mutate(
      { id: serverId, flagUrl: serverFlagUrls[serverId] ?? "" },
      { onSettled: () => setSavingServerId(null) }
    );
  };

  // ── Loading ────────────────────────────────────────────────────────────────

  if (settingsLoading || serversLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  const isSaving = settingsMutation.isPending;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-10">
      {/* Header */}
      <motion.div {...fadeUp()}>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage app configuration, payments, and server flags
        </p>
      </motion.div>

      {/* ── Maintenance Mode ── */}
      <motion.div {...fadeUp(0.02)}>
        <div
          className={`bg-card border rounded-2xl p-5 ${
            maintenanceMode
              ? "border-orange-500/50 bg-orange-500/5"
              : "border-border"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  maintenanceMode ? "bg-orange-500/20" : "bg-muted/50"
                }`}
              >
                <Power
                  size={18}
                  className={
                    maintenanceMode ? "text-orange-500" : "text-muted-foreground"
                  }
                />
              </div>
              <div>
                <h2 className="font-bold text-foreground">Maintenance Mode</h2>
                <p className="text-xs text-muted-foreground">
                  {maintenanceMode
                    ? "App is under maintenance — users cannot make purchases"
                    : "App is online and accepting orders"}
                </p>
              </div>
            </div>
            <Switch
              checked={maintenanceMode}
              onCheckedChange={handleMaintenanceToggle}
              disabled={isSaving}
            />
          </div>
        </div>
      </motion.div>

      {/* ── Currency & Timers ── */}
      <Section icon={DollarSign} title="Currency & Timers" delay={0.04}>
        <Field
          icon={IndianRupee}
          label="Currency Symbol"
          hint="Displayed throughout the app (e.g. INR, USD)"
        >
          <Input
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            placeholder="INR"
            maxLength={5}
            disabled={isSaving}
            className="rounded-xl"
          />
        </Field>

        <Field
          icon={Clock}
          label="Minimum Cancel Time (minutes)"
          hint="Users cannot cancel a number within this window after purchase"
        >
          <Input
            type="number"
            value={minCancelMinutes}
            onChange={(e) =>
              setMinCancelMinutes(
                Math.max(0, Math.min(60, parseInt(e.target.value) || 0))
              )
            }
            min={0}
            max={60}
            disabled={isSaving}
            className="rounded-xl"
          />
        </Field>

        <Field
          icon={Clock}
          label="Number Expiry Time (minutes)"
          hint="How long before an unused purchased number expires (5–120 min)"
        >
          <Input
            type="number"
            value={numberExpiryMinutes}
            onChange={(e) =>
              setNumberExpiryMinutes(
                Math.max(5, Math.min(120, parseInt(e.target.value) || 20))
              )
            }
            min={5}
            max={120}
            disabled={isSaving}
            className="rounded-xl"
          />
        </Field>
      </Section>

      {/* ── UPI & BharatPe ── */}
      <Section icon={QrCode} title="UPI & BharatPe" delay={0.06}>
        <Field
          icon={IndianRupee}
          label="UPI ID"
          hint="Shown to users when they top up their wallet"
        >
          <Input
            value={upiId}
            onChange={(e) => setUpiId(e.target.value)}
            placeholder="yourname@upi"
            disabled={isSaving}
            className="rounded-xl"
          />
        </Field>

        <Field
          icon={ImageIcon}
          label="BharatPe QR Image URL"
          hint="URL to the QR code image shown during deposit"
        >
          <Input
            value={bharatpeQrImage}
            onChange={(e) => setBharatpeQrImage(e.target.value)}
            placeholder="https://example.com/qr.png"
            disabled={isSaving}
            className="rounded-xl"
          />
          {bharatpeQrImage && (
            <div className="flex items-center gap-3 mt-2">
              <img
                src={bharatpeQrImage}
                alt="QR Preview"
                className="w-16 h-16 rounded-lg border border-border object-contain bg-white"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <CheckCircle2 size={14} className="text-green-500" />
              <span className="text-xs text-muted-foreground">QR loaded</span>
            </div>
          )}
        </Field>

        <Field
          icon={Key}
          label="BharatPe Merchant ID"
          hint="Your BharatPe merchant ID for payment verification"
        >
          <Input
            value={bharatpeMerchantId}
            onChange={(e) => setBharatpeMerchantId(e.target.value)}
            placeholder="MERCHANT_ID"
            disabled={isSaving}
            className="rounded-xl"
          />
        </Field>

        <Field
          icon={Shield}
          label="BharatPe Token"
          hint="BharatPe API token for verifying transactions"
        >
          <Input
            value={bharatpeToken}
            onChange={(e) => setBharatpeToken(e.target.value)}
            placeholder="API_TOKEN"
            type="password"
            disabled={isSaving}
            className="rounded-xl"
          />
        </Field>
      </Section>

      {/* ── Payment Limits ── */}
      <Section icon={WalletCards} title="Payment Limits" delay={0.08}>
        <Field
          icon={IndianRupee}
          label="Minimum Recharge Amount (₹)"
          hint="Minimum amount a user can deposit into their wallet"
        >
          <Input
            type="number"
            value={minRechargeAmount}
            onChange={(e) =>
              setMinRechargeAmount(
                Math.max(1, parseFloat(e.target.value) || 1).toFixed(2)
              )
            }
            min={1}
            step={0.01}
            disabled={isSaving}
            className="rounded-xl"
          />
        </Field>
      </Section>

      {/* ── Referral ── */}
      <Section icon={Users} title="Referral Settings" delay={0.1}>
        <Field
          icon={ArrowUpFromDot}
          label="Referral Bonus Percent (%)"
          hint="Percentage of a deposit credited to the referrer (0 = disabled)"
        >
          <Input
            type="number"
            value={referralPercent}
            onChange={(e) =>
              setReferralPercent(
                Math.max(0, Math.min(100, parseFloat(e.target.value) || 0))
              )
            }
            min={0}
            max={100}
            step={0.1}
            disabled={isSaving}
            className="rounded-xl"
          />
        </Field>

        <Field
          icon={Coins}
          label="Minimum Redeem Amount (₹)"
          hint="Minimum wallet balance required to redeem referral earnings"
        >
          <Input
            type="number"
            value={minRedeem}
            onChange={(e) =>
              setMinRedeem(
                Math.max(1, parseFloat(e.target.value) || 1).toFixed(2)
              )
            }
            min={1}
            step={0.01}
            disabled={isSaving}
            className="rounded-xl"
          />
        </Field>
      </Section>

      {/* ── Save Button ── */}
      <motion.div {...fadeUp(0.12)}>
        <Button
          onClick={handleSaveAll}
          disabled={isSaving}
          className="w-full rounded-xl h-12 text-base"
        >
          {isSaving ? (
            <>
              <Loader2 size={18} className="mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save size={18} className="mr-2" />
              Save All Settings
            </>
          )}
        </Button>
      </motion.div>

      {/* ── Server Country Flags ── */}
      <Section icon={Map} title="Server Country Flags" delay={0.14}>
        <p className="text-xs text-muted-foreground -mt-3">
          Set custom flag image URLs per server. Leave empty to use emoji flags.
        </p>

        <div className="space-y-3">
          {servers && servers.length === 0 && (
            <div className="text-center py-8">
              <Flag size={32} className="text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No servers configured</p>
            </div>
          )}

          {servers?.map((server, index) => (
            <motion.div
              key={server.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16 + index * 0.03 }}
              className="bg-muted/40 rounded-xl p-4 space-y-3"
            >
              {/* Server header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-card border border-border flex items-center justify-center overflow-hidden">
                    {server.flagUrl ? (
                      <img
                        src={server.flagUrl}
                        alt={server.countryName || server.countryCode}
                        className="w-full h-full object-cover"
                      />
                    ) : server.countryIso ? (
                      <span className="text-xl">
                        {getCountryFlagEmoji(server.countryIso)}
                      </span>
                    ) : (
                      <Flag size={16} className="text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="font-bold text-sm">{server.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {server.countryName || server.countryCode} (
                      {server.countryIso || "?"}) · Code:{" "}
                      {server.countryCode}
                    </p>
                  </div>
                </div>

                {/* Edit / Save / Cancel buttons */}
                {editingServerId === server.id ? (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingServerId(null)}
                      disabled={savingServerId === server.id}
                      className="h-8 px-3 rounded-lg"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleServerSave(server.id)}
                      disabled={savingServerId === server.id}
                      className="h-8 px-3 rounded-lg"
                    >
                      {savingServerId === server.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Save size={14} />
                      )}
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingServerId(server.id)}
                    className="h-8 px-3 rounded-lg"
                  >
                    Edit Flag
                  </Button>
                )}
              </div>

              {/* Flag URL input (only when editing) */}
              {editingServerId === server.id && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="space-y-2 pt-2 border-t border-border/50"
                >
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <ImageIcon size={12} className="text-primary" />
                    Flag Image URL
                  </label>
                  <Input
                    value={serverFlagUrls[server.id] ?? ""}
                    onChange={(e) =>
                      setServerFlagUrls((prev) => ({
                        ...prev,
                        [server.id]: e.target.value,
                      }))
                    }
                    placeholder="https://example.com/flags/in.svg"
                    disabled={savingServerId === server.id}
                    className="rounded-lg text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Leave empty to use the emoji flag instead.
                  </p>

                  {/* Live preview while editing */}
                  {serverFlagUrls[server.id] && (
                    <div className="flex items-center gap-2 pt-1">
                      <img
                        src={serverFlagUrls[server.id]}
                        alt="Preview"
                        className="w-8 h-6 object-contain rounded border border-border bg-white"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                      <span className="text-[10px] text-muted-foreground">
                        Preview
                      </span>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Current flag URL preview (when not editing) */}
              {server.flagUrl && editingServerId !== server.id && (
                <div className="pt-2 border-t border-border/50 flex items-center gap-2">
                  <img
                    src={server.flagUrl}
                    alt="flag"
                    className="w-6 h-4 object-contain rounded"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <p className="text-[10px] text-muted-foreground truncate flex-1">
                    {server.flagUrl}
                  </p>
                  <CheckCircle2 size={12} className="text-green-500 shrink-0" />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </Section>
    </div>
  );
}