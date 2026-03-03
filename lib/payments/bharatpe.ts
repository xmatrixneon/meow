/**
 * BharatPe Payment Client
 *
 * Used to verify UPI transactions by querying the BharatPe API.
 * This client is used for wallet deposits where users pay via UPI
 * to the merchant's QR code and verify their transaction using the UTR number.
 */

export interface BharatPeTransaction {
  id: number;
  paymentTimestamp: number;
  internalUtr: string;
  bankReferenceNo: string;
  amount: number;
  payerName?: string;
  payerHandle?: string;
  type: string;  // "PAYMENT_RECV", "REFUND", etc.
  status: string;  // "SUCCESS", "FAILED", "PENDING", etc.
  payeeIdentifier: string;
  merchantId: number;
  txnSubType?: string;
}

export interface BharatPeApiResponse {
  status?: boolean | string;
  message?: string;
  responseMessage?: string;
  responseCode?: string;
  data?: {
    collection?: number;
    services?: any;
    transactions?: BharatPeTransaction[];
  };
}

export interface VerifyTransactionResult {
  found: boolean;
  canCredit?: boolean;  // Whether this transaction can be credited
  amount?: number;
  payerName?: string;
  payerVpa?: string;
  transactionDate?: string;
  utr?: string;
  payeeIdentifier?: string;  // The merchant VPA that received the payment
  transactionStatus?: string;  // "SUCCESS", "FAILED", etc.
  transactionType?: string;    // "PAYMENT_RECV", "REFUND", etc.
}

export interface BharatPeClientConfig {
  merchantId: string;
  token: string;
}

/**
 * Error class for BharatPe API errors
 */
export class BharatPeError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly responseBody?: string
  ) {
    super(message);
    this.name = 'BharatPeError';
  }
}

/**
 * BharatPe Client for verifying UPI transactions
 *
 * @example
 * ```typescript
 * const client = new BharatPeClient({
 *   merchantId: 'your-merchant-id',
 *   token: 'your-auth-token'
 * });
 *
 * const result = await client.verifyTransaction('123456789012');
 * if (result.found) {
 *   console.log(`Found payment of ${result.amount} from ${result.payerName}`);
 * }
 * ```
 */
export class BharatPeClient {
  private readonly baseUrl = 'https://payments-tesseract.bharatpe.in';
  private readonly merchantId: string;
  private readonly token: string;

  constructor(config: BharatPeClientConfig) {
    if (!config.merchantId) {
      throw new Error('BharatPeClient: merchantId is required');
    }
    if (!config.token) {
      throw new Error('BharatPeClient: token is required');
    }

    this.merchantId = config.merchantId;
    this.token = config.token;
  }

  /**
   * Verify a UPI transaction by UTR (Unique Transaction Reference) number
   *
   * @param utr - The 12-digit UTR/bankReferenceNo from the UPI transaction
   * @returns Verification result indicating if the transaction was found
   * @throws BharatPeError if the API request fails
   */
  async verifyTransaction(utr: string): Promise<VerifyTransactionResult> {
    // Validate UTR format (typically 12 digits)
    if (!utr || typeof utr !== 'string') {
      return { found: false };
    }

    const sanitizedUtr = utr.trim();

    if (sanitizedUtr.length === 0) {
      return { found: false };
    }

    try {
      const transactions = await this.fetchTransactions();

      // Find transaction matching the UTR/bankReferenceNo
      const matchingTransaction = transactions.find(
        (tx) => tx.bankReferenceNo === sanitizedUtr
      );

      if (!matchingTransaction) {
        return { found: false };
      }

      // Only credit successful received payments
      if (matchingTransaction.status !== 'SUCCESS') {
        return {
          found: true,
          canCredit: false,
          transactionStatus: matchingTransaction.status,
          utr: matchingTransaction.bankReferenceNo,
        };
      }

      // Only credit PAYMENT_RECV transactions (not refunds or other types)
      if (matchingTransaction.type !== 'PAYMENT_RECV') {
        return {
          found: true,
          canCredit: false,
          transactionType: matchingTransaction.type,
          utr: matchingTransaction.bankReferenceNo,
        };
      }

      return {
        found: true,
        canCredit: true,
        amount: typeof matchingTransaction.amount === 'number' ? matchingTransaction.amount : parseFloat(matchingTransaction.amount) || 0,
        payerName: matchingTransaction.payerName,
        payerVpa: matchingTransaction.payerHandle, // API returns payerHandle, map to payerVpa for compatibility
        transactionDate: new Date(matchingTransaction.paymentTimestamp).toISOString(),
        utr: matchingTransaction.bankReferenceNo,
        payeeIdentifier: matchingTransaction.payeeIdentifier,
        transactionStatus: matchingTransaction.status,
        transactionType: matchingTransaction.type,
      };
    } catch (error) {
      if (error instanceof BharatPeError) {
        throw error;
      }

      // Wrap unexpected errors
      throw new BharatPeError(
        `Failed to verify transaction: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Fetch all transactions from BharatPe API
   *
   * @returns Array of transactions
   * @throws BharatPeError if the API request fails
   */
  private async fetchTransactions(): Promise<BharatPeTransaction[]> {
    const url = `${this.baseUrl}/api/v1/merchant/transactions?module=PAYMENT_QR&merchantId=${encodeURIComponent(this.merchantId)}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'token': this.token,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const responseBody = await this.readResponseBody(response);
        throw new BharatPeError(
          `BharatPe API error: ${response.status} ${response.statusText}`,
          response.status,
          responseBody
        );
      }

      const data: BharatPeApiResponse = await response.json();

      // BharatPe API returns status as boolean (true/false) not string
      // Also returns responseMessage for errors, not message
      const isSuccess = data.status === true ||
                      (typeof data.status === 'string' && (data.status === 'SUCCESS' || data.status === 'OK'));

      if (!isSuccess) {
        const errorMessage = (data as any).responseMessage || data.message || 'Unknown error';
        throw new BharatPeError(
          `BharatPe API error: ${errorMessage}`
        );
      }

      // Transactions are nested under data.data.transactions
      return data.data?.transactions || [];
    } catch (error) {
      if (error instanceof BharatPeError) {
        throw error;
      }

      // Handle network errors
      throw new BharatPeError(
        `Network error while fetching transactions: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Safely read response body as text
   */
  private async readResponseBody(response: Response): Promise<string> {
    try {
      return await response.text();
    } catch {
      return '[Unable to read response body]';
    }
  }
}

/**
 * Factory function to create a BharatPe client from settings
 *
 * @param merchantId - The merchant ID from settings
 * @param token - The authentication token from settings
 * @returns BharatPeClient instance
 */
export function createBharatPeClient(
  merchantId: string,
  token: string
): BharatPeClient {
  return new BharatPeClient({ merchantId, token });
}
