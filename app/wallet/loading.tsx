import { Skeleton } from "@/components/ui/skeleton";

export default function WalletLoading() {
  return (
    <div className="min-h-[calc(100vh-7rem)] flex flex-col">
      <div className="flex-1 px-4 pt-4 pb-28 max-w-md mx-auto w-full space-y-4">
        {/* Balance card skeleton */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-10 w-24" />
          </div>
          <Skeleton className="h-px w-full" />
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col items-center gap-2 py-3">
              <Skeleton className="w-8 h-8 rounded-lg" />
              <Skeleton className="h-2 w-16" />
              <Skeleton className="h-4 w-12" />
            </div>
            <div className="flex flex-col items-center gap-2 py-3">
              <Skeleton className="w-8 h-8 rounded-lg" />
              <Skeleton className="h-2 w-16" />
              <Skeleton className="h-4 w-12" />
            </div>
          </div>
        </div>

        {/* Manage section skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border/60">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent transactions skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
