import { AccountWallet, Fr, PXE, TxExecutionRequest, AuthWitness } from "@aztec/aztec.js";
import { Eip1193Account } from "@shieldswap/wallet-sdk/eip1193";
import { ExecutionRequestInit } from "@aztec/aztec.js/entrypoint";
import { IntentAction } from "@aztec/aztec.js/utils";
import { CompleteAddress } from "@aztec/circuits.js";
import { type AccountInterface } from '@aztec/aztec.js/account';

export class ExternalAccountWallet extends AccountWallet {
  constructor(pxe: PXE, private externalAccount: Eip1193Account) {
    super(pxe, externalAccount);
  }

  override async createTxExecutionRequest(exec: ExecutionRequestInit): Promise<TxExecutionRequest> {
    const tx = await this.externalAccount.sendTransaction({
      calls: exec.calls,
      authWitnesses: exec.authWitnesses
    });
    return tx as unknown as TxExecutionRequest;
  }

  override getChainId(): Fr {
    return Fr.fromString('1'); // Or get from config
  }

  override getVersion(): Fr {
    return Fr.fromString('1');
  }

  override async createAuthWit(messageHashOrIntent: Fr | Buffer | IntentAction): Promise<AuthWitness> {
    const result = await this.externalAccount.provider.request({
      method: 'aztec_createAuthWit',
      params: [messageHashOrIntent instanceof Fr ? messageHashOrIntent.toString() : messageHashOrIntent]
    });
    return result as AuthWitness;
  }

  override getAddress() {
    return this.externalAccount.address;
  }

  getCompleteAddress(): CompleteAddress {
    return { address: this.externalAccount.address };
  }
} 