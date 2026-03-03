/**
 * OTP Provider Module
 *
 * Exports the OtpProviderClient and related types for communicating
 * with external OTP provider APIs.
 */

export { OtpProviderClient, SetStatusAction } from './client';
export type {
  GetNumberResponse,
  GetStatusResponse,
  GetPricesResponse,
  SetStatusResponse,
  OtpProviderConfig,
  SmsStatus,
  ServicePrice,
  OtpProviderErrorCode,
} from './types';
export { OTP_ERROR_MESSAGES } from './types';
