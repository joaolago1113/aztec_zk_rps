import { PXEFactory } from './factories/PXEFactory.js';
import { RPSService } from './services/RPSService.js';
import { getInitialTestAccountsWallets, deployInitialTestAccounts} from "@aztec/accounts/testing";
import { PXE } from '@aztec/circuit-types';
import { UIManager } from './ui/UIManager.js';
import { KeystoreFactory } from './factories/KeystoreFactory.js';
import { WalletSdkFactory } from './factories/WalletSdkFactory.js';
import { AccountService } from './services/AccountService.js';
import { CONFIG } from './config.js';
import { AztecAddress } from '@aztec/aztec.js';
import { renderHeader } from './components/Header.js';
import { renderFooter } from './components/Footer.js';


let rpsService: RPSService;
let uiManager: UIManager;


async function setupInitialTestAccounts(pxe: PXE): Promise<void> {
  try {
    const randAccount = await getInitialTestAccountsWallets(pxe);

    const address = randAccount[0].getAddress();
    const registeredAccounts = await pxe.getRegisteredAccounts();

    let accountExists = registeredAccounts.some(account => account.address.equals(address));
    
    if (!accountExists) {
      await deployInitialTestAccounts(pxe);
    } else {
      console.log('Initial test accounts already set up');
    }
  } catch (deployError) {
    console.error('Error deploying initial test accounts:', deployError);
  }
}

async function main() {
  const pxe = await PXEFactory.getPXEInstance();

  try {
    const nodeInfo = await pxe.getNodeInfo();
    console.log('PXE connection successful. Node info:', nodeInfo);
    //setupInitialTestAccounts(pxe);
  } catch (error) {
    console.error('Failed to connect to PXE:', error);
    alert('Failed to connect to the Aztec network. Please check your connection and try again.');
  }

  uiManager = new UIManager();
  rpsService = new RPSService(pxe);
  const keystore = KeystoreFactory.getKeystore();  
  const accountService = new AccountService(pxe, keystore, uiManager);

  const contractAddress = AztecAddress.fromString(CONFIG.ROCK_PAPER_SCISSORS_ADDRESS);
  await rpsService.initialize( contractAddress, accountService );

  uiManager.setRPSService(rpsService);
  uiManager.setAccountService(accountService);
  uiManager.setupUI();

  // Render the header and footer components
  const headerElement = document.querySelector('header');
  const footerElement = document.querySelector('footer');

  if (headerElement) {
    headerElement.innerHTML = await renderHeader();
  }

  if (footerElement) {
    footerElement.innerHTML = await renderFooter();
  }
  // Add event listener for navigation
  window.addEventListener('hashchange', () => {
    renderPage();
  });

  // Initial page render
  renderPage();
}


async function renderPage() {
  const hash = window.location.hash.slice(1) || 'accounts'; // Default to 'accounts' if hash is empty
  const contentElement = document.getElementById('content');

  if (contentElement) {
    try {
      const response = await fetch(`${hash}.html`);
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const mainContent = doc.querySelector('main');

      if (mainContent) {
        contentElement.innerHTML = mainContent.innerHTML;
        // Call the UIManager method directly
        uiManager.debouncedHandlePageChange();
      } else {
        contentElement.innerHTML = '<h2>Page not found</h2>';
      }
    } catch (error) {
      console.error(`Failed to load page: ${hash}`, error);
      contentElement.innerHTML = '<h2>Page not found</h2>';
    }
  }
}


main().catch(console.error);