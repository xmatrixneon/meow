# External API Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a full external stubs API for MeowSMS that proxies requests to upstream OTP providers, manages user balance, and provides service discovery.

**Architecture:** Your external API (`/api/stubs/handler_api.php`) functions as a proxy/reseller API. It validates API keys (telegramId), deducts balance on purchases, calls upstream provider APIs (cattysms.shop, etc.), and manages orders in the database.

**Tech Stack:** Next.js 16, tRPC, Prisma, PostgreSQL, TypeScript

---

## Task Structure

### Task 1: Update Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma`

**Steps:**
1. Add `user_api` table for mapping api_key to user_id
2. Add `user_data` table for user status tracking
3. Add indexes for performance

**Schema Changes:**
```prisma
model user_api {
  id    String   @id @default(cuid())
  userId String @unique
  apiKey String @unique  // User's telegramId
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model user_data {
  id    String   @id @default(cuid())
  userId String @unique
  status Int @default(1) // 1=active, 0=blocked
  lastLogin DateTime?
}
```

---

### Task 2: Extend OtpProviderClient

**Files:**
- Modify: `lib/providers/client.ts`

**Steps:**
1. Add `getNumbersStatus()` method for stock checking
2. Add `getPrices()` method for price checking
3. Ensure proper error handling

**Methods to Add:**
```typescript
async getNumbersStatus(country: string): Promise<GetNumbersStatusResponse>
async getPrices(country: string): Promise<GetPricesResponse>
```

---

### Task 3: Implement getBalance

**Files:**
- Modify: `app/api/stubs/handler_api.php/route.ts`

**Steps:**
1. Add `getBalance` case to switch statement
2. Query user_wallet by userId
3. Return `ACCESS_BALANCE:amount` format

**Implementation:**
```typescript
case "getBalance":
  return handleGetBalance(searchParams, user);

async function handleGetBalance(searchParams: URLSearchParams, user: UserWithWallet) {
  const wallet = await prisma.wallet.findUnique({
    where: { userId: user.id },
  });
  if (!wallet) {
    return new NextResponse("ACCESS_BALANCE:0.00", { status: 200, headers: corsHeaders });
  }
  return new NextResponse(`ACCESS_BALANCE:${wallet.balance}`, { status: 200, headers: corsHeaders });
}
```

---

### Task 4: Implement getCountries

**Files:**
- Modify: `app/api/stubs/handler_api.php/route.ts`

**Steps:**
1. Add `getCountries` case to switch statement
2. Query otp_server table
3. Return JSON with server IDs as keys

**Implementation:**
```typescript
case "getCountries":
  return handleGetCountries(user);

async function handleGetCountries(user: UserWithWallet) {
  const servers = await prisma.otpServer.findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
  });

  const response: Record<string, string> = {};
  servers.forEach(server => {
    response[server.id] = server.name || server.countryCode || server.id;
  });

  return new NextResponse(JSON.stringify(response), { status: 200, headers: corsHeaders });
}
```

---

### Task 5: Implement getServices

**Files:**
- Modify: `app/api/stubs/handler_api.php/route.ts`

**Steps:**
1. Add `getServices` case to switch statement
2. Query service table filtered by country
3. Return JSON with service IDs as keys

**Implementation:**
```typescript
case "getServices":
  return handleGetServices(searchParams, user);

async function handleGetServices(searchParams: URLSearchParams, user: UserWithWallet) {
  const country = searchParams.get("country");

  if (!country) {
    return new NextResponse("BAD_COUNTRY", { status: 200, headers: corsHeaders });
  }

  const services = await prisma.service.findMany({
    where: {
      server: { countryCode: country, isActive: true },
      isActive: true,
    },
    include: {
      server: {
        select: { id: true, name: true, countryCode: true },
      },
    },
  });

  const response: Record<string, string> = {};
  services.forEach(service => {
    const key = `${service.serverId}_${service.server?.countryCode || ''}`;
    response[key] = service.name;
  });

  return new NextResponse(JSON.stringify(response), { status: 200, headers: corsHeaders });
}
```

---

### Task 6: Implement getNumber with Provider API

**Files:**
- Modify: `app/api/stubs/handler_api.php/route.ts`

**Steps:**
1. Update `handleGetNumber` to call upstream provider
2. Deduct balance atomically with transaction
3. Create order in database
4. Return `ACCESS_NUMBER:orderId:phone` format

**Implementation:**
```typescript
async function handleGetNumber(searchParams: URLSearchParams, user: UserWithWallet) {
  const serviceCode = searchParams.get("service");
  const countryCode = searchParams.get("country");

  if (!serviceCode || !countryCode) {
    return new NextResponse("BAD_SERVICE", { status: 200, headers: corsHeaders });
  }

  // Get user status
  const userData = await prisma.userData.findUnique({
    where: { userId: user.id },
  });

  if (!userData || userData.status !== 1) {
    return new NextResponse("ACCOUNT_BLOCKED", { status: 200, headers: corsHeaders });
  }

  // Get service
  const service = await prisma.service.findFirst({
    where: {
      code: serviceCode,
      server: { countryCode, isActive: true },
    },
    include: {
      server: {
        include: { api: true },
      },
    },
  });

  if (!service || !service.server) {
    return new NextResponse("BAD_SERVICE", { status: 200, headers: corsHeaders });
  }

  // Get wallet
  let wallet = await prisma.wallet.findUnique({
    where: { userId: user.id },
  });

  if (!wallet) {
    wallet = await prisma.wallet.create({
      data: { userId: user.id, balance: 0, totalSpent: 0, totalRecharge: 0, totalOtp: 0 },
    });
  }

  const price = Number(service.basePrice);

  if (Number(wallet.balance) < price) {
    return new NextResponse("NO_BALANCE", { status: 200, headers: corsHeaders });
  }

  // Call upstream provider
  const client = new OtpProviderClient({
    apiUrl: service.server.api.apiUrl,
    apiKey: service.server.api.apiKey,
  });

  const result = await client.getNumber(serviceCode, countryCode);

  if (!result.success || !result.phoneNumber) {
    if (result.error?.includes("NO_NUMBER") || result.error?.includes("NO_NUMBERS")) {
      return new NextResponse("NO_API_NUMBER", { status: 200, headers: corsHeaders });
    }
    return new NextResponse("SERVER_ERROR", { status: 200, headers: corsHeaders });
  }

  // Atomic transaction: deduct balance + create order
  const orderId = nanoid();
  const phoneNumber = result.phoneNumber;
  const numberId = result.orderId || '';

  await prisma.$transaction([
    prisma.wallet.update({
      where: { userId: user.id },
      data: {
        balance: { decrement: service.basePrice },
        totalSpent: { increment: service.basePrice },
        totalOtp: { increment: 1 },
      },
    }),
    prisma.activeNumber.create({
      data: {
        userId: user.id,
        numberId,
        phoneNumber,
        serverId: service.serverId,
        serviceId: service.id,
        orderId,
        buyTime: new Date(),
        price: service.basePrice,
        serviceName: service.name,
        status: 'PENDING',
        activeStatus: 'ACTIVE',
      },
    }),
  ]);

  return new NextResponse(`ACCESS_NUMBER:${orderId}:${phoneNumber}`, { status: 200, headers: corsHeaders });
}
```

---

### Task 7: Implement getStatus with Provider API

**Files:**
- Modify: `app/api/stubs/handler_api.php/route.ts`
- Modify: `app/api/stubs/handler_api.php/route.ts`

**Steps:**
1. Update `handleGetStatus` to call upstream provider API
2. Update database with new SMS when received
3. Return appropriate status codes

**Implementation:**
```typescript
async function handleGetStatus(searchParams: URLSearchParams, user: UserWithWallet) {
  const orderId = searchParams.get("id");

  if (!orderId) {
    return new NextResponse("NO_ACTIVATION", { status: 200, headers: corsHeaders });
  }

  const order = await prisma.activeNumber.findFirst({
    where: { orderId, userId: user.id },
    include: {
      service: {
        include: {
          server: {
            include: { api: true },
          },
        },
      },
    },
  });

  if (!order) {
    return new NextResponse("NO_ACTIVATION", { status: 200, headers: corsHeaders });
  }

  // Call upstream provider for SMS status
  const client = new OtpProviderClient({
    apiUrl: order.service.server.api.apiUrl,
    apiKey: order.service.server.api.apiKey,
  });

  const status = await client.getStatus(order.numberId);

  if (status.status === 'WAITING') {
    return new NextResponse("STATUS_WAIT_CODE", { status: 200, headers: corsHeaders });
  }

  if (status.status === 'RECEIVED' && status.sms) {
    // Update database with SMS
    const currentSms = Array.isArray(order.smsContent) ? order.smsContent :
      (typeof order.smsContent === 'string' ? [{ content: order.smsContent, receivedAt: new Date().toISOString() }] : []);

    const newSms = [...currentSms, { content: status.sms, receivedAt: new Date().toISOString() }];

    await prisma.activeNumber.update({
      where: { id: order.id },
      data: {
        smsContent: newSms,
        status: 'COMPLETED',
      },
    });

    return new NextResponse(`STATUS_OK:${status.sms}`, { status: 200, headers: corsHeaders });
  }

  if (status.status === 'CANCELLED') {
    return new NextResponse("STATUS_CANCEL", { status: 200, headers: corsHeaders });
  }

  return new NextResponse("STATUS_WAIT_CODE", { status: 200, headers: corsHeaders });
}
```

---

### Task 8: Implement setStatus with Multi-SMS Support

**Files:**
- Modify: `app/api/stubs/handler_api.php/route.ts`

**Steps:**
1. Update `handleSetStatus` for status=3 (next SMS)
2. Add upstream provider API call for status=3
3. Update response codes

**Implementation:**
```typescript
async function handleSetStatus(searchParams: URLSearchParams, user: UserWithWallet) {
  const orderId = searchParams.get("id");
  const statusStr = searchParams.get("status");

  if (!orderId || !statusStr) {
    return new NextResponse("BAD_ACTION", { status: 200, headers: corsHeaders });
  }

  const statusCode = parseInt(statusStr);

  const order = await prisma.activeNumber.findFirst({
    where: { orderId, userId: user.id },
    include: {
      service: {
        include: {
          server: {
            include: { api: true },
          },
        },
      },
    },
  });

  if (!order) {
    return new NextResponse("NO_ACTIVATION", { status: 200, headers: corsHeaders });
  }

  const client = new OtpProviderClient({
    apiUrl: order.service.server.api.apiUrl,
    apiKey: order.service.server.api.apiKey,
  });

  // Status 8 = Cancel
  if (statusCode === 8) {
    if (order.status !== 'PENDING') {
      return new NextResponse("ACCESS_ACTIVATION", { status: 200, headers: corsHeaders });
    }

    // Check cancel timer
    const settings = await prisma.settings.findUnique({ where: { id: "1" } });
    const minCancelMinutes = settings?.minCancelMinutes ?? 2;
    const timeSincePurchase = Date.now() - order.buyTime.getTime();
    const minCancelMs = minCancelMinutes * 60 * 1000;

    if (timeSincePurchase < minCancelMs) {
      return new NextResponse("EARLY_CANCEL_DENIED", { status: 200, headers: corsHeaders });
    }

    // Call upstream provider to cancel
    await client.cancelOrder(order.numberId);

    // Refund
    if (user.wallet) {
      await prisma.$transaction([
        prisma.activeNumber.update({
          where: { id: order.id },
          data: { status: 'CANCELLED', activeStatus: 'CLOSED' },
        }),
        prisma.wallet.update({
          where: { userId: user.id },
          data: {
            balance: { increment: order.price },
            totalSpent: { decrement: order.price },
            totalOtp: { decrement: 1 },
          },
        }),
      ]);
    }

    return new NextResponse("STATUS_CANCEL", { status: 200, headers: corsHeaders });
  }

  // Status 3 = Next SMS (multi-SMS)
  if (statusCode === 3) {
    // Call upstream provider to request next SMS
    const nextResult = await client.getNextSms(order.numberId);

    if (nextResult.success && nextResult.hasMore) {
      return new NextResponse("ACCESS_RETRY_GET", { status: 200, headers: corsHeaders });
    }

    return new NextResponse("ACCESS_RETRY_GET", { status: 200, headers: corsHeaders });
  }

  return new NextResponse("BAD_STATUS", { status: 200, headers: corsHeaders });
}
```

---

### Task 9: Update main GET handler

**Files:**
- Modify: `app/api/stubs/handler_api.php/route.ts`

**Steps:**
1. Update GET function to route all cases
2. Ensure proper error handling
3. Update main switch statement

**Implementation:**
```typescript
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get("action");
  const apiKey = searchParams.get("api_key");

  // Validate API key and get user
  if (!apiKey) {
    return new NextResponse("BAD_KEY", { status: 200, headers: corsHeaders });
  }

  // Find user and map API key
  const userApi = await prisma.userApi.findUnique({
    where: { apiKey },
    include: { user: true },
  });

  if (!userApi || !userApi.user) {
    return new NextResponse("BAD_KEY", { status: 200, headers: corsHeaders });
  }

  const user = userApi.user;

  // Check user status
  const userData = await prisma.userData.findUnique({
    where: { userId: user.id },
  });

  if (!userData || userData.status !== 1) {
    return new NextResponse("ACCOUNT_BLOCKED", { status: 200, headers: corsHeaders });
  }

  switch (action) {
    case "getNumber":
      return handleGetNumber(searchParams, user);
    case "getStatus":
      return handleGetStatus(searchParams, user);
    case "setStatus":
      return handleSetStatus(searchParams, user);
    case "getBalance":
      return handleGetBalance(user);
    case "getCountries":
      return handleGetCountries(user);
    case "getServices":
      return handleGetServices(searchParams, user);
    default:
      return new NextResponse("WRONG_ACTION", { status: 200, headers: corsHeaders });
  }
}
```

---

### Task 10: Run Database Migration

**Steps:**
1. Create migration for user_api and user_data tables
2. Run prisma migrate

**Commands:**
```bash
npx prisma migrate dev --name add_api_key_tables
```

---

### Task 11: Build and Test

**Steps:**
1. Build the application
2. Test each endpoint with curl

**Test Commands:**
```bash
# Test getBalance
curl "http://localhost:3000/api/stubs/handler_api.php?action=getBalance&api_key=YOUR_TELEGRAM_ID"

# Test getCountries
curl "http://localhost:3000/api/stubs/handler_api.php?action=getCountries&api_key=YOUR_TELEGRAM_ID"

# Test getServices
curl "http://localhost:3000/api/stubs/handler_api.php?action=getServices&api_key=YOUR_TELEGRAM_ID&country=22"

# Test getStatus
curl "http://localhost:3000/api/stubs/handler_api.php?action=getStatus&api_key=YOUR_TELEGRAM_ID&id=ORDER_ID"

# Test getNumber
curl "http://localhost:3000/api/stubs/handler_api.php?action=getNumber&api_key=YOUR_TELEGRAM_ID&service=airtel&country=22"

# Test setStatus (cancel)
curl "http://localhost:3000/api/stubs/handler_api.php?action=setStatus&api_key=YOUR_TELEGRAM_ID&id=ORDER_ID&status=8"

# Test setStatus (multi-SMS)
curl "http://localhost:3000/api/stubs/handler_api.php?action=setStatus&api_key=YOUR_TELEGRAM_ID&id=ORDER_ID&status=3"
```

---

## File Summary

| File | Purpose |
|------|----------|
| `prisma/schema.prisma` | Add user_api, user_data tables |
| `lib/providers/client.ts` | Add getNumbersStatus, getPrices methods |
| `app/api/stubs/handler_api.php/route.ts` | Full rewrite with all endpoints |

## Testing Checklist

- [ ] API key validation works
- [ ] getBalance returns correct balance
- [ ] getCountries returns server list
- [ ] getServices returns service list
- [ ] getNumber purchases and deducts balance
- [ ] getStatus checks upstream API
- [ ] setStatus with status=8 cancels and refunds
- [ ] setStatus with status=3 requests next SMS
- [ ] All error codes return correctly
- [ ] CORS headers present on all responses

## Success Criteria

- All 6 API endpoints implemented and working
- Balance deduction is atomic
- All API responses follow stubs protocol format
- Upstream provider calls use proper error handling
- Tests pass for all endpoints
- No TypeScript or build errors
