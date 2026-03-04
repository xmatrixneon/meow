# External API Implementation Design

> **For Claude:** This document describes the design for implementing a full external stubs API for the MeowSMS virtual OTP service.

## Overview

The external API (`/api/stubs/handler_api.php`) will function as a **proxy/reseller API** that:
- Proxies requests to upstream OTP providers (cattysms.shop, 5sim, etc.)
- Manages user balance for purchases
- Provides service discovery endpoints
- Supports all standard stubs protocol actions

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    User (API Consumer)                             │
│                          Requests                                    │
│                              │                                      │
│                              ▼                                      │
│                    ┌──────────────────────────────────────┐         │
│                    │  Your External API (Next.js)      │         │
│                    │  - Authentication                 │         │
│                    │  - Balance Management            │         │
│                    │  - Service Discovery            │         │
│                    └──────────┬───────────────────────┘         │
│                               │                            │         │
┌───────────────────────────────┼───────────────────────────────┐         │
│   Your Database            │  Upstream Providers            │         │
│   - Users                    │   - cattysms.shop                │         │
│   - Wallets                   │   - (add more providers)            │         │
│   - Orders                    │   - Real-time stock check         │         │
└───────────────────────────┴───────────────────────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

## API Endpoints

| Endpoint | Method | Purpose | External Call |
|----------|---------|----------|---------------|
| **getNumber** | GET | Purchase number (proxy to provider, deduct balance) |
| **getStatus** | GET | Check SMS status (proxy to provider) |
| **setStatus** | GET | Cancel/finish/multi-SMS (proxy to provider) |
| **getBalance** | GET | Return user wallet balance |
| **getCountries** | GET | List available servers/countries |
| **getServices** | GET | List services for a country |

## Data Flows

### getNumber Flow

```
1. Validate API key → Get user_id from user_api table
2. Check user is active (user_data.status = 1)
3. Get service from database by code + country
4. Check user wallet balance
5. If balance < price → return NO_BALANCE
6. Deduct balance atomically:
   - UPDATE user_wallet: balance -= price, total_otp += 1
7. Call upstream provider API for number
8. Create order in active_number table
9. Return ACCESS_NUMBER:orderId:phone
```

### getStatus Flow

```
1. Validate API key → Get user_id
2. Get order from active_number by order_id
3. Get upstream provider URL from otp_server + api_detail
4. If order not found → return NO_ACTIVATION
5. Call upstream provider API for SMS status
6. Handle responses:
   - STATUS_WAIT_CODE → Return waiting
   - STATUS_OK:sms → Update DB, return SMS
   - STATUS_CANCEL → Cancel with refund
```

### setStatus Flow

```
1. Validate API key, order_id, status
2. status=8 → Cancel:
   - Check within 20 minutes of purchase
   - Call upstream provider API to cancel
   - Refund balance, update order status
3. status=3 → Request next SMS:
   - Call upstream provider API with status=3
   - Return ACCESS_RETRY_GET
4. status=6 → Finish order (mark as complete)
```

### getBalance Flow

```
1. Validate API key → Get user_id
2. Query user_wallet table
3. Return ACCESS_BALANCE:amount
```

### getCountries Flow

```
1. Validate API key → Get user_id
2. Query otp_server table
3. Return JSON: {"0": "India", "1": "Russia", "22": "CattySMS", ...}
```

### getServices Flow

```
1. Validate API key, country → Get user_id
2. Query service table filtered by country + server_id
3. Return JSON: {"1": "WhatsApp", "2": "Telegram", "3": "Airtel", ...}
```

## Error Codes

| Code | Description |
|-------|-------------|
| `BAD_KEY` | Invalid or expired API key |
| `NO_BALANCE` | Insufficient balance for purchase |
| `NO_API_NUMBER` | Upstream provider has no numbers |
| `ACCOUNT_BLOCKED` | User account blocked (user_data.status != 1) |
| `BAD_SERVICE` | Invalid service ID |
| `BAD_COUNTRY` | Invalid country code |
| `NO_ACTIVATION` | Order not found |
| `BAD_ACTION` | Invalid action parameter |
| `STATUS_CANCEL` | Order cancelled |
| `STATUS_WAIT_CODE` | Waiting for SMS |
| `STATUS_OK:sms` | SMS received |
| `ACCESS_BALANCE:amount` | Balance query success |
| `ACCESS_RETRY_GET` | Next SMS requested |
| `SERVER_ERROR` | Upstream API error |

## Response Format

All responses are plain text (no JSON), following stubs protocol:

```
ACCESS_NUMBER:abc123:91987654321
STATUS_OK:<#> 1234 is your OTP
STATUS_WAIT_CODE
STATUS_CANCEL
ACCESS_BALANCE:100.50
{"0": "India", "22": "CattySMS"}
{"1": "WhatsApp", "3": "Airtel"}
BAD_KEY
NO_BALANCE
```

## Database Queries Required

### Tables to Query
- `user_api` - Map api_key to user_id
- `user_data` - Check user active status
- `user_wallet` - Balance management
- `otp_server` - Upstream provider servers
- `api_detail` - Provider API credentials
- `service` - Available services
- `active_number` - Order records

### Key Queries

```sql
-- Get user_id from API key
SELECT user_id FROM user_api WHERE api_key = ?

-- Get user status
SELECT status FROM user_data WHERE id = ?

-- Get wallet balance
SELECT balance FROM user_wallet WHERE user_id = ?

-- Get OTP server details
SELECT * FROM otp_server WHERE id = ?

-- Get provider API credentials
SELECT * FROM api_detail WHERE id = ?

-- Get service details
SELECT * FROM service WHERE service_id = ? AND server_id = ?

-- Create order
INSERT INTO active_number (user_id, number_id, number, server_id, service_id,
  order_id, buy_time, status, sms_text, service_price,
  service_name, active_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 2, 'PENDING')

-- Update balance (deduct)
UPDATE user_wallet SET balance = balance - ?, total_otp = total_otp + 1
WHERE user_id = ?

-- Update balance (refund)
UPDATE user_wallet SET balance = balance + ?, total_otp = total_otp - 1
WHERE user_id = ?

-- Update order SMS
UPDATE active_number SET sms_text = ?, status = 1
WHERE order_id = ?

-- Cancel order
UPDATE active_number SET active_status = 1, status = 3
WHERE order_id = ?
```

## Implementation Tasks

1. **Database Schema Updates** - Add user_api table if not exists
2. **OtpProviderClient** - Add methods for upstream provider calls
3. **getNumber** - Implement purchase with balance deduction
4. **getStatus** - Implement SMS check with upstream API calls
5. **setStatus** - Implement cancel/finish/multi-SMS
6. **getBalance** - Implement balance query
7. **getCountries** - Implement countries list
8. **getServices** - Implement services list
9. **Error Handling** - Proper error codes and responses
10. **Testing** - Test all endpoints with curl

## Technical Notes

- **Authentication**: Use telegramId as API key, map via user_api table
- **Balance**: Atomic transactions for purchase/cancel to prevent double-spending
- **Concurrency**: Use database transactions for critical operations
- **Timeout**: Upstream API calls should have 10-20 second timeout
- **CORS**: Allow all origins for external API access
- **Logging**: Log all API calls and errors for debugging

## Files to Modify

- `app/api/stubs/handler_api.php/route.ts` - Main API handler
- `prisma/schema.prisma` - Add user_api table if needed
- `lib/providers/client.ts` - Extend with upstream provider methods
