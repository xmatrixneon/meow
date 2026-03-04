/**
 * Types for OTP Provider API communication
 */

/**
 * Response from getNumber API call
 */
export interface GetNumberResponse {
  success: boolean;
  orderId?: string;
  phoneNumber?: string;
  error?: string;
}

/**
 * Status values for SMS delivery
 */
export type SmsStatus = 'WAITING' | 'RECEIVED' | 'CANCELLED';

/**
 * Response from getStatus API call
 */
export interface GetStatusResponse {
  status: SmsStatus;
  sms?: string;
}

/**
 * Response from setStatus API call
 */
export interface SetStatusResponse {
  success: boolean;
  error?: string;
}

/**
 * Price information for a service
 */
export interface ServicePrice {
  service: string;
  price: number;
  count?: number;
}

/**
 * Response from getPrices API call
 * Structure varies by provider, but typically includes country code and service prices
 */
export interface GetPricesResponse {
  success: boolean;
  data?: Record<string, ServicePrice[] | number | string>;
  error?: string;
}

/**
 * Response from getNumbersStatus API call
 * Returns stock count for each service on a server/country
 * Format: {"whatsapp_0": 50, "airtel_0": 25, "telegram_0": 100}
 */
export interface GetNumbersStatusResponse {
  success: boolean;
  data?: Record<string, number>;
  error?: string;
}

/**
 * Status codes for setStatus action
 * - 8: Cancel the order
 * - 6: Mark order as finished (SMS received successfully)
 * - 3: Get next SMS from order (for multi-SMS support)
 */
export enum SetStatusAction {
  CANCEL = 8,
  FINISH = 6,
  /**
   * Get next SMS from order (for multi-SMS support)
   * After receiving first SMS, call with status=3 to get additional SMS
   * Returns "ACCESS_RETRY_GET" if another SMS is available
   */
  GET_NEXT_SMS = 3,
}

/**
 * Known error codes from OTP provider APIs
 */
export type OtpProviderErrorCode =
  | 'BAD_KEY'
  | 'ERROR_SQL'
  | 'BAD_ACTION'
  | 'BAD_SERVICE'
  | 'BAD_COUNTRY'
  | 'NO_NUMBER'
  | 'BANNED'
  | 'NO_NUMBERS'
  | 'NO_BALANCE'
  | 'WRONG_SERVICE'
  | 'BAD_STATUS'
  | 'ID_NOT_EXIST';

/**
 * Error messages mapping for known error codes
 */
export const OTP_ERROR_MESSAGES: Record<OtpProviderErrorCode, string> = {
  BAD_KEY: 'Invalid API key',
  ERROR_SQL: 'Server database error',
  BAD_ACTION: 'Invalid action specified',
  BAD_SERVICE: 'Invalid service specified',
  BAD_COUNTRY: 'Invalid country code',
  NO_NUMBER: 'No phone numbers available for this service/country',
  BANNED: 'Account is banned',
  NO_NUMBERS: 'No phone numbers available for this service/country',
  NO_BALANCE: 'Insufficient balance',
  WRONG_SERVICE: 'Service not available',
  BAD_STATUS: 'Invalid status value',
  ID_NOT_EXIST: 'Order ID does not exist',
};

/**
 * Configuration for creating an OTP provider client
 */
export interface OtpProviderConfig {
  apiUrl: string;
  apiKey: string;
  timeout?: number;
}
