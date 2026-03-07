/**
 * BharatPe Payment Client
 *
 * Used to verify UPI transactions by querying the BharatPe API.
 * Users pay via UPI to the merchant QR and verify using their UTR number.
 */

export interface BharatPeTransaction {
  id: number;
  paymentTimestamp: number;
  internalUtr: string;
  bankReferenceNo: string;
  // FIX (Bug 11): API actually returns string in some cases — reflect reality
  amount: number | string;
  payerName?: string;
  payerHandle?: string;
  type: string;
  status: string;
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
    services?: unknown;
    transactions?: BharatPeTransaction[];
  };
}

export interface VerifyTransactionResult {
  found: boolean;
  canCredit?: boolean;
  amount?: number;
  payerName?: string;
  payerVpa?: string;
  transactionDate?: string;
  utr?: string;
  payeeIdentifier?: string;
  transactionStatus?: string;
  transactionType?: string;
}

export interface BharatPeClientConfig {
  merchantId: string;
  token: string;
  // FIX (Bug 10): configurable timeout, default 15s
  timeoutMs?: number;
}

export class BharatPeError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly responseBody?: string,
  ) {
    super(message);
    this.name = "BharatPeError";
  }
}

export class BharatPeClient {
  private readonly baseUrl = "https://payments-tesseract.bharatpe.in";
  private readonly merchantId: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(config: BharatPeClientConfig) {
    if (!config.merchantId) throw new Error("BharatPeClient: merchantId is required");
    if (!config.token) throw new Error("BharatPeClient: token is required");
    this.merchantId = config.merchantId;
    this.token = config.token;
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  async verifyTransaction(utr: string): Promise<VerifyTransactionResult> {
    if (!utr || typeof utr !== "string") return { found: false };

    const sanitizedUtr = utr.trim();
    if (sanitizedUtr.length === 0) return { found: false };

    try {
      const transactions = await this.fetchTransactions();

      // FIX (Bug 9): check BOTH bankReferenceNo and internalUtr.
      // Different UPI apps show different UTR fields to the user — users
      // submitting internalUtr would always get "not found" with the old code.
      const matchingTransaction = transactions.find(
        (tx) =>
          tx.bankReferenceNo === sanitizedUtr ||
          tx.internalUtr === sanitizedUtr,
      );

      if (!matchingTransaction) {
        return { found: false };
      }

      if (matchingTransaction.status !== "SUCCESS") {
        return {
          found: true,
          canCredit: false,
          transactionStatus: matchingTransaction.status,
          utr: matchingTransaction.bankReferenceNo,
        };
      }

      if (matchingTransaction.type !== "PAYMENT_RECV") {
        return {
          found: true,
          canCredit: false,
          transactionType: matchingTransaction.type,
          utr: matchingTransaction.bankReferenceNo,
        };
      }

      // FIX (Bug 11): normalise amount — API returns string in some responses
      const amount =
        typeof matchingTransaction.amount === "number"
          ? matchingTransaction.amount
          : parseFloat(matchingTransaction.amount as string) || 0;

      return {
        found: true,
        canCredit: true,
        amount,
        payerName: matchingTransaction.payerName,
        payerVpa: matchingTransaction.payerHandle,
        transactionDate: new Date(matchingTransaction.paymentTimestamp).toISOString(),
        utr: matchingTransaction.bankReferenceNo,
        payeeIdentifier: matchingTransaction.payeeIdentifier,
        transactionStatus: matchingTransaction.status,
        transactionType: matchingTransaction.type,
      };
    } catch (error) {
      if (error instanceof BharatPeError) throw error;
      throw new BharatPeError(
        `Failed to verify transaction: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  private async fetchTransactions(): Promise<BharatPeTransaction[]> {
    // FIX (Bug 8): add date filter to avoid fetching all-time transactions.
    // Query last 7 days only — UTRs older than that are very unlikely to be
    // submitted for a wallet deposit, and this dramatically reduces payload size.
    const now = Math.floor(Date.now() / 1000);
    const sevenDaysAgo = now - 7 * 24 * 60 * 60;

    const url =
      `${this.baseUrl}/api/v1/merchant/transactions` +
      `?module=PAYMENT_QR` +
      `&merchantId=${encodeURIComponent(this.merchantId)}` +
      `&startTime=${sevenDaysAgo}` +
      `&endTime=${now}`;

    // FIX (Bug 10): abort if BharatPe takes more than timeoutMs
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          token: this.token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        const body = await this.readResponseBody(response);
        throw new BharatPeError(
          `BharatPe API error: ${response.status} ${response.statusText}`,
          response.status,
          body,
        );
      }

      const data: BharatPeApiResponse = await response.json();

      const isSuccess =
        data.status === true ||
        (typeof data.status === "string" &&
          (data.status === "SUCCESS" || data.status === "OK"));

      if (!isSuccess) {
        const msg =
          (data as Record<string, unknown>).responseMessage ||
          data.message ||
          "Unknown error";
        throw new BharatPeError(`BharatPe API error: ${msg}`);
      }

      return data.data?.transactions || [];
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof BharatPeError) throw error;
      // Provide a cleaner message for AbortError (timeout)
      const msg =
        error instanceof Error && error.name === "AbortError"
          ? `BharatPe API timed out after ${this.timeoutMs}ms`
          : `Network error: ${error instanceof Error ? error.message : "Unknown error"}`;
      throw new BharatPeError(msg);
    }
  }

  private async readResponseBody(response: Response): Promise<string> {
    try {
      return await response.text();
    } catch {
      return "[Unable to read response body]";
    }
  }
}

export function createBharatPeClient(merchantId: string, token: string): BharatPeClient {
  return new BharatPeClient({ merchantId, token });
}