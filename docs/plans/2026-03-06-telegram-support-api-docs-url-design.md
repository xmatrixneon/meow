# Telegram Support & Configurable API Docs URL Design

**Date:** 2026-03-06
**Status:** Approved

## Overview

Add a Telegram support button to the profile page and make the API docs base URL configurable from the database.

## Requirements

1. Add a Telegram support button on the profile page that opens a chat with the support bot
2. The Telegram bot username should come from the database
3. The API docs base URL should be configurable from the database
4. Default to `https://meowsms.shop/stubs/handler_api.php` for API docs

## Database Schema Changes

Add two new fields to the `Settings` model in `prisma/schema.prisma`:

```prisma
model Settings {
  // ... existing fields ...
  telegramHelpUrl     String?
  telegramSupportUsername String?  // NEW: Support bot username (e.g., "meowsms_bot")
  apiDocsBaseUrl      String?      // NEW: API docs base URL (e.g., "https://meowsms.shop")
}
```

### Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `telegramSupportUsername` | String? | Telegram bot username for support | `"meowsms_bot"` |
| `apiDocsBaseUrl` | String? | Base URL for API documentation | `"https://meowsms.shop"` |

## Profile Page Changes

### Add Telegram Support Button

Add a Telegram support button in the "Support" section that:
- Opens `https://t.me/{username}` when clicked
- Shows the Telegram icon with "Support" label
- Displays the username (e.g., `@meowsms_bot`)
- Only renders when `telegramSupportUsername` is set

**Location:** `app/profile/page.tsx` - within the `SettingsCard` under "Support" section

## API Docs Dialog Changes

### Use Configurable Base URL

Update `ApiDocsDialog` to:
- Accept an optional `apiDocsBaseUrl` prop from settings
- Fall back to `window.location.origin` if not provided
- Display the URL as `{baseUrl}/stubs/handler_api.php`

**Location:** `components/api-docs-dialog.tsx`

## Data Flow

```
Database (Settings)
    ↓
trpc.service.settings.useQuery()
    ↓
settings.telegramSupportUsername → ProfilePage → Telegram Support Button
settings.apiDocsBaseUrl → ProfilePage → ApiDocsDialog
```

## Database Initialization

After schema migration, populate initial values via PostgreSQL MCP:

```sql
-- Insert/update default settings
INSERT INTO "Settings" ("id", "telegramSupportUsername", "apiDocsBaseUrl")
VALUES ('1', 'meowsms_bot', 'https://meowsms.shop')
ON CONFLICT ("id") DO UPDATE SET
  "telegramSupportUsername" = EXCLUDED."telegramSupportUsername",
  "apiDocsBaseUrl" = EXCLUDED."apiDocsBaseUrl";
```

## Implementation Checklist

1. Update `prisma/schema.prisma` with new fields
2. Run Prisma migration
3. Update `ProfilePage` to add Telegram support button
4. Update `ApiDocsDialog` to accept and use `apiDocsBaseUrl`
5. Pass `apiDocsBaseUrl` from `ProfilePage` to `ApiDocsDialog`
6. Populate initial values in database using PostgreSQL MCP

## Dependencies

- PostgreSQL MCP for database operations
- Prisma for schema migrations
- Existing `trpc.service.settings` query (already available)
