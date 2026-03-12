import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { OtpProviderClient } from "@/lib/providers/client";
import { getLatestSms, hasSmsMessages } from "@/lib/sms";
import { generateId } from "@/lib/utils";
import {
  Prisma,
  UserStatus,
  TransactionType,
  TransactionStatus,
  NumberStatus,
  ActiveStatus,
  DiscountType,
} from "@/app/generated/prisma/client";
import type { User } from "@/app/generated/prisma/client";
import { RateLimiterMemory } from "rate-limiter-flexible";

const { Decimal } = Prisma;

// ─── Rate Limiting (30 req/s per user) ───────────────────────────────────────
// Using rate-limiter-flexible with in-memory store.
// For distributed production, swap RateLimiterMemory with RateLimiterRedis.

const rateLimiter = new RateLimiterMemory({
  points: 30, // 30 requests
  duration: 1, // per second
  keyPrefix: "stubs_api",
});

// API key format validation (alphanumeric only, no special chars)
const API_KEY_REGEX = /^[A-Za-z0-9]{32}$/;

// ─── CORS ─────────────────────────────────────────────────────────────────────

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

  try {
    await rateLimiter.consume(user.id);
  } catch (rejRes: unknown) {
    const msBeforeNext =
      rejRes instanceof Error
        ? 1000
        : (rejRes as { msBeforeNext: number }).msBeforeNext;
    return new NextResponse("RATE_LIMIT_EXCEEDED", {
      status: 429,
      headers: {
        ...corsHeaders,
        "Retry-After": String(Math.ceil(msBeforeNext / 1000)),
        "X-RateLimit-Limit": "30",
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(
          Math.ceil((Date.now() + msBeforeNext) / 1000),
        ),
      },
    });
  }

  // ─── UserData auto-repair ──────────────────────────────────────────────────
  const userData = await prisma.userData.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      status: UserStatus.ACTIVE,
      lastLogin: new Date(),
      lastApiCall: new Date(),
      apiCalls: 1,
    },
    update: {},
  });

  if (userData.status !== UserStatus.ACTIVE) {
    return new NextResponse("ACCOUNT_BLOCKED", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (action !== "getBalance" && action !== "getStatus") {
    const settings = await prisma.settings.findUnique({
      where: { id: "1" },
      select: { maintenanceMode: true },
    });
    if (settings?.maintenanceMode) {
      return new NextResponse("ERROR_MAINTENANCE", {
        status: 200,
        headers: corsHeaders,
      });
    }
  }

  prisma.userData
    .update({
      where: { userId: user.id },
      data: { apiCalls: { increment: 1 }, lastApiCall: new Date() },
    })
    .catch(() => {});

  switch (action) {
    case "getBalance":
      return handleGetBalance(user);
    case "getCountries":
      return handleGetCountries();
    case "getServices":
      return handleGetServices(searchParams);
    case "getNumber":
      return handleGetNumber(searchParams, user);
    case "getStatus":
      return handleGetStatus(searchParams, user);
    case "setStatus":
      return handleSetStatus(searchParams, user);
    default:
      return new NextResponse("WRONG_ACTION", {
        status: 200,
        headers: corsHeaders,
      });
  }
}

// ─── getBalance ───────────────────────────────────────────────────────────────

async function handleGetBalance(user: User) {
  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });

  if (!wallet) {
    return new NextResponse("ACCESS_BALANCE:0.00", {
      status: 200,
      headers: corsHeaders,
    });
  }

  return new NextResponse(
    `ACCESS_BALANCE:${wallet.balance.toDecimalPlaces(2).toString()}`,
    { status: 200, headers: corsHeaders },
  );
}

// ─── getCountries ─────────────────────────────────────────────────────────────

async function handleGetCountries() {
  const servers = await prisma.otpServer.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
    select: { id: true, name: true, countryCode: true, countryName: true },
  });

  const response: Record<string, string> = {};
  for (const server of servers) {
    response[server.countryCode] =
      server.countryName || server.name || server.countryCode;
  }

  return new NextResponse(JSON.stringify(response), {
    status: 200,
    headers: corsHeaders,
  });
}

// ─── getServices ──────────────────────────────────────────────────────────────

async function handleGetServices(searchParams: URLSearchParams) {
  const country = searchParams.get("country");

  if (!country) {
    return new NextResponse("BAD_COUNTRY", {
      status: 200,
      headers: corsHeaders,
    });
  }

  const services = await prisma.service.findMany({
    where: {
      isActive: true,
      server: { countryCode: country, isActive: true },
    },
    include: { server: { select: { countryCode: true } } },
    orderBy: { name: "asc" },
  });

  const response: Record<string, string> = {};
  for (const service of services) {
    const key = `${service.code}_${service.server.countryCode}`;
    response[key] = service.name;
  }

  return new NextResponse(JSON.stringify(response), {
    status: 200,
    headers: corsHeaders,
  });
}

// ─── getNumber ────────────────────────────────────────────────────────────────

async function handleGetNumber(searchParams: URLSearchParams, user: User) {
  const serviceCode = searchParams.get("service");
  const countryCode = searchParams.get("country");

  if (!serviceCode)
    return new NextResponse("BAD_SERVICE", {
      status: 200,
      headers: corsHeaders,
    });
  if (!countryCode)
    return new NextResponse("BAD_COUNTRY", {
      status: 200,
      headers: corsHeaders,
    });

  const settings = await prisma.settings.findUnique({ where: { id: "1" } });
  const numberExpiryMinutes = settings?.numberExpiryMinutes ?? 15;

  const service = await prisma.service.findFirst({
    where: {
      code: serviceCode,
      isActive: true,
      server: { countryCode, isActive: true },
    },
    include: { server: { include: { api: true } } },
  });

  if (!service?.server?.api) {
    return new NextResponse("BAD_SERVICE", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (!service.server.isActive || !service.server.api.isActive) {
    return new NextResponse("BAD_SERVICE", {
      status: 200,
      headers: corsHeaders,
    });
  }

  // Idempotency: Check for existing active order
  const existingActive = await prisma.activeNumber.findFirst({
    where: {
      userId: user.id,
      serviceId: service.id,
      activeStatus: ActiveStatus.ACTIVE,
    },
    orderBy: { createdAt: "desc" },
  });

  if (existingActive) {
    const phone = existingActive.phoneNumber ?? "PENDING";
    return new NextResponse(`ACCESS_NUMBER:${existingActive.orderId}:${phone}`, {
      status: 200,
      headers: corsHeaders,
    });
  }

  // FIX: clamp finalPrice to zero — a discount larger than basePrice must
  // never produce a negative value. A negative price passes the
  // `balance.lessThan(finalPrice)` check and causes `decrement(negative)`
  // to INCREMENT the wallet instead, giving the user free balance.
  let finalPrice = service.basePrice;
  const customPrice = await prisma.customPrice.findUnique({
    where: { userId_serviceId: { userId: user.id, serviceId: service.id } },
  });

  if (customPrice) {
    let computed: Prisma.Decimal;
    if (customPrice.type === DiscountType.FLAT) {
      computed = service.basePrice.minus(customPrice.discount);
    } else {
      // PERCENT: guard against discount > 100 as well
      const discountAmount = service.basePrice.mul(
        customPrice.discount.div(100),
      );
      computed = service.basePrice.minus(discountAmount);
    }
    finalPrice = computed.isNegative() ? new Decimal(0) : computed;
  }

  const orderId = generateId();
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
          // totalSpent and totalOtp are incremented only when SMS is received
        },
      });

      if (updatedWallet.balance.isNegative()) throw new Error("NO_BALANCE");

      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: TransactionType.PURCHASE,
          amount: finalPrice,
          status: TransactionStatus.COMPLETED,
          orderId,
          description: `Purchase pending: ${service.name}`,
          metadata: {
            orderId,
            serviceId: service.id,
            serviceName: service.name,
          },
        },
      });

      const activeNumber = await tx.activeNumber.create({
        data: {
          userId: user.id,
          numberId: null,
          phoneNumber: null,
          serverId: service.serverId,
          serviceId: service.id,
          orderId,
          expiresAt,
          price: finalPrice,
          status: NumberStatus.PENDING,
          activeStatus: ActiveStatus.ACTIVE,
          balanceDeducted: true,
        },
      });

      return { activeNumberId: activeNumber.id };
    });

    activeNumberId = txResult.activeNumberId;
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message === "NO_BALANCE" || err.message === "NO_WALLET")
    ) {
      return new NextResponse("NO_BALANCE", {
        status: 200,
        headers: corsHeaders,
      });
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
    const errorCode = result.errorCode;
    if (errorCode === "NO_NUMBER" || errorCode === "NO_NUMBERS") {
      return new NextResponse("NO_NUMBER", {
        status: 200,
        headers: corsHeaders,
      });
    }
    return new NextResponse("ERROR_SQL", { status: 200, headers: corsHeaders });
  }

  // Step 3: Update record with real provider data
  try {
    await prisma.activeNumber.update({
      where: { id: activeNumberId },
      data: {
        numberId: result.orderId,
        phoneNumber: result.phoneNumber,
        lastProviderCheck: new Date(),
        providerStatus: "SUCCESS",
      },
    });

    await prisma.transaction.updateMany({
      where: { orderId },
      data: {
        description: `Purchased ${service.name} number: ${result.phoneNumber}`,
        phoneNumber: result.phoneNumber,
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
 * Refund and DELETE a failed purchase record.
 *
 * FIX (consistency): now matches number.router.ts handleBuyFailure — deletes
 * the activeNumber and the PURCHASE transaction instead of creating a REFUND
 * transaction. This ensures both API paths produce identical history for users:
 * a failed buy leaves no trace in transaction history (clean slate).
 *
 * Previously this function kept the PURCHASE and added a REFUND, while
 * number.router.ts deleted both — inconsistent history depending on which
 * code path was taken.
 *
 * FIX (wallet null): wallet is fetched first and throws if missing so the
 * transaction rolls back and balanceDeducted stays true. The ghost poller
 * will pick it up and retry. Previously a missing wallet silently skipped the
 * REFUND transaction while still deleting the activeNumber, resulting in
 * permanently lost balance with no log entry.
 */
async function handleProviderFailure(
  orderId: string,
  price: Prisma.Decimal,
  userId: string,
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) {
        throw new Error(
          `[stubs/getNumber] Wallet not found for userId=${userId}, orderId=${orderId}`,
        );
      }

      const activeNumber = await tx.activeNumber.findFirst({
        where: { orderId, userId, balanceDeducted: true },
      });
      if (!activeNumber) return;

      await tx.activeNumber.delete({ where: { id: activeNumber.id } });

      // Delete the PURCHASE transaction — consistent with tRPC handleBuyFailure.
      // Failed buys leave no transaction history on either API path.
      await tx.transaction.deleteMany({
        where: { orderId, type: TransactionType.PURCHASE },
      });

      await tx.wallet.update({
        where: { userId },
        data: {
          balance: { increment: price },
          // totalSpent and totalOtp are not touched - they only increment when SMS is received
        },
      });
    });
  } catch (error) {
    console.error("[getNumber] Failed to refund after provider error:", error);
  }
}

// ─── getStatus ────────────────────────────────────────────────────────────────

async function handleGetStatus(searchParams: URLSearchParams, user: User) {
  const orderId = searchParams.get("id");

  if (!orderId) {
    return new NextResponse("NO_ACTIVATION", {
      status: 200,
      headers: corsHeaders,
    });
  }

  const number = await prisma.activeNumber.findFirst({
    where: { orderId, userId: user.id },
  });

  if (!number) {
    return new NextResponse("NO_ACTIVATION", {
      status: 200,
      headers: corsHeaders,
    });
  }

  // Check for SMS messages using SmsMessage table
  const hasSms = await hasSmsMessages(number.id);
  const latestSms = hasSms ? await getLatestSms(number.id) : null;

  if (number.activeStatus === ActiveStatus.CLOSED) {
    if (latestSms) {
      return new NextResponse(`STATUS_OK:${latestSms.content}`, {
        status: 200,
        headers: corsHeaders,
      });
    }
    return new NextResponse("STATUS_CANCEL", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (
    number.activeStatus === ActiveStatus.ACTIVE &&
    new Date() > number.expiresAt
  ) {
    if (number.balanceDeducted && number.status === NumberStatus.PENDING) {
      try {
        await prisma.$transaction(async (tx) => {
          const wallet = await tx.wallet.findUnique({
            where: { userId: user.id },
          });
          if (!wallet) {
            throw new Error(
              `[stubs/getStatus] Wallet not found for userId=${user.id}, orderId=${number.orderId}`,
            );
          }

          const updated = await tx.activeNumber.updateMany({
            where: { id: number.id, balanceDeducted: true },
            data: {
              status: NumberStatus.CANCELLED,
              activeStatus: ActiveStatus.CLOSED,
              balanceDeducted: false,
            },
          });

          if (updated.count === 0) return;

          await tx.wallet.update({
            where: { userId: user.id },
            data: {
              balance: { increment: number.price },
              // totalSpent and totalOtp are not touched - they only increment when SMS is received
            },
          });

          await tx.transaction.create({
            data: {
              walletId: wallet.id,
              type: TransactionType.REFUND,
              amount: number.price,
              status: TransactionStatus.COMPLETED,
              refundOrderId: number.orderId,
              orderId: number.orderId,
              phoneNumber: number.phoneNumber,
              description: "Auto-refund: Number expired without SMS",
              metadata: {
                orderId: number.orderId,
                reason: "expired",
                serviceId: number.serviceId,
              },
            },
          });
        });
      } catch (err) {
        console.error(`[stubs/getStatus] Refund transaction failed:`, err);
      }
    } else {
      await prisma.activeNumber.update({
        where: { id: number.id },
        data: { activeStatus: ActiveStatus.CLOSED },
      });
    }

    return new NextResponse("STATUS_CANCEL", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (latestSms) {
    return new NextResponse(`STATUS_OK:${latestSms.content}`, {
      status: 200,
      headers: corsHeaders,
    });
  }

  return new NextResponse("STATUS_WAIT_CODE", {
    status: 200,
    headers: corsHeaders,
  });
}

// ─── setStatus ────────────────────────────────────────────────────────────────

async function handleSetStatus(searchParams: URLSearchParams, user: User) {
  const orderId = searchParams.get("id");
  const statusStr = searchParams.get("status");

  if (!orderId || !statusStr) {
    return new NextResponse("BAD_ACTION", {
      status: 200,
      headers: corsHeaders,
    });
  }

  const statusCode = parseInt(statusStr, 10);
  if (isNaN(statusCode)) {
    return new NextResponse("BAD_ACTION", {
      status: 200,
      headers: corsHeaders,
    });
  }

  const number = await prisma.activeNumber.findFirst({
    where: { orderId, userId: user.id },
    include: {
      service: { include: { server: { include: { api: true } } } },
    },
  });

  if (!number) {
    return new NextResponse("NO_ACTIVATION", {
      status: 200,
      headers: corsHeaders,
    });
  }

  // Check for SMS messages using SmsMessage table
  const hasSms = await hasSmsMessages(number.id);

  // ── Status 8: Cancel ──────────────────────────────────────────────────────

  if (statusCode === 8) {
    if (number.status !== NumberStatus.PENDING || hasSms) {
      return new NextResponse("ACCESS_ACTIVATION", {
        status: 200,
        headers: corsHeaders,
      });
    }

    if (!number.balanceDeducted) {
      return new NextResponse("ACCESS_ACTIVATION", {
        status: 200,
        headers: corsHeaders,
      });
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

    const wallet = await prisma.wallet.findUnique({
      where: { userId: user.id },
    });
    if (!wallet) {
      return new NextResponse("ERROR_SQL", {
        status: 200,
        headers: corsHeaders,
      });
    }

    const client = new OtpProviderClient({
      apiUrl: number.service.server.api.apiUrl,
      apiKey: number.service.server.api.apiKey,
    });

    const cancelResponse = await client
      .cancelOrder(number.numberId)
      .catch((err) => {
        console.error(
          `[setStatus] Failed to cancel upstream order ${number.numberId}:`,
          err,
        );
        return { success: false };
      });

    await prisma.$transaction(async (tx) => {
      const guard = await tx.activeNumber.updateMany({
        where: { id: number.id, balanceDeducted: true },
        data: {
          status: NumberStatus.CANCELLED,
          activeStatus: ActiveStatus.CLOSED,
          balanceDeducted: false,
        },
      });

      if (guard.count === 0) return;

      await tx.wallet.update({
        where: { userId: user.id },
        data: {
          balance: { increment: number.price },
          // totalSpent and totalOtp are not touched - they only increment when SMS is received
        },
      });

      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: TransactionType.REFUND,
          amount: number.price,
          status: TransactionStatus.COMPLETED,
          refundOrderId: number.orderId,
          orderId: number.orderId,
          phoneNumber: number.phoneNumber,
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

    return new NextResponse("STATUS_CANCEL", {
      status: 200,
      headers: corsHeaders,
    });
  }

  // ── Status 3: Next SMS (multi-SMS) ────────────────────────────────────────

  if (statusCode === 3) {
    if (number.status !== NumberStatus.COMPLETED) {
      return new NextResponse("BAD_STATUS", {
        status: 200,
        headers: corsHeaders,
      });
    }

    const client = new OtpProviderClient({
      apiUrl: number.service.server.api.apiUrl,
      apiKey: number.service.server.api.apiKey,
    });

    try {
      const nextResult = await client.getNextSms(number.numberId);

      if (nextResult.success && nextResult.hasMore) {
        await prisma.activeNumber.update({
          where: { id: number.id },
          data: { activeStatus: ActiveStatus.ACTIVE },
        });
        return new NextResponse("ACCESS_RETRY_GET", {
          status: 200,
          headers: corsHeaders,
        });
      }

      return new NextResponse("ACCESS_ACTIVATION", {
        status: 200,
        headers: corsHeaders,
      });
    } catch {
      return new NextResponse("ERROR_SQL", {
        status: 200,
        headers: corsHeaders,
      });
    }
  }

  return new NextResponse("BAD_STATUS", { status: 200, headers: corsHeaders });
}
