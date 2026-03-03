# Country Flags, INR Pricing, Cancel Timer - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add country flag support with admin-uploaded URLs, display all prices in INR (₹), implement global cancel timer controlled by admin, and create external PHP API at `/var/www/stubs/` for programmatic access.

**Architecture:** Database schema updates for Settings (currency, minCancelMinutes), OtpServer (flagUrl), ActiveNumber (server relation). tRPC router updates for cancel timer validation. External PHP API connecting to PostgreSQL database. Frontend UI updates for INR formatting and country flag display.

**Tech Stack:** Next.js 16, tRPC, Prisma with PostgreSQL, PHP 8.3 with PDO

---

### Task 1: Update Database Schema

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add currency and minCancelMinutes to Settings model**

```prisma
model Settings {
  id                  String  @id @default("1")
  // ... existing fields ...

  // NEW FIELDS:
  currency            String  @default("INR")      // Currency symbol for display
  minCancelMinutes    Int     @default(2)        // Global cancel timer (minutes)
}
```

**Step 2: Add flagUrl to OtpServer model**

```prisma
model OtpServer {
  id          String    @id @default(cuid())
  name        String
  countryCode String
  flagUrl     String?   // NEW: URL to country flag image
  apiId       String
  isActive    Boolean   @default(true)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  services    Service[]
  api         ApiCredential @relation(fields: [apiId], references: [id])
}
```

**Step 3: Add server relation to ActiveNumber model**

```prisma
model ActiveNumber {
  // ... existing fields ...

  // NEW RELATION:
  server      OtpServer    @relation(fields: [serverId], references: [id]) // For country info

  @@index([userId, status])
  @@index([status, expiresAt])
}
```

**Step 4: Run database migration**

```bash
npx prisma migrate dev --name add-country-and-cancel-timer
```

Expected: New migration file created in `prisma/migrations/`

**Step 5: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected: Client regenerated in `app/generated/prisma/`

**Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add currency, minCancelMinutes, flagUrl, and server relation"
```

---

### Task 2: Update tRPC Service Router

**Files:**
- Modify: `lib/trpc/routers/service.ts`

**Step 1: Add listWithServers procedure**

```typescript
listWithServers: publicProcedure
  .query(async ({ ctx }) => {
    const services = await prisma.service.findMany({
      where: { isActive: true },
      include: {
        server: {
          select: {
            id: true,
            name: true,
            countryCode: true,
            flagUrl: true,
          }
        }
      }
    });

    return { services };
  }),
```

**Step 2: Update settings public procedure**

```typescript
settings: publicProcedure
  .query(async () => {
    const settings = await prisma.settings.findUnique({
      where: { id: "1" }
    });

    return {
      currency: settings?.currency || "₹",
      bharatpeQrImage: settings?.bharatpeQrImage,
      upiId: settings?.upiId,
      minCancelMinutes: settings?.minCancelMinutes,
    };
  }),
```

**Step 3: Commit**

```bash
git add lib/trpc/routers/service.ts
git commit -m "feat(trpc): add listWithServers and update settings procedure"
```

---

### Task 3: Update tRPC Number Router with Cancel Timer

**Files:**
- Modify: `lib/trpc/routers/number.ts`

**Step 1: Update cancel procedure with timer validation**

```typescript
cancel: protectedProcedure
  .input(z.object({
    orderId: z.string(),
  }))
  .mutation(async ({ ctx, input }) => {
    // Get settings
    const settings = await prisma.settings.findUnique({
      where: { id: "1" }
    });
    const minCancelMinutes = settings?.minCancelMinutes || 2;
    const minCancelMs = minCancelMinutes * 60 * 1000;

    // Find order
    const order = await prisma.activeNumber.findUnique({
      where: {
        id: input.orderId,
        userId: ctx.user.id
      }
    });

    if (!order) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Order not found",
      });
    }

    // Check timer
    const timeSincePurchase = Date.now() - order.buyTime.getTime();
    if (timeSincePurchase < minCancelMs) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `Cannot cancel within ${minCancelMinutes} minutes`,
      });
    }

    // Proceed with cancel
    // ... existing cancel logic
  }),
```

**Step 2: Update getActive to include server relation**

```typescript
getActive: protectedProcedure
  .query(async ({ ctx }) => {
    const numbers = await prisma.activeNumber.findMany({
      where: {
        userId: ctx.user.id,
        status: { in: ["PENDING", "COMPLETED"] }
      },
      include: {
        service: {
          select: { name: true, code: true }
        },
        server: {
          select: {
            name: true,
            countryCode: true,
            flagUrl: true,
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return { numbers };
  }),
```

**Step 3: Commit**

```bash
git add lib/trpc/routers/number.ts
git commit -m "feat(trpc): add cancel timer validation and server relation"
```

---

### Task 4: Update tRPC Admin Router

**Files:**
- Modify: `lib/trpc/routers/admin.ts`

**Step 1: Update settings.update to accept new fields**

```typescript
settings.update: adminProcedure
  .input(z.object({
    currency: z.string().optional(),
    minCancelMinutes: z.number().min(0).max(60).optional(),
    bharatpeQrImage: z.string().url().optional(),
    upiId: z.string().optional(),
  }))
  .mutation(async ({ input }) => {
    const updated = await prisma.settings.update({
      where: { id: "1" },
      data: {
        ...(input.currency !== undefined && { currency: input.currency }),
        ...(input.minCancelMinutes !== undefined && { minCancelMinutes: input.minCancelMinutes }),
        ...(input.bharatpeQrImage !== undefined && { bharatpeQrImage: input.bharatpeQrImage }),
        ...(input.upiId !== undefined && { upiId: input.upiId }),
      }
    });

    return updated;
  }),
```

**Step 2: Update servers.update to accept flagUrl**

```typescript
servers.update: adminProcedure
  .input(z.object({
    id: z.string(),
    name: z.string().optional(),
    countryCode: z.string().optional(),
    flagUrl: z.string().url().optional(),
    isActive: z.boolean().optional(),
  }))
  .mutation(async ({ input }) => {
    const updated = await prisma.otpServer.update({
      where: { id: input.id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.countryCode !== undefined && { countryCode: input.countryCode }),
        ...(input.flagUrl !== undefined && { flagUrl: input.flagUrl }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      }
    });

    return updated;
  }),
```

**Step 3: Commit**

```bash
git add lib/trpc/routers/admin.ts
git commit -m "feat(trpc): add currency, minCancelMinutes, and flagUrl to admin updates"
```

---

### Task 5: Create External PHP API

**Files:**
- Create: `/var/www/stubs/handler_api.php`

**Step 1: Create PHP file with database connection**

```php
<?php
header('Content-Type: text/plain');
error_reporting(0);

// Database connection
$host = getenv('DB_HOST') ?: 'localhost';
$dbname = getenv('DB_NAME') ?: 'meowsms';
$user = getenv('DB_USER') ?: 'postgres';
$password = getenv('DB_PASSWORD') ?: '';

try {
    $pdo = new PDO("pgsql:host=$host;dbname=$dbname;user=$user;password=$password");
} catch (PDOException $e) {
    die("DB_ERROR");
}

// Helper: Get user by API key
function getUser($pdo, $apiKey) {
    $stmt = $pdo->prepare("SELECT * FROM \"User\" WHERE \"telegramId\" = ?");
    $stmt->execute([$apiKey]);
    return $stmt->fetch(PDO::FETCH_ASSOC);
}

// Helper: Get settings
function getSettings($pdo) {
    $stmt = $pdo->prepare("SELECT * FROM \"Settings\" WHERE id = '1'");
    $stmt->execute();
    return $stmt->fetch(PDO::FETCH_ASSOC);
}
```

**Step 2: Implement getNumber action**

```php
function getNumber($pdo) {
    $apiKey = $_GET['api_key'] ?? '';
    $service = $_GET['service'] ?? '';
    $country = $_GET['country'] ?? '';

    if (!$apiKey || !$service || !$country) {
        return "BAD_KEY";
    }

    // Get user
    $user = getUser($pdo, $apiKey);
    if (!$user) {
        return "BAD_KEY";
    }

    // Get wallet balance
    $stmt = $pdo->prepare("SELECT * FROM \"Wallet\" WHERE \"userId\" = ?");
    $stmt->execute([$user['id']]);
    $wallet = $stmt->fetch(PDO::FETCH_ASSOC);

    // Get service with server
    $stmt = $pdo->prepare("
        SELECT s.*, srv.\"countryCode\", srv.\"flagUrl\", srv.\"name\" as serverName
        FROM \"Service\" s
        JOIN \"OtpServer\" srv ON s.\"serverId\" = srv.id
        WHERE s.code = ? AND s.\"isActive\" = true AND srv.\"isActive\" = true
        LIMIT 1
    ");
    $stmt->execute([$service]);
    $serviceData = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$serviceData) {
        return "BAD_SERVICE";
    }

    $price = floatval($serviceData['basePrice']);

    // Check balance
    if (floatval($wallet['balance']) < $price) {
        return "NO_BALANCE";
    }

    // Call external provider (example for cattysms.shop)
    // ... provider call logic ...

    // Create order
    $orderId = uniqid();
    $stmt = $pdo->prepare("
        INSERT INTO \"ActiveNumber\" (\"id\", \"userId\", \"serviceId\", \"serverId\", \"orderId\", \"phoneNumber\", \"price\", \"status\", \"buyTime\", \"expiresAt\")
        VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', NOW(), NOW() + INTERVAL '20 minutes')
    ");
    $stmt->execute([$orderId, $user['id'], $serviceData['id'], $serviceData['serverId'], $orderId, $phoneNumber, $price]);

    return "ACCESS_NUMBER:$orderId:$phoneNumber";
}
```

**Step 3: Implement getStatus action**

```php
function getStatus($pdo) {
    $apiKey = $_GET['api_key'] ?? '';
    $id = $_GET['id'] ?? '';

    if (!$apiKey || !$id) {
        return "BAD_KEY";
    }

    $user = getUser($pdo, $apiKey);
    if (!$user) {
        return "BAD_KEY";
    }

    $stmt = $pdo->prepare("
        SELECT an.*, s.\"name\" as serviceName
        FROM \"ActiveNumber\" an
        JOIN \"Service\" s ON an.\"serviceId\" = s.id
        WHERE an.\"orderId\" = ? AND an.\"userId\" = ? AND an.\"status\" = 'PENDING'
    ");
    $stmt->execute([$id, $user['id']]);
    $order = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$order) {
        return "NO_ACTIVATION";
    }

    // Check if expired
    $expiresAt = strtotime($order['expiresAt']);
    if (time() > $expiresAt) {
        return "STATUS_CANCEL";
    }

    if ($order['smsContent']) {
        $otp = extractOTP($order['smsContent']);
        return "STATUS_OK:$otp";
    }

    return "STATUS_WAIT_CODE";
}
```

**Step 4: Implement setStatus action with cancel timer**

```php
function setStatus($pdo) {
    $apiKey = $_GET['api_key'] ?? '';
    $id = $_GET['id'] ?? '';
    $status = $_GET['status'] ?? '';

    if (!$apiKey || !$id || !$status) {
        return "BAD_KEY";
    }

    $user = getUser($pdo, $apiKey);
    if (!$user) {
        return "BAD_KEY";
    }

    $settings = getSettings($pdo);
    $minCancelMinutes = intval($settings['minCancelMinutes'] ?? 2);

    $stmt = $pdo->prepare("
        SELECT * FROM \"ActiveNumber\"
        WHERE \"orderId\" = ? AND \"userId\" = ? AND \"status\" = 'PENDING'
    ");
    $stmt->execute([$id, $user['id']]);
    $order = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$order) {
        return "NO_ACTIVATION";
    }

    // Cancel timer check
    if ($status == 8) {
        $buyTime = strtotime($order['buyTime']);
        $diffSeconds = time() - $buyTime;
        $minCancelSeconds = $minCancelMinutes * 60;

        if ($diffSeconds < $minCancelSeconds) {
            return "EARLY_CANCEL_DENIED";
        }

        // Refund wallet
        $stmt = $pdo->prepare("
            UPDATE \"Wallet\"
            SET \"balance\" = \"balance\" + ?, \"totalOtp\" = \"totalOtp\" - 1
            WHERE \"userId\" = ?
        ");
        $stmt->execute([floatval($order['price']), $user['id']]);

        // Mark as cancelled
        $stmt = $pdo->prepare("
            UPDATE \"ActiveNumber\"
            SET \"status\" = 'CANCELLED'
            WHERE \"orderId\" = ?
        ");
        $stmt->execute([$id]);

        return "ACCESS_CANCEL";
    }

    return "BAD_STATUS";
}
```

**Step 5: Main router**

```php
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action'])) {
    $action = $_GET['action'];

    switch ($action) {
        case 'getNumber':
            echo getNumber($pdo);
            break;
        case 'getStatus':
            echo getStatus($pdo);
            break;
        case 'setStatus':
            echo setStatus($pdo);
            break;
        default:
            echo "WRONG_ACTION";
    }
} else {
    echo "NO_ACTION";
}
?>
```

**Step 6: Set permissions**

```bash
sudo chown -R www-data:www-data /var/www/stubs/
sudo chmod -R 755 /var/www/stubs/
```

**Step 7: Commit**

```bash
git add /var/www/stubs/handler_api.php 2>/dev/null || true
git commit -m "feat(api): create external PHP API at /var/www/stubs/"
```

---

### Task 6: Update Home Page - INR Pricing

**Files:**
- Modify: `app/page.tsx`

**Step 1: Update listWithServers query**

```typescript
const { data: servicesWithServersData } = trpc.service.listWithServers.useQuery();

// Transform services
const services: Service[] = servicesWithServersData?.services.map((s) => ({
  id: s.id,
  name: s.name,
  emoji: s.iconUrl || "📱",
  category: "Service",
  basePrice: parseFloat(s.basePrice),
})) || [];
```

**Step 2: Update server price display**

```typescript
const servers: ServerOption[] = servicesWithServersData?.services.map((s) => ({
  id: s.server.id,
  name: s.server.serverName || s.server.name,
  price: `₹${parseFloat(s.basePrice).toFixed(2)}`,
  countryCode: s.server.countryCode,
  flagUrl: s.server.flagUrl,
  stock: 100,
  successRate: 95,
  avgTime: "~30s",
})) || [];
```

**Step 3: Update balance display**

```typescript
<span className="text-xs font-bold text-green-500">
  ₹{walletData?.balance?.toFixed(2) || "0.00"}
</span>
```

**Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat(frontend): update home page with INR pricing"
```

---

### Task 7: Update Numbers Page - Country Flags

**Files:**
- Modify: `app/numbers/page.tsx`

**Step 1: Update getActive query to include server**

```typescript
const { data: activeData, refetch } = trpc.number.getActive.useQuery();

const numbers: TempNumber[] = activeData?.numbers.map((n) => ({
  id: n.id,
  orderId: n.orderId,
  number: n.phoneNumber,
  country: n.server?.name || "Unknown",
  countryCode: n.server?.countryCode || "??",
  flagUrl: n.server?.flagUrl,
  service: n.service?.name || "Unknown",
  status: n.status === "PENDING" ? "waiting" : n.status === "COMPLETED" ? "received" : "cancelled",
  expiresIn: formatTimeRemaining(n.expiresAt),
  sms: n.smsContent ?? undefined,
  code: extractOTP(n.smsContent),
  // Calculate if can cancel based on minCancelMinutes
  canCancel: n.status === "PENDING" &&
    (Date.now() - new Date(n.buyTime).getTime()) > (settings?.minCancelMinutes || 2) * 60 * 1000),
})) || [];
```

**Step 2: Add country flag to NumberCard**

```typescript
// Replace country code box with flag
<div className="w-10 h-10 rounded-xl overflow-hidden bg-primary/10 dark:bg-primary/15 flex items-center justify-center">
  {item.flagUrl ? (
    <img
      src={item.flagUrl}
      alt={item.country}
      className="w-full h-full object-cover"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = 'none';
        (e.target as HTMLImageElement).parentElement?.appendChild(
          document.createTextNode(item.countryCode)
        );
      }}
    />
  ) : (
    <span className="text-lg">{item.countryCode}</span>
  )}
</div>
```

**Step 3: Add cancel timer tooltip**

```typescript
{isWaiting && (
  <Tooltip content={!item.canCancel ? `Cannot cancel within ${settings?.minCancelMinutes || 2} minutes` : "Cancel number"}>
    <Button
      whileTap={{ scale: 0.96 }}
      type="button"
      onClick={() => onCancel(item.orderId)}
      disabled={!item.canCancel}
      className="flex items-center justify-center w-9 h-9 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors duration-150 shrink-0"
    >
      <Trash2 size={14} />
    </Button>
  </Tooltip>
)}
```

**Step 4: Commit**

```bash
git add app/numbers/page.tsx
git commit -m "feat(frontend): add country flags and cancel timer to numbers page"
```

---

### Task 8: Update Wallet Page - INR Format

**Files:**
- Modify: `app/wallet/page.tsx`

**Step 1: Update balance display**

```typescript
<span className="text-2xl font-bold text-green-500 tabular-nums">
  ₹{walletData?.balance?.toFixed(2) || "0.00"}
</span>
```

**Step 2: Update transaction amounts**

```typescript
const amountPrefix = transaction.type === "DEPOSIT" || transaction.type === "PROMO" ? "+" : "-";
const amountClass = transaction.type === "DEPOSIT" || transaction.type === "PROMO"
  ? "text-green-500"
  : "text-red-500";

<p className={`text-sm font-semibold ${amountClass} tabular-nums`}>
  {amountPrefix}₹{Math.abs(parseFloat(transaction.amount)).toFixed(2)}
</p>
```

**Step 3: Commit**

```bash
git add app/wallet/page.tsx
git commit -m "feat(frontend): update wallet page with INR formatting"
```

---

### Task 9: Create Admin Settings Page

**Files:**
- Create: `app/admin/settings/page.tsx`

**Step 1: Create page component**

```typescript
"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function AdminSettingsPage() {
  const { data: settingsData } = trpc.admin.settings.get.useQuery();
  const { data: serversData } = trpc.admin.servers.list.useQuery();

  const updateSettingsMutation = trpc.admin.settings.update.useMutation({
    onSuccess: () => {
      toast.success("Settings updated");
    },
  });

  const updateServerMutation = trpc.admin.servers.update.useMutation({
    onSuccess: () => {
      toast.success("Server updated");
    },
  });

  const [currency, setCurrency] = useState("₹");
  const [minCancelMinutes, setMinCancelMinutes] = useState(2);

  const handleSaveSettings = () => {
    updateSettingsMutation.mutate({
      currency,
      minCancelMinutes,
    });
  };

  return (
    <div className="min-h-[calc(100vh-7rem)] px-4 pt-5 pb-28">
      <h1 className="text-xl font-bold mb-6">Admin Settings</h1>

      {/* Currency Settings */}
      <div className="space-y-4 mb-8">
        <h2 className="text-lg font-semibold">Currency & Timer</h2>
        <div>
          <label className="text-sm font-medium">Currency Symbol</label>
          <Input
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            placeholder="₹, $, €"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Cancel Timer (minutes)</label>
          <Input
            type="number"
            value={minCancelMinutes}
            onChange={(e) => setMinCancelMinutes(parseInt(e.target.value))}
            min={0}
            max={60}
          />
          <p className="text-xs text-muted-foreground">
            Users cannot cancel numbers within this time
          </p>
        </div>
        <Button onClick={handleSaveSettings}>Save Settings</Button>
      </div>

      {/* Server Flag URLs */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold mb-4">Server Flags</h2>
        {serversData?.servers.map((server) => (
          <div key={server.id} className="flex items-center gap-3 p-4 border rounded-xl">
            <div className="flex-1">
              <p className="font-medium">{server.name}</p>
              <p className="text-sm text-muted-foreground">{server.countryCode}</p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                defaultValue={server.flagUrl || ""}
                placeholder="https://flagcdn.com/..."
                className="w-48"
              />
              {server.flagUrl && (
                <img src={server.flagUrl} alt={server.name} className="w-8 h-6 rounded object-cover" />
              )}
              <Button
                size="sm"
                onClick={() => updateServerMutation.mutate({
                  id: server.id,
                  flagUrl: server.flagUrl || "",
                })}
              >
                Save
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add app/admin/settings/page.tsx
git commit -m "feat(frontend): create admin settings page"
```

---

### Task 10: Build and Test

**Files:**
- Test: All modified files

**Step 1: Run TypeScript check**

```bash
npm run lint
```

Expected: No errors

**Step 2: Build the project**

```bash
npm run build
```

Expected: ✓ Compiled successfully

**Step 3: Test external API**

```bash
# Test getNumber
curl "http://localhost/stubs/handler_api.php?action=getNumber&api_key=USER_TELEGRAM_ID&service=airtel&country=22"

# Expected: ACCESS_NUMBER:ORDER_ID:PHONE_NUMBER or NO_NUMBER/NO_BALANCE/BAD_KEY

# Test getStatus
curl "http://localhost/stubs/handler_api.php?action=getStatus&api_key=USER_TELEGRAM_ID&id=ORDER_ID"

# Expected: STATUS_WAIT_CODE or STATUS_OK:OTP

# Test cancel within timer
curl "http://localhost/stubs/handler_api.php?action=setStatus&api_key=USER_TELEGRAM_ID&id=ORDER_ID&status=8"

# Expected: EARLY_CANCEL_DENIED

# Test cancel after timer
# Wait 2+ minutes then test again
# Expected: ACCESS_CANCEL
```

**Step 4: Commit final changes**

```bash
git add .
git commit -m "test: verify build and API functionality"
```

---

## Verification Checklist

- [ ] Database migration ran successfully
- [ ] Prisma client regenerated
- [ ] External PHP API accessible at `/var/www/stubs/handler_api.php`
- [ ] getNumber action returns correct format
- [ ] getStatus action returns correct format
- [ ] setStatus action enforces cancel timer
- [ ] EARLY_CANCEL_DENIED response works
- [ ] Home page shows prices as ₹X.XX
- [ ] Numbers page shows country flags
- [ ] Cancel button disabled within timer
- [ ] Wallet page shows INR format
- [ ] Admin settings page created
- [ ] Build completes without errors
