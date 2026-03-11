import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { customAlphabet } from "nanoid"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Alphanumeric ID generator (no underscores, hyphens, or special chars)
// Used for orderId, apiKey, and other user-visible identifiers
const alphanumeric = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
export const generateId = customAlphabet(alphanumeric, 16)
export const generateApiKey = customAlphabet(alphanumeric, 32)