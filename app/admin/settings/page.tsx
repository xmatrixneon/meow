"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Settings as SettingsIcon,
  Flag,
  IndianRupee,
  Clock,
  Save,
  CheckCircle2,
  Loader2,
  DollarSign,
  Image as ImageIcon,
  Map,
  Smartphone,
  WalletCards,
  Users,
  ShieldAlert,
  ArrowUpFromDot,
  Coins,
  Power,
  QrCode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";

// Animation helper
const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { type: "spring" as const, stiffness: 280, damping: 24, delay },
});

/**
 * Convert country ISO code to flag emoji
 */
function getCountryFlagEmoji(isoCode: string): string {
  if (!isoCode || isoCode.length !== 2) return "🌍";
  const codePoints = isoCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

/**
 * Format decimal to INR display string
 */
function formatINR(value: number | null | undefined): string {
  if (value === null || value === undefined) return "0.00";
  return value.toFixed(2);
}

export default function AdminSettingsPage() {
  // Queries
  const { data: settings, isLoading: settingsLoading } = trpc.admin.settings.get.useQuery();
  const { data: servers, isLoading: serversLoading } = trpc.admin.server.list.useQuery();

  // Mutations
  const settingsMutation = trpc.admin.settings.update.useMutation({
    onSuccess: () => {
      toast.success("Settings updated successfully");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const serverMutation = trpc.admin.server.update.useMutation({
    onSuccess: () => {
      toast.success("Server updated successfully");
      setEditingServerId(null);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // State
  const [currency, setCurrency] = useState(settings?.currency || "INR");
  const [minCancelMinutes, setMinCancelMinutes] = useState(settings?.minCancelMinutes || 2);
  const [upiId, setUpiId] = useState(settings?.upiId || "");
  const [bharatpeQrImage, setBharatpeQrImage] = useState(settings?.bharatpeQrImage || "");
  const [minRechargeAmount, setMinRechargeAmount] = useState(
    formatINR(settings?.minRechargeAmount ? parseFloat(settings.minRechargeAmount.toString()) : 10)
  );
  const [numberExpiryMinutes, setNumberExpiryMinutes] = useState(settings?.numberExpiryMinutes || 20);
  const [referralPercent, setReferralPercent] = useState(settings?.referralPercent || 0);
  const [minRedeem, setMinRedeem] = useState(
    formatINR(settings?.minRedeem ? parseFloat(settings.minRedeem.toString()) : 50)
  );
  const [maintenanceMode, setMaintenanceMode] = useState(settings?.maintenanceMode || false);

  const [editingServerId, setEditingServerId] = useState<string | null>(null);
  const [serverFlagUrls, setServerFlagUrls] = useState<Record<string, string>>({});
  const [savingServerId, setSavingServerId] = useState<string | null>(null);

  // Update state when settings load
  if (settings) {
    if (currency !== settings.currency) setCurrency(settings.currency);
    if (minCancelMinutes !== settings.minCancelMinutes) setMinCancelMinutes(settings.minCancelMinutes);
    if (upiId !== (settings.upiId || "")) setUpiId(settings.upiId || "");
    if (bharatpeQrImage !== (settings.bharatpeQrImage || "")) setBharatpeQrImage(settings.bharatpeQrImage || "");
    if (formatINR(settings.minRechargeAmount ? parseFloat(settings.minRechargeAmount.toString()) : 10) !== minRechargeAmount) {
      setMinRechargeAmount(formatINR(settings.minRechargeAmount ? parseFloat(settings.minRechargeAmount.toString()) : 10));
    }
    if (numberExpiryMinutes !== settings.numberExpiryMinutes) setNumberExpiryMinutes(settings.numberExpiryMinutes);
    if (referralPercent !== settings.referralPercent) setReferralPercent(settings.referralPercent);
    if (formatINR(settings.minRedeem ? parseFloat(settings.minRedeem.toString()) : 50) !== minRedeem) {
      setMinRedeem(formatINR(settings.minRedeem ? parseFloat(settings.minRedeem.toString()) : 50));
    }
    if (maintenanceMode !== settings.maintenanceMode) setMaintenanceMode(settings.maintenanceMode);
  }

  // Initialize server flag URLs
  if (servers && Object.keys(serverFlagUrls).length === 0) {
    const urls: Record<string, string> = {};
    servers.forEach((s) => {
      urls[s.id] = s.flagUrl || "";
    });
    setServerFlagUrls(urls);
  }

  const handleSettingsSave = () => {
    settingsMutation.mutate({
      currency,
      minCancelMinutes,
      upiId: upiId || undefined,
      bharatpeQrImage: bharatpeQrImage || undefined,
      minRechargeAmount: parseFloat(minRechargeAmount),
      numberExpiryMinutes,
      referralPercent,
      minRedeem: parseFloat(minRedeem),
      maintenanceMode,
    });
  };

  const handleServerEdit = (serverId: string) => {
    setEditingServerId(serverId);
    const server = servers?.find((s) => s.id === serverId);
    if (server) {
      setServerFlagUrls((prev) => ({
        ...prev,
        [serverId]: server.flagUrl || "",
      }));
    }
  };

  const handleServerFlagUrlChange = (serverId: string, value: string) => {
    setServerFlagUrls((prev) => ({
      ...prev,
      [serverId]: value,
    }));
  };

  const handleServerSave = (serverId: string) => {
    setSavingServerId(serverId);
    serverMutation.mutate(
      {
        id: serverId,
        flagUrl: serverFlagUrls[serverId] || "",
      },
      {
        onSettled: () => {
          setSavingServerId(null);
        },
      }
    );
  };

  const handleServerCancel = () => {
    setEditingServerId(null);
  };

  if (settingsLoading || serversLoading) {
    return (
      <div className="min-h-[calc(100vh-7rem)] flex flex-col items-center justify-center p-6">
        <Loader2 size={32} className="animate-spin text-primary" />
        <p className="text-sm text-muted-foreground mt-3">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <motion.div {...fadeUp()} className="mb-6">
        <h1 className="text-2xl font-bold text-foreground mb-1">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage currency, payments, referrals, and system settings
        </p>
      </motion.div>

      {/* Maintenance Mode Section */}
      <motion.div {...fadeUp(0.02)} className="mb-4">
        <div className={`bg-card border ${maintenanceMode ? "border-orange-500/50 bg-orange-500/5" : "border-border"} rounded-2xl p-5`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${maintenanceMode ? "bg-orange-500/20" : "bg-muted/50"} flex items-center justify-center`}>
                <Power size={18} className={maintenanceMode ? "text-orange-500" : "text-muted-foreground"} />
              </div>
              <div>
                <h2 className="font-bold text-foreground">Maintenance Mode</h2>
                <p className="text-xs text-muted-foreground">
                  {maintenanceMode ? "App is under maintenance - users cannot make purchases" : "App is online and accepting orders"}
                </p>
              </div>
            </div>
            <Switch
              checked={maintenanceMode}
              onCheckedChange={(checked) => {
                setMaintenanceMode(checked);
                settingsMutation.mutate({ maintenanceMode: checked });
              }}
              disabled={settingsMutation.isPending}
            />
          </div>
        </div>
      </motion.div>

      {/* Currency & Timer Section */}
      <motion.div {...fadeUp(0.04)} className="mb-6">
        <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={18} className="text-primary" />
            <h2 className="font-bold text-foreground">Currency & Cancel Timer</h2>
          </div>

          {/* Currency */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <IndianRupee size={12} className="text-primary" />
              Currency Symbol
            </label>
            <Input
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              placeholder="INR"
              maxLength={3}
              className="rounded-xl"
              disabled={settingsMutation.isPending}
            />
            <p className="text-[10px] text-muted-foreground">
              Default: INR for Indian Rupee
            </p>
          </div>

          {/* Cancel Timer */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Clock size={12} className="text-primary" />
              Minimum Cancel Time (minutes)
            </label>
            <Input
              type="number"
              value={minCancelMinutes}
              onChange={(e) => setMinCancelMinutes(Math.max(0, Math.min(60, parseInt(e.target.value) || 0)))}
              min={0}
              max={60}
              className="rounded-xl"
              disabled={settingsMutation.isPending}
            />
            <p className="text-[10px] text-muted-foreground">
              Users cannot cancel numbers within this time after purchase
            </p>
          </div>
        </div>
      </motion.div>

      {/* UPI Settings Section */}
      <motion.div {...fadeUp(0.06)} className="mb-6">
        <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
          <div className="flex items-center gap-2 mb-2">
            <QrCode size={18} className="text-primary" />
            <h2 className="font-bold text-foreground">UPI Settings</h2>
          </div>

          {/* UPI ID */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <IndianRupee size={12} className="text-primary" />
              UPI ID
            </label>
            <Input
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="example@upi"
              className="rounded-xl"
              disabled={settingsMutation.isPending}
            />
            <p className="text-[10px] text-muted-foreground">
              Displayed to users for wallet top-up via UPI
            </p>
          </div>

          {/* BharatPe QR Image */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <ImageIcon size={12} className="text-primary" />
              BharatPe QR Image URL
            </label>
            <Input
              value={bharatpeQrImage}
              onChange={(e) => setBharatpeQrImage(e.target.value)}
              placeholder="https://example.com/qr-code.png"
              className="rounded-xl"
              disabled={settingsMutation.isPending}
            />
            <p className="text-[10px] text-muted-foreground">
              URL to QR code image shown during deposit
            </p>
            {bharatpeQrImage && (
              <div className="flex items-center gap-2 mt-2">
                <img
                  src={bharatpeQrImage}
                  alt="BharatPe QR"
                  className="w-16 h-16 rounded-lg border border-border object-contain bg-white"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                <CheckCircle2 size={14} className="text-green-500" />
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Payment Settings Section */}
      <motion.div {...fadeUp(0.08)} className="mb-6">
        <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
          <div className="flex items-center gap-2 mb-2">
            <WalletCards size={18} className="text-primary" />
            <h2 className="font-bold text-foreground">Payment Settings</h2>
          </div>

          {/* Minimum Recharge Amount */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <IndianRupee size={12} className="text-primary" />
              Minimum Recharge Amount (₹)
            </label>
            <Input
              type="number"
              value={minRechargeAmount}
              onChange={(e) => setMinRechargeAmount(Math.max(1, parseFloat(e.target.value) || 0).toFixed(2))}
              min={1}
              step={0.01}
              className="rounded-xl"
              disabled={settingsMutation.isPending}
            />
            <p className="text-[10px] text-muted-foreground">
              Minimum amount users can recharge into their wallet
            </p>
          </div>

          {/* Number Expiry Minutes */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Clock size={12} className="text-primary" />
              Number Expiry Time (minutes)
            </label>
            <Input
              type="number"
              value={numberExpiryMinutes}
              onChange={(e) => setNumberExpiryMinutes(Math.max(5, Math.min(120, parseInt(e.target.value) || 20)))}
              min={5}
              max={120}
              className="rounded-xl"
              disabled={settingsMutation.isPending}
            />
            <p className="text-[10px] text-muted-foreground">
              Time before a purchased number expires (5-120 minutes)
            </p>
          </div>
        </div>
      </motion.div>

      {/* Referral Settings Section */}
      <motion.div {...fadeUp(0.1)} className="mb-6">
        <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
          <div className="flex items-center gap-2 mb-2">
            <Users size={18} className="text-primary" />
            <h2 className="font-bold text-foreground">Referral Settings</h2>
          </div>

          {/* Referral Percent */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <ArrowUpFromDot size={12} className="text-primary" />
              Referral Bonus Percent
            </label>
            <Input
              type="number"
              value={referralPercent}
              onChange={(e) => setReferralPercent(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
              min={0}
              max={100}
              step={0.1}
              className="rounded-xl"
              disabled={settingsMutation.isPending}
            />
            <p className="text-[10px] text-muted-foreground">
              Percentage of deposit credited as referral bonus (0-100%)
            </p>
          </div>

          {/* Minimum Redeem Amount */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Coins size={12} className="text-primary" />
              Minimum Redeem Amount (₹)
            </label>
            <Input
              type="number"
              value={minRedeem}
              onChange={(e) => setMinRedeem(Math.max(10, parseFloat(e.target.value) || 0).toFixed(2))}
              min={10}
              step={0.01}
              className="rounded-xl"
              disabled={settingsMutation.isPending}
            />
            <p className="text-[10px] text-muted-foreground">
              Minimum wallet balance required to redeem referral earnings
            </p>
          </div>
        </div>
      </motion.div>

      {/* Server Flags Section */}
      <motion.div {...fadeUp(0.12)}>
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Map size={18} className="text-primary" />
            <h2 className="font-bold text-foreground">Server Country Flags</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Set custom flag images for each server. Leave empty to use emoji flags.
          </p>

          <div className="space-y-3 pt-2">
            {servers?.map((server) => (
              <motion.div
                key={server.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + servers.indexOf(server) * 0.03 }}
                className="bg-muted/40 rounded-xl p-4 space-y-3"
              >
                {/* Server Header */}
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
                        <span className="text-xl">{getCountryFlagEmoji(server.countryIso)}</span>
                      ) : (
                        <Flag size={16} className="text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-sm text-foreground">{server.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {server.countryName || server.countryCode} ({server.countryIso || "?"})
                      </p>
                    </div>
                  </div>
                  {editingServerId === server.id ? (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleServerCancel}
                        disabled={savingServerId === server.id}
                        className="h-8 px-3 rounded-lg"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleServerSave(server.id)}
                        disabled={savingServerId === server.id || !serverFlagUrls[server.id]?.trim()}
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
                      onClick={() => handleServerEdit(server.id)}
                      className="h-8 px-3 rounded-lg"
                    >
                      Edit Flag
                    </Button>
                  )}
                </div>

                {/* Flag URL Input (when editing) */}
                {editingServerId === server.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-2 pt-2 border-t border-border/50"
                  >
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <ImageIcon size={12} className="text-primary" />
                      Flag Image URL
                    </label>
                    <Input
                      value={serverFlagUrls[server.id] || ""}
                      onChange={(e) => handleServerFlagUrlChange(server.id, e.target.value)}
                      placeholder="https://example.com/flags/in.svg"
                      disabled={savingServerId === server.id}
                      className="rounded-lg text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Enter a URL to a flag image. Leave empty to use emoji flags.
                    </p>
                  </motion.div>
                )}

                {/* Preview */}
                {server.flagUrl && editingServerId !== server.id && (
                  <div className="pt-2 border-t border-border/50">
                    <p className="text-[10px] text-muted-foreground mb-1.5">Current flag:</p>
                    <div className="flex items-center gap-2">
                      <img
                        src={server.flagUrl}
                        alt={`${server.countryName} flag`}
                        className="w-6 h-4 object-contain rounded"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                      <p className="text-[10px] text-muted-foreground truncate">
                        {server.flagUrl}
                      </p>
                      <CheckCircle2 size={12} className="text-green-500 shrink-0" />
                    </div>
                  </div>
                )}
              </motion.div>
            ))}

            {servers?.length === 0 && (
              <div className="text-center py-8">
                <Flag size={32} className="text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No servers configured</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Save Button */}
      <motion.div {...fadeUp(0.14)} className="pb-4">
        <Button
          onClick={handleSettingsSave}
          disabled={settingsMutation.isPending}
          className="w-full rounded-xl h-12 text-base"
        >
          {settingsMutation.isPending ? (
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
    </div>
  );
}
