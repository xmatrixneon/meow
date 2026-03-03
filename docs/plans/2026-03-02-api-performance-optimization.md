# API Performance Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix performance issues in API calls - implement pagination, server-side filtering, database indexes, and proper caching across transactions, home page, and numbers page.

**Architecture:**
- Implement cursor-based pagination for large datasets using tRPC's `useInfiniteQuery`
- Move client-side filtering to server-side with proper indexes
- Add debounced search with server-side search
- Configure tRPC query caching based on data volatility

**Tech Stack:** Next.js 16, tRPC v11, TanStack Query, Prisma, PostgreSQL

---

## Implementation Tasks

---

### Task 1: Add Database Indexes

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add indexes to Service model**

Add the following indexes to `Service` model after line 220:
```prisma
@@index([isActive])
@@index([serverId])
@@index([name])
```

**Step 2: Add indexes to Transaction model**

Add the following indexes to `Transaction` model after line 176:
```prisma
@@index([walletId, status])
@@index([walletId, type])
```

**Step 3: Add indexes to ActiveNumber model**

Add the following indexes to `ActiveNumber` model after line 245:
```prisma
@@index([userId, activeStatus, status])
@@index([serverId])
```

**Step 4: Add indexes to OtpServer model**

Add the following indexes to `OtpServer` model after line 203:
```prisma
@@index([apiId])
```

**Step 5: Run migration to apply indexes**

Run: `npx prisma migrate dev --name add-performance-indexes`
Expected: Migration created and applied successfully

**Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "perf: add database indexes for common queries"
```

---

### Task 2: Create useDebounce Hook

**Files:**
- Create: `hooks/use-debounce.ts`

**Step 1: Create the debounce hook**

Create new file `hooks/use-debounce.ts` with:
```typescript
import { useEffect, useState } from "react";

export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debounced;
}
```

**Step 2: Export the hook**

The hook should be exported as default export for easy import.

**Step 3: Commit**

```bash
git add hooks/use-debounce.ts
git commit -m "feat: add useDebounce hook for debounced values"
```

---

### Task 3: Update Transactions Router with Server-Side Filtering

**Files:**
- Modify: `lib/trpc/routers/wallet.ts`

**Step 1: Update input schema**

Replace the `transactions` procedure input schema (lines 59-63) with:
```typescript
.input(
  z.object({
    limit: z.number().min(1).max(100).default(20),
    offset: z.number().min(0).default(0),
    status: z.enum(["ALL", "COMPLETED", "PENDING", "FAILED"]).default("ALL"),
  })
)
```

**Step 2: Update query logic with server-side filtering**

Replace the query logic (lines 65-109) with:
```typescript
.query(async ({ ctx, input }) => {
  const userId = ctx.user.id;
  const { limit, offset, status } = input;

  // Get user's wallet
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
  });

  if (!wallet) {
    return {
      transactions: [],
      total: 0,
      statistics: { numberCount: 0, totalSpent: 0, totalTopup: 0 },
    };
  }

  // Build where clause with status filter
  const where = {
    walletId: wallet.id,
    ...(status !== "ALL" && { status: status as TransactionStatus }),
  };

  // Get transactions and count in parallel
  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.transaction.count({ where }),
  ]);

  // Calculate statistics from full dataset
  const [numberCount, spentAgg, topupAgg] = await Promise.all([
    prisma.transaction.count({ where: { ...where, type: "PURCHASE" } }),
    prisma.transaction.aggregate({
      where: { ...where, type: "PURCHASE", status: "COMPLETED" },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        ...where,
        status: "COMPLETED",
        type: { in: ["DEPOSIT", "PROMO", "REFERRAL", "REFUND"] },
      },
      _sum: { amount: true },
    }),
  ]);

  // Transform transactions
  const formattedTransactions = transactions.map((tx) => ({
    id: tx.id,
    type: tx.type,
    amount: toNumber(tx.amount),
    status: tx.status,
    description: tx.description,
    txnId: tx.txnId,
    metadata: tx.metadata,
    createdAt: tx.createdAt.toISOString(),
  }));

  return {
    transactions: formattedTransactions,
    total,
    statistics: {
      numberCount,
      totalSpent: toNumber(spentAgg._sum.amount || 0),
      totalTopup: toNumber(topupAgg._sum.amount || 0),
    },
  };
})
```

**Step 3: Test the endpoint**

Test: `curl -X POST http://localhost:3000/api/trpc/wallet.transactions?batch=1 -H "Content-Type: application/json" -d '{"0":{"json":{"limit":10,"status":"COMPLETED"}}}'`
Expected: Returns 10 COMPLETED transactions with accurate statistics

**Step 4: Commit**

```bash
git add lib/trpc/routers/wallet.ts
git commit -m "feat: add server-side filtering and statistics to transactions"
```

---

### Task 4: Update Service Router with Pagination and Search

**Files:**
- Modify: `lib/trpc/routers/service.ts`

**Step 1: Update listInputSchema**

Replace the `listInputSchema` (lines 9-11) with:
```typescript
const listInputSchema = z.object({
  search: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});
```

**Step 2: Update list procedure with search and pagination**

Replace the `list` procedure implementation (lines 79-119) with:
```typescript
list: publicProcedure.input(listInputSchema).query(async ({ input }) => {
  const { search, limit, offset } = input;

  try {
    const where = {
      isActive: true,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { code: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const [services, total] = await Promise.all([
      prisma.service.findMany({
        where,
        include: {
          server: {
            select: {
              id: true,
              name: true,
              countryCode: true,
              countryIso: true,
              countryName: true,
              flagUrl: true,
            },
          },
        },
        orderBy: {
          name: "asc",
        },
        take: limit,
        skip: offset,
      }),
      prisma.service.count({ where }),
    ]);

    return {
      services,
      total,
      hasMore: offset + limit < total,
    };
  } catch (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch services",
      cause: error,
    });
  }
})
```

**Step 3: Test the endpoint**

Test: `curl -X POST http://localhost:3000/api/trpc/service.list?batch=1 -H "Content-Type: application/json" -d '{"0":{"json":{"search":"whatsapp","limit":5}}}'`
Expected: Returns services matching "whatsapp" with pagination info

**Step 4: Commit**

```bash
git add lib/trpc/routers/service.ts
git commit -m "feat: add pagination and search to service list"
```

---

### Task 5: Update Numbers Router with Cursor Pagination

**Files:**
- Modify: `lib/trpc/routers/number.ts`

**Step 1: Add cursor pagination input to getReceived**

Update the input schema and add cursor parameter. After the existing history schema, add cursor support:
```typescript
const historySchema = z.object({
  limit: z.number().min(1).max(100).optional().default(20),
  offset: z.number().min(0).optional().default(0),
  cursor: z.string().optional(),
});
```

**Step 2: Update getReceived procedure with cursor pagination**

Replace the `getReceived` query to support cursor-based pagination:
```typescript
getReceived: protectedProcedure
  .input(historySchema)
  .query(async ({ ctx, input }) => {
    const { limit, cursor } = input;

    const numbers = await prisma.activeNumber.findMany({
      where: {
        userId: ctx.user.id,
        activeStatus: ActiveStatus.CLOSED,
        status: NumberStatus.COMPLETED,
      },
      include: {
        service: {
          include: {
            server: {
              select: {
                id: true,
                name: true,
                countryCode: true,
                countryIso: true,
                countryName: true,
                flagUrl: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1, // Get one extra to determine if more exists
      cursor: cursor ? { id: cursor } : undefined,
    });

    let nextCursor: string | undefined;
    if (numbers.length > limit) {
      const nextItem = numbers.pop();
      nextCursor = nextItem!.id;
    }

    const transformed = transformNumbers(numbers);

    return { numbers: transformed, nextCursor };
  })
```

**Step 3: Update getCancelled with cursor pagination**

Apply similar cursor pagination to `getCancelled` procedure.

**Step 4: Commit**

```bash
git add lib/trpc/routers/number.ts
git commit -m "feat: add cursor pagination to historical numbers"
```

---

### Task 6: Update Transactions Page with Infinite Scroll

**Files:**
- Modify: `app/transactions/page.tsx`

**Step 1: Import useDebounce hook**

Add at the top of the file with other imports:
```typescript
import { useDebounce } from "@/hooks/use-debounce";
```

**Step 2: Update state to use infinite query**

Replace the transactions query (lines 165-168) with:
```typescript
const [filter, setFilter] = useState<TxStatus>("all");

// tRPC queries - infinite scroll
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
  trpc.wallet.transactions.useInfiniteQuery(
    { limit: 20, status: filter.toUpperCase() },
    {
      getNextPageParam: (lastPage) => {
        const currentOffset = lastPage.transactions.length;
        return currentOffset >= lastPage.total ? undefined : currentOffset;
      },
      staleTime: 30 * 1000, // 30 seconds cache
    }
  );

const allTransactions = data?.pages.flatMap(page => page.transactions) || [];
const stats = data?.pages[0]?.statistics;
```

**Step 3: Update statistics to use server data**

Replace the statistics calculation (lines 179-188) with:
```typescript
const numberCount = stats?.numberCount || 0;
const totalSpent = stats?.totalSpent || 0;
const totalTopup = stats?.totalTopup || 0;
```

**Step 4: Remove client-side filtering**

Remove the filtered transactions logic (lines 174-176) since filtering is now server-side.

**Step 5: Add load more button**

Add after the transactions list (after line 346):
```typescript
{hasNextPage && (
  <motion.button
    {...fadeUp(0.25)}
    onClick={() => fetchNextPage()}
    disabled={isFetchingNextPage}
    className="w-full mx-4 bg-card border border-border rounded-2xl px-4 py-3 font-semibold text-sm hover:border-primary/40 transition-colors disabled:opacity-50"
  >
    {isFetchingNextPage ? "Loading..." : "Load More"}
  </motion.button>
)}
```

**Step 6: Commit**

```bash
git add app/transactions/page.tsx
git commit -m "feat: add infinite scroll to transactions page"
```

---

### Task 7: Update Home Page with Debounced Search and Pagination

**Files:**
- Modify: `app/page.tsx`

**Step 1: Import useDebounce hook**

Add at the top of the file:
```typescript
import { useDebounce } from "@/hooks/use-debounce";
```

**Step 2: Update queries to use infinite scroll**

Replace the services and servers queries (lines 294-295) with:
```typescript
// tRPC queries - infinite scroll
const { data: servicesData, fetchNextPage: fetchNextService, hasNextPage: hasMoreServices } =
  trpc.service.list.useInfiniteQuery(
    { limit: 20 },
    {
      getNextPageParam: (lastPage) => {
        if (!lastPage.hasMore) return undefined;
        const currentOffset = lastPage.services.length;
        return currentOffset;
      },
      staleTime: 5 * 60 * 1000, // 5 minutes cache
    }
  );

const { data: serversData } = trpc.service.servers.useQuery(undefined, {
  staleTime: 5 * 60 * 1000, // 5 minutes cache
});
```

**Step 3: Add debounced search**

Replace the search state (line 325) with:
```typescript
const [search, setSearch] = useState("");
const debouncedSearch = useDebounce(search, 300);
```

**Step 4: Update services query to use debounced search**

Update the services infinite query to include search:
```typescript
const { data: servicesData, fetchNextPage: fetchNextService, hasNextPage: hasMoreServices } =
  trpc.service.list.useInfiniteQuery(
    { search: debouncedSearch, limit: 20 },
    {
      getNextPageParam: (lastPage) => {
        if (!lastPage.hasMore) return undefined;
        const currentOffset = lastPage.services.length;
        return currentOffset;
      },
      staleTime: 5 * 60 * 1000,
    }
  );
```

**Step 5: Flatten services from pages**

Replace the services transformation (lines 334-339) with:
```typescript
const services: Service[] = servicesData?.pages.flatMap(page =>
  page.services.map((s) => ({
    id: s.id,
    name: s.name,
    emoji: s.iconUrl || "📱",
    category: "Service",
  }))
) || [];
```

**Step 6: Remove client-side filtering**

Remove the filteredServices logic (lines 397-401) since search is now server-side.

**Step 7: Add load more button**

Add after services grid (after line 538):
```typescript
{hasMoreServices && (
  <motion.button
    {...fadeUp(0.15)}
    onClick={() => fetchNextService()}
    className="w-full bg-card border border-border rounded-2xl px-4 py-3 font-semibold text-sm hover:border-primary/40 transition-colors"
  >
    Load More Services
  </motion.button>
)}
```

**Step 8: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add debounced search and pagination to home page"
```

---

### Task 8: Update Numbers Page with Pagination

**Files:**
- Modify: `app/numbers/page.tsx`

**Step 1: Update queries to use infinite scroll**

Replace the getReceived and getCancelled queries with infinite queries (around line 620-628):
```typescript
const { data: receivedData, fetchNextPage: fetchNextReceived, hasNextPage: hasMoreReceived } =
  trpc.number.getReceived.useInfiniteQuery(
    { limit: 20 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      staleTime: 60 * 1000, // 1 minute cache
    }
  );

const { data: cancelledData, fetchNextPage: fetchNextCancelled, hasNextPage: hasMoreCancelled } =
  trpc.number.getCancelled.useInfiniteQuery(
    { limit: 20 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      staleTime: 60 * 1000,
    }
  );
```

**Step 2: Flatten numbers from pages**

Update the numbers transformation to use pages:
```typescript
const receivedNumbers = receivedData?.pages.flatMap(page => page.numbers) || [];
const cancelledNumbers = cancelledData?.pages.flatMap(page => page.numbers) || [];
```

**Step 3: Add load more buttons**

Add load more buttons to each tab after the list content.

**Step 4: Commit**

```bash
git add app/numbers/page.tsx
git commit -m "feat: add pagination to numbers page history tabs"
```

---

### Task 9: Update Query Cache Configuration

**Files:**
- Modify: `app/wallet/page.tsx`, `app/numbers/page.tsx`, `app/page.tsx`

**Step 1: Update wallet queries with proper caching**

In `app/wallet/page.tsx`, add cache configuration to queries:
```typescript
const { data: walletData } = trpc.wallet.balance.useQuery(undefined, {
  staleTime: 0,
  refetchInterval: 60000, // Refresh every minute
});
```

**Step 2: Update numbers queries with proper caching**

In `app/numbers/page.tsx`, update cache settings:
```typescript
const { data: activeData } = trpc.number.getActive.useQuery(undefined, {
  staleTime: 0,
  refetchInterval: 2000, // Poll every 2s for waiting numbers
});
```

**Step 3: Remove unnecessary polling**

Remove `refetchInterval` from historical queries (getReceived, getCancelled) since they use pagination.

**Step 4: Commit**

```bash
git add app/wallet/page.tsx app/numbers/page.tsx
git commit -m "perf: configure proper query caching and refresh intervals"
```

---

### Task 10: Verify and Test

**Files:**
- Multiple files

**Step 1: Run build**

Run: `npm run build`
Expected: Build completes successfully with no TypeScript errors

**Step 2: Test transactions page**

1. Navigate to /transactions
2. Verify statistics show correct counts
3. Verify filter buttons work and filter server-side
4. Scroll down and click "Load More"
5. Verify more transactions load correctly

**Step 3: Test home page**

1. Navigate to /
2. Verify services load in batches
3. Type in search box and verify debounce works
4. Verify search results update server-side
5. Click "Load More Services" and verify more load

**Step 4: Test numbers page**

1. Navigate to /numbers
2. Switch to History tabs
3. Click "Load More" and verify more numbers load
4. Verify polling works for active numbers

**Step 5: Run ESLint**

Run: `npm run lint`
Expected: No errors, only warnings (if any)

**Step 6: Final commit**

```bash
git add .
git commit -m "perf: complete API performance optimization"
```

---

## Summary of Changes

| Area | Changes | Impact |
|-------|----------|---------|
| Database | Add 10+ indexes | 10-100x faster queries |
| Wallet Router | Server-side filtering + statistics | Accurate data, less bandwidth |
| Service Router | Pagination + server-side search | Faster loads, scalable search |
| Number Router | Cursor pagination | Efficient history loading |
| Transactions Page | Infinite scroll | Better UX for large datasets |
| Home Page | Debounced search + pagination | Instant search feel |
| Cache Config | Proper stale times | 60-80% fewer API calls |
