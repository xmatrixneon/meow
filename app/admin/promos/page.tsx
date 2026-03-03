"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Ticket,
  Plus,
  RefreshCw,
  Trash2,
  Power,
  PowerOff,
  Loader2,
  Copy,
  CheckCircle2,
  XCircle,
  IndianRupee,
  Calendar,
  Users,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";

// Animation helper
const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { type: "spring" as const, stiffness: 280, damping: 24, delay },
});

// Format currency in INR
const formatCurrency = (value: number | { toNumber: () => number } | null | undefined) => {
  if (value === null || value === undefined) return "₹0.00";
  const num = typeof value === "number" ? value : value.toNumber();
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(num);
};

// Format date
const formatDate = (date: Date | string) => {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
};

// Format relative time
const formatRelativeTime = (date: Date | string) => {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(d);
};

export default function PromosPage() {
  // State
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [promoToDelete, setPromoToDelete] = useState<{ id: string; code: string } | null>(null);
  const [amount, setAmount] = useState("10");
  const [count, setCount] = useState("1");
  const [maxUses, setMaxUses] = useState("1");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Queries
  const { data: promocodes, isLoading, refetch, isFetching } = trpc.admin.promo.list.useQuery();

  // Mutations
  const generateMutation = trpc.admin.promo.generate.useMutation({
    onSuccess: (result) => {
      toast.success(`Generated ${result.count} promocode${result.count > 1 ? "s" : ""}!`);
      setGenerateDialogOpen(false);
      setAmount("10");
      setCount("1");
      setMaxUses("1");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deactivateMutation = trpc.admin.promo.deactivate.useMutation({
    onSuccess: () => {
      toast.success("Promocode deactivated");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const activateMutation = trpc.admin.promo.activate.useMutation({
    onSuccess: () => {
      toast.success("Promocode activated");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = trpc.admin.promo.delete.useMutation({
    onSuccess: () => {
      toast.success("Promocode deleted");
      setDeleteDialogOpen(false);
      setPromoToDelete(null);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Handlers
  const handleGenerate = () => {
    const amountValue = parseFloat(amount);
    const countValue = parseInt(count);
    const maxUsesValue = parseInt(maxUses);

    if (isNaN(amountValue) || amountValue <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    if (isNaN(countValue) || countValue < 1 || countValue > 100) {
      toast.error("Count must be between 1 and 100");
      return;
    }
    if (isNaN(maxUsesValue) || maxUsesValue < 1) {
      toast.error("Max uses must be at least 1");
      return;
    }

    generateMutation.mutate({
      amount: amountValue,
      count: countValue,
      maxUses: maxUsesValue,
    });
  };

  const handleDeactivate = (id: string) => {
    deactivateMutation.mutate({ id });
  };

  const handleActivate = (id: string) => {
    activateMutation.mutate({ id });
  };

  const handleDeleteClick = (promo: { id: string; code: string }) => {
    setPromoToDelete(promo);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (!promoToDelete) return;
    deleteMutation.mutate({ id: promoToDelete.id });
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success("Code copied to clipboard");
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Calculate stats
  const activeCount = promocodes?.filter((p) => p.isActive).length || 0;
  const totalAmount = promocodes?.reduce((sum, p) => sum + p.amount.toNumber(), 0) || 0;
  const totalUsed = promocodes?.reduce((sum, p) => sum + p.usedCount, 0) || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div {...fadeUp()} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Promocodes</h1>
          <p className="text-sm text-muted-foreground">
            Create and manage discount promocodes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? (
              <Loader2 size={16} className="animate-spin mr-2" />
            ) : (
              <RefreshCw size={16} className="mr-2" />
            )}
            Refresh
          </Button>
          <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus size={16} className="mr-2" />
                Generate
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Generate Promocodes</DialogTitle>
                <DialogDescription>
                  Create new promocodes for users to redeem
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <IndianRupee size={14} className="text-primary" />
                    Amount per code
                  </label>
                  <Input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="10"
                    min="0.01"
                    step="0.01"
                    disabled={generateMutation.isPending}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Amount in INR that will be credited to user's wallet
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-1.5">
                      <Ticket size={14} className="text-primary" />
                      Count
                    </label>
                    <Input
                      type="number"
                      value={count}
                      onChange={(e) => setCount(e.target.value)}
                      placeholder="1"
                      min="1"
                      max="100"
                      disabled={generateMutation.isPending}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Number of codes to generate (max 100)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-1.5">
                      <Users size={14} className="text-primary" />
                      Max uses
                    </label>
                    <Input
                      type="number"
                      value={maxUses}
                      onChange={(e) => setMaxUses(e.target.value)}
                      placeholder="1"
                      min="1"
                      disabled={generateMutation.isPending}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Times each code can be used
                    </p>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setGenerateDialogOpen(false)}
                  disabled={generateMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={generateMutation.isPending}
                >
                  {generateMutation.isPending ? (
                    <>
                      <Loader2 size={16} className="mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Plus size={16} className="mr-2" />
                      Generate {count || "1"} Code{parseInt(count || "1") > 1 ? "s" : ""}
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <motion.div {...fadeUp(0.05)} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-500/10 p-2 rounded-lg">
              <Ticket size={18} className="text-blue-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-medium">Total Codes</p>
              <p className="text-xl font-bold text-foreground">{promocodes?.length || 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="bg-green-500/10 p-2 rounded-lg">
              <CheckCircle2 size={18} className="text-green-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-medium">Active</p>
              <p className="text-xl font-bold text-foreground">{activeCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="bg-purple-500/10 p-2 rounded-lg">
              <IndianRupee size={18} className="text-purple-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-medium">Total Value</p>
              <p className="text-xl font-bold text-foreground">{formatCurrency(totalAmount)}</p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500/10 p-2 rounded-lg">
              <Users size={18} className="text-amber-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-medium">Redeemed</p>
              <p className="text-xl font-bold text-foreground">{totalUsed}</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Promocodes Table */}
      <motion.div {...fadeUp(0.1)}>
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Code</TableHead>
                  <TableHead className="w-[100px]">Amount</TableHead>
                  <TableHead className="w-[80px]">Max Uses</TableHead>
                  <TableHead className="w-[80px]">Used</TableHead>
                  <TableHead className="w-[80px]">Remaining</TableHead>
                  <TableHead className="w-[100px]">Created</TableHead>
                  <TableHead className="w-[80px]">Status</TableHead>
                  <TableHead className="w-[100px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : promocodes && promocodes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
                      <div className="flex flex-col items-center gap-3">
                        <Ticket size={48} className="text-muted-foreground/40" />
                        <p className="text-muted-foreground">No promocodes found</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setGenerateDialogOpen(true)}
                        >
                          Generate your first promocode
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  promocodes?.map((promo, index) => {
                    const isUsedUp = promo.remainingUses <= 0;
                    return (
                      <motion.tr
                        key={promo.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 + index * 0.02 }}
                        className="hover:bg-muted/50 transition-colors border-b"
                      >
                        {/* Code */}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleCopyCode(promo.code)}
                              className="font-mono text-sm font-medium hover:text-primary transition-colors flex items-center gap-1.5"
                            >
                              {copiedCode === promo.code ? (
                                <CheckCircle2 size={14} className="text-green-500" />
                              ) : (
                                <Copy size={12} className="text-muted-foreground" />
                              )}
                              {promo.code}
                            </button>
                          </div>
                        </TableCell>

                        {/* Amount */}
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                            <IndianRupee size={12} />
                            <span className="font-semibold text-sm">
                              {formatCurrency(promo.amount)}
                            </span>
                          </div>
                        </TableCell>

                        {/* Max Uses */}
                        <TableCell>
                          <span className="text-sm font-medium">{promo.maxUses}</span>
                        </TableCell>

                        {/* Used */}
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium">{promo.usedCount}</span>
                            {promo.usedCount > 0 && (
                              <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                                {Math.round((promo.usedCount / promo.maxUses) * 100)}%
                              </Badge>
                            )}
                          </div>
                        </TableCell>

                        {/* Remaining */}
                        <TableCell>
                          <span
                            className={`text-sm font-medium ${
                              promo.remainingUses <= 0
                                ? "text-muted-foreground"
                                : "text-green-600 dark:text-green-400"
                            }`}
                          >
                            {promo.remainingUses}
                          </span>
                        </TableCell>

                        {/* Created */}
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Calendar size={12} className="text-muted-foreground" />
                            <span className="text-xs">{formatRelativeTime(promo.createdAt)}</span>
                          </div>
                        </TableCell>

                        {/* Status */}
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {isUsedUp ? (
                              <Badge variant="secondary" className="gap-1">
                                <XCircle size={10} />
                                Used Up
                              </Badge>
                            ) : promo.isActive ? (
                              <Badge variant="default" className="gap-1 bg-green-500 hover:bg-green-600">
                                <CheckCircle2 size={10} />
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1 text-muted-foreground">
                                <XCircle size={10} />
                                Inactive
                              </Badge>
                            )}
                          </div>
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {!isUsedUp && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => promo.isActive ? handleDeactivate(promo.id) : handleActivate(promo.id)}
                                disabled={deactivateMutation.isPending || activateMutation.isPending}
                                title={promo.isActive ? "Deactivate" : "Activate"}
                              >
                                {promo.isActive ? (
                                  <PowerOff size={14} className="text-muted-foreground" />
                                ) : (
                                  <Power size={14} className="text-green-500" />
                                )}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteClick(promo)}
                              disabled={promo.usedCount > 0}
                              title="Delete (only unused codes)"
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </TableCell>
                      </motion.tr>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </motion.div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Promocode</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete promocode <strong>{promoToDelete?.code}</strong>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleteMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 size={16} className="mr-2" />
                  Delete
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
