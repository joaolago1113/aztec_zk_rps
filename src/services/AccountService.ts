import { AuthWitnessProvider, AccountContract, Fr, AccountManager, AccountWallet, NodeInfo, Contract } from "@aztec/aztec.js";
import { EcdsaKAccountContract } from '@aztec/accounts/ecdsa';
import { computePartialAddress, deriveSigningKey, deriveKeys, CompleteAddress, AztecAddress } from '@aztec/circuits.js';
import { PXE } from '@aztec/circuit-types';
import { KeyStore } from '../utils/Keystore.js';
import { CryptoUtils } from '../utils/CryptoUtils.js';
import { UIManager } from '../ui/UIManager.js';
import { TokenService } from './TokenService.js';
//import { KeyRegistryContract } from '@aztec/noir-contracts.js';
//import { getCanonicalKeyRegistryAddress } from '@aztec/protocol-contracts/key-registry';
import { DefaultAccountInterface } from '@aztec/accounts/defaults';
import { derivePublicKeyFromSecretKey } from '@aztec/circuits.js';
import { getEcdsaKWallet } from '@aztec/accounts/ecdsa';
import { EcdsaKAccountContractArtifact } from '@aztec/accounts/ecdsa';
import { getCustomEcdsaKWallet } from '../utils/CustomWalletUtils.js';
import { CONFIG } from '../config.js';
import { ReownPopupWalletSdk } from "@shieldswap/wallet-sdk";
import { ExternalAccountWallet } from '../wallet/ExternalAccountWallet.js';

// Fallback function for popup
const fallbackOpenPopup = async (openPopup: () => Window | null): Promise<Window | null> => {
  return Promise.resolve(openPopup());
};

export class AccountService {
  private currentAccountIndex: number | null = null;
  private tokenService: TokenService | null = null;
  // Map external wallet addresses to their AccountWallet instance.
  private externalWallets: Map<string, ExternalAccountWallet> = new Map();
  // An ordered list of account addresses (both local and external) in the order they were added.
  private accountOrder: string[] = [];

  constructor(private pxe: PXE, private keystore: KeyStore, private uiManager: UIManager) {
    this.loadCurrentAccountIndex();
    this.loadAccountOrder();
  }

  setTokenService(tokenService: TokenService) {
    this.tokenService = tokenService;
  }

  private loadCurrentAccountIndex() {
    const storedIndex = localStorage.getItem('currentAccountIndex');
    this.currentAccountIndex = storedIndex ? parseInt(storedIndex, 10) : null;
  }

  private saveCurrentAccountIndex() {
    if (this.currentAccountIndex !== null) {
      localStorage.setItem('currentAccountIndex', this.currentAccountIndex.toString());
    } else {
      localStorage.removeItem('currentAccountIndex');
    }
  }

  private loadAccountOrder(): void {
    const storedOrder = localStorage.getItem('accountOrder');
    if (storedOrder) {
      try {
        this.accountOrder = JSON.parse(storedOrder);
      } catch (err) {
        this.accountOrder = [];
      }
    }
  }

  private saveAccountOrder(): void {
    localStorage.setItem('accountOrder', JSON.stringify(this.accountOrder));
  }

  async importAccount(secretKey: string, use2FA: boolean = false, hotpsecret: string = ''): Promise<void> {
    const secretKeyFr = Fr.fromString(secretKey);

    const privateKey = deriveSigningKey(secretKeyFr);

    let accountContract: AccountContract;

    accountContract = new EcdsaKAccountContract(privateKey.toBuffer());

    const account = await AccountManager.create(this.pxe, secretKeyFr, accountContract);

    const wallet = await this.getWallet(account);

    const partialAddress = await computePartialAddress(account.getInstance());

    const accountInKeystore = await this.isAccountInKeystore(wallet);

    if (!accountInKeystore) {
      await this.keystore.addAccount(secretKeyFr, partialAddress, use2FA, hotpsecret);
      const accounts = await this.keystore.getAccounts();
      const newAddress = accounts[accounts.length - 1].toString();
      if (!this.accountOrder.includes(newAddress)) {
        this.accountOrder.push(newAddress);
        this.saveAccountOrder();
      }
      // Always select the newly imported local wallet.
      const combined = await this.getCombinedAccounts();
      this.currentAccountIndex = combined.length - 1;
      this.saveCurrentAccountIndex();
    } else {
      throw new Error('Account already exists in keystore');
    }
  }

  async createAccount(seed: string | undefined, use2FA: boolean = false) {
    let nonce = 0;
    let secretKey: Fr;
    let account: AccountManager;
    let wallet: AccountWallet;
    let hotpSecret: string | undefined;

    while (true) {
      try {
        secretKey = CryptoUtils.generateSecretKey(seed, nonce);
        if (use2FA) {
          hotpSecret = CryptoUtils.generateHOTPSecret(seed, nonce);
        }else{
          hotpSecret = '';
        }


        account = await this.setupAccount(secretKey, use2FA ? Buffer.from(hotpSecret) : Buffer.from([]));
        wallet = await this.getWallet(account);
        const partialAddress = await computePartialAddress(account.getInstance());

        const accountInKeystore = await this.isAccountInKeystore(wallet);

        if (!accountInKeystore) {
          await this.keystore.addAccount(secretKey, partialAddress, use2FA, hotpSecret);
          // Get the full account address from the keystore to ensure consistency.
          const updatedAccounts = await this.keystore.getAccounts();
          const newLocal = updatedAccounts[updatedAccounts.length - 1].toString();
          if (!this.accountOrder.includes(newLocal)) {
            this.accountOrder.push(newLocal);
            this.saveAccountOrder();
          }
          // Always select the newly created local wallet.
          const combined = await this.getCombinedAccounts();
          this.currentAccountIndex = combined.length - 1;
          this.saveCurrentAccountIndex();
          return { secretKey, hotpSecret };
        }

        nonce++;
      } catch (error) {
        console.error('Error creating account:', error);
        throw error;
      }
    }
  }

  private async setupAccount(secretKey: Fr, totpSecretHash: Buffer): Promise<AccountManager> {
    const privateKey = deriveSigningKey(secretKey);

    let accountContract: AccountContract;

    if(!totpSecretHash.byteLength){
      accountContract = new EcdsaKAccountContract(privateKey.toBuffer());
    }else{
      throw new Error('2FA not supported anymore');
    }
    console.log(accountContract);

    const account = await AccountManager.create(this.pxe, secretKey, accountContract!, Fr.ONE);
    return account;
  }

  async getSkKeysAtIndex() {
    const accounts = await this.getAccounts();

    if (this.currentAccountIndex === null) {
      this.currentAccountIndex = 0;
    }

    const accountAddress = accounts[this.currentAccountIndex];
    
    // If it's an external wallet, we can't get the keys
    if (this.externalWallets.has(accountAddress.toString())) {
      throw new Error('Cannot get keys for external wallet');
    }

    // Get the public keys
    const incomingViewingPublicKey = await this.keystore.getMasterIncomingViewingPublicKey(accountAddress);
    const outgoingViewingPublicKey = await this.keystore.getMasterOutgoingViewingPublicKey(accountAddress);
    const taggingPublicKey = await this.keystore.getMasterTaggingPublicKey(accountAddress);

    // Get the corresponding secret keys
    const incomingViewingSecretKey = await this.keystore.getMasterSecretKey(incomingViewingPublicKey);
    const outgoingViewingSecretKey = await this.keystore.getMasterSecretKey(outgoingViewingPublicKey);
    const taggingSecretKey = await this.keystore.getMasterSecretKey(taggingPublicKey);

    //const secretKey = await this.keystore.getSecretKey(accountAddress);
    const privateKey = await this.keystore.getEcdsaSecretKey(accountAddress);

    const address = accountAddress.toString()

    return { incomingViewingSecretKey, outgoingViewingSecretKey, taggingSecretKey, address, privateKey};
  }
  
  async getCurrentWallet(): Promise<AccountWallet | null> {
    const combined = await this.getCombinedAccounts();
    if (this.currentAccountIndex === null || this.currentAccountIndex >= combined.length) {
      return null;
    }
    const selectedAddress = combined[this.currentAccountIndex];
    // If the external wallet address matches, return the external wallet.
    if (this.externalWallets.has(selectedAddress)) {
      return this.externalWallets.get(selectedAddress)!;
    }
    // Otherwise return the local wallet.
    return this.getWalletByAddress(selectedAddress);
  }

  async retrieveContractAddress(index?: number): Promise<CompleteAddress | null> {
    const accounts = await this.getAccounts();
 
    if (this.currentAccountIndex === null) {
      return Promise.resolve(null);
    }

    index = index || this.currentAccountIndex;

    const contractAddress = accounts[this.currentAccountIndex];

    const registeredAccount: CompleteAddress | undefined = await this.pxe.getRegisteredAccounts().then(accounts => 
      accounts.find(account => account.address.toString() === contractAddress.toString())
    );

    if (!registeredAccount) {
      return Promise.resolve(null);
    }

    return Promise.resolve(registeredAccount);
  }

  private async getWallet(account: AccountManager): Promise<AccountWallet> {
    const isInit = await this.checkContractInitialization(account);
    return isInit ? await account.register() : await account.waitSetup();
  }

  private async checkContractInitialization(account: AccountManager): Promise<boolean> {
    return (await this.pxe.getContractMetadata(account.getAddress())).isContractInitialized;
  }

  private async isAccountInKeystore(wallet: AccountWallet): Promise<boolean> {
    const accountAddress = wallet.getCompleteAddress().address;
    const accounts = await this.getAccounts();
    return accounts.some(account => account.toString() === accountAddress.toString());
  }

  
  async getAccounts(): Promise<AztecAddress[]> {
    // Build the list in the order stored in accountOrder.
    const combinedOrder = await this.getCombinedAccounts();
    const accounts: AztecAddress[] = [];
    const localAccounts = await this.keystore.getAccounts();
    for (const addr of combinedOrder) {
      // First try to find a local account by matching its string representation.
      const localAccount = localAccounts.find(a => a.toString() === addr);
      if (localAccount) {
        accounts.push(localAccount);
      } else if (this.externalWallets.has(addr)) {
        // Otherwise, if the address exists in our external wallet map, convert it.
        accounts.push(AztecAddress.fromString(addr as `0x${string}`));
      }
    }
    return accounts;
  }

  getCurrentAccountIndex(): number | null {
    return this.currentAccountIndex;
  }

  async setCurrentAccountIndex(index: number | null) {
    const combined = await this.getCombinedAccounts();
    if (index === null) {
      this.currentAccountIndex = null;
      this.saveCurrentAccountIndex();
    } else if (index >= 0 && index < combined.length) {
      this.currentAccountIndex = index;
      this.saveCurrentAccountIndex();
    } else {
      console.error('Invalid account index');
    }
  }

  async removeAccount(index: number) {
    const accounts = await this.getAccounts();
    const accountAddress = accounts[index];
    
    // Handle removal differently for external vs local accounts
    if (this.externalWallets.has(accountAddress.toString())) {
      // Remove from external wallets map
      this.externalWallets.delete(accountAddress.toString());
    } else {
      // Remove from keystore
      await this.keystore.removeAccount(accountAddress);
    }
    
    // Remove the address from the stored order.
    const addrStr = accountAddress.toString();
    this.accountOrder = this.accountOrder.filter(addr => addr !== addrStr);
    this.saveAccountOrder();

    if (this.currentAccountIndex === index) {
      this.currentAccountIndex = this.accountOrder.length > 0 ? 0 : null;
      this.saveCurrentAccountIndex();
    } else if (this.currentAccountIndex !== null && this.currentAccountIndex > index) {
      this.currentAccountIndex--;
      this.saveCurrentAccountIndex();
    }
  }

  private async validateCurrentAccountIndex() {
    const combined = await this.getCombinedAccounts();
    if (this.currentAccountIndex === null || this.currentAccountIndex >= combined.length) {
      this.currentAccountIndex = combined.length > 0 ? 0 : null;
      this.saveCurrentAccountIndex();
    }
  }

  async getTokens(): Promise<{ name: string; symbol: string }[]> {
    if (!this.tokenService) {
      throw new Error("TokenService not set");
    }
    return this.tokenService.getTokens();
  }

  async getTokenAddress(token: { name: string; symbol: string }): Promise<AztecAddress> {

    if (!this.tokenService) {
      throw new Error("TokenService not set");
    }
    return this.tokenService.getTokenAddress(token);
  }

  async rotateNullifierKey(wallet: AccountWallet) {

    const newSecretKey = await CryptoUtils.generateSecretKey();

    const { masterNullifierSecretKey } = await deriveKeys(newSecretKey);

    //await wallet.rotateNullifierKeys(masterNullifierSecretKey);

    await this.keystore.rotateMasterNullifierKey(wallet.getAddress(), masterNullifierSecretKey);

    //const newPublicKey = derivePublicKeyFromSecretKey(masterNullifierSecretKey);
    //const keyRegistry = await KeyRegistryContract.at(getCanonicalKeyRegistryAddress(), wallet);
    //await keyRegistry
    //  .withWallet(wallet)
    //  .methods.rotate_npk_m(wallet.getAddress(), { inner: newPublicKey.toNoirStruct() }, Fr.ZERO)
    //  .send()
    //  .wait();

    console.log('Nullifier key rotated successfully in both Keystore and KeyRegistry');
  }

  async getWalletByAddress(address: string): Promise<AccountWallet | null> {
    // If the address corresponds to an external wallet, return that.
    if (this.externalWallets.has(address)) {
      return this.externalWallets.get(address)!;
    }
    const accounts = await this.keystore.getAccounts();
    const localAcc = accounts.find(acc => acc.toString() === address);
    if (!localAcc) return null;
    const ecdsaSkBuffer = await this.keystore.getEcdsaSecretKey(localAcc);
    const ecdsaSk = Fr.fromBuffer(ecdsaSkBuffer);
    return getCustomEcdsaKWallet(this.pxe, localAcc, ecdsaSk.toBuffer());
  }

  async getPrivateKey(address: string): Promise<Fr> {
    const accounts = await this.keystore.getAccounts();
    const index = accounts.findIndex(acc => acc.toString() === address);
  
    if (index === -1) {
      throw new Error(`No account found for address ${address}`);
    }

    const accountAddress = accounts[index];
    const privateKeyBuffer = await this.keystore.getEcdsaSecretKey(accountAddress);
    return Fr.fromBuffer(privateKeyBuffer);
  }

  // Connect an external wallet using the PopupWalletSdk.
  async connectOutsideWallet(): Promise<void> {
    const wcOptions = {
      projectId: CONFIG.WALLETCONNECT_PROJECT_ID,
    };
    const params = { fallbackOpenPopup };
    const sdk = new ReownPopupWalletSdk(this.pxe, wcOptions, params);

    const account = await sdk.connect();

    if (!account) throw new Error("External wallet connection failed");

    const accountWallet = new ExternalAccountWallet(this.pxe, account);
    // Add the external wallet to our collection:
    const extAddress = account.getAddress().toString();
    this.externalWallets.set(extAddress, accountWallet);
    if (!this.accountOrder.includes(extAddress)) {
      this.accountOrder.push(extAddress);
      this.saveAccountOrder();
    }
    const combined = await this.getCombinedAccounts();
    // Always select the external wallet (last index) when added:
    this.currentAccountIndex = combined.length - 1;
    this.saveCurrentAccountIndex();
    console.log("Connected external wallet:", account.getAddress().toString());
  }

  async getCombinedAccounts(): Promise<string[]> {
    // Just return the accountOrder array as stored.
    return [...this.accountOrder];
  }

}