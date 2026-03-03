  /**
   * OTP Provider Client
   *
   * Communicates with external OTP provider APIs to:
   * - Purchase virtual phone numbers for SMS verification
   * - Poll for incoming SMS messages
   * - Cancel/finish orders
   * - Retrieve pricing information
   *
   * API format: /stubs/handler_api.php?api_key=KEY&action=ACTION&...
   */

  import {
    GetNumberResponse,
    GetStatusResponse,
    GetPricesResponse,
    SetStatusResponse,
    OtpProviderConfig,
    OtpProviderErrorCode,
    OTP_ERROR_MESSAGES,
    SetStatusAction,
    SmsStatus,
  } from './types';

  /**
   * OtpProviderClient - Client for communicating with OTP provider APIs
   */
  export class OtpProviderClient {
    private readonly apiUrl: string;
    private readonly apiKey: string;
    private readonly timeout: number;

    constructor(config: OtpProviderConfig) {
      // Remove trailing slash from API URL if present
      this.apiUrl = config.apiUrl.replace(/\/$/, '');
      this.apiKey = config.apiKey;
      this.timeout = config.timeout ?? 30000; // Default 30 second timeout
    }

    /**
     * Build the full URL for an API request
     */
    private buildUrl(action: string, params: Record<string, string> = {}): string {
      const url = new URL(`${this.apiUrl}/stubs/handler_api.php`);
      url.searchParams.set('api_key', this.apiKey);
      url.searchParams.set('action', action);

      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }

      return url.toString();
    }

    /**
     * Make a request to the OTP provider API
     */
    private async makeRequest(action: string, params: Record<string, string> = {}): Promise<string> {
      const url = this.buildUrl(action, params);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
        }

        const text = await response.text();
        return text.trim();
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Request timeout');
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    /**
     * Check if a response is a known error code
     */
    private isErrorCode(response: string): response is OtpProviderErrorCode {
      return response in OTP_ERROR_MESSAGES;
    }

    /**
     * Parse an error response and return the error message
     */
    private parseError(response: string): string {
      if (this.isErrorCode(response)) {
        return OTP_ERROR_MESSAGES[response];
      }
      return `Unknown error: ${response}`;
    }

    /**
     * Purchase a phone number for receiving SMS
     *
     * @param service - Service code (e.g., 'whatsapp', 'telegram')
     * @param country - Country code (e.g., 'in', 'us', '22')
     * @returns GetNumberResponse with orderId and phoneNumber on success
     */
    async getNumber(service: string, country: string): Promise<GetNumberResponse> {
      try {
        const response = await this.makeRequest('getNumber', {
          service,
          country,
        });

        // Check for error responses
        if (this.isErrorCode(response)) {
          return {
            success: false,
            error: this.parseError(response),
          };
        }

        // Parse success response: ACCESS_NUMBER:id:phone
        if (response.startsWith('ACCESS_NUMBER:')) {
          const parts = response.split(':');
          if (parts.length >= 3) {
            const orderId = parts[1];
            const phoneNumber = parts.slice(2).join(':'); // Handle phone numbers with colons

            return {
              success: true,
              orderId,
              phoneNumber,
            };
          }
        }

        // Unknown response format
        return {
          success: false,
          error: `Unexpected response format: ${response}`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
      }
    }

    /**
     * Get the status of an order / check for incoming SMS
     *
     * @param id - Order ID from getNumber
     * @returns GetStatusResponse with status and SMS content if received
     */
    async getStatus(id: string): Promise<GetStatusResponse> {
      try {
        const response = await this.makeRequest('getStatus', { id });

        // Waiting for SMS code
        if (response === 'STATUS_WAIT_CODE' || response === 'STATUS_WAIT_RETRY') {
          return { status: 'WAITING' };
        }

        // SMS received successfully
        if (response.startsWith('STATUS_OK:')) {
          const sms = response.substring('STATUS_OK:'.length);
          return {
            status: 'RECEIVED',
            sms,
          };
        }

        // Handle other known statuses
        if (response === 'STATUS_CANCELLED' || response === 'STATUS_TIMEOUT') {
          return { status: 'CANCELLED' };
        }

        // Check for error codes
        if (this.isErrorCode(response)) {
          // ID_NOT_EXIST typically means the order is no longer valid
          if (response === 'ID_NOT_EXIST') {
            return { status: 'CANCELLED' };
          }
          // For other errors, treat as cancelled and include the error
          return { status: 'CANCELLED' };
        }

        // Unknown status - treat as cancelled
        return { status: 'CANCELLED' };
      } catch (error) {
        throw error;
        
      }
    }

    /**
     * Update the status of an order
     *
     * @param id - Order ID from getNumber
     * @param status - Status code (8 = cancel, 6 = finish)
     * @returns SetStatusResponse indicating success or failure
     */
    async setStatus(id: string, status: SetStatusAction): Promise<SetStatusResponse> {
      try {
        const response = await this.makeRequest('setStatus', {
          id,
          status: status.toString(),
        });

        // Check for success responses
        if (
          response === 'ACCESS_CANCEL' ||
          response === 'ACCESS_ACTIVATION' ||
          response === 'ACCESS_FINISH'
        ) {
          return { success: true };
        }

        // Check for error codes
        if (this.isErrorCode(response)) {
          return {
            success: false,
            error: this.parseError(response),
          };
        }

        // Unknown response
        return {
          success: false,
          error: `Unexpected response: ${response}`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
      }
    }

    /**
     * Cancel an order
     *
     * @param id - Order ID to cancel
     * @returns SetStatusResponse indicating success or failure
     */
    async cancelOrder(id: string): Promise<SetStatusResponse> {
      return this.setStatus(id, SetStatusAction.CANCEL);
    }

    /**
     * Mark an order as finished (SMS received successfully)
     *
     * @param id - Order ID to finish
     * @returns SetStatusResponse indicating success or failure
     */
    async finishOrder(id: string): Promise<SetStatusResponse> {
      return this.setStatus(id, SetStatusAction.FINISH);
    }

    /**
     * Get the next SMS from an order (for multi-SMS support)
     *
     * @param id - Order ID to check for additional SMS
     * @returns SetStatusResponse with success=true if another SMS is available
     *
     * Usage:
     * 1. First call getStatus() to get initial SMS
     * 2. Call getNextSms() to check for additional SMS
     * 3. If returns "ACCESS_RETRY_GET", call getStatus() again to get the next SMS
     * 4. Repeat until no more SMS available
     */
    async getNextSms(id: string): Promise<{ success: boolean; hasMore: boolean; error?: string }> {
      try {
        const response = await this.makeRequest('setStatus', {
          id,
          status: SetStatusAction.GET_NEXT_SMS.toString(),
        });

        // Success - another SMS is available
        if (response === 'ACCESS_RETRY_GET') {
          return { success: true, hasMore: true };
        }

        // No more SMS or order not marked as used yet
        if (response === 'ACCESS_READY') {
          return { success: true, hasMore: false };
        }

        // Check for error codes
        if (this.isErrorCode(response)) {
          return {
            success: false,
            hasMore: false,
            error: this.parseError(response),
          };
        }

        // Unknown response
        return {
          success: false,
          hasMore: false,
          error: `Unexpected response: ${response}`,
        };
      } catch (error) {
        return {
          success: false,
          hasMore: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
      }
    }

    /**
     * Get pricing information for a country
     *
     * @param country - Country code (e.g., 'in', 'us', '22')
     * @returns GetPricesResponse with pricing data
     */
    async getPrices(country: string): Promise<GetPricesResponse> {
      try {
        const response = await this.makeRequest('getPrices', { country });

        // Check for error codes
        if (this.isErrorCode(response)) {
          return {
            success: false,
            error: this.parseError(response),
          };
        }

        // Try to parse as JSON
        try {
          const data = JSON.parse(response);
          return {
            success: true,
            data,
          };
        } catch {
          // Response is not valid JSON
          return {
            success: false,
            error: `Invalid JSON response: ${response}`,
          };
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
      }
    }

    /**
     * Get the current account balance
     *
     * @returns Balance amount or error
     */
    async getBalance(): Promise<{ success: boolean; balance?: number; error?: string }> {
      try {
        const response = await this.makeRequest('getBalance');

        // Check for error codes
        if (this.isErrorCode(response)) {
          return {
            success: false,
            error: this.parseError(response),
          };
        }

        // Parse balance (format varies by provider, often just a number)
        const balance = parseFloat(response);
        if (!isNaN(balance)) {
          return {
            success: true,
            balance,
          };
        }

        return {
          success: false,
          error: `Unexpected balance response: ${response}`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
      }
    }
  }

  // Re-export types and enums for convenience
  export { SetStatusAction } from './types';
  export type {
    GetNumberResponse,
    GetStatusResponse,
    GetPricesResponse,
    SetStatusResponse,
    OtpProviderConfig,
    SmsStatus,
  } from './types';
