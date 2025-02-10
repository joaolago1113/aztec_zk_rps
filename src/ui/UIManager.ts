// Add this at the top of the file, before the class definition
declare global {
  interface Window {
    resolveGame: (gameId: string) => Promise<void>;
    timeoutGame: (gameId: string) => Promise<void>;
    copyGameIdHandler: (gameId: string) => void;
  }
}

import { RPSService } from '../services/RPSService.js';
import { AccountService } from '../services/AccountService.js';
import { TokenService } from '../services/TokenService.js';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { WalletConnectService } from '../services/WalletConnectService.js';
import { CONFIG } from '../config.js';
import { Fr, Note } from "@aztec/aztec.js";
import { AztecAddress } from '@aztec/circuits.js';
import { TransactionService } from '../services/TransactionService.js';
import { PXEFactory } from '../factories/PXEFactory.js';
import { Transaction } from '../services/TransactionService.js';
import { CheatCodes } from '@aztec/aztec.js';
import qrcode from 'qrcode-generator';
import { KeystoreFactory } from '../factories/KeystoreFactory.js';

interface SimulationResult {
  isPrivate: boolean;
  fromBalanceBefore: number;
  toBalanceBefore: number;
  fromBalanceAfter: number;
  toBalanceAfter: number;
  gasEstimate: bigint;
  error?: string;
}

// Add this helper function at the top of the file or in a separate utilities file
function getFrValue(frValue: Fr | { type: string, value: string }): bigint {
  if (frValue instanceof Fr) {
    return frValue.toBigInt();
  } else if (typeof frValue === 'object' && frValue.type === 'Fr') {
    return Fr.fromString(frValue.value).toBigInt();
  }
  throw new Error('Invalid Fr value');
}

export class UIManager {
  private rpsService!: RPSService;
  private accountService!: AccountService;
  private tokenService!: TokenService;
  private walletConnectService!: WalletConnectService;
  private transactionService!: TransactionService;
  private debounceTimer: NodeJS.Timeout | null = null;

  setRPSService(rpsService: RPSService) {
    this.rpsService = rpsService;
  }  
  setTokenService(tokenService: TokenService) {
    this.tokenService = tokenService;
  }
  setAccountService(accountService: AccountService) {
    this.accountService = accountService;
  }
  setWalletConnectService(walletConnectService: WalletConnectService) {
    this.walletConnectService = walletConnectService;
  }
  setTransactionService(transactionService: TransactionService) {
    this.transactionService = transactionService;
  }

  
  constructor() {
    // Remove the call to createModal if it was here
  }

  private async handlePageChange() {
    const hash = window.location.hash.slice(1) || 'accounts';
    console.log('Page changed to:', hash);
    
    // Update account UI for all pages
    await this.updateAccountUI();
    
    switch (hash) {
      case 'accounts':
        await this.updateAccountsPage();
        break;
      case 'tokens':
        await this.updateTokensPage();
        break;
      case 'apps':
        await this.updateAppsPage();
        break;
      case 'transactions':
        await this.updateTransactionsPage();
        break;
      case 'bridge':
        await this.updateBridgePage();
        break;
      case 'rps':
        await this.setupRPSPage();
        break;
    }
  }

  private async updateAccountsPage() {
    await this.updateAccountUI();
    this.setAccountSelectionListener();
    // Any other account-specific updates

    const accountSelect = document.getElementById('accountSelect') as HTMLSelectElement | null;
    if (!accountSelect) {
      console.debug('Account select not found. This is expected if not on the Accounts page.');
      return;
    }

    accountSelect.addEventListener('change', async () => {
        try {
            await this.accountService.setCurrentAccountIndex(parseInt(accountSelect.value));
            if (this.rpsService) {
                await this.rpsService.updateCurrentWallet();
            }
            await this.updateAccountUI();
        } catch (error) {
            console.error('Error changing account:', error);
        }
    });
  }

  private async updateTokensPage() {
    console.log('Updating Tokens page');
    const currentWallet = await this.accountService.getCurrentWallet();

    console.log('currentWallet', currentWallet);

    if (currentWallet) {
      try {
        await this.tokenService.updateBalancesForNewAccount(currentWallet);
        // Import all configured tokens on service initialization

        /*
        // Fetch pending shields for each token
        const pendingShields = await Promise.all(this.tokenService.getTokens().map(async (token) => {
          const tokenAddress = await this.tokenService.getTokenAddress(token);
          const pendingShieldNotes = await this.tokenService.getPendingShields(tokenAddress);
          const formattedPendingShieldNotes = pendingShieldNotes.map(note => ({
            items: note.items,
            formattedAmount: this.tokenService.formatAmount(note.items[0].toBigInt())
          }));
          return { token, pendingShieldNotes: formattedPendingShieldNotes };
        }));

        // Update the pending shields list
        this.updatePendingShieldsList(pendingShields);
        */
      } catch (error) {
        console.error('Error updating balances for new account:', error);
        alert('Failed to update token balances. Please try again.');
      }
    } else {
      console.warn('No current wallet available');
    }
  }

  private async updateAppsPage() {
    console.log('Updating Apps page');
    await this.displayPairings();
  }

  private async updateTransactionsPage() {
    console.log('Updating Transactions page');
    await this.displayTransactions();
    this.setupTransactionFilters();
  }

  private async updateBridgePage() {
    console.log('Updating Bridge page');
    await this.populateBridgeTokens();
    this.setupBridgeEventListeners();
  }

  private async populateBridgeTokens() {
    const tokens = await this.accountService.getTokens();
    const depositTokenSelect = document.getElementById('depositToken') as HTMLSelectElement;
    const withdrawTokenSelect = document.getElementById('withdrawToken') as HTMLSelectElement;

    if (depositTokenSelect && withdrawTokenSelect) {
      depositTokenSelect.innerHTML = '';
      withdrawTokenSelect.innerHTML = '';

      tokens.forEach(token => {
        const option = document.createElement('option');
        option.value = `${token.name}:${token.symbol}`;
        option.text = `${token.name} (${token.symbol})`;
        depositTokenSelect.add(option);
        withdrawTokenSelect.add(option.cloneNode(true) as HTMLOptionElement);
      });
    }
  }

  private setupBridgeEventListeners() {
    const depositForm = document.getElementById('depositForm') as HTMLFormElement;
    const withdrawForm = document.getElementById('withdrawForm') as HTMLFormElement;

    if (depositForm) {
      depositForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const depositTokenSelect = document.getElementById('depositToken') as HTMLSelectElement;
        const depositAmountInput = document.getElementById('depositAmount') as HTMLInputElement;
        const [name, symbol] = depositTokenSelect.value.split(':');
        const amount = depositAmountInput.value;
        await this.handleDeposit({ name, symbol }, amount);
      });
    }

    if (withdrawForm) {
      withdrawForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const withdrawTokenSelect = document.getElementById('withdrawToken') as HTMLSelectElement;
        const withdrawAmountInput = document.getElementById('withdrawAmount') as HTMLInputElement;
        const [name, symbol] = withdrawTokenSelect.value.split(':');
        const amount = withdrawAmountInput.value;
        await this.handleWithdraw({ name, symbol }, amount);
      });
    }
  }

  private async handleDeposit(token: { name: string; symbol: string }, amount: string) {
    const isPrivate = document.getElementById('depositPrivate') as HTMLInputElement;
    await this.tokenService.depositTokens(token, amount, isPrivate.checked);
    // Implement the logic for depositing tokens from Ethereum to Aztec
    console.log(`Depositing ${amount} ${token.symbol} from Ethereum to Aztec`);
    // TODO: Implement the deposit functionality
  }

  private async handleWithdraw(token: { name: string; symbol: string }, amount: string) {
    const isPrivate = document.getElementById('withdrawPrivate') as HTMLInputElement;
    await this.tokenService.withdrawTokens(token, amount, isPrivate.checked);
    // Implement the logic for withdrawing tokens from Aztec to Ethereum
    console.log(`Withdrawing ${amount} ${token.symbol} from Aztec to Ethereum`);
    // TODO: Implement the withdraw functionality
  }

  private async displayTransactions(filter: string = 'all') {
    const transactionsTableBody = document.getElementById('transactionsTableBody');
    if (!transactionsTableBody) {
      console.debug('Transactions table body not found. This is expected if not on the Transactions page.');
      return;
    }

    try {
      let transactions = await this.transactionService.fetchTransactions();
      
      // Filter transactions based on the selected action
      if (filter !== 'all') {
        transactions = transactions.filter(transaction => transaction.action === filter);
      }

      // Sort transactions from most recent to least recent
      transactions.sort((a, b) => b.timestamp - a.timestamp);

      console.log('Displaying transactions:', transactions);
      transactionsTableBody.innerHTML = '';

      if (transactions.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="5">No transactions found</td>';
        transactionsTableBody.appendChild(row);
      } else {
        for (const transaction of transactions) {
          const row = document.createElement('tr');
          row.classList.add('transaction-row');
          row.innerHTML = `
            <td>
              <div class="transaction-icon ${transaction.action}"></div>
              <span class="transaction-action">${transaction.action}</span>
            </td>
            <td>
              <span class="transaction-amount">${transaction.amount}</span>
              <span class="transaction-token">${transaction.token}</span>
            </td>
            <td>
              <span class="transaction-status ${transaction.status}">${transaction.status}</span>
            </td>
            <td>
              <span class="transaction-timestamp">${new Date(transaction.timestamp).toLocaleString()}</span>
            </td>
            <td>
              <div class="transaction-addresses">
                ${transaction.from ? `<span class="transaction-from">${this.formatAddress(transaction.from)}</span>` : ''}
                ${transaction.from && transaction.to ? '<span class="transaction-arrow">→</span>' : ''}
                ${transaction.to ? `<span class="transaction-to">${this.formatAddress(transaction.to)}</span>` : ''}
              </div>
            </td>
            <td>
              ${transaction.txHash ? `<a href="https://aztecscan.xyz/tx/${transaction.txHash}" target="_blank" class="transaction-hash">${transaction.txHash.slice(0, 6)}...${transaction.txHash.slice(-4)}</a>` : ''}
            </td>
          `;
          transactionsTableBody.appendChild(row);
        }
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
      const row = document.createElement('tr');
      row.innerHTML = '<td colspan="5">Error fetching transactions. Please try again later.</td>';
      transactionsTableBody.appendChild(row);
    }
  }

  private formatAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  private setupDynamicEventListeners() {
    document.addEventListener('click', async (event) => {
      const target = event.target as HTMLElement;

      if (target.matches('#accountForm button[type="submit"]')) {
        event.preventDefault();
        await this.createAccountSubmit(event);
      } else if (target.matches('#exportKeys')) {
        await this.exportKeys(event);
      } else if (target.matches('#importKeys')) {
        await this.importKeys(event);
      } else if (target.matches('#logoutLink')) {
        await this.handleLogout();
      } else if (target.matches('#connectAppButton')) {
        await this.handleConnectApp();
      } else if (target.matches('#rotateNullifierKey')) {
        await this.rotateNullifierKey(event);
      } else if (target.matches('#eraseAllDataButton')) {
        this.handleEraseAllData(event);
      }
    });

    document.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement;
      if (target.name === 'tokenAction') {
        this.updateTokenForm(target.value);
      }
    });

    document.addEventListener('submit', async (event) => {
      const target = event.target as HTMLElement;
      if (target.matches('#createMintTokenForm')) {
        event.preventDefault();
        await this.handleCreateMintImportTokenSubmit(event);
      }
    });

  }

  private async handleLogout() {
    const currentAccountIndex = this.accountService.getCurrentAccountIndex();
    if (currentAccountIndex !== null) {
      try {
        await this.accountService.removeAccount(currentAccountIndex);
        await this.accountService.setCurrentAccountIndex(null);
        await this.updateAccountUI();
        this.tokenService.resetTokens();
      } catch (error) {
        console.error('Error during logout:', error);
        alert('Failed to log out. Please try again.');
      }
    } else {
      alert('No account is currently selected.');
    }
  }

  private async createAccountSubmit(event: Event) {
    event.preventDefault();
    const submitButton = event.target as HTMLButtonElement;
    const form = submitButton.closest('form') as HTMLFormElement;

    const seedInput = form.querySelector('#accountSeed') as HTMLInputElement;
    const use2FAInput = form.querySelector('#use2FA') as HTMLInputElement;

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Creating...';
    }

    const seed = seedInput?.value || undefined;
    const use2FA = use2FAInput.checked;

    try {
      const { secretKey, hotpSecret } = await this.accountService.createAccount(seed, use2FA);
      
      // Display secret key information
      this.displaySecretKeyInfo(secretKey);

      if (use2FA && hotpSecret) {
        this.displayQRCode(hotpSecret);
      } else {
        this.showSuccessMessage('Account created successfully!');
      }

      // Update the account UI
      await this.updateAccountUI();
    } catch (error) {
      console.error('Error creating account:', error);
      this.showErrorMessage('Failed to create account. Please try again.');
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Create New Account';
      }
    }
  }

  private displaySecretKeyInfo(secretKey: Fr) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h2>Account Created Successfully</h2>
        <p>Your account has been created with the following secret key:</p>
        <div class="secret-key-container">
          <div class="secret-key-overlay">Click to Copy</div>
          <p class="secret-key input">${secretKey.toString()}</p>
        </div>
        <p class="warning">Warning: Save this secret key securely. You won't be able to see it again!</p>
        <button id="closeSecretKeyModal" class="button primary-button">I've saved the secret key</button>
      </div>
    `;

    const secretKeyContainer = modal.querySelector('.secret-key-container') as HTMLElement;
    const secretKeyOverlay = modal.querySelector('.secret-key-overlay') as HTMLElement;
    const secretKeyInput = modal.querySelector('.secret-key') as HTMLElement;

    secretKeyContainer.addEventListener('click', () => {
      navigator.clipboard.writeText(secretKey.toString()).then(() => {
        secretKeyOverlay.textContent = 'Copied!';
        setTimeout(() => {
          secretKeyOverlay.textContent = 'Click to Copy';
        }, 2000);
      });
    });

    secretKeyContainer.addEventListener('mouseover', () => {
      secretKeyInput.style.filter = 'blur(0)';
    });

    secretKeyContainer.addEventListener('mouseout', () => {
      secretKeyInput.style.filter = 'blur(5px)';
    });

    const closeButton = modal.querySelector('#closeSecretKeyModal') as HTMLButtonElement;
    closeButton.onclick = () => {
      document.body.removeChild(modal);
    };

    document.body.appendChild(modal);
  }

  private displayQRCode(hotpSecret: string) {
    const qrCodeModal = document.getElementById('qrCodeModal') as HTMLDivElement;
    const qrCodeContainer = document.getElementById('qrCode') as HTMLDivElement;
    const hotpSecretElement = document.getElementById('hotpSecret') as HTMLParagraphElement;
    const closeButton = document.getElementById('closeQRModal') as HTMLButtonElement;

    // Generate QR code
    const qr = qrcode(0, 'M');
    qr.addData(`otpauth://hotp/AztecWallet:${this.accountService.getCurrentAccountIndex()}?secret=${hotpSecret}&algorithm=SHA256&digits=6&counter=0`);
    qr.make();
    qrCodeContainer.innerHTML = qr.createImgTag(5);

    // Display HOTP secret
    hotpSecretElement.textContent = hotpSecret;

    // Show modal
    qrCodeModal.style.display = 'flex';

    // Handle close button
    closeButton.onclick = () => {
      qrCodeModal.style.display = 'none';
      this.showSuccessMessage('Account created successfully!');
    };
  }

  private async exportKeys(event: Event) {
    event.preventDefault();
    const keys = await this.accountService.getSkKeysAtIndex();
    const keysJson = JSON.stringify(keys);
    const blob = new Blob([keysJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'keys.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  private async importKeys(event: Event) {
    event.preventDefault();
    const importKeysModal = document.getElementById('importKeysModal') as HTMLDivElement;
    importKeysModal.style.display = 'flex';

    const importKeysForm = document.getElementById('importKeysForm') as HTMLFormElement;
    const cancelImportButton = document.getElementById('cancelImport') as HTMLButtonElement;
    const use2FACheckbox = document.getElementById('importUse2FA') as HTMLInputElement;
    const secretGroup = document.getElementById('import2FASecretGroup') as HTMLDivElement;

    const handleImportSubmit = async (e: Event) => {
      e.preventDefault();
      const secretKeyInput = document.getElementById('importSecretKey') as HTMLInputElement;
      const use2FA = use2FACheckbox.checked;
      const secretInput = document.getElementById('import2FASecret') as HTMLInputElement;

      const secretKey = secretKeyInput.value.trim();
      const secret = use2FA ? secretInput.value.trim() : '';

      if (secretKey.length !== 66) {
        alert('Invalid secret key. Please enter a 32-byte string in hex format.');
        return;
      }

      try {
        await this.accountService.importAccount(secretKey, use2FA, secret);
        this.updateAccountUI();
        importKeysModal.style.display = 'none';
      } catch (error) {
        console.error('Error during account import:', error);
        alert('Failed to import account. Please check the secret key and try again.');
      }
    };

    const handleCancelImport = () => {
      importKeysModal.style.display = 'none';
    };

    const handleCheckboxChange = () => {
      if (use2FACheckbox.checked) {
        secretGroup.style.display = 'block';
      } else {
        secretGroup.style.display = 'none';
      }
    };

    use2FACheckbox.addEventListener('change', handleCheckboxChange);
    importKeysForm.addEventListener('submit', handleImportSubmit);
    cancelImportButton.addEventListener('click', handleCancelImport);
  }

  private async handleConnectApp() {
    const walletConnectLinkInput = document.getElementById('walletConnectLink') as HTMLInputElement;
    if (walletConnectLinkInput) {
      const uri = walletConnectLinkInput.value.trim();
      if (uri) {
        try {
          await this.walletConnectService.pair(uri);
          this.displayPairings();
          walletConnectLinkInput.value = ''; // Clear the input after successful connection
        } catch (error) {
          console.error('Failed to connect:', error);
          alert('Failed to connect. Please check the URL and try again.');
        }
      } else {
        alert('Please enter a valid WalletConnect URL.');
      }
    }
  }

  public async displayPairings() {
    const pairingList = document.getElementById('pairingList');
    if (pairingList) {
      pairingList.innerHTML = ''; // Clear existing pairings

      const pairings = await this.walletConnectService.getPairings();

      pairings.forEach((pairing) => {
        const pairingItem = document.createElement('div');
        pairingItem.className = 'pairing-item';
        pairingItem.innerHTML = `
          <p><strong>Peer:</strong> ${pairing.peerMetadata?.name || 'Unknown'}</p>
          <p><strong>URL:</strong> ${pairing.peerMetadata?.url || 'N/A'}</p>
          <p><strong>Active:</strong> ${pairing.active ? 'Yes' : 'No'}</p>
          <button class="button secondary-button disconnect-button" data-topic="${pairing.topic}">Disconnect</button>
        `;
        pairingList.appendChild(pairingItem);

        const disconnectButton = pairingItem.querySelector('.disconnect-button');
        if (disconnectButton) {
          disconnectButton.addEventListener('click', async () => {
            await this.walletConnectService.disconnectPairing(pairing.topic);
            pairingItem.remove();
          });
        }
      });
    }
  }

  private loadAccountState() {
    const currentAccountIndex = this.accountService.getCurrentAccountIndex();
    if (currentAccountIndex !== null) {
      this.updateAccountUI();
    }
  }

  public async updateTokensTable(tokenRows: { name: string; symbol: string; balance: { public: string; private: string } }[]) {
    console.log('Updating tokens table with rows:', tokenRows);
    const tokensTableBody = document.getElementById('tokensTableBody');
    const loadingSpinner = document.getElementById('loadingSpinner');
    if (!tokensTableBody || !loadingSpinner) {
      console.debug('Tokens table body or loading spinner not found. This is expected if not on the Tokens page.');
      return;
    }

    // Hide loading spinner
    loadingSpinner.style.display = 'none';

    // Clear existing rows
    tokensTableBody.innerHTML = '';

    // Create a document fragment to improve performance
    const fragment = document.createDocumentFragment();

    // Add new rows
    for (const token of tokenRows) {
      const row = document.createElement('tr');
      
      const tokenCell = document.createElement('td');
      tokenCell.innerHTML = `
        <div class="token-info">
          <span class="token-symbol">${token.symbol}</span>
          <span class="token-name">${token.name}</span>
          <div class="token-address-container">
            <span class="token-address" id="tokenAddress_${token.symbol}"></span>
            <button class="copy-address-button" data-symbol="${token.symbol}">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
        </div>
      `;
      row.appendChild(tokenCell);

      const balanceCell = document.createElement('td');
      balanceCell.innerHTML = `
        <div class="balance-container">
          <div class="balance-item">
            <span class="balance-label">Public:</span>
            <span class="balance-value">${token.balance.public}</span>
          </div>
          <div class="balance-item">
            <span class="balance-label">Private:</span>
            <span class="balance-value">${token.balance.private}</span>
          </div>
        </div>
      `;
      row.appendChild(balanceCell);

      const actionsCell = document.createElement('td');
      actionsCell.className = 'actions-cell';
      
      const sendButton = document.createElement('button');
      sendButton.textContent = 'Send';
      sendButton.className = 'action-button send-button';
      sendButton.addEventListener('click', async () => {
        await this.handleSendToken(token);
      });
      actionsCell.appendChild(sendButton);

      const shieldButton = document.createElement('button');
      shieldButton.textContent = 'Shield';
      shieldButton.className = 'action-button shield-button';
      shieldButton.addEventListener('click', () => {
        this.handleShieldToken(token);
      });
      actionsCell.appendChild(shieldButton);

      const unshieldButton = document.createElement('button');
      unshieldButton.textContent = 'Unshield';
      unshieldButton.className = 'action-button unshield-button';
      unshieldButton.addEventListener('click', () => {
        this.handleUnshieldToken(token);
      });
      actionsCell.appendChild(unshieldButton);

      row.appendChild(actionsCell);

      fragment.appendChild(row);
    }

    tokensTableBody.appendChild(fragment);
    console.log('Tokens table updated');

    // Add event listeners for copy buttons
    const copyButtons = tokensTableBody.querySelectorAll('.copy-address-button');
    copyButtons.forEach(button => {
      button.addEventListener('click', async () => {
        const symbol = button.getAttribute('data-symbol');
        if (symbol) {
          const address = await this.getTokenAddress(symbol);
          await navigator.clipboard.writeText(address);
          this.showSuccessMessage(`Address for ${symbol} copied to clipboard!`);
        }
      });
    });

    // Fetch and display token addresses
    for (const token of tokenRows) {
      const addressSpan = document.getElementById(`tokenAddress_${token.symbol}`);
      if (addressSpan) {
        const address = await this.getTokenAddress(token.symbol);
        addressSpan.textContent = `${address.slice(0, 6)}...${address.slice(-4)}`;
      }
    }
  }

  private async getTokenAddress(symbol: string): Promise<string> {
    const token = await this.tokenService.getTokenBySymbol(symbol);
    if (token) {
      const address = await this.tokenService.getTokenAddress(token);
      return address.toString();
    }
    return 'Address not found';
  }

  async handleSendToken(token: { name: string; symbol: string }) {
    const currentWallet = await this.accountService.getCurrentWallet();
    if (!currentWallet) {
      alert("No wallet available. Please create an account first.");
      return;
    }

    try {
      const result = await this.showSendTokenModal(token);
      if (!result) {
        console.log('Transfer cancelled by user');
        return;
      }

      const { recipient, amount, isPrivate } = result;

      /*
      // Validate TOTP code
      const isValidTOTP = await this.accountService.validateTOTP(currentWallet.getAddress(), totpCode);
      if (!isValidTOTP) {
        alert('Invalid TOTP code. Please try again.');
        return;
      }
        */

      const toAddress = AztecAddress.fromString(recipient);

      // Check if the recipient address is registered
      const isRecipientRegistered = await this.isAddressRegistered(toAddress);
      if (!isRecipientRegistered) {
        alert(`The recipient address ${recipient} is not registered. Please ask the recipient to register their address first.`);
        return;
      }

      // Show loading indicator
      this.showLoadingIndicator('Simulating transfer...');

      const tokenAddress = await this.tokenService.getTokenAddress(token);
      const tokenContract = await TokenContract.at(tokenAddress, currentWallet);

      const fromAddress = currentWallet.getAddress();
      const amountBigInt = BigInt(Math.round(parseFloat(amount) * 1e9));

      // Simulate the chosen transfer type
      const simulation = await this.simulateTransfer(tokenContract, fromAddress, toAddress, amountBigInt, isPrivate);

      // Hide loading indicator
      this.hideLoadingIndicator();

      // Show simulation results to the user
      const userConfirmed = await this.showTransferSimulation(simulation, fromAddress, toAddress, token);

      if (userConfirmed) {
        // Show loading indicator again
        this.showLoadingIndicator('Processing transfer...');

        await this.tokenService.sendToken(token, recipient, amount, isPrivate);

        // Hide loading indicator
        this.hideLoadingIndicator();

        // Show success message
        this.showSuccessMessage(`Successfully sent ${amount} ${token.symbol} to ${recipient}`);
      } else {
        console.log('Transfer cancelled by user');
      }
    } catch (error) {
      // Hide loading indicator in case of error
      this.hideLoadingIndicator();

      console.error('Error sending tokens:', error);
      alert(`Failed to send tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private showSendTokenModal(token: { name: string; symbol: string }): Promise<{ recipient: string; amount: string; isPrivate: boolean } | null> {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content">
          <h2>Send ${token.symbol} Tokens</h2>
          <form id="sendTokenForm">
            <div class="form-group">
              <label for="recipient">Recipient Address:</label>
              <input class="input" type="text" id="recipient" required>
            </div>
            <div class="form-group">
              <label for="amount">Amount:</label>
              <input class="input" type="number" id="amount" min="0" step="any" required>
            </div>
            <div class="form-group">
              <label>Transfer Type:</label>
              <div class="radio-group">
                <label class="radio-option">
                  <input type="radio" id="privateTransfer" name="transferType" value="private" checked>
                  <span class="radio-custom"></span>
                  Private Transfer
                </label>
                <label class="radio-option">
                  <input type="radio" id="publicTransfer" name="transferType" value="public">
                  <span class="radio-custom"></span>
                  Public Transfer
                </label>
              </div>
            </div>
            <div class="modal-actions">
              <button type="submit" id="proceedSend" class="button primary-button">Proceed</button>
              <button type="button" id="cancelSend" class="button secondary-button">Cancel</button>
            </div>
          </form>
        </div>
      `;

      document.body.appendChild(modal);

      const form = modal.querySelector('#sendTokenForm') as HTMLFormElement;
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const recipient = (document.getElementById('recipient') as HTMLInputElement).value;
        const amount = (document.getElementById('amount') as HTMLInputElement).value;
        const isPrivate = (document.getElementById('privateTransfer') as HTMLInputElement).checked;
        document.body.removeChild(modal);
        resolve({ recipient, amount, isPrivate });
      });

      modal.querySelector('#cancelSend')?.addEventListener('click', () => {
        document.body.removeChild(modal);
        resolve(null);
      });
    });
  }

  private async simulateTransfer(
    tokenContract: TokenContract,
    fromAddress: AztecAddress,
    toAddress: AztecAddress,
    amount: bigint,
    isPrivate: boolean
  ): Promise<SimulationResult> {
    let call;
    let fromBalance: bigint = BigInt(0);
    let toBalance: bigint = BigInt(0);
    let error: string | undefined;
    let gasEstimate: bigint = BigInt(0);

    try {
      if (isPrivate) {
        call = tokenContract.methods.transfer(toAddress, amount);
        fromBalance = await tokenContract.methods.balance_of_private(fromAddress).simulate();
        toBalance = await tokenContract.methods.balance_of_private(toAddress).simulate();
      } else {



        call = tokenContract.methods.transfer_in_public(fromAddress, toAddress, amount, 0);

        let ownerPublicBalanceSlot: Fr;

        const pxe = await PXEFactory.getPXEInstance();

        const cc = await CheatCodes.create(CONFIG.l1RpcUrl, pxe);

        ownerPublicBalanceSlot = await cc.aztec.computeSlotInMap(TokenContract.storage.public_balances.slot, fromAddress.toBigInt());
        fromBalance = (await pxe.getPublicStorageAt(tokenContract.address, ownerPublicBalanceSlot)).toBigInt();

        ownerPublicBalanceSlot = await cc.aztec.computeSlotInMap(TokenContract.storage.public_balances.slot, toAddress.toBigInt());
        toBalance = (await pxe.getPublicStorageAt(tokenContract.address, ownerPublicBalanceSlot)).toBigInt();
      }

      const keystore = KeystoreFactory.getKeystore();

      const is2FAEnabled = await keystore.isAccount2FA(fromAddress);

      if(!is2FAEnabled){
        try {
          const simulationResult = await call.simulate();
          gasEstimate = simulationResult.gasUsed;
        } catch (simulationError) {
          console.error('Simulation error:', simulationError);
          error = simulationError instanceof Error ? simulationError.message : 'Unknown simulation error';
        }
      }

      return {
        isPrivate,
        fromBalanceBefore: Number(fromBalance) / 1e9,
        toBalanceBefore: Number(toBalance) / 1e9,
        fromBalanceAfter: (Number(fromBalance) - Number(amount)) / 1e9,
        toBalanceAfter: (Number(toBalance) + Number(amount)) / 1e9,
        gasEstimate,
        error,
      };
    } catch (err) {
      console.error('Error during transfer simulation:', err);
      error = err instanceof Error ? err.message : 'An unknown error occurred';

      return {
        isPrivate,
        fromBalanceBefore: Number(fromBalance) / 1e9,
        toBalanceBefore: Number(toBalance) / 1e9,
        fromBalanceAfter: 0,
        toBalanceAfter: 0,
        gasEstimate,
        error,
      };
    }
  }

  async showTransferSimulation(simulation: SimulationResult, fromAddress: AztecAddress | undefined, toAddress: AztecAddress | undefined, token: { name: string; symbol: string }): Promise<boolean> {
    const formatNumber = (num: number) => {
      return num.toFixed(9).replace(/\.?0+$/, '');
    };

    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content simulation-modal">
          <h2>Transfer Simulation Results</h2>
          ${simulation.error 
            ? `<div class="simulation-error">
                 <h3>Simulation Error</h3>
                 <p>${simulation.error}</p>
               </div>`
            : ''}
          <div class="simulation-results">
            <h3>${simulation.isPrivate ? 'Private' : 'Public'} Transfer</h3>
            <div class="simulation-details">
              <div class="simulation-column">
                <h4>Your Balance ${fromAddress ? `(${this.formatAddress(fromAddress.toString())})` : ''}</h4>
                <p>Before: <span class="balance">${formatNumber(simulation.fromBalanceBefore)} ${token.symbol}</span></p>
                <p>After: <span class="balance">${formatNumber(simulation.fromBalanceAfter)} ${token.symbol}</span></p>
                <p>Change: <span class="balance-change">${formatNumber(simulation.fromBalanceAfter - simulation.fromBalanceBefore)} ${token.symbol}</span></p>
              </div>
              <div class="simulation-column">
                <h4>Recipient Balance ${toAddress ? `(${this.formatAddress(toAddress.toString())})` : ''}</h4>
                <p>Before: <span class="balance">${formatNumber(simulation.toBalanceBefore)} ${token.symbol}</span></p>
                <p>After: <span class="balance">${formatNumber(simulation.toBalanceAfter)} ${token.symbol}</span></p>
                <p>Change: <span class="balance-change">${formatNumber(simulation.toBalanceAfter - simulation.toBalanceBefore)} ${token.symbol}</span></p>
              </div>
            </div>
            <p class="gas-estimate">Estimated gas: <span>${simulation.gasEstimate !== undefined ? simulation.gasEstimate.toString() : 'N/A'}</span></p>
          </div>
          <div class="modal-actions">
            ${simulation.error
              ? `<button id="proceedAnyway" class="button primary-button">Proceed Anyway</button>`
              : `<button id="confirmTransfer" class="button primary-button">Confirm Transfer</button>`
            }
            <button id="cancelTransfer" class="button secondary-button">Cancel</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      modal.querySelector('#confirmTransfer')?.addEventListener('click', () => {
        document.body.removeChild(modal);
        resolve(true);
      });

      modal.querySelector('#proceedAnyway')?.addEventListener('click', () => {
        document.body.removeChild(modal);
        resolve(true);
      });

      modal.querySelector('#cancelTransfer')?.addEventListener('click', () => {
        document.body.removeChild(modal);
        resolve(false);
      });
    });
  }

  private async handleShieldToken(token: { name: string; symbol: string }) {
    const currentWallet = await this.accountService.getCurrentWallet();
    if (!currentWallet) {
      alert('No wallet available. Please create an account first.');
      return;
    }

    const shieldModal = document.createElement('div');
    shieldModal.className = 'modal';
    shieldModal.innerHTML = `
      <div class="modal-content">
        <h2>Shield ${token.symbol}</h2>
        <form id="shieldForm">
          <div class="form-group">
            <label for="shieldAmount">Amount:</label>
            <input type="number" id="shieldAmount" min="0" step="0.000000001" class="input" required>
          </div>
          <div class="form-actions">
            <button type="submit" class="button primary-button" id="shieldButton">Shield</button>
            <button type="button" class="button secondary-button" id="cancelShield">Cancel</button>
          </div>
        </form>
        <div id="shieldProcessing" style="display: none;">
          <p>Shielding in progress...</p>
          <div class="loading-spinner"></div>
        </div>
      </div>
    `;

    const shieldForm = shieldModal.querySelector('#shieldForm') as HTMLFormElement;
    const cancelButton = shieldModal.querySelector('#cancelShield') as HTMLButtonElement;
    const shieldButton = shieldModal.querySelector('#shieldButton') as HTMLButtonElement;
    const processingDiv = shieldModal.querySelector('#shieldProcessing') as HTMLDivElement;

    cancelButton.addEventListener('click', () => {
      document.body.removeChild(shieldModal);
    });

    shieldForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const amountInput = shieldForm.querySelector('#shieldAmount') as HTMLInputElement;
      const amount = amountInput.value;

      shieldButton.disabled = true;
      shieldForm.style.display = 'none';
      processingDiv.style.display = 'flex';

      try {
        await this.tokenService.shieldToken(token, amount);
        document.body.removeChild(shieldModal);
        this.showSuccessMessage(`Successfully shielded ${amount} ${token.symbol}`);
      } catch (error) {
        console.error('Error shielding token:', error);
        this.showErrorMessage(`Failed to shield ${token.symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        shieldButton.disabled = false;
        shieldForm.style.display = 'flex';
        processingDiv.style.display = 'none';
      }
    });

    document.body.appendChild(shieldModal);
  }

  private async handleUnshieldToken(token: { name: string; symbol: string }) {
    const currentWallet = await this.accountService.getCurrentWallet();
    if (!currentWallet) {
      alert('No wallet available. Please create an account first.');
      return;
    }

    const unshieldModal = document.createElement('div');
    unshieldModal.className = 'modal';
    unshieldModal.innerHTML = `
      <div class="modal-content">
        <h2>Unshield ${token.symbol}</h2>
        <form id="unshieldForm">
          <div class="form-group">
            <label for="unshieldAmount">Amount:</label>
            <input type="number" id="unshieldAmount" min="0" step="0.000000001" class="input" required>
          </div>
          <div class="form-actions">
            <button type="submit" class="button primary-button" id="unshieldButton">Unshield</button>
            <button type="button" class="button secondary-button" id="cancelUnshield">Cancel</button>
          </div>
        </form>
        <div id="unshieldProcessing" style="display: none;">
          <p>Unshielding in progress...</p>
          <div class="loading-spinner"></div>
        </div>
      </div>
    `;

    const unshieldForm = unshieldModal.querySelector('#unshieldForm') as HTMLFormElement;
    const cancelButton = unshieldModal.querySelector('#cancelUnshield') as HTMLButtonElement;
    const unshieldButton = unshieldModal.querySelector('#unshieldButton') as HTMLButtonElement;
    const processingDiv = unshieldModal.querySelector('#unshieldProcessing') as HTMLDivElement;

    cancelButton.addEventListener('click', () => {
      document.body.removeChild(unshieldModal);
    });

    unshieldForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const amountInput = unshieldForm.querySelector('#unshieldAmount') as HTMLInputElement;
      const amount = amountInput.value;

      unshieldButton.disabled = true;
      unshieldForm.style.display = 'none';
      processingDiv.style.display = 'flex';

      try {
        await this.tokenService.unshieldToken(token, amount);
        document.body.removeChild(unshieldModal);
        this.showSuccessMessage(`Successfully unshielded ${amount} ${token.symbol}`);
      } catch (error) {
        console.error('Error unshielding token:', error);
        this.showErrorMessage(`Failed to unshield ${token.symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        unshieldButton.disabled = false;
        unshieldForm.style.display = 'flex';
        processingDiv.style.display = 'none';
      }
    });

    document.body.appendChild(unshieldModal);
  }

  private async updateAccountUI() {
    const accounts = await this.accountService.getAccounts();
    const currentIndex = await this.accountService.getCurrentAccountIndex() ?? 0;
    const currentWallet = await this.accountService.getCurrentWallet();

    // Update dropdown in accounts page
    const accountSelect = document.getElementById('accountSelect') as HTMLSelectElement;
    if (accountSelect) {
        accountSelect.innerHTML = accounts.map((account, index) => `
            <option value="${index}" ${index === currentIndex ? 'selected' : ''}>
                Account ${index + 1} (${account.toString().slice(0, 6)}...${account.toString().slice(-4)})
            </option>
        `).join('');
    }

    // Update header account info
    const accountLabel = document.getElementById('accountLabel');
    const accountAddress = document.getElementById('accountAddress');
    
    if (currentWallet) {
        const address = currentWallet.getAddress().toString();
        if (accountLabel) accountLabel.textContent = `Account ${currentIndex + 1}`;
        if (accountAddress) accountAddress.textContent = `(${address.slice(0, 6)}...${address.slice(-4)})`;
    } else {
        if (accountLabel) accountLabel.textContent = 'Connect';
        if (accountAddress) accountAddress.textContent = '';
    }
  }

  private setAccountSelectionListener() {
    const accountSelect = document.getElementById('accountSelect') as HTMLSelectElement | null;
    if (!accountSelect) {
      console.debug('Account select not found. This is expected if not on the Accounts page.');
      return;
    }

    accountSelect.addEventListener('change', async (event) => {
      const selectedIndex = (event.target as HTMLSelectElement).selectedIndex - 1;
      if (selectedIndex >= 0) {
        await this.accountService.setCurrentAccountIndex(selectedIndex);
        const currentWallet = await this.accountService.getCurrentWallet();
        if (currentWallet) {
          await this.tokenService.updateBalancesForNewAccount(currentWallet);
        }
        await this.updateAccountUI();
      }
    });
  }

  private addCopyClipboard() {
    document.addEventListener('click', async (event) => {
      const target = event.target as HTMLElement;
      if (target.id === 'copyAddressButton' || target.closest('#copyAddressButton')) {
        const currentAccountIndex = this.accountService.getCurrentAccountIndex();
        if (currentAccountIndex === null) {
          alert('No account selected. Please select an account first.');
          return;
        }

        const contractAddress = await this.accountService.retrieveContractAddress(currentAccountIndex);

        if (contractAddress) {
          try {
            await navigator.clipboard.writeText(contractAddress.address.toString());
            alert('Contract address copied to clipboard!');
          } catch (err) {
            console.error('Failed to copy:', err);
            alert('Failed to copy address. Please try again.');
          }
        } else {
          alert('No contract address available to copy.');
        }
      }
    });
  }

  public showLoadingSpinner() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    const tableContainer = document.querySelector('.table-container');
    if (loadingSpinner && tableContainer) {
      loadingSpinner.style.display = 'block';
      tableContainer.classList.add('loading');
    }
  }

  public hideLoadingSpinner() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    const tableContainer = document.querySelector('.table-container');
    if (loadingSpinner && tableContainer) {
      loadingSpinner.style.display = 'none';
      tableContainer.classList.remove('loading');
    }
  }

  private setupDropdownMenu() {
    const dropdownMenu = document.getElementById('accountDropdown');
    const avatarButton = document.getElementById('avatarButton');
    const dropdownContent = document.getElementById('dropdownContent');

    if (dropdownMenu && avatarButton && dropdownContent) {
      let timeoutId: NodeJS.Timeout | null = null;

      const showDropdown = () => {
        if (timeoutId) clearTimeout(timeoutId);
        dropdownMenu.classList.add('active');
      };

      const hideDropdown = () => {
        timeoutId = setTimeout(() => {
          dropdownMenu.classList.remove('active');
        }, 300); // Delay before hiding the dropdown
      };

      // Hover functionality
      dropdownMenu.addEventListener('mouseenter', showDropdown);
      dropdownMenu.addEventListener('mouseleave', hideDropdown);

      // Click functionality
      avatarButton.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownMenu.classList.toggle('active');
      });

      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
        if (!dropdownMenu.contains(e.target as Node)) {
          dropdownMenu.classList.remove('active');
        }
      });

      // Prevent dropdown from closing when clicking inside
      dropdownContent.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    } else {
      console.error('Dropdown menu elements not found');
    }
  }

  showCreateMintTokenPopup() {
    if (this.accountService.getCurrentAccountIndex() === null) {
      alert("No account created yet. Please create an account before creating or minting tokens.");
      return;
    }

    // Instead of showing a modal, we can focus on the Create/Mint form
    const createMintForm = document.getElementById('createMintTokenForm');
    if (createMintForm) {
      createMintForm.scrollIntoView({ behavior: 'smooth' });
      const firstInput = createMintForm.querySelector('input') as HTMLInputElement;
      if (firstInput) {
        firstInput.focus();
      }
    }
  }

  private async initializeAccountInfo() {
    const currentAccountIndex = this.accountService.getCurrentAccountIndex();
    if (currentAccountIndex !== null) {
      const accounts = await this.accountService.getAccounts();
      if (accounts.length > currentAccountIndex) {
        const currentAccount = accounts[currentAccountIndex];
        const accountLabel = document.getElementById('accountLabel');
        const accountAddress = document.getElementById('accountAddress');
        
        if (accountLabel && accountAddress) {
          accountLabel.textContent = `Account ${currentAccountIndex + 1}`;
          accountAddress.textContent = `(${currentAccount.toString().slice(0, 5)}...${currentAccount.toString().slice(-5)})`;
        }
      }
    }
  }

  setupUI() {
    console.log('Setting up UI...');
    this.initializeAccountInfo();
    this.updateAccountUI();
    this.displayPairings();
    this.addCopyClipboard();
    this.setupDynamicEventListeners();
    this.setupHashChangeListener();
    this.loadAccountState();
    this.setupDropdownMenu();
    this.setupRPSPage();

    console.log('UI setup complete.');
  }

  private setupHashChangeListener() {
    window.addEventListener('hashchange', () => {
      this.debouncedHandlePageChange();
    });
    // Trigger the page change handler on initial load
    this.debouncedHandlePageChange();
  }

  public debouncedHandlePageChange() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.handlePageChange();
    }, 100); // Adjust this delay as needed
  }

  private async rotateNullifierKey(event: Event) {
    event.preventDefault();
    const button = event.target as HTMLButtonElement;
    const originalText = button.textContent || 'Rotate Nullifier Key';
    
    try {
      button.disabled = true;
      button.textContent = 'Processing...';
      this.showLoadingIndicator('Rotating Nullifier Key...');

      const currentAccountIndex = this.accountService.getCurrentAccountIndex();
      if (currentAccountIndex === null) {
        throw new Error('No account selected. Please select an account first.');
      }

      const wallet = await this.accountService.getCurrentWallet();
      if (!wallet) {
        throw new Error('No wallet available. Please create an account first.');
      }

      await this.accountService.rotateNullifierKey(wallet);
      this.showSuccessMessage('Nullifier key rotated successfully!');
    } catch (error) {
      console.error('Error rotating nullifier key:', error);
      alert('Failed to rotate nullifier key. Please try again.');
    } finally {
      button.disabled = false;
      button.textContent = originalText;
      this.hideLoadingIndicator();
    }
  }

  private showLoadingIndicator(message: string) {
    let loadingOverlay = document.getElementById('loadingOverlay');
    if (!loadingOverlay) {
      loadingOverlay = document.createElement('div');
      loadingOverlay.id = 'loadingOverlay';
      loadingOverlay.innerHTML = `
        <div class="loading-spinner"></div>
        <p id="loadingMessage"></p>
      `;
      document.body.appendChild(loadingOverlay);
    }
    const messageElement = loadingOverlay.querySelector('#loadingMessage');
    if (messageElement) {
      messageElement.textContent = message;
    }
    loadingOverlay.style.display = 'flex';
  }

  private hideLoadingIndicator() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
      loadingOverlay.style.display = 'none';
    }
  }

  private showSuccessMessage(message: string) {
    const successMessage = document.createElement('div');
    successMessage.id = 'successMessage';
    successMessage.innerHTML = `
      <p>${message}</p>
    `;
    document.body.appendChild(successMessage);

    // Remove the success message after 3 seconds
    setTimeout(() => {
      const messageElement = document.getElementById('successMessage');
      if (messageElement) {
        document.body.removeChild(messageElement);
      }
    }, 3000);
  }

  private async isAddressRegistered(address: AztecAddress): Promise<boolean> {
    try {
      const pxe = await PXEFactory.getPXEInstance();

      const registeredAccounts = await pxe.getRegisteredAccounts();
      return registeredAccounts.some(account => account.address.equals(address));
      return true;
    } catch (error) {
      return false;
    }
  }

  async registerAddress(address: AztecAddress) {
    try {

      const pxe = await PXEFactory.getPXEInstance();

      //TODO: fix this
      //await pxe.registerRecipient(address);
      console.log(`Address ${address.toString()} registered successfully.`);
    } catch (error) {
      console.error(`Failed to register address ${address.toString()}:`, error);
      throw error;
    }
  }

  async handleRegisterAddress() {
    const currentWallet = await this.accountService.getCurrentWallet();
    if (!currentWallet) {
      alert("No wallet available. Please create an account first.");
      return;
    }

    const address = currentWallet.getAddress();
    try {
      await this.registerAddress(address);
      alert(`Your address ${address.toString()} has been registered successfully.`);
    } catch (error) {
      alert(`Failed to register your address: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async updatePendingShieldsList(pendingShieldsData: { 
    token: { name: string; symbol: string }; 
    pendingShieldNotes: { items: Fr[]; formattedAmount: string }[];
  }[]) {
    const pendingShieldsList = document.getElementById('pendingShieldsList');
    if (pendingShieldsList) {
      pendingShieldsList.innerHTML = '';

      if (pendingShieldsData.length === 0) {
        pendingShieldsList.innerHTML = '<p class="no-pending-shields">No pending shields available.</p>';
        return;
      }

      for (const { token, pendingShieldNotes } of pendingShieldsData) {
        const tokenContainer = document.createElement('div');
        tokenContainer.className = 'token-pending-shields-container';
        tokenContainer.setAttribute('data-token-symbol', token.symbol);

        const tokenHeader = document.createElement('div');
        tokenHeader.className = 'token-pending-shields-header';
        tokenHeader.innerHTML = `
          <h4 class="token-pending-shields-title">${token.name} (${token.symbol})</h4>
          <span class="pending-shields-count">${pendingShieldNotes.length} pending</span>
        `;
        tokenContainer.appendChild(tokenHeader);

        if (pendingShieldNotes.length === 0) {
          const noShieldsMessage = document.createElement('p');
          noShieldsMessage.className = 'no-pending-shields';
          noShieldsMessage.textContent = `No pending shields for ${token.symbol}`;
          tokenContainer.appendChild(noShieldsMessage);
        } else {
          const notesList = document.createElement('ul');
          notesList.className = 'pending-shields-list';

          pendingShieldNotes.forEach((note, index) => {
            const noteItem = document.createElement('li');
            noteItem.className = 'pending-shield-note-item';
            
            // Safely access note.items[2] and provide a fallback
            const nonce = note.items[2] ? note.items[2].toBigInt() : BigInt(index);
            
            noteItem.innerHTML = `
              <div class="pending-shield-info">
                <span class="pending-shield-amount">${note.formattedAmount} ${token.symbol}</span>
                <span class="pending-shield-index">Shield #${nonce.toString()}</span>
              </div>
              <button class="redeem-button" data-token-name="${token.name}" data-token-symbol="${token.symbol}" data-index="${index}">Redeem</button>
            `;
            notesList.appendChild(noteItem);
          });

          tokenContainer.appendChild(notesList);
        }

        pendingShieldsList.appendChild(tokenContainer);
      }

      // Add event listeners for redeem buttons
      const redeemButtons = pendingShieldsList.querySelectorAll('.redeem-button');
      redeemButtons.forEach(button => {
        button.addEventListener('click', async (event) => {
          const target = event.target as HTMLButtonElement;
          target.disabled = true;
          target.textContent = 'Redeeming...';

          let tokenSymbol = '';

          try {
            const tokenName = target.getAttribute('data-token-name') || '';
            tokenSymbol = target.getAttribute('data-token-symbol') || '';
            const index = parseInt(target.getAttribute('data-index') || '0', 10);
            //await this.tokenService.redeemShield({ name: tokenName, symbol: tokenSymbol }, index);
            this.showSuccessMessage(`Successfully redeemed ${tokenSymbol} shield`);
          } catch (error) {
            console.error('Error redeeming shield:', error);
            this.showErrorMessage(`Failed to redeem ${tokenSymbol} shield: ${error instanceof Error ? error.message : 'Unknown error'}`);
          } finally {
            target.disabled = false;
            target.textContent = 'Redeem';
          }
        });
      });
    }
  }

  private showErrorMessage(message: string) {
    const errorMessage = document.createElement('div');
    errorMessage.id = 'errorMessage';
    errorMessage.className = 'error-message';
    errorMessage.innerHTML = `<p>${message}</p>`;
    document.body.appendChild(errorMessage);

    setTimeout(() => {
      const messageElement = document.getElementById('errorMessage');
      if (messageElement) {
        document.body.removeChild(messageElement);
      }
    }, 5000);
  }

  private async handleCreateMintImportTokenSubmit(event: Event) {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const nameInput = form.querySelector('#tokenName') as HTMLInputElement;
    const symbolInput = form.querySelector('#tokenSymbol') as HTMLInputElement;
    const amountInput = form.querySelector('#tokenAmount') as HTMLInputElement;
    const addressInput = form.querySelector('#tokenAddress') as HTMLInputElement;
    const mintAmountInput = form.querySelector('#mintAmount') as HTMLInputElement;
    const actionRadios = form.querySelectorAll('input[name="tokenAction"]') as NodeListOf<HTMLInputElement>;
    const submitButton = form.querySelector('button[type="submit"]') as HTMLButtonElement;

    const action = Array.from(actionRadios).find(radio => radio.checked)?.value;

    submitButton.disabled = true;
    submitButton.textContent = 'Processing...';

    try {
      switch (action) {
        case 'create':
          await this.tokenService.createToken({
            name: nameInput.value,
            symbol: symbolInput.value,
            amount: amountInput.value
          });
          break;
        case 'mint':
          await this.tokenService.mintToken(addressInput.value, mintAmountInput.value);
          break;
        case 'import':
          await this.tokenService.importExistingToken(addressInput.value);
          break;
        default:
          throw new Error('Invalid action selected');
      }

      // Clear the form fields
      form.reset();
      this.updateTokenForm('create'); // Reset form to create mode

      this.showSuccessMessage(`Successfully ${action}ed token`);
    } catch (error) {
      console.error(`Error ${action}ing token:`, error);
      this.showErrorMessage(`Failed to ${action} token. ${error instanceof Error ? error.message : 'Unknown error occurred.'}`);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Submit';
    }
  }

  private updateTokenForm(action: string) {
    const createFields = document.getElementById('createFields');
    const mintImportFields = document.getElementById('mintImportFields');
    const tokenNameInput = document.getElementById('tokenName') as HTMLInputElement;
    const tokenSymbolInput = document.getElementById('tokenSymbol') as HTMLInputElement;
    const tokenAmountInput = document.getElementById('tokenAmount') as HTMLInputElement;
    const tokenAddressInput = document.getElementById('tokenAddress') as HTMLInputElement;
    const mintAmountGroup = document.getElementById('mintAmountGroup');
    const mintAmountInput = document.getElementById('mintAmount') as HTMLInputElement;

    if (action === 'create') {
      createFields!.style.display = 'block';
      mintImportFields!.style.display = 'none';
      tokenNameInput.required = true;
      tokenSymbolInput.required = true;
      tokenAmountInput.required = true;
      tokenAddressInput.required = false;
      mintAmountInput.required = false;
    } else {
      createFields!.style.display = 'none';
      mintImportFields!.style.display = 'block';
      tokenNameInput.required = false;
      tokenSymbolInput.required = false;
      tokenAmountInput.required = false;
      tokenAddressInput.required = true;
      
      if (action === 'mint') {
        mintAmountGroup!.style.display = 'block';
        mintAmountInput.required = true;
      } else {
        mintAmountGroup!.style.display = 'none';
        mintAmountInput.required = false;
      }
    }
  }

  private handleEraseAllData(event: Event) {
    console.log('Erase All Data button clicked');
    event.preventDefault(); // Prevent the default anchor behavior
    if (confirm('Are you sure you want to erase all data? This action cannot be undone.')) {
      console.log('User confirmed, clearing localStorage...');
      localStorage.clear();
      console.log('localStorage cleared, showing alert...');
      console.log('Reloading page...');
      window.location.reload();
    } else {
      console.log('User cancelled the operation');
    }
  }

  private setupTransactionFilters() {
    const filterSelect = document.getElementById('transactionFilter') as HTMLSelectElement;
    const refreshButton = document.getElementById('refreshTransactions') as HTMLButtonElement;

    if (filterSelect) {
      filterSelect.addEventListener('change', async () => {
        const selectedFilter = filterSelect.value;
        await this.displayTransactions(selectedFilter);
      });
    }

    if (refreshButton) {
      refreshButton.addEventListener('click', async () => {
        const selectedFilter = filterSelect ? filterSelect.value : 'all';
        await this.displayTransactions(selectedFilter);
      });
    }
  }

  private async setupRPSPage() {
    if (!this.rpsService) {
        console.error('RPS Service not initialized');
        return;
    }

    await this.rpsService.initialize(this.accountService);
    this.setupTabs();
    this.setupGameActions();
    this.setupMoveSelection();
    this.initializeTokenSelect();
    
    // Wait for both updates to complete
    await Promise.all([
        this.updateGamesList(),
        this.updateUserGamesTables() // Make sure this gets called
    ]);
    
    // Expose global handlers
    window.copyGameIdHandler = (gameId: string) => {
        this.copyGameId(gameId);
    };
    
    window.timeoutGame = async (gameId: string) => {
        try {
            await this.rpsService.timeoutGame(gameId);
            this.addRPSLog(`Successfully timed out game ${this.formatGameId(gameId)}!`);
        } catch (err: any) {
            this.addRPSLog(`Error timing out game: ${err?.message || err}`);
        }
    };
    
    // Start periodic timeout checks
    setInterval(() => this.updateGameTimeouts(), 10000);
    
    await this.updateRPSBalance();
  }

  private initializeTokenSelect() {
    const tokenSelect = document.getElementById('tokenSelect') as HTMLSelectElement;
    if (tokenSelect) {
      tokenSelect.innerHTML = ''; // Clear any previous options
      CONFIG.TOKEN_CONTRACTS.forEach(token => {
        tokenSelect.innerHTML += `
          <option value="${token.ADDRESS}">
            ${token.NAME} (${token.SYMBOL})
          </option>`;
      });
      
      // Update balances when token selection changes
      tokenSelect.addEventListener('change', () => {
        this.updateRPSBalance();
      });
    }
  }

  private async updateUserGamesTables() {
    const startedGamesTable = document.getElementById('startedGamesTableBody');
    const joinedGamesTable = document.getElementById('joinedGamesTableBody');

    if (startedGamesTable && joinedGamesTable) {
      // Clear existing tables
      startedGamesTable.innerHTML = '';
      joinedGamesTable.innerHTML = '';

      try {
        // Get user games
        const startedGames = await this.rpsService.getUserStartedGames();
        const joinedGames = await this.rpsService.getUserJoinedGames();

        // Populate started games table
        startedGames.forEach(game => {
          const row = document.createElement('tr');
          const result = this.getGameResult(game);
          const showResolve = !game.isCompleted && game.player2Move !== '0';

          row.innerHTML = `
            <td>${this.formatGameId(game.id)}</td>
            <td>${game.betAmount}</td>
            <td>${game.isCompleted ? 'Completed' : 'Active'}</td>
            <td>${game.player2Move === '0' ? 'Waiting' : this.getMoveText(game.player2Move)}</td>
            <td>
              ${showResolve ? `
                <button onclick="resolveGame('${game.id}')" class="resolve-button">
                  Resolve
                </button>
              ` : '-'}
            </td>
          `;
          startedGamesTable.appendChild(row);
        });

        // Populate joined games table
        joinedGames.forEach(game => {
          const row = document.createElement('tr');
          const result = this.getGameResult(game);
          const showTimeout = !game.isCompleted;
          
          row.innerHTML = `
            <td>${this.formatGameId(game.id)}</td>
            <td>${game.betAmount}</td>
            <td>${game.isCompleted ? 'Completed' : 'Active'}</td>
            <td>${this.getMoveText(game.player2Move)}</td>
            <td>${result}</td>
            <td>
              ${showTimeout ? `
                <button onclick="timeoutGame('${game.id}')" class="timeout-button">
                  Timeout
                </button>
              ` : '-'}
            </td>
          `;
          joinedGamesTable.appendChild(row);
        });

        // Update statistics
        this.updateGameStatistics([...startedGames, ...joinedGames]);
      } catch (err) {
        console.error('Error updating user games tables:', err);
      }
    }
  }

  private getGameResult(game: any): string {
    if (!game.isCompleted) return '-';
    if (game.winner === '0') return 'Draw';
    if (game.winner === '1') return 'Won';
    if (game.winner === '2') return 'Lost';
    return 'Unknown';
  }

  private updateGameStatistics(games: any[]) {
    const statsContainer = document.getElementById('gameStatistics');
    if (!statsContainer) return;

    const completedGames = games.filter(g => g.isCompleted);
    const stats = {
      total: completedGames.length,
      wins: completedGames.filter(g => g.winner === '1').length,
      losses: completedGames.filter(g => g.winner === '2').length,
      draws: completedGames.filter(g => g.winner === '0').length
    };

    // Update individual stat elements
    const statTotal = document.getElementById('statTotal');
    const statWins = document.getElementById('statWins');
    const statLosses = document.getElementById('statLosses');
    const statDraws = document.getElementById('statDraws');

    if (statTotal) statTotal.textContent = stats.total.toString();
    if (statWins) statWins.textContent = stats.wins.toString();
    if (statLosses) statLosses.textContent = stats.losses.toString();
    if (statDraws) statDraws.textContent = stats.draws.toString();
  }

  private addRPSLog(message: string) {
    const logs = document.getElementById('logs');
    if (logs) {
      const entry = document.createElement('div');
      entry.className = 'log-entry';
      entry.textContent = message;
      logs.appendChild(entry);
      logs.scrollTop = logs.scrollHeight;

      // Keep only the last 50 messages
      const entries = logs.getElementsByClassName('log-entry');
      while (entries.length > 50) {
        entries[0].remove();
      }
    }
  }

  private getMoveText(move: string): string {
    switch (move) {
      case '0': return '✊ Rock';
      case '1': return '✋ Paper';
      case '2': return '✌️ Scissors';
      default: return 'Unknown';
    }
  }

  private async updateRPSBalance() {
    const balanceElement = document.getElementById('tokenBalance');
    const contractBalanceElement = document.getElementById('contractBalance');
    const tokenSelect = document.getElementById('tokenSelect') as HTMLSelectElement;
    if (balanceElement) {
      try {
        // Show loading indicators
        balanceElement.innerHTML = '<div class="loading-spinner small"></div>';
        if (contractBalanceElement) {
          contractBalanceElement.innerHTML = '<div class="loading-spinner small"></div>';
        }

        if (!this.rpsService.isInitialized()) {

          balanceElement.textContent = 'No balance';
          if (contractBalanceElement) {
            contractBalanceElement.textContent = 'No balance';
          }
          return;
        }

        const tokenDetails = await this.rpsService.getTokenDetails(tokenSelect.value);
        const balance = await this.rpsService.getPublicBalance(tokenSelect.value);
        balanceElement.textContent = `${balance} ${tokenDetails.symbol}`;
        
        if (contractBalanceElement) {
          const contractBalance = await this.rpsService.getContractBalance(tokenSelect.value);
          contractBalanceElement.textContent = `${contractBalance} ${tokenDetails.symbol}`;
        }
      } catch (error) {
        console.error('Error updating balance:', error);
        balanceElement.textContent = 'Error loading balance';
        if (contractBalanceElement) {
          contractBalanceElement.textContent = 'Error loading balance';
        }
      }
    }
  }

  public updateGameRow(game: { id: bigint, betAmount: string, isCompleted: boolean, player2Move: string, blocktime: string }) {
    const gameRow = document.querySelector(`tr[data-game-id="${game.id}"]`);
    if (!gameRow) return;

    // Update status cell
    const statusCell = gameRow.querySelector('td:nth-child(3)');
    if (statusCell) {
        statusCell.textContent = game.isCompleted ? 'Completed' : 'Active';
    }

    // Update player 2 move cell
    const moveCell = gameRow.querySelector('td:nth-child(4)');
    if (moveCell) {
        moveCell.textContent = game.blocktime === '0' ? 'Waiting' : this.getMoveText(game.player2Move);
    }

    // Update actions cell
    const actionsCell = gameRow.querySelector('td:nth-child(5)');
    if (actionsCell) {
        if (game.isCompleted) {
            actionsCell.innerHTML = '-';
        } else if (game.blocktime === '0') {
            actionsCell.innerHTML = `
                <button class="button action-button play-button" onclick="document.getElementById('gameId').value='${game.id}'; document.getElementById('joinGameSection').scrollIntoView({behavior: 'smooth'})">
                    Play
                </button>`;
        } else {
            actionsCell.innerHTML = `
                <div class="game-actions">
                    <button onclick="resolveGame('${game.id}')" class="resolve-button">
                        Resolve
                    </button>
                    <button onclick="timeoutGame('${game.id}')" class="timeout-button" id="timeout-${game.id}">
                        Timeout
                    </button>
                    <div class="timeout-info" id="timeout-info-${game.id}"></div>
                </div>`;
        }
    }
  }

  private generateGameRow(game: { id: bigint, betAmount: string, isCompleted: boolean, player2Move: string, blocktime: string }) {
    const id = game.id.toString();
    const isWaitingForPlayer2 = game.blocktime === '0';
    const isUserStartedGame = this.isGameStartedByUser(id);
    const isUserJoinedGame = this.isGameJoinedByUser(id);
    const canTimeout = !isWaitingForPlayer2 && !game.isCompleted; // Can timeout if player2 has moved and game isn't completed

    return `
        <tr data-game-id="${id}">
            <td>${this.formatGameId(id)}</td>
            <td>${game.betAmount}</td>
            <td>${game.isCompleted ? 'Completed' : 'Active'}</td>
            <td>${isWaitingForPlayer2 ? 'Waiting' : this.getMoveText(game.player2Move)}</td>
            <td>
                ${game.isCompleted ? '-' : 
                    isUserStartedGame && !isWaitingForPlayer2 ? 
                        `<button onclick="resolveGame('${id}')" class="resolve-button">
                            Resolve
                        </button>` :
                    (!isUserStartedGame && !isUserJoinedGame && isWaitingForPlayer2) ? 
                        `<button class="button action-button play-button" onclick="document.getElementById('gameId').value='${id}'; document.getElementById('joinGameSection').scrollIntoView({behavior: 'smooth'})">
                            Play
                        </button>` :
                    canTimeout ? 
                        `<button onclick="timeoutGame('${id}')" class="timeout-button" id="timeout-${id}">
                            Timeout
                        </button>
                        <div class="timeout-info" id="timeout-info-${id}"></div>` :
                        '-'
                }
            </td>
        </tr>
    `;
}

  private isGameStartedByUser(gameId: string): boolean {
    if (!this.rpsService) return false;
    const userGames = this.rpsService.getUserGames();
    const currentWalletAddress = this.rpsService.getCurrentWalletAddress();
    
    if (!userGames || !currentWalletAddress) return false;
    
    const games = userGames.get(currentWalletAddress);
    return games?.started.includes(gameId) || false;
  }

  private isGameJoinedByUser(gameId: string): boolean {
    if (!this.rpsService) return false;
    const userGames = this.rpsService.getUserGames();
    const currentWalletAddress = this.rpsService.getCurrentWalletAddress();
    
    if (!userGames || !currentWalletAddress) return false;
    
    const games = userGames.get(currentWalletAddress);
    return games?.joined.includes(gameId) || false;
  }

  private formatGameId(gameId: string): string {
    // Abbreviate long game ids. E.g., "18751008177878127295679387853841789877365493046757546476222158466894686461448"
    // becomes "1875...1448"
    if (gameId.length <= 8) return gameId;
    return `${gameId.slice(0, 4)}...${gameId.slice(-4)}`;
  }

  private copyGameId(gameId: string): void {
    navigator.clipboard.writeText(gameId)
      .then(() => {
         this.addRPSLog(`Copied game ID: ${gameId}`);
      })
      .catch(err => {
         console.error('Error copying game ID:', err);
      });
  }

  private async updateGamesList() {
    const gamesTableBody = document.getElementById('gamesTableBody');
    if (!gamesTableBody) return;

    try {
        // Show initial loading indicator
        gamesTableBody.innerHTML = `
            <tr>
                <td colspan="5" class="loading-cell">
                    <div class="loading-container">
                        <span>Loading games...</span>
                    </div>
                </td>
            </tr>
        `;

        // Get games count
        const count = await this.rpsService.getGamesCount();
        
        // Clear loading message (so we can insert rows)
        gamesTableBody.innerHTML = '';
        
        // Add loading indicator at bottom
        const loadingRow = document.createElement('tr');
        loadingRow.className = 'loading-row';
        loadingRow.innerHTML = `
            <td colspan="5" class="loading-cell subtle">
                <div class="loading-container">
                    <span>Loading more games...</span>
                </div>
            </td>
        `;
        gamesTableBody.appendChild(loadingRow);

        // Load games one by one in a non-blocking way.
        for (let i = 0; i < count; i++) {
            try {
                const gameId = await this.rpsService.getGameIdByIndex(i);
                const gameNote = await this.rpsService.getGameById(gameId);
                
                // Insert newly loaded game before the loading row
                const tempContainer = document.createElement('tbody');
                tempContainer.innerHTML = this.generateGameRow({
                    id: gameId.toBigInt(),
                    betAmount: gameNote.bet_amount.toString(),
                    isCompleted: gameNote.is_completed,
                    player2Move: gameNote.player2_move.toString(),
                    blocktime: gameNote.blocktime.toString()
                });
                
                const rowElement = tempContainer.firstElementChild;
                if (rowElement) {
                    gamesTableBody.insertBefore(rowElement, loadingRow);
                }
            } catch (error) {
                console.error(`Error loading game at index ${i}:`, error);
            }
            // Yield control to allow UI updates and events to be processed.
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        // Remove loading row when done
        loadingRow.remove();

        // Optionally, rebind global handlers if needed
        window.resolveGame = async (gameId: string) => {
            try {
                await this.rpsService.resolveGame(gameId);
                this.addRPSLog(`Successfully resolved game ${this.formatGameId(gameId)}!`);
                await this.updateGamesList();
            } catch (err: any) {
                this.addRPSLog(`Error resolving game: ${err?.message || err}`);
            }
        };

    } catch (error) {
        console.error('Error updating games list:', error);
        gamesTableBody.innerHTML = `
            <tr>
                <td colspan="5" class="error-cell">
                    Failed to load games. Please try again.
                </td>
            </tr>
        `;
    }
  }

  private addGameToTable(game: { id: bigint, betAmount: string, isCompleted: boolean, player2Move: string, blocktime: string }) {
    const gamesTableBody = document.getElementById('gamesTableBody');
    if (!gamesTableBody) return;

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${this.formatGameId(game.id.toString())}</td>
      <td>${game.betAmount}</td>
      <td>${game.isCompleted ? 'Completed' : 'Active'}</td>
      <td>${game.player2Move === '0' ? 'Waiting' : this.getMoveText(game.player2Move)}</td>
      <td>
        ${game.isCompleted 
            ? '-' 
            : (game.player2Move === '0' 
                ? '-' 
                : `<button onclick="resolveGame('${game.id}')" class="resolve-button">
                       Resolve
                    </button>`)}
      </td>
    `;

    // Use prepend to insert the new row at the start.
    gamesTableBody.prepend(row);
  }

  private async updateGameTimeouts() {
    const games = Array.from(document.querySelectorAll('[id^="timeout-"]'));
    for (const element of games) {
        const gameId = element.id.replace('timeout-', '');
        const timeoutInfo = await this.rpsService.checkGameTimeout(gameId);
        
        console.log(timeoutInfo.blocksLeft)
        
        const timeoutButton = document.getElementById(`timeout-${gameId}`) as HTMLButtonElement;
        const timeoutInfoDiv = document.getElementById(`timeout-info-${gameId}`);

        if (timeoutButton && timeoutInfoDiv) {
            if (timeoutInfo.canTimeout) {
                timeoutButton.disabled = false;
                timeoutButton.classList.add('can-timeout');
                timeoutInfoDiv.textContent = '⚠️ Game can be timed out! Player 1 failed to resolve in time.';
            } else if (timeoutInfo.blocksLeft && timeoutInfo.blocksLeft > 0) {
                timeoutButton.disabled = true;
                timeoutButton.classList.remove('can-timeout');
                timeoutInfoDiv.textContent = `⏳ ${timeoutInfo.blocksLeft} blocks until timeout available`;
            } else {
                timeoutButton.disabled = true;
                timeoutButton.classList.remove('can-timeout');
                timeoutInfoDiv.textContent = 'Waiting for player 2 to play';
            }
        }
    }
  }

  private setupMoveSelection() {
    const startGameMoves = document.getElementById('startGameMoves');
    const joinGameMoves = document.getElementById('joinGameMoves');

    const setupMoveButtons = (container: HTMLElement | null) => {
      if (!container) return;

      const buttons = container.querySelectorAll('.move-button');
      buttons.forEach(button => {
        button.addEventListener('click', () => {
          buttons.forEach(btn => btn.classList.remove('selected'));
          button.classList.add('selected');
        });
      });
    };

    setupMoveButtons(startGameMoves);
    setupMoveButtons(joinGameMoves);
  }

  private setupGameActions() {
    const startGameButton = document.getElementById('startGame');
    const joinGameButton = document.getElementById('joinGame');
  
    if (startGameButton) {
      // Use onclick to override any previously bound handler
      startGameButton.onclick = async () => {
        const betAmountInput = document.getElementById('betAmount') as HTMLInputElement;
        const selectedMove = document.querySelector('#startGameMoves .move-button.selected');
        const tokenSelect = document.getElementById('tokenSelect') as HTMLSelectElement;
        
        if (!betAmountInput?.value || !selectedMove?.getAttribute('data-move') || !tokenSelect?.value) {
          this.addRPSLog('Please select a move, token and enter a bet amount');
          return;
        }
  
        try {
          startGameButton.classList.add('loading');
          startGameButton.setAttribute('disabled', 'true');
  
          // Check balance before attempting to start game
          const balance = await this.rpsService.getPublicBalance(tokenSelect.value);
          const betAmount = parseFloat(betAmountInput.value);
          
          if (BigInt(balance) < BigInt(betAmount)) {
            this.addRPSLog(`Insufficient balance! You need ${betAmount} tokens but only have ${balance}`);
            return;
          }
  
          const gameId = await this.rpsService.startGame(
            parseInt(selectedMove.getAttribute('data-move')!),
            betAmountInput.value,
            tokenSelect.value
          );
  
          // Add check for Fr.ZERO
          if (gameId === Fr.ZERO) {
            this.addRPSLog('Failed to start game. Please check your wallet and try again.');
            return;
          }
  
          this.addRPSLog(`Game started successfully! Game ID: ${gameId.toBigInt().toString()}`);
          
          // Immediately add the new game to the Active Games table
          this.addGameToTable({
            id: gameId.toBigInt(),
            betAmount: betAmountInput.value,
            isCompleted: false,
            player2Move: '0',
            blocktime: '0'
          });
  
          // Also update the My Games tables dynamically
          await this.updateUserGamesTables();
  
          // Finally, update the balance
          await this.updateRPSBalance();
        } catch (err: any) {
          let errorMessage = `Error starting game: ${err?.message || err}`;
          if (err?.message?.includes('JSON-RPC PROPAGATED')) {
            const errorParts = err.message.split('\n');
            if (errorParts.length > 0) {
              errorMessage = `Contract Error: ${errorParts[0]}`;
              if (errorParts.length > 1) {
                errorMessage += `\n${errorParts[1]}`;
              }
            }
          }
          this.addRPSLog(errorMessage);
          console.error('Game start error:', err);
        } finally {
          startGameButton.classList.remove('loading');
          startGameButton.removeAttribute('disabled');
        }
      };
    }
  
    if (joinGameButton) {
      joinGameButton.onclick = async () => {
        const gameIdInput = document.getElementById('gameId') as HTMLInputElement;
        const selectedMove = document.querySelector('#joinGameMoves .move-button.selected');
        
        if (!gameIdInput?.value || !selectedMove?.getAttribute('data-move')) {
          this.addRPSLog('Please select a move and enter a game ID');
          return;
        }

        try {
          joinGameButton.classList.add('loading');
          const result = await this.rpsService.joinGame(
            gameIdInput.value,
            parseInt(selectedMove.getAttribute('data-move')!)
          );

          if (result.success && result.gameInfo) {
            this.updateGameRow(result.gameInfo);
            this.addRPSLog(`Successfully joined game ${this.formatGameId(gameIdInput.value)}!`);
            await this.updateRPSBalance();
            
            // Clear selection and game ID
            document.querySelectorAll('#joinGameMoves .move-button').forEach(btn => 
              btn.classList.remove('selected')
            );
            gameIdInput.value = '';
          }
        } catch (err: any) {
          this.addRPSLog(`Error joining game: ${err?.message || err}`);
        } finally {
          joinGameButton.classList.remove('loading');
        }
      };
    }
  }

  private setupTabs() {
    const activeBtn = document.getElementById('tabActive');
    const myGamesBtn = document.getElementById('tabMyGames');

    if (activeBtn) {
      activeBtn.addEventListener('click', () => this.switchTab('active'));
    }

    if (myGamesBtn) {
      myGamesBtn.addEventListener('click', () => this.switchTab('mygames'));
    }
  }

  private switchTab(tab: 'active' | 'mygames') {
    const activeBtn = document.getElementById('tabActive');
    const myGamesBtn = document.getElementById('tabMyGames');
    const activeContent = document.getElementById('activeGamesContent');
    const myGamesContent = document.getElementById('myGamesContent');
  
    if (!activeBtn || !myGamesBtn || !activeContent || !myGamesContent) return;
  
    if (tab === 'active') {
      activeBtn.classList.add('active');
      myGamesBtn.classList.remove('active');
      activeContent.style.display = 'block';
      myGamesContent.style.display = 'none';
    } else {
      myGamesBtn.classList.add('active');
      activeBtn.classList.remove('active');
      activeContent.style.display = 'none';
      myGamesContent.style.display = 'block';
    }
    // No reloading here—cached content will be shown immediately
  }

  // Add these methods to UIManager class
  setStartedGamesLoading(loading: boolean) {
    const tbody = document.getElementById('startedGamesTableBody');
    if (tbody) {
        if (loading) {
            tbody.innerHTML = '<tr><td colspan="5">Loading Games...</td></tr>';
        } else {
            tbody.innerHTML = ''; // Clear before new data is added
        }
    }
  }

  setJoinedGamesLoading(loading: boolean) {
    const tbody = document.getElementById('joinedGamesTableBody');
    if (tbody) {
        if (loading) {
            tbody.innerHTML = '<tr><td colspan="5">Loading Games...</td></tr>';
        } else {
            tbody.innerHTML = ''; // Clear before new data is added
        }
    }
  }
}