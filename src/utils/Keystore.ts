import { type PublicKey } from '@aztec/circuit-types';
import {
  AztecAddress,
  CompleteAddress,
  Fq,
  Fr,
  GeneratorIndex,
  GrumpkinScalar,
  KEY_PREFIXES,
  type KeyPrefix,
  KeyValidationRequest,
  type PartialAddress,
  Point,
  computeAddress,
  computeAppSecretKey,
  deriveKeys,
  derivePublicKeyFromSecretKey,
} from '@aztec/circuits.js';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto';
import { type Bufferable, serializeToBuffer } from '@aztec/foundation/serialize';
import { CryptoUtils } from './CryptoUtils.js';
import { deriveSigningKey } from '@aztec/circuits.js';
import { Transaction } from '../services/TransactionService.js';

export class KeyStore {
  #keys = new Map<string, Buffer>();
  #transactions = new Map<string, Transaction[]>();

  constructor() {
    this.loadFromLocalStorage();
  }

  private loadFromLocalStorage() {
    const storedKeys = localStorage.getItem('keystoreData');
    if (storedKeys) {
      const parsedKeys = JSON.parse(storedKeys);
      this.#keys = new Map(Object.entries(parsedKeys).map(([key, value]) => [key, Buffer.from(value as string, 'base64')]));
    }

    const storedTransactions = localStorage.getItem('transactions');
    if (storedTransactions) {
      const parsedTransactions = JSON.parse(storedTransactions);
      this.#transactions = new Map(Object.entries(parsedTransactions).map(([key, value]) => [key, value as Transaction[]]));
    }
  }

  private saveToLocalStorage() {
    const keysObject = Object.fromEntries(Array.from(this.#keys.entries()).map(([key, value]) => [key, value.toString('base64')]));
    localStorage.setItem('keystoreData', JSON.stringify(keysObject));

    const transactionsObject = Object.fromEntries(Array.from(this.#transactions.entries()));
    localStorage.setItem('transactions', JSON.stringify(transactionsObject));
  }

  /**
   * Adds an account to the key store from the provided secret key.
   * @param sk - The secret key of the account.
   * @param partialAddress - The partial address of the account.
   * @returns The account's complete address.
   */
  public async addAccount(sk: Fr, partialAddress: PartialAddress, use2FA: boolean, hotpSecret: string): Promise<CompleteAddress> {
    const {
      masterNullifierSecretKey,
      masterIncomingViewingSecretKey,
      masterOutgoingViewingSecretKey,
      masterTaggingSecretKey,
      publicKeys,
    } = await deriveKeys(sk);

    const account = await computeAddress(publicKeys, partialAddress);

    // Naming of keys is as follows ${account}-${n/iv/ov/t}${sk/pk}_m
    await this.#keys.set(`${account.toString()}-ivsk_m`, masterIncomingViewingSecretKey.toBuffer());
    await this.#keys.set(`${account.toString()}-ovsk_m`, masterOutgoingViewingSecretKey.toBuffer());
    await this.#keys.set(`${account.toString()}-tsk_m`, masterTaggingSecretKey.toBuffer());
    await this.#keys.set(`${account.toString()}-nsk_m`, masterNullifierSecretKey.toBuffer());

    await this.#keys.set(`${account.toString()}-npk_m`, publicKeys.masterNullifierPublicKey.toBuffer());
    await this.#keys.set(`${account.toString()}-ivpk_m`, publicKeys.masterIncomingViewingPublicKey.toBuffer());
    await this.#keys.set(`${account.toString()}-ovpk_m`, publicKeys.masterOutgoingViewingPublicKey.toBuffer());
    await this.#keys.set(`${account.toString()}-tpk_m`, publicKeys.masterTaggingPublicKey.toBuffer());

    // We store pk_m_hash under `account-{n/iv/ov/t}pk_m_hash` key to be able to obtain address and key prefix
    // using the #getKeyPrefixAndAccount function later on
    await this.#keys.set(`${account.toString()}-npk_m_hash`,(await publicKeys.masterNullifierPublicKey.hash()).toBuffer());
    await this.#keys.set(
      `${account.toString()}-ivpk_m_hash`,
      (await publicKeys.masterIncomingViewingPublicKey.hash()).toBuffer(),
    );  
    await this.#keys.set(
      `${account.toString()}-ovpk_m_hash`,
      (await publicKeys.masterOutgoingViewingPublicKey.hash()).toBuffer(),
    );
    await this.#keys.set(`${account.toString()}-tpk_m_hash`, (await publicKeys.masterTaggingPublicKey.hash()).toBuffer());

    const privateKey = await deriveSigningKey(sk);

    await this.#keys.set(`${account.toString()}-ecdsa_sk`, privateKey.toBuffer());

    await this.#keys.set(`${account.toString()}-use2FA`, Buffer.from(use2FA ? [1] : [0]));

    if (use2FA) {
      await this.#keys.set(`${account.toString()}-hotp_secret`, Buffer.from(hotpSecret));
    }
    
    this.saveToLocalStorage();
    return CompleteAddress.create(account, publicKeys, partialAddress);
  }

  /**
   * Checks if an account has 2FA enabled.
   * @param account - The AztecAddress of the account.
   * @returns A Promise that resolves to a boolean indicating whether the account has 2FA enabled.
   * @throws Error if the account is not found.
   */
  public async isAccount2FA(account: AztecAddress): Promise<boolean> {
    const use2FAKey = `${account.toString()}-use2FA`;
    const use2FABuffer = await this.#keys.get(use2FAKey);

    if (!use2FABuffer) {
      throw new Error(`Account ${account.toString()} not found`);
    }

    return use2FABuffer[0] === 1;
  }

  /**
   * Retrieves the 2FA secret for a given account.
   * @param account - The AztecAddress of the account.
   * @returns A Promise that resolves to the 2FA secret as a Buffer.
   * @throws Error if the account is not found or if 2FA is not enabled for the account.
   */
  public async get2FASecret(account: AztecAddress): Promise<Buffer> {
    const use2FAKey = `${account.toString()}-use2FA`;
    const use2FABuffer = await this.#keys.get(use2FAKey);

    if (!use2FABuffer) {
      throw new Error(`Account ${account.toString()} not found`);
    }

    if (use2FABuffer[0] === 0) {
      throw new Error(`2FA is not enabled for account ${account.toString()}`);
    }

    const hotpSecretKey = `${account.toString()}-hotp_secret`;
    const hotpSecretBuffer = await this.#keys.get(hotpSecretKey);

    if (!hotpSecretBuffer) {
      throw new Error(`2FA secret not found for account ${account.toString()}`);
    }

    return hotpSecretBuffer;
  }


  /**
   * Retrieves the ECDSA secret key for a given account.
   * @param account - The AztecAddress of the account.
   * @returns A Promise that resolves to the ECDSA secret key as a Buffer.
   * @throws Error if the ECDSA secret key for the account is not found.
   */
  public async getEcdsaSecretKey(account: AztecAddress): Promise<Buffer> {
    const ecdsaSkKey = `${account.toString()}-ecdsa_sk`;
    const ecdsaSkBuffer = await this.#keys.get(ecdsaSkKey);

    if (!ecdsaSkBuffer) {
      throw new Error(`ECDSA secret key not found for account ${account.toString()}`);
    }

    return ecdsaSkBuffer;
  }

  
/*
  public async getSecretKey(account: AztecAddress): Promise<Fr> {
    const secretKeyBuffer = await this.#keys.get(`${account.toString()}-sk_m`);

    if (!secretKeyBuffer) {
      const registeredAccounts = await this.getAccounts();
      throw new Error(
        `Account ${account.toString()} does not exist. Registered accounts: ${registeredAccounts.map(acc => acc.toString()).join(', ')}.`,
      );
    }
    return Promise.resolve(Fr.fromBuffer(secretKeyBuffer));
  }
*/

  /**
   * Retrieves addresses of accounts stored in the key store.
   * @returns A Promise that resolves to an array of account addresses.
   */
  public getAccounts(): Promise<AztecAddress[]> {
    const allMapKeys = Array.from(this.#keys.keys());
    // We return account addresses based on the map keys that end with '-ivsk_m'
    const accounts = allMapKeys.filter(key => key.endsWith('-ivsk_m')).map(key => key.split('-')[0]);
    return Promise.resolve(accounts.map(account => AztecAddress.fromString(account)));
  }

  /**
   * Gets the key validation request for a given master public key hash and contract address.
   * @throws If the account corresponding to the master public key hash does not exist in the key store.
   * @param pkMHash - The master public key hash.
   * @param contractAddress - The contract address to silo the secret key in the key validation request with.
   * @returns The key validation request.
   */
  public async getKeyValidationRequest(pkMHash: Fr, contractAddress: AztecAddress): Promise<KeyValidationRequest> {
    const [keyPrefix, account] = this.#getKeyPrefixAndAccount(pkMHash);

    // Now we find the master public key for the account
    // Since each public keys buffer contains multiple public keys, we need to find the one that matches the hash.
    // Then we store the index of the key in the buffer to be able to quickly obtain the corresponding secret key.
    let pkM: PublicKey | undefined;
    let keyIndexInBuffer = 0;
    {
      const pkMsBuffer = this.#keys.get(`${account.toString()}-${keyPrefix}pk_m`);
      if (!pkMsBuffer) {
        throw new Error(
          `Could not find ${keyPrefix}pk_m for account ${account.toString()} whose address was successfully obtained with ${keyPrefix}pk_m_hash ${pkMHash.toString()}.`,
        );
      }

      // Now we iterate over the public keys in the buffer to find the one that matches the hash
      const numKeys = this.#calculateNumKeys(pkMsBuffer, Point);
      for (; keyIndexInBuffer < numKeys; keyIndexInBuffer++) {
        const foundPkM = Point.fromBuffer(
          pkMsBuffer.subarray(keyIndexInBuffer * Point.SIZE_IN_BYTES, (keyIndexInBuffer + 1) * Point.SIZE_IN_BYTES),
        );
        if ((await foundPkM.hash()).equals(pkMHash)) {
          pkM = foundPkM;
          break;
        }
      }

      if (!pkM) {
        throw new Error(`Could not find ${keyPrefix}pkM for ${keyPrefix}pk_m_hash ${pkMHash.toString()}.`);
      }
    }

    // Now we find the secret key for the public key
    let skM: GrumpkinScalar | undefined;
    {
      const skMsBuffer = this.#keys.get(`${account.toString()}-${keyPrefix}sk_m`);
      if (!skMsBuffer) {
        throw new Error(
          `Could not find ${keyPrefix}sk_m for account ${account.toString()} whose address was successfully obtained with ${keyPrefix}pk_m_hash ${pkMHash.toString()}.`,
        );
      }

      skM = GrumpkinScalar.fromBuffer(
        skMsBuffer.subarray(
          keyIndexInBuffer * GrumpkinScalar.SIZE_IN_BYTES,
          (keyIndexInBuffer + 1) * GrumpkinScalar.SIZE_IN_BYTES,
        ),
      );
    }

    // We sanity check that it's possible to derive the public key from the secret key
    if (!(await derivePublicKeyFromSecretKey(skM)).equals(pkM)) {
      throw new Error(`Could not derive ${keyPrefix}pkM from ${keyPrefix}skM.`);
    }

    // At last we silo the secret key and return the key validation request
    const skApp = await computeAppSecretKey(skM, contractAddress, keyPrefix!);

    return Promise.resolve(new KeyValidationRequest(pkM, skApp));
  }

  /**
   * Gets the master incoming viewing public key for a given account.
   * @throws If the account does not exist in the key store.
   * @param account - The account address for which to retrieve the master incoming viewing public key.
   * @returns The master incoming viewing public key for the account.
   */
  public async getMasterIncomingViewingPublicKey(account: AztecAddress): Promise<PublicKey> {
    const masterIncomingViewingPublicKeyBuffer = this.#keys.get(`${account.toString()}-ivpk_m`);
    if (!masterIncomingViewingPublicKeyBuffer) {
      throw new Error(
        `Account ${account.toString()} does not exist. Registered accounts: ${await this.getAccounts()}.`,
      );
    }
    return Promise.resolve(Point.fromBuffer(masterIncomingViewingPublicKeyBuffer));
  }

  /**
   * Retrieves the master outgoing viewing public key.
   * @throws If the account does not exist in the key store.
   * @param account - The account to retrieve the master outgoing viewing key for.
   * @returns A Promise that resolves to the master outgoing viewing key.
   */
  public async getMasterOutgoingViewingPublicKey(account: AztecAddress): Promise<PublicKey> {
    const masterOutgoingViewingPublicKeyBuffer = this.#keys.get(`${account.toString()}-ovpk_m`);
    if (!masterOutgoingViewingPublicKeyBuffer) {
      throw new Error(
        `Account ${account.toString()} does not exist. Registered accounts: ${await this.getAccounts()}.`,
      );
    }
    return Promise.resolve(Point.fromBuffer(masterOutgoingViewingPublicKeyBuffer));
  }

  /**
   * Retrieves the master tagging public key.
   * @throws If the account does not exist in the key store.
   * @param account - The account to retrieve the master tagging key for.
   * @returns A Promise that resolves to the master tagging key.
   */
  public async getMasterTaggingPublicKey(account: AztecAddress): Promise<PublicKey> {
    const masterTaggingPublicKeyBuffer = this.#keys.get(`${account.toString()}-tpk_m`);
    if (!masterTaggingPublicKeyBuffer) {
      throw new Error(
        `Account ${account.toString()} does not exist. Registered accounts: ${await this.getAccounts()}.`,
      );
    }
    return Promise.resolve(Point.fromBuffer(masterTaggingPublicKeyBuffer));
  }

  /**
   * Retrieves application incoming viewing secret key.
   * @throws If the account does not exist in the key store.
   * @param account - The account to retrieve the application incoming viewing secret key for.
   * @param app - The application address to retrieve the incoming viewing secret key for.
   * @returns A Promise that resolves to the application incoming viewing secret key.
   */
  public async getAppIncomingViewingSecretKey(account: AztecAddress, app: AztecAddress): Promise<Fr> {
    const masterIncomingViewingSecretKeyBuffer = this.#keys.get(`${account.toString()}-ivsk_m`);
    if (!masterIncomingViewingSecretKeyBuffer) {
      throw new Error(
        `Account ${account.toString()} does not exist. Registered accounts: ${await this.getAccounts()}.`,
      );
    }
    const masterIncomingViewingSecretKey = GrumpkinScalar.fromBuffer(masterIncomingViewingSecretKeyBuffer);

    return Promise.resolve(
      poseidon2HashWithSeparator(
        [masterIncomingViewingSecretKey.hi, masterIncomingViewingSecretKey.lo, app],
        GeneratorIndex.IVSK_M,
      ),
    );
  }

  /**
   * Retrieves application outgoing viewing secret key.
   * @throws If the account does not exist in the key store.
   * @param account - The account to retrieve the application outgoing viewing secret key for.
   * @param app - The application address to retrieve the outgoing viewing secret key for.
   * @returns A Promise that resolves to the application outgoing viewing secret key.
   */
  public async getAppOutgoingViewingSecretKey(account: AztecAddress, app: AztecAddress): Promise<Fr> {
    const masterOutgoingViewingSecretKeyBuffer = this.#keys.get(`${account.toString()}-ovsk_m`);
    if (!masterOutgoingViewingSecretKeyBuffer) {
      throw new Error(
        `Account ${account.toString()} does not exist. Registered accounts: ${await this.getAccounts()}.`,
      );
    }
    const masterOutgoingViewingSecretKey = GrumpkinScalar.fromBuffer(masterOutgoingViewingSecretKeyBuffer);

    return Promise.resolve(
      poseidon2HashWithSeparator(
        [masterOutgoingViewingSecretKey.hi, masterOutgoingViewingSecretKey.lo, app],
        GeneratorIndex.OVSK_M,
      ),
    );
  }

  /**
   * Retrieves the sk_m corresponding to the pk_m.
   * @throws If the provided public key is not associated with any of the registered accounts.
   * @param pkM - The master public key to get secret key for.
   * @returns A Promise that resolves to sk_m.
   * @dev Used when feeding the sk_m to the kernel circuit for keys verification.
   */
  public async getMasterSecretKey(pkM: PublicKey): Promise<GrumpkinScalar> {
    const [keyPrefix, account] = this.#getKeyPrefixAndAccount(pkM);

    // We get the secret keys buffer and iterate over the values in the buffer to find the one that matches pkM
    let skM: GrumpkinScalar | undefined;
    {
      const secretKeysBuffer = this.#keys.get(`${account.toString()}-${keyPrefix}sk_m`);
      if (!secretKeysBuffer) {
        throw new Error(
          `Could not find ${keyPrefix}sk_m for ${keyPrefix}pk_m ${pkM.toString()}. This should not happen.`,
        );
      }

      const numKeys = this.#calculateNumKeys(secretKeysBuffer, GrumpkinScalar);
      for (let i = 0; i < numKeys; i++) {
        const foundSkM = GrumpkinScalar.fromBuffer(
          secretKeysBuffer.subarray(i * GrumpkinScalar.SIZE_IN_BYTES, (i + 1) * GrumpkinScalar.SIZE_IN_BYTES),
        );
        if ((await derivePublicKeyFromSecretKey(foundSkM)).equals(pkM)) {
          skM = foundSkM;
          break;
        }
      }

      if (!skM) {
        throw new Error(`Could not find ${keyPrefix}skM for ${keyPrefix}pkM ${pkM.toString()} in secret keys buffer.`);
      }
    }

    return Promise.resolve(skM);
  }

  /**
   * Rotates the master nullifier key for the specified account.
   *
   * @dev This function updates the secret and public keys associated with the account.
   * It appends a new secret key to the existing secret keys, derives the
   * corresponding public key, and updates the stored keys accordingly.
   *
   * @param account - The account address for which the master nullifier key is being rotated.
   * @param newSecretKey - (Optional) A new secret key of type Fq. If not provided, a random key is generated.
   * @throws If the account does not have existing nullifier secret keys or public keys.
   * @returns A Promise that resolves when the key rotation is complete.
   */
  public async rotateMasterNullifierKey(account: AztecAddress, newSecretKey: Fq = Fq.random()) {
    // We append the secret key to the array of secret keys
    await this.#appendValue(`${account.toString()}-nsk_m`, newSecretKey);

    // Now we derive the public key from the new secret key and append it to the buffer of original public keys
    const newPublicKey = await derivePublicKeyFromSecretKey(newSecretKey);
    await this.#appendValue(`${account.toString()}-npk_m`, newPublicKey);

    // At last we store npk_m_hash under `account-npk_m_hash` key to be able to obtain address and key prefix
    // using the #getKeyPrefixAndAccount function later on
    await this.#appendValue(`${account.toString()}-npk_m_hash`, await newPublicKey.hash());

    this.saveToLocalStorage();
  }

  /**
   * Gets the key prefix and account address for a given value.
   * @returns A tuple containing the key prefix and account address.
   * @dev Note that this is quite inefficient but it should not matter because there should never be too many keys
   * in the key store.
   */
  #getKeyPrefixAndAccount(value: Bufferable): [KeyPrefix, AztecAddress] {
    const valueBuffer = serializeToBuffer(value);
    for (const [key, val] of this.#keys.entries()) {
      // `val` can contain multiple values due to key rotation so we check if the value is in the buffer instead
      // of just calling `.equals(...)`
      if (val.includes(valueBuffer)) {
        for (const prefix of KEY_PREFIXES) {
          if (key.includes(`-${prefix}`)) {
            const account = AztecAddress.fromString(key.split('-')[0]);
            return [prefix, account];
          }
        }
      }
    }
    throw new Error(`Could not find key prefix.`);
  }

  async #appendValue(key: string, value: Bufferable) {
    const currentValue = this.#keys.get(key);
    if (!currentValue) {
      throw new Error(`Could not find current value for key ${key}`);
    }

    await this.#keys.set(key, serializeToBuffer([currentValue, value]));
  }

  #calculateNumKeys(buf: Buffer, T: typeof Point | typeof Fq) {
    return buf.byteLength / T.SIZE_IN_BYTES;
  }

  public async removeAccount(account: AztecAddress): Promise<void> {
    const allMapKeys = Array.from(this.#keys.keys());
    const accountKeys = allMapKeys.filter(key => key.startsWith(account.toString()));
    for (const key of accountKeys) {
      await this.#keys.delete(key);
    }
    this.saveToLocalStorage();
  }

  public async saveTransaction(account: AztecAddress, transaction: Transaction) {
    const accountTransactions = this.#transactions.get(account.toString()) || [];
    accountTransactions.push(transaction);
    this.#transactions.set(account.toString(), accountTransactions);
    this.saveToLocalStorage();
  }

  public async getTransactions(account: AztecAddress): Promise<Transaction[]> {
    return this.#transactions.get(account.toString()) || [];
  }
}