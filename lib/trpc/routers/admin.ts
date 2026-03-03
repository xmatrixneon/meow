import { createTRPCRouter, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { nanoid } from "nanoid";
import { DiscountType } from "@/app/generated/prisma/client";

/**
 * Admin procedure middleware
 * Checks if the user has admin privileges
 */
const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.user?.isAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

// ============================================
// Input Validation Schemas
// ============================================

// Service schemas
const serviceCreateSchema = z.object({
  code: z.string().min(1, "Service code is required"),
  name: z.string().min(1, "Service name is required"),
  serverId: z.string().min(1, "Server ID is required"),
  basePrice: z.number().positive("Base price must be positive"),
  iconUrl: z.string().url().optional().nullable(),
});

const serviceUpdateSchema = z.object({
  id: z.string().min(1, "Service ID is required"),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  serverId: z.string().min(1).optional(),
  basePrice: z.number().positive().optional(),
  iconUrl: z.string().url().optional().nullable(),
});

const serviceDeleteSchema = z.object({
  id: z.string().min(1, "Service ID is required"),
});

// Server schemas
const serverCreateSchema = z.object({
  name: z.string().min(1, "Server name is required"),
  countryCode: z.string().min(1, "Country code is required"),
  apiCredentialId: z.string().min(1, "API credential ID is required"),
  flagUrl: z.string().url("Invalid flag URL").optional().or(z.literal("")),
});

const serverUpdateSchema = z.object({
  id: z.string().min(1, "Server ID is required"),
  name: z.string().min(1).optional(),
  countryCode: z.string().min(1).optional(),
  flagUrl: z.string().url("Invalid flag URL").optional().or(z.literal("")),
  isActive: z.boolean().optional(),
});

const serverDeleteSchema = z.object({
  id: z.string().min(1, "Server ID is required"),
});

// API Credential schemas
const apiCredentialCreateSchema = z.object({
  name: z.string().min(1, "API name is required"),
  apiUrl: z.string().url("Valid API URL is required"),
  apiKey: z.string().min(1, "API key is required"),
});

const apiCredentialUpdateSchema = z.object({
  id: z.string().min(1, "API credential ID is required"),
  name: z.string().min(1).optional(),
  apiUrl: z.string().url().optional(),
  apiKey: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

// Settings schemas
const settingsUpdateSchema = z.object({
  currency: z.string().optional(),
  minCancelMinutes: z.number().min(0).max(60).optional(),
  bharatpeQrImage: z.string().url("Invalid QR image URL").optional().or(z.literal("")),
  upiId: z.string().optional(),
  bharatpeMerchantId: z.string().optional(),
  bharatpeToken: z.string().optional(),
  minRechargeAmount: z.number().optional(),
  referralPercent: z.number().optional(),
  numberExpiryMinutes: z.number().optional(),
  minRedeem: z.number().optional(),
  maintenanceMode: z.boolean().optional(),
});

// Promo schemas
const promoGenerateSchema = z.object({
  amount: z.number().positive("Amount must be positive"),
  count: z.number().int().min(1).max(100, "Can generate up to 100 promocodes at once"),
  maxUses: z.number().int().min(1).default(1),
});

// Custom price schemas
const customPriceSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  serviceId: z.string().min(1, "Service ID is required"),
  discount: z.number().nonnegative("Discount must be non-negative"),
  type: z.enum([DiscountType.FLAT, DiscountType.PERCENT]),
});

/**
 * Admin router
 * Handles administrative operations with role-based access control
 */
export const adminRouter = createTRPCRouter({
  // ============================================
  // Dashboard Stats
  // ============================================
  stats: adminProcedure.query(async () => {
    const [
      totalUsers,
      totalServices,
      totalServers,
      activeNumbers,
      totalWalletBalance,
      activePromocodes,
      totalRevenueResult,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.service.count({ where: { isActive: true } }),
      prisma.otpServer.count({ where: { isActive: true } }),
      prisma.activeNumber.count({ where: { status: "PENDING" } }),
      prisma.wallet.aggregate({
        _sum: { balance: true },
      }),
      prisma.promocode.count({ where: { isActive: true } }),
      // Calculate total revenue from completed transactions
      prisma.transaction.aggregate({
        where: {
          status: "COMPLETED",
          amount: { gt: 0 },
        },
        _sum: { amount: true },
      }),
    ]);

    return {
      totalUsers,
      totalServices,
      totalServers,
      activeNumbers,
      totalWalletBalance: totalWalletBalance._sum.balance || 0,
      activePromocodes,
      totalRevenue: totalRevenueResult._sum.amount || 0,
    };
  }),

  // ============================================
  // Service CRUD
  // ============================================
  service: createTRPCRouter({
    list: adminProcedure.query(async () => {
      const services = await prisma.service.findMany({
        include: {
          server: {
            include: {
              api: true,
            },
          },
          _count: {
            select: { purchases: true, customPrices: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return services;
    }),

    create: adminProcedure
      .input(serviceCreateSchema)
      .mutation(async ({ input }) => {
        // Check if server exists
        const server = await prisma.otpServer.findUnique({
          where: { id: input.serverId },
        });

        if (!server) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Server not found",
          });
        }

        // Check for duplicate code+serverId combination
        const existing = await prisma.service.findUnique({
          where: {
            code_serverId: {
              code: input.code,
              serverId: input.serverId,
            },
          },
        });

        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Service with this code already exists for this server",
          });
        }

        const service = await prisma.service.create({
          data: {
            code: input.code,
            name: input.name,
            serverId: input.serverId,
            basePrice: input.basePrice,
            iconUrl: input.iconUrl,
          },
        });

        return service;
      }),

    update: adminProcedure
      .input(serviceUpdateSchema)
      .mutation(async ({ input }) => {
        const { id, ...data } = input;

        // Check if service exists
        const existing = await prisma.service.findUnique({
          where: { id },
        });

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Service not found",
          });
        }

        // If code or serverId is being updated, check for duplicates
        if (data.code || data.serverId) {
          const duplicate = await prisma.service.findUnique({
            where: {
              code_serverId: {
                code: data.code || existing.code,
                serverId: data.serverId || existing.serverId,
              },
            },
          });

          if (duplicate && duplicate.id !== id) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Service with this code already exists for this server",
            });
          }
        }

        const service = await prisma.service.update({
          where: { id },
          data,
        });

        return service;
      }),

    delete: adminProcedure
      .input(serviceDeleteSchema)
      .mutation(async ({ input }) => {
        // Check if service exists
        const existing = await prisma.service.findUnique({
          where: { id: input.id },
        });

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Service not found",
          });
        }

        // Soft delete by setting isActive to false
        await prisma.service.update({
          where: { id: input.id },
          data: { isActive: false },
        });

        return { success: true, id: input.id };
      }),
  }),

  // ============================================
  // Server CRUD (OtpServer + ApiCredential)
  // ============================================
  server: createTRPCRouter({
    list: adminProcedure.query(async () => {
      const servers = await prisma.otpServer.findMany({
        include: {
          api: true,
          _count: {
            select: { services: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return servers;
    }),

    create: adminProcedure
      .input(serverCreateSchema)
      .mutation(async ({ input }) => {
        // Check if API credential exists
        const apiCredential = await prisma.apiCredential.findUnique({
          where: { id: input.apiCredentialId },
        });

        if (!apiCredential) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "API credential not found",
          });
        }

        const server = await prisma.otpServer.create({
          data: {
            name: input.name,
            countryCode: input.countryCode,
            apiId: input.apiCredentialId,
            flagUrl: input.flagUrl || null,
          },
          include: {
            api: true,
          },
        });

        return server;
      }),

    update: adminProcedure
      .input(serverUpdateSchema)
      .mutation(async ({ input }) => {
        const { id, flagUrl, ...data } = input;

        // Check if server exists
        const existing = await prisma.otpServer.findUnique({
          where: { id },
        });

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Server not found",
          });
        }

        const server = await prisma.otpServer.update({
          where: { id },
          data: {
            ...data,
            ...(flagUrl !== undefined && { flagUrl: flagUrl || null }),
          },
          include: {
            api: true,
          },
        });

        return server;
      }),

    delete: adminProcedure
      .input(serverDeleteSchema)
      .mutation(async ({ input }) => {
        // Check if server exists
        const existing = await prisma.otpServer.findUnique({
          where: { id: input.id },
        });

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Server not found",
          });
        }

        // Soft delete by setting isActive to false
        await prisma.otpServer.update({
          where: { id: input.id },
          data: { isActive: false },
        });

        return { success: true, id: input.id };
      }),
  }),

  // ============================================
  // API Credentials CRUD
  // ============================================
  apiCredential: createTRPCRouter({
    list: adminProcedure.query(async () => {
      const credentials = await prisma.apiCredential.findMany({
        include: {
          _count: {
            select: { servers: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      // Mask the API key for security
      return credentials.map((cred) => ({
        ...cred,
        apiKey: `${cred.apiKey.slice(0, 8)}...${cred.apiKey.slice(-4)}`,
      }));
    }),

    create: adminProcedure
      .input(apiCredentialCreateSchema)
      .mutation(async ({ input }) => {
        const credential = await prisma.apiCredential.create({
          data: {
            name: input.name,
            apiUrl: input.apiUrl,
            apiKey: input.apiKey,
          },
        });

        // Return with masked key
        return {
          ...credential,
          apiKey: `${credential.apiKey.slice(0, 8)}...${credential.apiKey.slice(-4)}`,
        };
      }),

    update: adminProcedure
      .input(apiCredentialUpdateSchema)
      .mutation(async ({ input }) => {
        const { id, ...data } = input;

        // Check if credential exists
        const existing = await prisma.apiCredential.findUnique({
          where: { id },
        });

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "API credential not found",
          });
        }

        const credential = await prisma.apiCredential.update({
          where: { id },
          data,
        });

        // Return with masked key
        return {
          ...credential,
          apiKey: `${credential.apiKey.slice(0, 8)}...${credential.apiKey.slice(-4)}`,
        };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        // Check if credential exists
        const existing = await prisma.apiCredential.findUnique({
          where: { id: input.id },
          include: {
            _count: { select: { servers: true } },
          },
        });

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "API credential not found",
          });
        }

        // Check if there are active servers using this credential
        if (existing._count.servers > 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Cannot delete API credential with associated servers",
          });
        }

        // Soft delete
        await prisma.apiCredential.update({
          where: { id: input.id },
          data: { isActive: false },
        });

        return { success: true, id: input.id };
      }),
  }),

  // ============================================
  // Promo Management
  // ============================================
  promo: createTRPCRouter({
    list: adminProcedure.query(async () => {
      const promocodes = await prisma.promocode.findMany({
        include: {
          _count: {
            select: { history: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return promocodes.map((promo) => ({
        ...promo,
        usedCount: promo.usedCount,
        remainingUses: promo.maxUses - promo.usedCount,
      }));
    }),

    generate: adminProcedure
      .input(promoGenerateSchema)
      .mutation(async ({ input }) => {
        const promocodes = [];

        for (let i = 0; i < input.count; i++) {
          // Generate 12-character alphanumeric code
          const code = nanoid(12).toUpperCase();

          promocodes.push({
            code,
            amount: input.amount,
            maxUses: input.maxUses,
          });
        }

        // Batch insert
        const result = await prisma.promocode.createMany({
          data: promocodes,
        });

        return {
          success: true,
          count: result.count,
          promocodes: promocodes.map((p) => p.code),
        };
      }),

    deactivate: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        const existing = await prisma.promocode.findUnique({
          where: { id: input.id },
        });

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Promocode not found",
          });
        }

        await prisma.promocode.update({
          where: { id: input.id },
          data: { isActive: false },
        });

        return { success: true, id: input.id };
      }),

    activate: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        const existing = await prisma.promocode.findUnique({
          where: { id: input.id },
        });

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Promocode not found",
          });
        }

        await prisma.promocode.update({
          where: { id: input.id },
          data: { isActive: true },
        });

        return { success: true, id: input.id };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        const existing = await prisma.promocode.findUnique({
          where: { id: input.id },
          include: {
            _count: {
              select: { history: true },
            },
          },
        });

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Promocode not found",
          });
        }

        // Check if promocode has been used
        if (existing._count.history > 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Cannot delete a promocode that has been used",
          });
        }

        await prisma.promocode.delete({
          where: { id: input.id },
        });

        return { success: true, id: input.id };
      }),
  }),

  // ============================================
  // User Management
  // ============================================
  user: createTRPCRouter({
    // Enhanced list with search, filter, and pagination
    list: adminProcedure
      .input(
        z.object({
          search: z.string().optional(),
          filter: z.enum(["all", "admin", "regular", "deleted"]).optional().default("all"),
          sortBy: z.enum(["createdAt", "balance", "totalSpent", "totalOtp"]).optional().default("createdAt"),
          sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
          page: z.number().int().min(1).optional().default(1),
          pageSize: z.number().int().min(1).max(100).optional().default(20),
        })
      )
      .query(async ({ input }) => {
        const { search, filter, sortBy, sortOrder, page, pageSize } = input;
        const skip = (page - 1) * pageSize;

        // Build where clause
        const where: Record<string, any> = {};

        // Search by telegramId, username, email, or name
        if (search) {
          where.OR = [
            { telegramId: { contains: search, mode: "insensitive" } },
            { telegramUsername: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
            { firstName: { contains: search, mode: "insensitive" } },
          ];
        }

        // Filter by status
        if (filter === "deleted") {
          where.deletedAt = { not: null };
        } else if (filter === "admin") {
          where.isAdmin = true;
          where.deletedAt = null;
        } else if (filter === "regular") {
          where.isAdmin = false;
          where.deletedAt = null;
        } else {
          where.deletedAt = null; // Default: exclude deleted
        }

        // Build orderBy
        let orderBy: any = { createdAt: sortOrder as "asc" | "desc" };

        if (sortBy === "balance") {
          orderBy = { wallet: { balance: sortOrder as "asc" | "desc" } };
        } else if (sortBy === "totalSpent") {
          orderBy = { wallet: { totalSpent: sortOrder as "asc" | "desc" } };
        } else if (sortBy === "totalOtp") {
          orderBy = { wallet: { totalOtp: sortOrder as "asc" | "desc" } };
        }

        // Get users and total count in parallel
        const [users, total] = await Promise.all([
          prisma.user.findMany({
            where,
            skip,
            take: pageSize,
            orderBy,
            include: {
              wallet: true,
              _count: {
                select: {
                  numbers: true,
                  promoHistory: true,
                  customPrices: true,
                },
              },
            },
          }),
          prisma.user.count({ where }),
        ]);

        return {
          users: users.map((user) => ({
            id: user.id,
            telegramId: user.telegramId,
            telegramUsername: user.telegramUsername,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            isAdmin: user.isAdmin,
            isPremium: user.isPremium,
            deletedAt: user.deletedAt,
            createdAt: user.createdAt,
            wallet: user.wallet
              ? {
                  balance: user.wallet.balance,
                  totalSpent: user.wallet.totalSpent,
                  totalOtp: user.wallet.totalOtp,
                }
              : null,
            stats: {
              totalNumbers: user._count.numbers,
              promoUsed: user._count.promoHistory,
              customPrices: user._count.customPrices,
            },
          })),
          pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize),
          },
        };
      }),

    // Get single user with full details
    get: adminProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        const user = await prisma.user.findUnique({
          where: { id: input.id },
          include: {
            wallet: true,
            _count: {
              select: {
                numbers: true,
                promoHistory: true,
                customPrices: true,
                auditLogsAsTarget: true,
              },
            },
          },
        });

        if (!user) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found",
          });
        }

        return {
          id: user.id,
          telegramId: user.telegramId,
          telegramUsername: user.telegramUsername,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          image: user.image,
          isAdmin: user.isAdmin,
          isPremium: user.isPremium,
          allowsWriteToPm: user.allowsWriteToPm,
          photoUrl: user.photoUrl,
          languageCode: user.languageCode,
          deletedAt: user.deletedAt,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          wallet: user.wallet,
          stats: {
            totalNumbers: user._count.numbers,
            promoUsed: user._count.promoHistory,
            customPrices: user._count.customPrices,
            auditLogCount: user._count.auditLogsAsTarget,
          },
        };
      }),

    // Update user profile fields
    update: adminProcedure
      .input(
        z.object({
          id: z.string(),
          name: z.string().optional(),
          email: z.string().email().optional().nullable(),
          isAdmin: z.boolean().optional(),
          isPremium: z.boolean().optional(),
          reason: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { id, reason, ...data } = input;
        const adminId = ctx.user?.id;

        // Check if user exists
        const user = await prisma.user.findUnique({
          where: { id },
        });

        if (!user) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found",
          });
        }

        // If updating email, check for duplicates
        if (data.email !== undefined && data.email !== user.email) {
          const existing = await prisma.user.findUnique({
            where: { email: data.email || "" },
          });

          if (existing && existing.id !== id) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Email already in use",
            });
          }
        }

        // Calculate changes for audit log
        const changes: Record<string, { from: any; to: any }> = {};

        if (data.name !== undefined && data.name !== user.name) {
          changes.name = { from: user.name, to: data.name };
        }
        if (data.email !== undefined && data.email !== user.email) {
          changes.email = { from: user.email, to: data.email };
        }
        if (data.isAdmin !== undefined && data.isAdmin !== user.isAdmin) {
          changes.isAdmin = { from: user.isAdmin, to: data.isAdmin };
        }
        if (data.isPremium !== undefined && data.isPremium !== user.isPremium) {
          changes.isPremium = { from: user.isPremium, to: data.isPremium };
        }

        // Update user
        const updated = await prisma.user.update({
          where: { id },
          data,
        });

        // Create audit log
        if (Object.keys(changes).length > 0 && adminId) {
          await prisma.userAuditLog.create({
            data: {
              userId: id,
              action: "UPDATE",
              adminId,
              changes: changes as any,
              reason,
            },
          });
        }

        return {
          success: true,
          user: updated,
          changes: Object.keys(changes),
        };
      }),

    // Soft delete user with audit logging
    delete: adminProcedure
      .input(
        z.object({
          id: z.string(),
          permanent: z.boolean().default(false),
          reason: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { id, permanent, reason } = input;
        const adminId = ctx.user?.id;

        // Check if user exists
        const user = await prisma.user.findUnique({
          where: { id },
        });

        if (!user) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found",
          });
        }

        // Prevent deleting admins
        if (user.isAdmin) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Cannot delete admin users",
          });
        }

        // Prevent self-deletion
        if (id === adminId) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Cannot delete yourself",
          });
        }

        if (permanent) {
          // Hard delete - cascade handles related records
          await prisma.user.delete({
            where: { id },
          });
        } else {
          // Soft delete
          await prisma.user.update({
            where: { id },
            data: { deletedAt: new Date() },
          });
        }

        // Create audit log
        if (adminId) {
          await prisma.userAuditLog.create({
            data: {
              userId: id,
              action: permanent ? "DELETE_PERMANENT" : "DELETE",
              adminId,
              reason,
            },
          });
        }

        return {
          success: true,
          permanent,
        };
      }),

    // Adjust user balance with transaction record
    balanceAdjust: adminProcedure
      .input(
        z.object({
          userId: z.string(),
          amount: z.number(), // Positive for credit, negative for debit
          reason: z.string().min(1, "Reason is required"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { userId, amount, reason } = input;
        const adminId = ctx.user?.id;

        if (amount === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Amount cannot be zero",
          });
        }

        // Check if user exists
        const user = await prisma.user.findUnique({
          where: { id: userId },
          include: { wallet: true },
        });

        if (!user) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found",
          });
        }

        // Check for soft-deleted user
        if (user.deletedAt) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Cannot adjust balance for deleted user",
          });
        }

        // Ensure wallet exists
        let wallet = user.wallet;

        if (!wallet) {
          wallet = await prisma.wallet.create({
            data: {
              userId,
            },
          });
        }

        // Check if debit would cause negative balance
        const currentBalance = parseFloat(wallet.balance.toString());
        if (amount < 0 && currentBalance + amount < 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Insufficient balance for debit",
          });
        }

        // Update wallet balance
        const newBalance = currentBalance + amount;

        await prisma.wallet.update({
          where: { id: wallet.id },
          data: {
            balance: newBalance.toString(),
            ...(amount > 0 && { totalRecharge: { increment: amount } }),
          },
        });

        // Create transaction record
        const transaction = await prisma.transaction.create({
          data: {
            walletId: wallet.id,
            type: "ADJUSTMENT",
            amount: amount,
            description: `${amount > 0 ? "Credit" : "Debit"}: ${reason}`,
            status: "COMPLETED",
            metadata: {
              adminId,
              reason,
              adminUsername: ctx.user?.telegramUsername || ctx.user?.name,
            },
          },
        });

        // Create audit log
        if (adminId) {
          await prisma.userAuditLog.create({
            data: {
              userId,
              action: "BALANCE_ADJUST",
              adminId,
              changes: {
                balance: {
                  from: currentBalance,
                  to: newBalance,
                  adjustment: amount,
                },
              },
              reason,
            },
          });
        }

        return {
          success: true,
          transaction: {
            id: transaction.id,
            amount: transaction.amount,
            type: transaction.type,
            description: transaction.description,
          },
          newBalance,
        };
      }),

    setCustomPrice: adminProcedure
      .input(customPriceSchema)
      .mutation(async ({ input }) => {
        // Verify user exists
        const user = await prisma.user.findUnique({
          where: { id: input.userId },
        });

        if (!user) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found",
          });
        }

        // Verify service exists
        const service = await prisma.service.findUnique({
          where: { id: input.serviceId },
        });

        if (!service) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Service not found",
          });
        }

        // Upsert custom price (create or update)
        const customPrice = await prisma.customPrice.upsert({
          where: {
            userId_serviceId: {
              userId: input.userId,
              serviceId: input.serviceId,
            },
          },
          create: {
            userId: input.userId,
            serviceId: input.serviceId,
            discount: input.discount,
            type: input.type,
          },
          update: {
            discount: input.discount,
            type: input.type,
          },
          include: {
            user: {
              select: {
                id: true,
                telegramUsername: true,
                firstName: true,
              },
            },
            service: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        });

        return customPrice;
      }),

    removeCustomPrice: adminProcedure
      .input(
        z.object({
          userId: z.string(),
          serviceId: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        const existing = await prisma.customPrice.findUnique({
          where: {
            userId_serviceId: {
              userId: input.userId,
              serviceId: input.serviceId,
            },
          },
        });

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Custom price not found",
          });
        }

        await prisma.customPrice.delete({
          where: {
            userId_serviceId: {
              userId: input.userId,
              serviceId: input.serviceId,
            },
          },
        });

        return { success: true };
      }),

    setAdmin: adminProcedure
      .input(
        z.object({
          userId: z.string(),
          isAdmin: z.boolean(),
        })
      )
      .mutation(async ({ input }) => {
        const user = await prisma.user.findUnique({
          where: { id: input.userId },
        });

        if (!user) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found",
          });
        }

        const updatedUser = await prisma.user.update({
          where: { id: input.userId },
          data: { isAdmin: input.isAdmin },
        });

        return {
          success: true,
          user: {
            id: updatedUser.id,
            telegramUsername: updatedUser.telegramUsername,
            isAdmin: updatedUser.isAdmin,
          },
        };
      }),

    // Get user's transaction history
    transactions: adminProcedure
      .input(
        z.object({
          userId: z.string(),
          limit: z.number().int().min(1).max(100).default(50),
        })
      )
      .query(async ({ input }) => {
        const { userId, limit } = input;

        // Get user's wallet
        const wallet = await prisma.wallet.findUnique({
          where: { userId },
        });

        if (!wallet) {
          return {
            transactions: [],
            total: 0,
          };
        }

        // Get transactions
        const [total, transactions] = await Promise.all([
          prisma.transaction.count({
            where: { walletId: wallet.id },
          }),
          prisma.transaction.findMany({
            where: { walletId: wallet.id },
            orderBy: { createdAt: "desc" },
            take: limit,
          }),
        ]);

        return {
          transactions: transactions.map((tx) => ({
            id: tx.id,
            type: tx.type,
            amount: typeof tx.amount === "number" ? tx.amount : tx.amount.toNumber(),
            status: tx.status,
            description: tx.description,
            txnId: tx.txnId,
            metadata: tx.metadata as Record<string, any> | null,
            createdAt: tx.createdAt,
          })),
          total,
        };
      }),
  }),

  // ============================================
  // System Health Check
  // ============================================
  health: adminProcedure.query(async () => {
    try {
      // Test database connection
      await prisma.$queryRaw`SELECT 1`;

      return {
        status: "healthy",
        database: "connected",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database connection failed",
      });
    }
  }),

  // ============================================
  // Settings Management
  // ============================================
  settings: createTRPCRouter({
    get: adminProcedure.query(async () => {
      return prisma.settings.findUnique({ where: { id: "1" } });
    }),

    update: adminProcedure
      .input(settingsUpdateSchema)
      .mutation(async ({ input }) => {
        const updated = await prisma.settings.update({
          where: { id: "1" },
          data: {
            ...(input.currency !== undefined && { currency: input.currency }),
            ...(input.minCancelMinutes !== undefined && { minCancelMinutes: input.minCancelMinutes }),
            ...(input.bharatpeQrImage !== undefined && { bharatpeQrImage: input.bharatpeQrImage || null }),
            ...(input.upiId !== undefined && { upiId: input.upiId }),
            ...(input.bharatpeMerchantId !== undefined && { bharatpeMerchantId: input.bharatpeMerchantId }),
            ...(input.bharatpeToken !== undefined && { bharatpeToken: input.bharatpeToken }),
            ...(input.minRechargeAmount !== undefined && { minRechargeAmount: input.minRechargeAmount }),
            ...(input.referralPercent !== undefined && { referralPercent: input.referralPercent }),
            ...(input.numberExpiryMinutes !== undefined && { numberExpiryMinutes: input.numberExpiryMinutes }),
            ...(input.minRedeem !== undefined && { minRedeem: input.minRedeem }),
            ...(input.maintenanceMode !== undefined && { maintenanceMode: input.maintenanceMode }),
          }
        });

        return updated;
      }),
  }),

  // ============================================
  // Statistics & Analytics
  // ============================================
  getTransactionStats: adminProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const startDate = input.startDate ? new Date(input.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: 30 days
      const endDate = input.endDate ? new Date(input.endDate) : new Date();

      // Get transactions within date range
      const transactions = await prisma.transaction.findMany({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      });

      // Calculate stats by type
      const stats = {
        total: transactions.length,
        totalAmount: 0,
        byType: {} as Record<string, { count: number; amount: number }>,
        byStatus: {} as Record<string, { count: number; amount: number }>,
        daily: [] as Array<{ date: string; count: number; amount: number }>,
      };

      // Group by date for daily stats
      const dailyMap = new Map<string, { count: number; amount: number }>();

      for (const tx of transactions) {
        const amount = parseFloat(tx.amount.toString());
        stats.totalAmount += amount;

        // By type
        if (!stats.byType[tx.type]) {
          stats.byType[tx.type] = { count: 0, amount: 0 };
        }
        stats.byType[tx.type].count += 1;
        stats.byType[tx.type].amount += amount;

        // By status
        if (!stats.byStatus[tx.status]) {
          stats.byStatus[tx.status] = { count: 0, amount: 0 };
        }
        stats.byStatus[tx.status].count += 1;
        stats.byStatus[tx.status].amount += amount;

        // Daily grouping (format: YYYY-MM-DD)
        const dateKey = tx.createdAt.toISOString().split("T")[0];
        if (!dailyMap.has(dateKey)) {
          dailyMap.set(dateKey, { count: 0, amount: 0 });
        }
        const day = dailyMap.get(dateKey)!;
        day.count += 1;
        day.amount += amount;
      }

      // Convert daily map to array and sort
      stats.daily = Array.from(dailyMap.entries())
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return stats;
    }),

  getOtpStats: adminProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        groupBy: z.enum(["day", "service", "server", "user"]).optional().default("day"),
      })
    )
    .query(async ({ input }) => {
      const startDate = input.startDate ? new Date(input.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = input.endDate ? new Date(input.endDate) : new Date();

      // Get numbers within date range
      const numbers = await prisma.activeNumber.findMany({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          service: true,
          server: true,
          user: {
            include: { wallet: true },
          },
        },
      });

      // Calculate overall stats
      const stats = {
        total: numbers.length,
        completed: numbers.filter((n) => n.status === "COMPLETED").length,
        pending: numbers.filter((n) => n.status === "PENDING").length,
        cancelled: numbers.filter((n) => n.status === "CANCELLED").length,
        totalRevenue: 0,
        totalRefunds: 0,
        netRevenue: 0,
        groups: [] as Array<any>,
      };

      for (const number of numbers) {
        const price = parseFloat(number.price.toString());
        if (number.status === "COMPLETED") {
          stats.totalRevenue += price;
          stats.netRevenue += price;
        } else if (number.status === "CANCELLED") {
          stats.totalRefunds += price;
        }
      }

      stats.netRevenue = stats.totalRevenue - stats.totalRefunds;

      // Group by specified field
      const groupMap = new Map<string, { count: number; revenue: number; refunds: number; name: string }>();

      for (const number of numbers) {
        let groupKey = "";
        let groupName = "";

        switch (input.groupBy) {
          case "day":
            groupKey = number.createdAt.toISOString().split("T")[0];
            groupName = groupKey;
            break;
          case "service":
            groupKey = number.service.id;
            groupName = number.service.name;
            break;
          case "server":
            groupKey = number.server.id;
            groupName = number.server.name;
            break;
          case "user":
            groupKey = number.user.id;
            groupName = number.user.telegramUsername || number.user.firstName || "Unknown";
            break;
        }

        if (!groupMap.has(groupKey)) {
          groupMap.set(groupKey, { count: 0, revenue: 0, refunds: 0, name: groupName });
        }

        const group = groupMap.get(groupKey)!;
        group.count += 1;

        const price = parseFloat(number.price.toString());
        if (number.status === "COMPLETED") {
          group.revenue += price;
        } else if (number.status === "CANCELLED") {
          group.refunds += price;
        }
      }

      // Convert to array and sort by revenue desc
      stats.groups = Array.from(groupMap.entries())
        .map(([key, data]) => ({
          key,
          ...data,
        }))
        .sort((a, b) => b.revenue - a.revenue);

      return stats;
    }),

  // ============================================
  // Audit Logs
  // ============================================
  auditLog: createTRPCRouter({
    list: adminProcedure
      .input(
        z.object({
          userId: z.string().optional(),
          adminId: z.string().optional(),
          action: z.string().optional(),
          page: z.number().int().min(1).optional().default(1),
          pageSize: z.number().int().min(1).max(100).optional().default(20),
        })
      )
      .query(async ({ input }) => {
        const { userId, adminId, action, page, pageSize } = input;
        const skip = (page - 1) * pageSize;

        const where: Record<string, any> = {};

        if (userId) where.userId = userId;
        if (adminId) where.adminId = adminId;
        if (action) where.action = { contains: action, mode: "insensitive" };

        const [logs, total] = await Promise.all([
          prisma.userAuditLog.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { createdAt: "desc" },
            include: {
              user: {
                select: {
                  id: true,
                  telegramUsername: true,
                  firstName: true,
                  telegramId: true,
                },
              },
              admin: {
                select: {
                  id: true,
                  telegramUsername: true,
                  firstName: true,
                },
              },
            },
          }),
          prisma.userAuditLog.count({ where }),
        ]);

        return {
          logs,
          pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize),
          },
        };
      }),
  }),

  // ============================================
  // Transactions Management
  // ============================================
  transactions: createTRPCRouter({
    list: adminProcedure
      .input(
        z.object({
          type: z.enum(["DEPOSIT", "PURCHASE", "REFUND", "PROMO", "REFERRAL", "ADJUSTMENT"]).optional(),
          status: z.enum(["PENDING", "COMPLETED", "FAILED"]).optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          search: z.string().optional(),
          page: z.number().int().min(1).optional().default(1),
          pageSize: z.number().int().min(1).max(100).optional().default(50),
        })
      )
      .query(async ({ input }) => {
        const { type, status, startDate, endDate, search, page, pageSize } = input;
        const skip = (page - 1) * pageSize;

        // Build where clause
        const where: Record<string, any> = {};

        // Filter by type
        if (type) {
          where.type = type;
        }

        // Filter by status
        if (status) {
          where.status = status;
        }

        // Filter by date range
        if (startDate || endDate) {
          where.createdAt = {};
          if (startDate) {
            where.createdAt.gte = new Date(startDate);
          }
          if (endDate) {
            // Include the entire end day
            const endDateTime = new Date(endDate);
            endDateTime.setHours(23, 59, 59, 999);
            where.createdAt.lte = endDateTime;
          }
        }

        // Search by transaction ID, UTR, or description
        if (search) {
          where.OR = [
            { id: { contains: search, mode: "insensitive" } },
            { txnId: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ];
        }

        // Get transactions and total count in parallel
        const [transactions, total] = await Promise.all([
          prisma.transaction.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { createdAt: "desc" },
            include: {
              wallet: {
                include: {
                  user: {
                    select: {
                      id: true,
                      telegramId: true,
                      telegramUsername: true,
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              },
            },
          }),
          prisma.transaction.count({ where }),
        ]);

        return {
          transactions: transactions.map((tx) => ({
            id: tx.id,
            type: tx.type,
            amount: typeof tx.amount === "number" ? tx.amount : tx.amount.toNumber(),
            status: tx.status,
            description: tx.description,
            txnId: tx.txnId,
            metadata: tx.metadata as Record<string, any> | null,
            createdAt: tx.createdAt,
            user: tx.wallet?.user || null,
          })),
          pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize),
          },
        };
      }),

    // Get transaction statistics
    stats: adminProcedure
      .input(
        z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        })
      )
      .query(async ({ input }) => {
        const startDate = input.startDate ? new Date(input.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const endDate = input.endDate ? new Date(input.endDate) : new Date();

        const transactions = await prisma.transaction.findMany({
          where: {
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
            status: "COMPLETED",
          },
        });

        // Calculate stats by type
        const stats = {
          totalTransactions: transactions.length,
          totalVolume: 0,
          deposits: 0,
          depositsCount: 0,
          purchases: 0,
          purchasesCount: 0,
          refunds: 0,
          refundsCount: 0,
          promos: 0,
          promosCount: 0,
          adjustments: 0,
          adjustmentsCount: 0,
        };

        for (const tx of transactions) {
          const amount = parseFloat(tx.amount.toString());
          stats.totalVolume += amount;

          switch (tx.type) {
            case "DEPOSIT":
              stats.deposits += amount;
              stats.depositsCount += 1;
              break;
            case "PURCHASE":
              stats.purchases += amount;
              stats.purchasesCount += 1;
              break;
            case "REFUND":
              stats.refunds += amount;
              stats.refundsCount += 1;
              break;
            case "PROMO":
              stats.promos += amount;
              stats.promosCount += 1;
              break;
            case "ADJUSTMENT":
              stats.adjustments += amount;
              stats.adjustmentsCount += 1;
              break;
          }
        }

        // Net revenue (deposits + promos - refunds)
        stats.totalVolume = stats.deposits + stats.promos + stats.adjustments;
        const netRevenue = stats.purchases - stats.refunds;

        return {
          ...stats,
          netRevenue,
          startDate,
          endDate,
        };
      }),
  }),
});
