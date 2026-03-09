import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { OtpProviderClient } from "@/lib/providers/client";
import { nanoid } from "nanoid";
import { Prisma, UserStatus } from "@/app/generated/prisma/client";
import type { User } from "@/app/generated/prisma/client";
import { RateLimiterMemory } from "rate-limiter-flexible";

const { Decimal } = Prisma;

// ─── Rate Limiting (30 req/s per user) ─────────────────────────────────────────
// Using rate-limiter-flexible with in-memory store
// For distributed production, swap RateLimiterMemory with RateLimiterRedis

const rateLimiter = new RateLimiterMemory({
  points: 30, // 30 requests
  duration: 1, // per second
  keyPrefix: "stubs_api",
});

// API key format validation (nanoid generates 32 URL-safe chars)
const API_KEY_REGEX = /^[A-Za-z0-9_-]{32}$/;

// ─── CORS ─────────────────────────────────────────────────────────────────────

// SECURITY (M1): stubs API is GET-only and uses api_key query param (not headers).
// Removing Authorization from CORS allowed headers reduces attack surface —
// there is no legitimate reason for a browser to send Authorization here.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get("action");
  const apiKey = searchParams.get("api_key");

  // SECURITY: Validate API key format before DB query
  if (!apiKey || !API_KEY_REGEX.test(apiKey)) {
    return new NextResponse("BAD_KEY", { status: 200, headers: corsHeaders });
  }

  const userApi = await prisma.userApi.findUnique({
    where: { apiKey },
    include: { user: true },
  });

  if (!userApi || !userApi.user || !userApi.isActive) {
    return new NextResponse("BAD_KEY", { status: 200, headers: corsHeaders });
  }

  const user = userApi.user;

  // SECURITY: Enforce rate limit (30 req/s per user)
  try {
    await rateLimiter.consume(user.id);
  } catch (rejRes: unknown) {
    // rejRes is RateLimiterRes when rate limited, Error when store error
    const msBeforeNext =
      rejRes instanceof Error ? 1000 : (rejRes as { msBeforeNext: number }).msBeforeNext;
    return new NextResponse("RATE_LIMIT_EXCEEDED", {
      status: 429,
      headers: {
        ...corsHeaders,
        "Retry-After": String(Math.ceil(msBeforeNext / 1000)),
        "X-RateLimit-Limit": "30",
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil((Date.now() + msBeforeNext) / 1000)),
      },
    });
  }

  // ─── Layer 2: UserData auto-repair ────────────────────────────────────────
  //
  // WHY UPSERT HERE:
  // `databaseHooks.user.create.after` in auth.ts creates UserData on signup,
  // but the hook runs inside better-auth's transaction and can silently fail
  // due to FK visibility timing (the User row isn't committed yet when the
  // hook fires). This upsert is the guaranteed safety net — it auto-creates
  // any missing row so a new user is NEVER falsely returned ACCOUNT_BLOCKED.
  //
  // This is idempotent — existing rows are untouched (update: {}).
  // For blocked/suspended users the existing status is preserved correctly.
  const userData = await prisma.userData.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      // Use enum constant — compile-time safety + matches schema UserStatus enum
      status: UserStatus.ACTIVE,
      lastLogin: new Date(),
      lastApiCall: new Date(),
      apiCalls: 1,
    },
    update: {}, // preserve existing status — don't un-block a blocked user
  });

  // Compare against enum value — UserData.status is a UserStatus enum in schema
  if (userData.status !== UserStatus.ACTIVE) {
    return new NextResponse("ACCOUNT_BLOCKED", { status: 200, headers: corsHeaders });
  }

  // SECURITY (C4): maintenance mode — block all API operations except getBalance
  // so admin can halt number purchases/cancellations during maintenance without
  // taking down the service entirely.
  if (action !== "getBalance" && action !== "getStatus") {
    const settings = await prisma.settings.findUnique({
      where: { id: "1" },
      select: { maintenanceMode: true },
    });
    if (settings?.maintenanceMode) {
      return new NextResponse("ERROR_MAINTENANCE", { status: 200, headers: corsHeaders });
    }
  }

  // Update API call stats (fire-and-forget — not on critical path)
  prisma.userData
    .update({
      where: { userId: user.id },
      data: { apiCalls: { increment: 1 }, lastApiCall: new Date() },
    })
    .catch(() => {});

  switch (action) {
    case "getBalance":   return handleGetBalance(user);
    case "getCountries": return handleGetCountries();
    case "getServices":  return handleGetServices(searchParams);
    case "getNumber":    return handleGetNumber(searchParams, user);
    case "getStatus":    return handleGetStatus(searchParams, user);
    case "setStatus":    return handleSetStatus(searchParams, user);
    default:
      return new NextResponse("WRONG_ACTION", { status: 200, headers: corsHeaders });
  }
}

// ─── getBalance ───────────────────────────────────────────────────────────────
// Returns: ACCESS_BALANCE:{amount}

async function handleGetBalance(user: User) {
  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });

  if (!wallet) {
    return new NextResponse("ACCESS_BALANCE:0.00", { status: 200, headers: corsHeaders });
  }

  // Use toDecimalPlaces instead of Number() to avoid precision loss
  // on large balances (Number() loses precision above ~15 significant digits)
  return new NextResponse(
    `ACCESS_BALANCE:${wallet.balance.toDecimalPlaces(2).toString()}`,
    { status: 200, headers: corsHeaders },
  );
}

// ─── getCountries ─────────────────────────────────────────────────────────────
// Returns: JSON { countryCode: countryName, ... }

async function handleGetCountries() {
  const servers = await prisma.otpServer.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
    select: { id: true, name: true, countryCode: true, countryName: true },
  });

  const response: Record<string, string> = {};
  for (const server of servers) {
    response[server.countryCode] = server.countryName || server.name || server.countryCode;
  }

  return new NextResponse(JSON.stringify(response), { status: 200, headers: corsHeaders });
}

// ─── getServices ──────────────────────────────────────────────────────────────
// Params: country (countryCode)
// Returns: JSON { "serviceCode_countryCode": serviceName, ... }

async function handleGetServices(searchParams: URLSearchParams) {
  const country = searchParams.get("country");

  if (!country) {
    return new NextResponse("BAD_COUNTRY", { status: 200, headers: corsHeaders });
  }

  const services = await prisma.service.findMany({
    where: {
      isActive: true,
      server: { countryCode: country, isActive: true },
    },
    include: {
      server: { select: { countryCode: true } },
    },
    orderBy: { name: "asc" },
  });

  const response: Record<string, string> = {};
  for (const service of services) {
    const key = `${service.code}_${service.server.countryCode}`;
    response[key] = service.name;
  }

  return new NextResponse(JSON.stringify(response), { status: 200, headers: corsHeaders });
}

// ─── getNumber ────────────────────────────────────────────────────────────────

async function handleGetNumber(searchParams: URLSearchParams, user: User) {
  const serviceCode = searchParams.get("service");
  const countryCode = searchParams.get("country");

  if (!serviceCode) return new NextResponse("BAD_SERVICE", { status: 200, headers: corsHeaders });
  if (!countryCode) return new NextResponse("BAD_COUNTRY", { status: 200, headers: corsHeaders });

  const settings = await prisma.settings.findUnique({ where: { id: "1" } });
  const numberExpiryMinutes = settings?.numberExpiryMinutes ?? 20;

  const service = await prisma.service.findFirst({
    where: {
      code: serviceCode,
      isActive: true,
      server: { countryCode, isActive: true },
    },
    include: { server: { include: { api: true } } },
  });

  if (!service?.server?.api) {
    return new NextResponse("BAD_SERVICE", { status: 200, headers: corsHeaders });
  }

  if (!service.server.isActive || !service.server.api.isActive) {
    return new NextResponse("BAD_SERVICE", { status: 200, headers: corsHeaders });
  }

  // Calculate price with custom discount if applicable
  let finalPrice = service.basePrice;
  const customPrice = await prisma.customPrice.findUnique({
    where: { userId_serviceId: { userId: user.id, serviceId: service.id } },
  });

  if (customPrice) {
    if (customPrice.type === "FLAT") {
      finalPrice = service.basePrice.minus(customPrice.discount);
    } else {
      const discountAmount = service.basePrice.mul(customPrice.discount.div(100));
      finalPrice = service.basePrice.minus(discountAmount);
    }
  }

  const orderId = nanoid(16);
  const expiresAt = new Date(Date.now() + numberExpiryMinutes * 60 * 1000);

  // Step 1: Deduct balance + create PENDING record atomically
  let activeNumberId: string;

  try {
    const txResult = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: user.id } });

      if (!wallet) throw new Error("NO_WALLET");
      if (wallet.balance.lessThan(finalPrice)) throw new Error("NO_BALANCE");

      const updatedWallet = await tx.wallet.update({
        where: { userId: user.id },
        data: {
          balance: { decrement: finalPrice },
          totalSpent: { increment: finalPrice },
          totalOtp: { increment: 1 },
        },
      });

      // Extra safety net — should never happen due to the check above
      if (updatedWallet.balance.isNegative()) throw new Error("NO_BALANCE");

      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: "PURCHASE",
          amount: finalPrice,
          status: "COMPLETED",
          description: `Purchase pending: ${service.name}`,
          metadata: { orderId, serviceId: service.id, serviceName: service.name },
        },
      });

      const activeNumber = await tx.activeNumber.create({
        data: {
          userId: user.id,
          numberId: "PENDING",
          phoneNumber: "PENDING",
          serverId: service.serverId,
          serviceId: service.id,
          orderId,
          expiresAt,
          price: finalPrice,
          status: "PENDING",
          activeStatus: "ACTIVE",
          balanceDeducted: true,
        },
      });

      return { activeNumberId: activeNumber.id };
    });

    activeNumberId = txResult.activeNumberId;
  } catch (err) {
    if (err instanceof Error && (err.message === "NO_BALANCE" || err.message === "NO_WALLET")) {
      return new NextResponse("NO_BALANCE", { status: 200, headers: corsHeaders });
    }
    return new NextResponse("ERROR_SQL", { status: 200, headers: corsHeaders });
  }

  // Step 2: Call upstream provider (outside transaction)
  const client = new OtpProviderClient({
    apiUrl: service.server.api.apiUrl,
    apiKey: service.server.api.apiKey,
  });

  let result;
  try {
    result = await client.getNumber(serviceCode, countryCode);
  } catch {
    await handleProviderFailure(orderId, finalPrice, user.id);
    return new NextResponse("ERROR_SQL", { status: 200, headers: corsHeaders });
  }

  if (!result.success || !result.phoneNumber || !result.orderId) {
    await handleProviderFailure(orderId, finalPrice, user.id);
    // Check raw error code from provider (not parsed message)
    const errorCode = result.errorCode;
    if (errorCode === "NO_NUMBER" || errorCode === "NO_NUMBERS") {
      return new NextResponse("NO_API_NUMBER", { status: 200, headers: corsHeaders });
    }
    return new NextResponse("ERROR_SQL", { status: 200, headers: corsHeaders });
  }

  // Step 3: Update record with real provider data
  try {
    await prisma.activeNumber.update({
      where: { id: activeNumberId },
      data: { numberId: result.orderId, phoneNumber: result.phoneNumber },
    });

    await prisma.transaction.updateMany({
      where: { metadata: { path: ["orderId"], equals: orderId } },
      data: {
        description: `Purchased ${service.name} number: ${result.phoneNumber}`,
        metadata: {
          orderId,
          numberId: result.orderId,
          serviceId: service.id,
          serviceName: service.name,
        },
      },
    });
  } catch {
    console.error(
      `[getNumber] Failed to update ActiveNumber ${activeNumberId} with provider data`,
    );
  }

  return new NextResponse(`ACCESS_NUMBER:${orderId}:${result.phoneNumber}`, {
    status: 200,
    headers: corsHeaders,
  });
}

/**
 * Refund and delete a failed purchase record.
 * Sets refundOrderId for DB-level dedup (unique constraint prevents double refunds).
 */
async function handleProviderFailure(
  orderId: string,
  price: Prisma.Decimal,
  userId: string,
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId } });

      const activeNumber = await tx.activeNumber.findFirst({
        where: { orderId, userId, balanceDeducted: true },
      });
      if (!activeNumber) return;

      await tx.activeNumber.delete({ where: { id: activeNumber.id } });

      await tx.wallet.update({
        where: { userId },
        data: {
          balance: { increment: price },
          totalSpent: { decrement: price },
          totalOtp: { decrement: 1 },
        },
      });

      if (wallet) {
        await tx.transaction.create({
          data: {
            walletId: wallet.id,
            type: "REFUND",
            amount: price,
            status: "COMPLETED",
            refundOrderId: orderId,
            description: "No number available from provider",
            metadata: { orderId, reason: "provider_no_number" },
          },
        });
      }
    });
  } catch (error) {
    console.error("[getNumber] Failed to refund after provider error:", error);
  }
}

// ─── getStatus ────────────────────────────────────────────────────────────────

async function handleGetStatus(searchParams: URLSearchParams, user: User) {
  const orderId = searchParams.get("id");

  if (!orderId) {
    return new NextResponse("NO_ACTIVATION", { status: 200, headers: corsHeaders });
  }

  const number = await prisma.activeNumber.findFirst({
    where: { orderId, userId: user.id },
  });

  if (!number) {
    return new NextResponse("NO_ACTIVATION", { status: 200, headers: corsHeaders });
  }

  // Already closed by poller
  if (number.activeStatus === "CLOSED") {
    if (number.smsContent) {
      return new NextResponse(`STATUS_OK:${extractLatestSms(number.smsContent)}`, {
        status: 200,
        headers: corsHeaders,
      });
    }
    return new NextResponse("STATUS_CANCEL", { status: 200, headers: corsHeaders });
  }

  // Expiry safety net (fetch.ts is the primary handler)
  if (number.activeStatus === "ACTIVE" && new Date() > number.expiresAt) {
    if (number.balanceDeducted && number.status === "PENDING") {
      await prisma.$transaction(async (tx) => {
        const wallet = await tx.wallet.findUnique({ where: { userId: user.id } });

        // Atomic guard — prevents double-refund race with the poller
        const updated = await tx.activeNumber.updateMany({
          where: { id: number.id, balanceDeducted: true },
          data: { status: "CANCELLED", activeStatus: "CLOSED", balanceDeducted: false },
        });

        if (updated.count === 0) return; // Already refunded by poller

        if (!wallet) {
          // Close the number regardless so it doesn't get re-processed.
          // Balance loss is logged for manual recovery.
          console.error(
            `[stubs/getStatus] Wallet not found for userId=${user.id}, orderId=${number.orderId} — number closed but balance NOT refunded`,
          );
          return;
        }

        await tx.wallet.update({
          where: { userId: user.id },
          data: {
            balance: { increment: number.price },
            totalSpent: { decrement: number.price },
            totalOtp: { decrement: 1 },
          },
        });

        await tx.transaction.create({
          data: {
            walletId: wallet.id,
            type: "REFUND",
            amount: number.price,
            status: "COMPLETED",
            refundOrderId: number.orderId,
            description: "Auto-refund: Number expired without SMS",
            metadata: { orderId: number.orderId, reason: "expired", serviceId: number.serviceId },
          },
        });
      });
    } else {
      // Has SMS or already refunded — just close
      await prisma.activeNumber.update({
        where: { id: number.id },
        data: { activeStatus: "CLOSED" },
      });
    }

    return new NextResponse("STATUS_CANCEL", { status: 200, headers: corsHeaders });
  }

  if (number.smsContent) {
    return new NextResponse(`STATUS_OK:${extractLatestSms(number.smsContent)}`, {
      status: 200,
      headers: corsHeaders,
    });
  }

  return new NextResponse("STATUS_WAIT_CODE", { status: 200, headers: corsHeaders });
}

/**
 * Extract the latest SMS text from smsContent JSON field.
 * Handles array [{ content, receivedAt }] and legacy string formats.
 */
function extractLatestSms(smsContent: unknown): string {
  if (Array.isArray(smsContent) && smsContent.length > 0) {
    const latest = smsContent[smsContent.length - 1];
    if (typeof latest === "object" && latest !== null && "content" in latest) {
      return String((latest as { content: string }).content);
    }
    return String(latest);
  }
  return String(smsContent);
}

// ─── setStatus ────────────────────────────────────────────────────────────────

async function handleSetStatus(searchParams: URLSearchParams, user: User) {
  const orderId = searchParams.get("id");
  const statusStr = searchParams.get("status");

  if (!orderId || !statusStr) {
    return new NextResponse("BAD_ACTION", { status: 200, headers: corsHeaders });
  }

  const statusCode = parseInt(statusStr, 10);
  if (isNaN(statusCode)) {
    return new NextResponse("BAD_ACTION", { status: 200, headers: corsHeaders });
  }

  const number = await prisma.activeNumber.findFirst({
    where: { orderId, userId: user.id },
    include: {
      service: { include: { server: { include: { api: true } } } },
    },
  });

  if (!number) {
    return new NextResponse("NO_ACTIVATION", { status: 200, headers: corsHeaders });
  }

  // ── Status 8: Cancel ──────────────────────────────────────────────────────

  if (statusCode === 8) {
    if (number.status !== "PENDING" || number.smsContent) {
      return new NextResponse("ACCESS_ACTIVATION", { status: 200, headers: corsHeaders });
    }

    if (!number.balanceDeducted) {
      return new NextResponse("ACCESS_ACTIVATION", { status: 200, headers: corsHeaders });
    }

    const settings = await prisma.settings.findUnique({ where: { id: "1" } });
    const minCancelMs = (settings?.minCancelMinutes ?? 2) * 60 * 1000;
    const elapsed = Date.now() - number.createdAt.getTime();

    if (elapsed < minCancelMs) {
      const remainingSeconds = Math.ceil((minCancelMs - elapsed) / 1000);
      return new NextResponse(`EARLY_CANCEL_DENIED:${remainingSeconds}`, {
        status: 200,
        headers: corsHeaders,
      });
    }

    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    if (!wallet) {
      return new NextResponse("ERROR_SQL", { status: 200, headers: corsHeaders });
    }

    const client = new OtpProviderClient({
      apiUrl: number.service.server.api.apiUrl,
      apiKey: number.service.server.api.apiKey,
    });

    const cancelResponse = await client.cancelOrder(number.numberId).catch((err) => {
      console.error(`[setStatus] Failed to cancel upstream order ${number.numberId}:`, err);
      return { success: false };
    });

    // updateMany with balanceDeducted=true guard INSIDE the transaction.
    // Prevents double-refund race with the poller's handleAutoRefund.
    await prisma.$transaction(async (tx) => {
      const guard = await tx.activeNumber.updateMany({
        where: { id: number.id, balanceDeducted: true },
        data: { status: "CANCELLED", activeStatus: "CLOSED", balanceDeducted: false },
      });

      if (guard.count === 0) return; // Poller already refunded

      await tx.wallet.update({
        where: { userId: user.id },
        data: {
          balance: { increment: number.price },
          totalSpent: { decrement: number.price },
          totalOtp: { decrement: 1 },
        },
      });

      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: "REFUND",
          amount: number.price,
          status: "COMPLETED",
          refundOrderId: number.orderId,
          description: `Cancelled: ${number.service.name} - ${number.phoneNumber}`,
          metadata: {
            orderId: number.orderId,
            numberId: number.numberId,
            serviceId: number.serviceId,
            serviceName: number.service.name,
            cancelReason: "user_requested",
            providerCancelSuccess: cancelResponse.success,
          },
        },
      });
    });

    return new NextResponse("STATUS_CANCEL", { status: 200, headers: corsHeaders });
  }

  // ── Status 3: Next SMS (multi-SMS) ────────────────────────────────────────

  if (statusCode === 3) {
    if (number.status !== "COMPLETED") {
      return new NextResponse("BAD_STATUS", { status: 200, headers: corsHeaders });
    }

    const client = new OtpProviderClient({
      apiUrl: number.service.server.api.apiUrl,
      apiKey: number.service.server.api.apiKey,
    });

    try {
      const nextResult = await client.getNextSms(number.numberId);

      if (nextResult.success && nextResult.hasMore) {
        // Keep status=COMPLETED (not PENDING) so the poller's multi-SMS branch
        // correctly handles it (checks smsContent && status===COMPLETED).
        // Resetting to PENDING would cause the poller to re-deliver the old SMS.
        await prisma.activeNumber.update({
          where: { id: number.id },
          data: { status: "COMPLETED", activeStatus: "ACTIVE" },
        });
        return new NextResponse("ACCESS_RETRY_GET", { status: 200, headers: corsHeaders });
      }

      return new NextResponse("ACCESS_ACTIVATION", { status: 200, headers: corsHeaders });
    } catch {
      return new NextResponse("ERROR_SQL", { status: 200, headers: corsHeaders });
    }
  }

  return new NextResponse("BAD_STATUS", { status: 200, headers: corsHeaders });
}