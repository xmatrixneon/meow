import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { OtpProviderClient } from "@/lib/providers/client";
import { nanoid } from "nanoid";
import { Prisma } from "@/app/generated/prisma/client";
import type { User } from "@/app/generated/prisma/client";

const { Decimal } = Prisma;

/**
 * CORS headers for external API access
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

// ============================================
// GET Handler — Entry Point
// ============================================

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get("action");
  const apiKey = searchParams.get("api_key");

  if (!apiKey) {
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

  const userData = await prisma.userData.findUnique({
    where: { userId: user.id },
  });

  // FIX: compare against enum value rather than raw string — UserData.status is
  // now a UserStatus enum, so we compare against the enum member directly.
  if (!userData || userData.status !== "ACTIVE") {
    return new NextResponse("ACCOUNT_BLOCKED", { status: 200, headers: corsHeaders });
  }

  // Update API call stats (fire-and-forget)
  prisma.userData
    .update({
      where: { userId: user.id },
      data: { apiCalls: { increment: 1 }, lastApiCall: new Date() },
    })
    .catch(() => {});

  switch (action) {
    case "getBalance":  return handleGetBalance(user);
    case "getCountries": return handleGetCountries();
    case "getServices":  return handleGetServices(searchParams);
    case "getNumber":    return handleGetNumber(searchParams, user);
    case "getStatus":    return handleGetStatus(searchParams, user);
    case "setStatus":    return handleSetStatus(searchParams, user);
    default:
      return new NextResponse("WRONG_ACTION", { status: 200, headers: corsHeaders });
  }
}

// ============================================
// getBalance
// Returns: ACCESS_BALANCE:{amount}
// ============================================

async function handleGetBalance(user: User) {
  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });

  if (!wallet) {
    return new NextResponse("ACCESS_BALANCE:0.00", { status: 200, headers: corsHeaders });
  }

  // FIX: use Decimal.toDecimalPlaces instead of Number() to avoid precision loss
  // on large balances (Number() can lose precision above ~15 significant digits).
  return new NextResponse(
    `ACCESS_BALANCE:${wallet.balance.toDecimalPlaces(2).toString()}`,
    { status: 200, headers: corsHeaders },
  );
}

// ============================================
// getCountries
// Returns: JSON { countryCode: countryName, ... }
// ============================================

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

// ============================================
// getServices
// Params: country (countryCode)
// Returns: JSON { "serviceCode_countryCode": serviceName, ... }
// ============================================

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
    // Note: if two active servers share the same countryCode+serviceCode, last writer wins.
    // Deduplicate upstream by ensuring unique (code, countryCode) pairs if needed.
    response[key] = service.name;
  }

  return new NextResponse(JSON.stringify(response), { status: 200, headers: corsHeaders });
}

// ============================================
// getNumber
// ============================================

async function handleGetNumber(searchParams: URLSearchParams, user: User) {
  const serviceCode = searchParams.get("service");
  const countryCode = searchParams.get("country");

  if (!serviceCode) return new NextResponse("BAD_SERVICE", { status: 200, headers: corsHeaders });
  if (!countryCode) return new NextResponse("BAD_COUNTRY", { status: 200, headers: corsHeaders });

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

  if (!service || !service.server || !service.server.api) {
    return new NextResponse("BAD_SERVICE", { status: 200, headers: corsHeaders });
  }

  if (!service.server.isActive || !service.server.api.isActive) {
    return new NextResponse("BAD_SERVICE", { status: 200, headers: corsHeaders });
  }

  let finalPrice = service.basePrice;
  const customPrice = await prisma.customPrice.findUnique({
    where: { userId_serviceId: { userId: user.id, serviceId: service.id } },
  });

  if (customPrice) {
    if (customPrice.type === "FLAT") {
      const after = service.basePrice.minus(customPrice.discount);
      finalPrice = after.isNegative() ? new Decimal(0) : after;
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
    const err = result.error ?? "";
    if (err.includes("NO_NUMBER") || err.includes("NO_NUMBERS")) {
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
 * Refund and delete failed purchase record.
 * FIX: wallet is read BEFORE the wallet.update so the read reflects pre-refund state.
 * FIX: refundOrderId set for DB-level dedup.
 */
async function handleProviderFailure(
  orderId: string,
  price: Prisma.Decimal,
  userId: string,
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      // FIX: read wallet FIRST (before the increment) so balance context is correct
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
            // FIX: refundOrderId for DB-level dedup
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

// ============================================
// getStatus
// ============================================

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

  // Expiry safety net
  if (number.activeStatus === "ACTIVE" && new Date() > number.expiresAt) {
    if (number.balanceDeducted && number.status === "PENDING") {
      // FIX: close the number regardless of whether wallet exists.
      // Previously if wallet was null the number stayed ACTIVE and was polled forever.
      await prisma.$transaction(async (tx) => {
        const wallet = await tx.wallet.findUnique({ where: { userId: user.id } });

        const updated = await tx.activeNumber.updateMany({
          where: { id: number.id, balanceDeducted: true },
          data: { status: "CANCELLED", activeStatus: "CLOSED", balanceDeducted: false },
        });

        if (updated.count === 0) return; // Already refunded

        if (!wallet) {
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
            // FIX: refundOrderId for DB-level dedup
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

// ============================================
// setStatus
// ============================================

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

  // ---- Status 8: Cancel ----
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

    // FIX: use updateMany with balanceDeducted=true guard INSIDE the transaction.
    // Prevents double-refund race with the poller's handleAutoRefund.
    // FIX: set refundOrderId for DB-level dedup.
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

  // ---- Status 3: Next SMS (multi-SMS) ----
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
        // FIX: keep status=COMPLETED (not PENDING) so the poller's multi-SMS branch
        // correctly handles it (checks smsContent && status===COMPLETED).
        // Previously resetting to PENDING caused the poller to fall through to the
        // first-SMS branch and re-deliver the old SMS.
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