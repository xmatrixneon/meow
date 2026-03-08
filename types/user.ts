// types/user.ts
// Matches the better-auth session.user shape + your Prisma User model.

export interface User {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
  // Non-nullable in schema — every user signs in via Telegram
  telegramId: string;
  telegramUsername: string | null;
  // Telegram Mini App user fields populated via mapMiniAppDataToUser
  firstName: string | null;
  lastName: string | null;
  languageCode: string | null;
  isPremium: boolean | null;
  allowsWriteToPm: boolean | null;
  photoUrl: string | null;
  isAdmin: boolean;
}