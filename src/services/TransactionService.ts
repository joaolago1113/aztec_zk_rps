import { RPSService } from './RPSService.js';

export interface Transaction {
  action: 'start_game' | 'join_game' | 'reveal_game';
  token: string;
  amount: string;
  from?: string;
  to?: string;
  timestamp: number;
  status: 'pending' | 'success' | 'failed';
  txHash?: string;
}

export class TransactionService {
  constructor(
    private rpsService: RPSService
  ) {}

  async fetchTransactions(): Promise<Transaction[]> {
    return [];
  }

  async saveTransaction(transaction: Transaction) {
    // Implement saving RPS-specific transactions if needed
  }
}