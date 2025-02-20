import { AccountWallet, Fr, PXE, TxExecutionRequest, AuthWitness, CompleteAddress, computeAuthWitMessageHash } from "@aztec/aztec.js";
import type { AccountInterface } from "@aztec/aztec.js/account";
import { Eip1193Account } from "@shieldswap/wallet-sdk/eip1193";
import type { IntentAction } from "@aztec/aztec.js/utils";
import {
  type EntrypointInterface,
  EntrypointPayload,
  type ExecutionRequestInit,
  computeCombinedPayloadHash,
} from '@aztec/aztec.js/entrypoint';
import { encodeArguments, FunctionAbi, FunctionType } from "@aztec/foundation/abi";
import { TxContext } from "@aztec/circuits.js";
import { Tx } from "@aztec/aztec.js";
import { HashedValues, FunctionSelector, TxHash, FunctionCall, AztecAddress } from "@aztec/aztec.js";
import { TxSimulationResult } from "@aztec/circuit-types";

/**
 * Adapter that implements AccountInterface using an Eip1193Account.
 */
class ExternalAccountAdapter implements AccountInterface {

  private version: Fr | undefined;
  private chainId: Fr | undefined;
  private initializationPromise: Promise<void> | undefined;
  private provider: typeof Eip1193Account.prototype.provider;

  private initializeNodeInfo = async () => {
    const nodeInfo = await this.pxe.getNodeInfo();
    this.chainId = Fr.fromString(nodeInfo.l1ChainId.toString());
    this.version = Fr.fromString(nodeInfo.protocolVersion.toString());
  };

  constructor(private externalAccount: Eip1193Account, private pxe: PXE) {
    this.initializationPromise = this.initializeNodeInfo();
    this.provider = this.externalAccount.provider;
  }

  private async ensureInitialized() {
    if (!this.version || !this.chainId) {
      await this.initializationPromise;
    }
  }

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
      validate: async () => {},
      toReadableString: () => this.externalAccount.address.toString(),
      equals: (other: CompleteAddress) => this.externalAccount.address.equals(other.address),
      toBuffer: () => this.externalAccount.address.toBuffer()
    };
  }

  async createTxExecutionRequest(exec: ExecutionRequestInit): Promise<TxExecutionRequest> {
    await this.ensureInitialized();
    
    const { calls, fee, nonce, cancellable } = exec;
    const appPayload = await EntrypointPayload.fromAppExecution(calls, nonce);
    const feePayload = await EntrypointPayload.fromFeeOptions(this.externalAccount.address, fee);

    const abi = this.getEntrypointAbi();

    const entrypointHashedArgs = await HashedValues.fromValues(
      encodeArguments(abi, [appPayload, feePayload, !!cancellable])
    );

    const combinedPayloadAuthWitness = await this.createAuthWit(
      await computeCombinedPayloadHash(appPayload, feePayload)
    );

    return TxExecutionRequest.from({
      firstCallArgsHash: entrypointHashedArgs.hash,
      origin: this.externalAccount.address,
      functionSelector: await FunctionSelector.fromNameAndParameters(abi.name, abi.parameters),
      txContext: new TxContext(this.chainId!, this.version!, fee.gasSettings),
      argsOfCalls: [...appPayload.hashedArguments, ...feePayload.hashedArguments, entrypointHashedArgs],
      authWitnesses: [combinedPayloadAuthWitness],
    });
  }

  private getEntrypointAbi() {
    return {
      name: 'entrypoint',
      isInitializer: false,
      functionType: 'private',
      isInternal: false,
      isStatic: false,
      parameters: [
        {
          name: 'app_payload',
          type: {
            kind: 'struct',
            path: 'authwit::entrypoint::app::AppPayload',
            fields: [
              {
                name: 'function_calls',
                type: {
                  kind: 'array',
                  length: 4,
                  type: {
                    kind: 'struct',
                    path: 'authwit::entrypoint::function_call::FunctionCall',
                    fields: [
                      { name: 'args_hash', type: { kind: 'field' } },
                      {
                        name: 'function_selector',
                        type: {
                          kind: 'struct',
                          path: 'authwit::aztec::protocol_types::abis::function_selector::FunctionSelector',
                          fields: [{ name: 'inner', type: { kind: 'integer', sign: 'unsigned', width: 32 } }],
                        },
                      },
                      {
                        name: 'target_address',
                        type: {
                          kind: 'struct',
                          path: 'authwit::aztec::protocol_types::address::AztecAddress',
                          fields: [{ name: 'inner', type: { kind: 'field' } }],
                        },
                      },
                      { name: 'is_public', type: { kind: 'boolean' } },
                      { name: 'is_static', type: { kind: 'boolean' } },
                    ],
                  },
                },
              },
              { name: 'nonce', type: { kind: 'field' } },
            ],
          },
          visibility: 'public',
        },
        {
          name: 'fee_payload',
          type: {
            kind: 'struct',
            path: 'authwit::entrypoint::fee::FeePayload',
            fields: [
              {
                name: 'function_calls',
                type: {
                  kind: 'array',
                  length: 2,
                  type: {
                    kind: 'struct',
                    path: 'authwit::entrypoint::function_call::FunctionCall',
                    fields: [
                      { name: 'args_hash', type: { kind: 'field' } },
                      {
                        name: 'function_selector',
                        type: {
                          kind: 'struct',
                          path: 'authwit::aztec::protocol_types::abis::function_selector::FunctionSelector',
                          fields: [{ name: 'inner', type: { kind: 'integer', sign: 'unsigned', width: 32 } }],
                        },
                      },
                      {
                        name: 'target_address',
                        type: {
                          kind: 'struct',
                          path: 'authwit::aztec::protocol_types::address::AztecAddress',
                          fields: [{ name: 'inner', type: { kind: 'field' } }],
                        },
                      },
                      { name: 'is_public', type: { kind: 'boolean' } },
                      { name: 'is_static', type: { kind: 'boolean' } },
                    ],
                  },
                },
              },
              { name: 'nonce', type: { kind: 'field' } },
              { name: 'is_fee_payer', type: { kind: 'boolean' } },
            ],
          },
          visibility: 'public',
        },
        { name: 'cancellable', type: { kind: 'boolean' } },
      ],
      returnTypes: [],
      errorTypes: {},
    } as FunctionAbi;
  }
  
  getChainId(): Fr {
    return this.chainId!;
  }

  getVersion(): Fr {
    return this.version!;
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

  async simulateTx(
    txRequest: TxExecutionRequest,
    simulatePublic: boolean,
    msgSender?: AztecAddress,
  ): Promise<TxSimulationResult> {
    const result = await this.externalAccount.simulateTransaction({
      calls: txRequest.argsOfCalls.map(args => new FunctionCall(
        'entrypoint',
        AztecAddress.fromString(txRequest.origin.toString()),
        txRequest.functionSelector,
        FunctionType.PRIVATE,
        false,
        args.values,
        []
      ))
    });
    return result as unknown as TxSimulationResult;
  }

  async sendTx(txProof: Tx): Promise<TxHash> {
    const result = await this.externalAccount.sendTransaction({
      calls: txProof.data.getNonRevertiblePublicCallRequests().map(call => new FunctionCall(
        'entrypoint',
        call.msgSender,
        call.functionSelector,
        FunctionType.PUBLIC,
        false,
        [call.argsHash],
        []
      ))
    });
    return result.getTxHash();
  }
}

/**
 * ExternalAccountWallet wraps an Eip1193Account into an AccountWallet-complaint adapter.
 */
export class ExternalAccountWallet extends AccountWallet {
  private externalAccount: Eip1193Account;


  constructor(pxe: PXE, externalAccount: Eip1193Account) {
    const adapter = new ExternalAccountAdapter(externalAccount, pxe);
    super(pxe, adapter); 
    this.externalAccount = externalAccount;

  }

  /**
   * Exposes the underlying Eip1193Account.
   */
  public getEip1193Account(): Eip1193Account {
    return this.externalAccount;
  }

  /**
   * Returns true to indicate that this wallet is external.
   */
  public isExternalWallet(): boolean {
    return true;
  }
} 