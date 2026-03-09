/**
 * OTP Provider Client
 *
 * Communicates with external OTP provider APIs (sms-activate style).
 * API format: /stubs/handler_api.php?api_key=KEY&action=ACTION&...
 */

import {
  GetNumberResponse,
  GetStatusResponse,
  GetPricesResponse,
  GetNumbersStatusResponse,
  SetStatusResponse,
  OtpProviderConfig,
  OtpProviderErrorCode,
  OTP_ERROR_MESSAGES,
  SetStatusAction,
  SmsStatus,
} from './types';

export class OtpProviderClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;
  // FIX: path is configurable — not all providers use /stubs/handler_api.php
  private readonly apiPath: string;

  constructor(config: OtpProviderConfig) {
    this.apiUrl = config.apiUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 30_000;
    this.apiPath = config.apiPath ?? '/stubs/handler_api.php';
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private buildUrl(action: string, params: Record<string, string> = {}): string {
    const url = new URL(`${this.apiUrl}${this.apiPath}`);
    url.searchParams.set('api_key', this.apiKey);
    url.searchParams.set('action', action);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  private async makeRequest(
    action: string,
    params: Record<string, string> = {},
  ): Promise<string> {
    const url = this.buildUrl(action, params);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, { method: 'GET', signal: controller.signal });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status} ${response.statusText}: ${body.slice(0, 200)}`);
      }

      const text = (await response.text()).trim();
      return text;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`[OTP] Timeout after ${this.timeout}ms (action=${action})`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private isErrorCode(response: string): response is OtpProviderErrorCode {
    return response in OTP_ERROR_MESSAGES;
  }

  private parseError(response: string): string {
    if (this.isErrorCode(response)) return OTP_ERROR_MESSAGES[response];
    return `Unknown provider error: ${response}`;
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Purchase a phone number for receiving SMS.
   */
  async getNumber(service: string, country: string): Promise<GetNumberResponse> {
    try {
      const response = await this.makeRequest('getNumber', { service, country });

      if (this.isErrorCode(response)) {
        return { success: false, error: this.parseError(response) };
      }

      if (response.startsWith('ACCESS_NUMBER:')) {
        const parts = response.split(':');
        if (parts.length >= 3) {
          return {
            success: true,
            orderId: parts[1],
            phoneNumber: parts.slice(2).join(':'), // handles colons in phone numbers
          };
        }
      }

      return { success: false, error: `Unexpected response: ${response}` };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Get SMS status for an order.
   * FIX: no longer rethrows — returns WAITING on network errors so the
   * poller continues to the next number instead of crashing.
   */
  async getStatus(id: string): Promise<GetStatusResponse> {
    try {
      const response = await this.makeRequest('getStatus', { id });

      if (response === 'STATUS_WAIT_CODE' || response === 'STATUS_WAIT_RETRY') {
        return { status: 'WAITING' };
      }

      if (response.startsWith('STATUS_OK:')) {
        return { status: 'RECEIVED', sms: response.slice('STATUS_OK:'.length) };
      }

      if (
        response === 'STATUS_CANCELLED' ||
        response === 'STATUS_TIMEOUT' ||
        response === 'ID_NOT_EXIST'
      ) {
        return { status: 'CANCELLED' };
      }

      if (this.isErrorCode(response)) {
        return { status: 'CANCELLED' };
      }

      return { status: 'WAITING' }; // safe default — don't cancel on unknown response
    } catch (error) {
      // FIX: transient errors return WAITING so poller doesn't crash or cancel valid orders
      return { status: 'WAITING' };
    }
  }

  /**
   * Update order status.
   */
  async setStatus(id: string, status: SetStatusAction): Promise<SetStatusResponse> {
    try {
      const response = await this.makeRequest('setStatus', { id, status: status.toString() });

      if (
        response === 'ACCESS_CANCEL' ||
        response === 'ACCESS_ACTIVATION' ||
        response === 'ACCESS_FINISH'
      ) {
        return { success: true };
      }

      if (this.isErrorCode(response)) {
        return { success: false, error: this.parseError(response) };
      }

      return { success: false, error: `Unexpected setStatus response: ${response}` };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /** Cancel an order (status=8). */
  async cancelOrder(id: string): Promise<SetStatusResponse> {
    return this.setStatus(id, SetStatusAction.CANCEL);
  }

  /** Mark an order as finished (status=6). */
  async finishOrder(id: string): Promise<SetStatusResponse> {
    return this.setStatus(id, SetStatusAction.FINISH);
  }

  /**
   * Check if provider has another SMS for this order (status=3).
   * Returns hasMore=true if ACCESS_RETRY_GET.
   */
  async getNextSms(
    id: string,
  ): Promise<{ success: boolean; hasMore: boolean; error?: string }> {
    try {
      const response = await this.makeRequest('setStatus', {
        id,
        status: SetStatusAction.GET_NEXT_SMS.toString(),
      });

      if (response === 'ACCESS_RETRY_GET') return { success: true, hasMore: true };
      if (response === 'ACCESS_READY') return { success: true, hasMore: false };

      if (this.isErrorCode(response)) {
        return { success: false, hasMore: false, error: this.parseError(response) };
      }

      return { success: false, hasMore: false, error: `Unexpected response: ${response}` };
    } catch (error) {
      return {
        success: false,
        hasMore: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get pricing for a country.
   */
  async getPrices(country: string): Promise<GetPricesResponse> {
    try {
      const response = await this.makeRequest('getPrices', { country });

      if (this.isErrorCode(response)) {
        return { success: false, error: this.parseError(response) };
      }

      // Handle empty response
      if (!response || response.trim() === '') {
        return { success: false, error: 'Empty response from provider' };
      }

      try {
        const parsed = JSON.parse(response);

        // Validate response is an object (expected structure)
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          return { success: false, error: `Invalid response format: expected object` };
        }

        return { success: true, data: parsed };
      } catch {
        // Truncate response in error to avoid huge logs
        const truncated = response.length > 100 ? response.slice(0, 100) + '...' : response;
        return { success: false, error: `Invalid JSON response: ${truncated}` };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Get available number counts for all services in a country.
   */
  async getNumbersStatus(country: string): Promise<GetNumbersStatusResponse> {
    try {
      const response = await this.makeRequest('getNumbersStatus', { country });

      if (this.isErrorCode(response)) {
        return { success: false, error: this.parseError(response) };
      }

      // Handle empty response
      if (!response || response.trim() === '') {
        return { success: false, error: 'Empty response from provider' };
      }

      try {
        const raw = JSON.parse(response);

        if (typeof raw !== 'object' || raw === null) {
          return { success: false, error: `Expected object, got ${typeof raw}` };
        }

        const data: Record<string, number> = {};
        for (const [key, value] of Object.entries(raw)) {
          const n = Number(value);
          if (!isNaN(n)) data[key] = n;
        }

        return { success: true, data };
      } catch {
        // Truncate response in error to avoid huge logs
        const truncated = response.length > 100 ? response.slice(0, 100) + '...' : response;
        return { success: false, error: `Invalid JSON response: ${truncated}` };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Get upstream account balance.
   * FIX: correctly strips ACCESS_BALANCE: prefix before parseFloat.
   */
  async getBalance(): Promise<{ success: boolean; balance?: number; error?: string }> {
    try {
      const response = await this.makeRequest('getBalance');

      if (this.isErrorCode(response)) {
        return { success: false, error: this.parseError(response) };
      }

      // Format: ACCESS_BALANCE:123.45
      const raw = response.startsWith('ACCESS_BALANCE:')
        ? response.slice('ACCESS_BALANCE:'.length)
        : response;

      const balance = parseFloat(raw);
      if (!isNaN(balance)) return { success: true, balance };

      return { success: false, error: `Unexpected balance format: ${response}` };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

export { SetStatusAction } from './types';
export type {
  GetNumberResponse,
  GetStatusResponse,
  GetPricesResponse,
  GetNumbersStatusResponse,
  SetStatusResponse,
  OtpProviderConfig,
  SmsStatus,
} from './types';