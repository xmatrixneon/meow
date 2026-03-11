import { Skeleton } from "@/components/ui/skeleton";

export default function HomeLoading() {
  return (
    <div className="min-h-[calc(100vh-7rem)] flex flex-col">
      <div className="flex-1 px-4 pt-4 pb-28 max-w-md mx-auto w-full space-y-4">
        {/* Search skeleton */}
        <Skeleton className="h-11 w-full rounded-xl" />

        {/* Services section skeleton */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-0.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-4 w-8 rounded-md" />
          </div>
          <div className="h-[260px] w-full rounded-xl border border-border bg-card p-2.5">
            <div className="grid grid-cols-2 gap-1.5">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-xl" />
              ))}
            </div>
          </div>
        </div>

        {/* Recent numbers skeleton */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="px-3 pb-3 space-y-1.5">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 px-3 py-2.5 bg-background border border-border/60 rounded-lg">
                <Skeleton className="w-7 h-7 rounded-lg shrink-0" />
                <Skeleton className="h-3.5 flex-1" />
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-4 w-14 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
