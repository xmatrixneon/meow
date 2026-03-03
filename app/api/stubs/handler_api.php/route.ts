import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { OtpProviderClient } from "@/lib/providers/client";
import { nanoid } from "nanoid";
import type { Wallet } from "@/app/generated/prisma/client";

/**
 * CORS headers for external API access
 * Allows external clients to call the stubs API from any origin
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * Handle preflight OPTIONS requests
 */
export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

type UserWithWallet = {
  id: string;
  telegramId: string;
  wallet: Wallet | null;
};

/**
 * GET handler for stubs API
 * Supports actions: getNumber, getStatus, setStatus
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get("action");
  const apiKey = searchParams.get("api_key");

  // Validate API key
  if (!apiKey) {
    return new NextResponse("BAD_KEY", { status: 200, headers: corsHeaders });
  }

  // Find user by telegramId (using telegramId as API key for now)
  const user = await prisma.user.findUnique({
    where: { telegramId: apiKey },
    include: { wallet: true },
  });

  if (!user) {
    return new NextResponse("BAD_KEY", { status: 200, headers: corsHeaders });
  }

  // Check if user is banned (you can add a banned field to User model)
  // if (user.banned) {
  //   return new NextResponse("BANNED", { status: 200, headers: corsHeaders });
  // }

  switch (action) {
    case "getNumber":
      return handleGetNumber(searchParams, user);
    case "getStatus":
      return handleGetStatus(searchParams, user);
    case "setStatus":
      return handleSetStatus(searchParams, user);
    default:
      return new NextResponse("WRONG_ACTION", { status: 200, headers: corsHeaders });
  }
}

async function handleGetNumber(searchParams: URLSearchParams, user: UserWithWallet) {
  const serviceCode = searchParams.get("service");
  const countryCode = searchParams.get("country");

  if (!serviceCode) {
    return new NextResponse("BAD_SERVICE", { status: 200, headers: corsHeaders });
  }
  if (!countryCode) {
    return new NextResponse("BAD_COUNTRY", { status: 200, headers: corsHeaders });
  }

  // Get settings for expiry time
  const settings = await prisma.settings.findUnique({
    where: { id: "1" },
  });
  const numberExpiryMinutes = settings?.numberExpiryMinutes ?? 15;

  // Find service and server
  const service = await prisma.service.findFirst({
    where: {
      code: serviceCode,
      isActive: true,
      server: {
        countryCode: countryCode,
        isActive: true,
      },
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

  // Check wallet
  if (!user.wallet || Number(user.wallet.balance) < Number(service.basePrice)) {
    return new NextResponse("NO_BALANCE", { status: 200, headers: corsHeaders });
  }

  // Call provider API
  const client = new OtpProviderClient({
    apiUrl: service.server.api.apiUrl,
    apiKey: service.server.api.apiKey,
  });

  const result = await client.getNumber(serviceCode, countryCode);

  if (!result.success) {
    if (result.error?.includes("NO_NUMBERS") || result.error?.includes("No phone numbers")) {
      return new NextResponse("NO_NUMBER", { status: 200, headers: corsHeaders });
    }
    return new NextResponse(result.error || "ERROR", { status: 200, headers: corsHeaders });
  }

  // Create order in transaction
  const orderId = nanoid();
  const expiresAt = new Date(Date.now() + numberExpiryMinutes * 60 * 1000);

  try {
    await prisma.$transaction([
      prisma.activeNumber.create({
        data: {
          userId: user.id,
          serviceId: service.id,
          orderId,
          numberId: result.orderId!,
          phoneNumber: result.phoneNumber!,
          serverId: service.serverId,
          price: service.basePrice,
          status: "PENDING",
          activeStatus: "ACTIVE",
          expiresAt,
        },
      }),
      prisma.wallet.update({
        where: { userId: user.id },
        data: {
          balance: { decrement: service.basePrice },
          totalSpent: { increment: service.basePrice },
          totalOtp: { increment: 1 },
        },
      }),
      prisma.transaction.create({
        data: {
          walletId: user.wallet.id,
          type: "PURCHASE",
          amount: service.basePrice,
          status: "COMPLETED",
          description: `Purchased ${service.name} number`,
        },
      }),
    ]);

    return new NextResponse(
      `ACCESS_NUMBER:${orderId}:${result.phoneNumber}`,
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error("Error creating order:", error);
    return new NextResponse("ERROR", { status: 200, headers: corsHeaders });
  }
}

async function handleGetStatus(searchParams: URLSearchParams, user: UserWithWallet) {
  const orderId = searchParams.get("id");

  if (!orderId) {
    return new NextResponse("NO_ACTIVATION", { status: 200, headers: corsHeaders });
  }

  const number = await prisma.activeNumber.findFirst({
    where: { orderId, userId: user.id },
    include: { service: { include: { server: { include: { api: true } } } } },
  });

  if (!number) {
    return new NextResponse("NO_ACTIVATION", { status: 200, headers: corsHeaders });
  }

  // Check expiry - auto-expire if time has passed
  if (number.activeStatus === "ACTIVE" && new Date() > number.expiresAt) {
    await prisma.activeNumber.update({
      where: { id: number.id },
      data: { activeStatus: "CLOSED" },
    });
    number.activeStatus = "CLOSED";
  }

  // Return SMS content if already received
  if (number.smsContent) {
    // Check if there are more SMS (multi-SMS support)
    if (number.service?.server?.api && number.activeStatus === "ACTIVE") {
      const client = new OtpProviderClient({
        apiUrl: number.service.server.api.apiUrl,
        apiKey: number.service.server.api.apiKey,
      });

      // Check if provider has more SMS
      const nextSmsCheck = await client.getNextSms(number.numberId);

      if (nextSmsCheck.success && nextSmsCheck.hasMore) {
        // More SMS available - fetch it
        const additionalStatus = await client.getStatus(number.numberId);

        if (additionalStatus.status === "RECEIVED" && additionalStatus.sms) {
          // Append additional SMS to array
          const currentSms = Array.isArray(number.smsContent) ? number.smsContent :
            (typeof number.smsContent === 'string' ? [{ content: number.smsContent, receivedAt: new Date().toISOString() }] : []);
          await prisma.activeNumber.update({
            where: { id: number.id },
            data: {
              smsContent: [...currentSms, {
                content: additionalStatus.sms,
                receivedAt: new Date().toISOString(),
              }],
            },
          });

          // Notify provider we received it
          await client.finishOrder(number.numberId);

          // Return the new SMS
          return new NextResponse(`STATUS_OK:${additionalStatus.sms}`, { status: 200, headers: corsHeaders });
        }
      }
    }

    // Return existing SMS (as string or JSON)
    const smsArray = Array.isArray(number.smsContent) ? number.smsContent : [number.smsContent];
    const latestEntry = smsArray[smsArray.length - 1];
    const latestSms = typeof latestEntry === 'object' && latestEntry !== null && 'content' in latestEntry
      ? (latestEntry as { content: string }).content
      : typeof latestEntry === 'string'
      ? latestEntry
      : "";
    return new NextResponse(`STATUS_OK:${latestSms}`, { status: 200, headers: corsHeaders });
  }

  // If closed/expired and no SMS, return cancel status
  if (number.activeStatus === "CLOSED") {
    return new NextResponse("STATUS_CANCEL", { status: 200, headers: corsHeaders });
  }

  // Poll provider for SMS
  if (number.service?.server?.api && number.activeStatus === "ACTIVE") {
    const client = new OtpProviderClient({
      apiUrl: number.service.server.api.apiUrl,
      apiKey: number.service.server.api.apiKey,
    });

    const status = await client.getStatus(number.numberId);

    if (status.status === "RECEIVED" && status.sms) {
      // Append SMS to existing array (handle both string and array formats)
      const currentSms = Array.isArray(number.smsContent) ? number.smsContent :
        (typeof number.smsContent === 'string' ? [{ content: number.smsContent, receivedAt: new Date().toISOString() }] : []);
      await prisma.activeNumber.update({
        where: { id: number.id },
        data: {
          smsContent: [...currentSms, {
            content: status.sms,
            receivedAt: new Date().toISOString(),
          }],
          status: "COMPLETED", // Update to COMPLETED when SMS is received
        },
      });
      return new NextResponse(`STATUS_OK:${status.sms}`, { status: 200, headers: corsHeaders });
    }
  }

  return new NextResponse("STATUS_WAIT_CODE", { status: 200, headers: corsHeaders });
}

async function handleSetStatus(searchParams: URLSearchParams, user: UserWithWallet) {
  const orderId = searchParams.get("id");
  const statusStr = searchParams.get("status");

  if (!orderId) {
    return new NextResponse("NO_ACTIVATION", { status: 200, headers: corsHeaders });
  }

  const statusCode = parseInt(statusStr || "0");

  const number = await prisma.activeNumber.findFirst({
    where: { orderId, userId: user.id },
    include: { service: { include: { server: { include: { api: true } } } } },
  });

  if (!number) {
    return new NextResponse("NO_ACTIVATION", { status: 200, headers: corsHeaders });
  }

  // Status 8 = Cancel
  if (statusCode === 8) {
    if (number.status !== "PENDING") {
      return new NextResponse("ACCESS_ACTIVATION", { status: 200, headers: corsHeaders });
    }

    // Check cancel timer
    const settings = await prisma.settings.findUnique({
      where: { id: "1" },
    });
    const minCancelMinutes = settings?.minCancelMinutes ?? 2;
    const timeSincePurchase = Date.now() - number.buyTime.getTime();
    const minCancelMs = minCancelMinutes * 60 * 1000;

    if (timeSincePurchase < minCancelMs) {
      return new NextResponse("EARLY_CANCEL_DENIED", { status: 200, headers: corsHeaders });
    }

    // Cancel with provider
    if (number.service?.server?.api) {
      const client = new OtpProviderClient({
        apiUrl: number.service.server.api.apiUrl,
        apiKey: number.service.server.api.apiKey,
      });
      await client.cancelOrder(number.numberId);
    }

    // Refund
    if (user.wallet) {
      try {
        await prisma.$transaction([
          prisma.activeNumber.update({
            where: { id: number.id },
            data: { status: "CANCELLED" },
          }),
          prisma.wallet.update({
            where: { userId: user.id },
            data: {
              balance: { increment: number.price },
              totalSpent: { decrement: number.price },
              totalOtp: { decrement: 1 },
            },
          }),
          prisma.transaction.create({
            data: {
              walletId: user.wallet.id,
              type: "REFUND",
              amount: number.price,
              status: "COMPLETED",
              description: "Refund for cancelled order",
            },
          }),
        ]);
      } catch (error) {
        console.error("Error processing refund:", error);
      }
    }
    return new NextResponse("ACCESS_CANCEL", { status: 200, headers: corsHeaders });
  }

  // Status 6 = Finish
  if (statusCode === 6) {
    await prisma.activeNumber.update({
      where: { id: number.id },
      data: { status: "COMPLETED" },
    });
    return new NextResponse("ACCESS_ACTIVATION", { status: 200, headers: corsHeaders });
  }

  // Status 3 = NextSMS check
  if (statusCode === 3) {
    // Check if we have already received at least one SMS
    if (!number.smsContent) {
      // No SMS yet, not ready for nextsms
      return new NextResponse("ACCESS_READY", { status: 200, headers: corsHeaders });
    }

    // Check if there are more SMS available from provider
    if (number.service?.server?.api) {
      const client = new OtpProviderClient({
        apiUrl: number.service.server.api.apiUrl,
        apiKey: number.service.server.api.apiKey,
      });

      const nextSmsCheck = await client.getNextSms(number.numberId);

      if (nextSmsCheck.success && nextSmsCheck.hasMore) {
        // Another SMS is available - mark that we know
        return new NextResponse("ACCESS_RETRY_GET", { status: 200, headers: corsHeaders });
      }
    }

    // No more SMS available
    return new NextResponse("ACCESS_READY", { status: 200, headers: corsHeaders });
  }

  return new NextResponse("BAD_STATUS", { status: 200, headers: corsHeaders });
}
