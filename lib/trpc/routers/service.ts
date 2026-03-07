import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/db";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@/app/generated/prisma/client";

const listInputSchema = z.object({
  search: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

export const serviceRouter = createTRPCRouter({
  /**
   * Get public app settings.
   */
  settings: publicProcedure.query(async () => {
    try {
      const settings = await prisma.settings.findUnique({
        where: { id: "1" },
      });

      return {
        currency:
          settings?.currency === "INR"
            ? "₹"
            : settings?.currency ?? "₹",
        bharatpeQrImage: settings?.bharatpeQrImage,
        upiId: settings?.upiId,
        minCancelMinutes: settings?.minCancelMinutes ?? 2,
        minRechargeAmount: settings?.minRechargeAmount,
        referralPercent: settings?.referralPercent,
        minRedeem: settings?.minRedeem,
        numberExpiryMinutes: settings?.numberExpiryMinutes,
        telegramHelpUrl: settings?.telegramHelpUrl,
        telegramSupportUsername: settings?.telegramSupportUsername,
        apiDocsBaseUrl: settings?.apiDocsBaseUrl,
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
   * List all active services with server info
   */
  listWithServers: publicProcedure.query(async () => {
    const services = await prisma.service.findMany({
      where: {
        isActive: true,
        server: { isActive: true },
      },
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
      orderBy: { name: "asc" },
    });

    return { services };
  }),

  /**
   * List services with search + pagination
   */
  list: publicProcedure
    .input(listInputSchema)
    .query(async ({ input }) => {
      try {
        const { search, limit, offset } = input;

        const where: Prisma.ServiceWhereInput = {
          isActive: true,
          server: { isActive: true },
        };

        if (search) {
          where.OR = [
            {
              name: { contains: search, mode: "insensitive" },
            },
            {
              code: { contains: search, mode: "insensitive" },
            },
          ];
        }

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
            orderBy: { name: "asc" },
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
    }),

  /**
   * List all active OTP servers with their services
   */
  servers: protectedProcedure.query(async () => {
    try {
      const where = { isActive: true };

      const [servers, total] = await Promise.all([
        prisma.otpServer.findMany({
          where,
          include: {
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
          orderBy: { name: "asc" },
        }),

        prisma.otpServer.count({ where }),
      ]);

      return { servers, total };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch servers",
        cause: error,
      });
    }
  }),
});