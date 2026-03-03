/**
 * Payments Module
 *
 * This module provides payment verification clients for various
 * payment providers used in the wallet deposit flow.
 */

export {
  BharatPeClient,
  BharatPeError,
  createBharatPeClient,
  type BharatPeClientConfig,
  type BharatPeTransaction,
  type BharatPeApiResponse,
  type VerifyTransactionResult,
} from './bharatpe';
