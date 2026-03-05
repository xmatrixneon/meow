import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { prisma } from "@/lib/db";
import { TRPCError } from "@trpc/server";

/**
 * Input schema for list procedure
 */
const listInputSchema = z.object({
  search: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

/**
 * Service router
 * Handles service listing and OTP server information
 */
export const serviceRouter = createTRPCRouter({
  /**
   * Get public app settings
   * Returns settings needed for client-side operations (e.g., UPI ID for deposits)
   */
  settings: publicProcedure.query(async () => {
    try {
      const settings = await prisma.settings.findUnique({
        where: { id: "1" },
      });

      return {
        currency: settings?.currency || "₹",
        bharatpeQrImage: settings?.bharatpeQrImage,
        upiId: settings?.upiId,
        minCancelMinutes: settings?.minCancelMinutes || 2,
        minRechargeAmount: settings?.minRechargeAmount,
        referralPercent: settings?.referralPercent,
        minRedeem: settings?.minRedeem,
        numberExpiryMinutes: settings?.numberExpiryMinutes,
        telegramHelpUrl: settings?.telegramHelpUrl,
      };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch settings",
        cause: error,
      });
    }
  }),
  /**
   * List all available services with server info (name, country, flag)
   * Only returns active services with nested server details
   */
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
              countryIso: true,
              countryName: true,
              flagUrl: true,
            }
          }
        },
        orderBy: {
          name: "asc",
        },
      });

      return { services };
    }),

  /**
   * List all available services
   * Supports search with case-insensitive matching on name and code
   * Supports pagination with limit and offset
   * Only returns active services
   */
  list: publicProcedure.input(listInputSchema).query(async ({ input }) => {
    try {
      const { search, limit, offset } = input;

      // Build where clause
      const where: any = {
        isActive: true,
      };

      // Add search conditions if provided
      if (search) {
        where.OR = [
          {
            name: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            code: {
              contains: search,
              mode: "insensitive",
            },
          },
        ];
      }

      // Get paginated services
      const services = await prisma.service.findMany({
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
      });

      // Get total count
      const total = await prisma.service.count({ where });

      // Calculate hasMore
      const hasMore = offset + limit < total;

      return {
        services,
        total,
        hasMore,
      };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch services",
        cause: error,
      });
    }
  }),

  /**
   * List all active OTP servers with their services and prices
   * Includes API credential relation
   */
  servers: publicProcedure.query(async () => {
    try {
      const where = {
        isActive: true,
      };

      const [servers, total] = await Promise.all([
        prisma.otpServer.findMany({
          where,
          include: {
            api: true,
            services: {
              where: { isActive: true },
              select: {
                id: true,
                code: true,
                name: true,
                basePrice: true,
                iconUrl: true,
              },
              orderBy: { name: "asc" },
            },
          },
          orderBy: {
            name: "asc",
          },
        }),
        prisma.otpServer.count({ where }),
      ]);

      return {
        servers,
        total,
      };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch servers",
        cause: error,
      });
    }
  }),
});
