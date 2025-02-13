import { AccountWallet, Fr, PXE, TxExecutionRequest, AuthWitness } from "@aztec/aztec.js";
import type { AccountInterface } from "@aztec/aztec.js/account";
import { Eip1193Account } from "@shieldswap/wallet-sdk/eip1193";
import { ExecutionRequestInit } from "@aztec/aztec.js/entrypoint";
import type { IntentAction } from "@aztec/aztec.js/utils";
import { CompleteAddress } from "@aztec/circuits.js";

/**
 * Adapter that implements AccountInterface using an Eip1193Account.
 */
class ExternalAccountAdapter implements AccountInterface {
  constructor(private externalAccount: Eip1193Account) {}

  getAddress() {
    return this.externalAccount.address;
  }

  getCompleteAddress(): CompleteAddress {
    return { 
      address: this.externalAccount.getAddress(), 
      publicKeys: {} as any,
      partialAddress: {} as any,
      toJSON: () => this.externalAccount.address.toString(), 
      getPreaddress: () => Promise.resolve(Fr.fromString(this.externalAccount.address.toString())),
    };
  }

  async createTxExecutionRequest(exec: ExecutionRequestInit): Promise<TxExecutionRequest> {
    const authWitnesses = Array.isArray(exec.authWitnesses) &&
      exec.authWitnesses.length > 0 &&
      typeof exec.authWitnesses[0] === 'object' &&
      'caller' in exec.authWitnesses[0]
        ? await Promise.all(exec.authWitnesses.map(async (w: any) => ({
              caller: w.caller.toString(),
              action: await encodeFunctionCall(w.action)
          })))
        : [];

    const tx = await this.externalAccount.sendTransaction({
      calls: exec.calls,
      authWitnesses: authWitnesses
    });
    
    return tx as unknown as TxExecutionRequest;
  }

  getChainId(): Fr {
    // Depending on your configuration, you may have a dynamic chain id.
    // Here we use a default.
    return Fr.fromString("1");
  }

  getVersion(): Fr {
    return Fr.fromString("1");
  }

  async createAuthWit(messageHashOrIntent: Fr | Buffer | IntentAction): Promise<AuthWitness> {
    let param: string;
    if (messageHashOrIntent instanceof Fr) {
      param = messageHashOrIntent.toString();
    } else if (Buffer.isBuffer(messageHashOrIntent)) {
      param = "0x" + messageHashOrIntent.toString('hex');
    } else {
      // For IntentAction, you can use its toString() method or call a helper to compute the message hash
      param = messageHashOrIntent.toString();
    }

    const result = await (this.externalAccount.provider as any).request({
      method: "aztec_createAuthWit",
      params: [param]
    });
    return result as AuthWitness;
  }
}

/**
 * ExternalAccountWallet wraps an Eip1193Account into an AccountWallet-complaint adapter.
 */
export class ExternalAccountWallet extends AccountWallet {
  private externalAccount: Eip1193Account;

  constructor(pxe: PXE, externalAccount: Eip1193Account) {
    const adapter = new ExternalAccountAdapter(externalAccount);
    super(pxe, adapter);
    this.externalAccount = externalAccount;
  }

  /**
   * Exposes the underlying Eip1193Account.
   */
  public getEip1193Account(): Eip1193Account {
    return this.externalAccount;
  }

} 