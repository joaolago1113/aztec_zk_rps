![Aztec Wallet Logo](public/aztec.png)

# Aztec Wallet UI 

Aztec Wallet UI is a comprehensive, feature-rich wallet application built on the Aztec Protocol. It provides users with secure account management, seamless token operations, robust transaction handling, and seamless integration with decentralized applications through [ShieldSwap](https://docs.shieldswap.org/).

## Table of Contents

- [Features](#features)
  - [Account Management](#account-management)
  - [Token Management](#token-management)
  - [WalletConnect Integration](#walletconnect-integration)
  - [Transaction Handling](#transaction-handling)
  - [User Interface](#user-interface)
  - [2FA Feature Through Account Abstraction](#2fa-feature-through-account-abstraction)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Running the Application](#running-the-application)
- [Deploying the Rock Paper Scissors Contract](#deploying-the-rock-paper-scissors-contract)
  - [Creating a Wallet](#creating-a-wallet)
  - [Deploying a Token](#deploying-a-token)
  - [Deploying the RPS Contract](#deploying-the-rps-contract)
- [Project Structure](#project-structure)
- [License](#license)

## Features

Aztec Wallet UI encompasses a wide range of features designed to provide users with a secure and efficient cryptocurrency management experience. Below is a detailed overview of each feature.

### Account Management

Effortlessly manage your cryptocurrency accounts with Aztec Wallet UI. Whether you're creating new accounts, importing existing ones, or switching between multiple accounts, the process is seamless and intuitive. Enhance the security of your accounts with optional **Two-Factor Authentication (2FA)** using **HMAC-based One-Time Passwords (HOTP)**.

- **Creating Accounts:** Start by creating a standard account, followed by a 2FA-enabled account for enhanced security.
  
https://github.com/user-attachments/assets/7e8847fc-176b-409d-a544-b004851314df
  
- **Importing Accounts:** Easily import your existing accounts.
  
https://github.com/user-attachments/assets/01a7cfbf-df1c-4cfb-b8f5-73eb3dce9f46

### Token Management

Aztec Wallet UI allows you to create new tokens, mint existing ones, import token contracts, and manage your token balances seamlessly. Execute essential token operations such as sending, unshielding, and shielding and redeeming directly from the wallet interface.

https://github.com/user-attachments/assets/9a2c4b72-0907-47c5-af53-10e61ca341d6

### WalletConnect Integration

Connect the wallet to a wide range of decentralized applications (dApps). Seamlessly interact with various dApps, authorize transactions securely, and manage your connections directly within the wallet.

https://github.com/user-attachments/assets/b6418b90-dc54-4916-ab27-38341af3292d

### Transaction Handling

Maintain a comprehensive overview of all your cryptocurrency transactions. Aztec Wallet UI provides a detailed transaction history, allowing you to filter transactions by action type, view in-depth information, and monitor pending transactions.

https://github.com/user-attachments/assets/022e475a-e695-4510-aa38-4f208199be1f

### User Interface

Experience a clean, intuitive, and responsive user interface designed for optimal usability across all devices. The UI encompasses:

- **Header and Footer:** Consistent navigation and branding elements that provide seamless access to different sections of the wallet.
- **Dynamic Forms and Modals:** Interactive elements that facilitate various wallet operations.
- **Responsive Tables:** Easily view and manage your token balances and transaction histories with adaptable table designs that adapt to different screen sizes.

### 2FA Feature Through Account Abstraction

Aztec Wallet UI leverages Aztec's Account Abstraction to provide users with the ability to enable **Two-Factor Authentication (2FA)** through **HMAC-based One-Time Passwords (HOTP)** for their contract accounts. 
This implementation ensures that every time a user interacts with their account contract, they must provide a one-time key, significantly enhancing the security of their transactions. 
Moreover, this abstraction provides flexibility and breathing room when dealing with complex DeFi protocols by accepting also the generated code before and after.

## Getting Started

Follow these instructions to set up and run the Aztec Wallet UI on your local machine.

### Prerequisites

Ensure you have the following installed on your system:

- **Node.js** (v20 or higher)
- **yarn**
- **Git**

### Installation

1. **Clone the Repository**

   ```bash
   git clone https://github.com/joaolago1113/aztec_wallet.git
   cd aztec_wallet
   ```

2. **Install Dependencies**

   Using yarn:

   ```bash
   yarn
   ```

3. **Configure Environment Variables**

   Change the `config.ts` file in the src directory and add the necessary configuration variables:

   ```env
   WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
   L1_RPC_URL=http://localhost:8545/
   PXE_URL=https://localhost:8080/
   ```

   *Replace the placeholder values with your actual configuration details.*

4. **Start the Aztec Sandbox**

   The application relies on the Aztec sandbox environment. Follow the [Aztec Sandbox Quickstart](https://docs.aztec.network/guides/developer_guides/getting_started/quickstart) to set up and start the sandbox.

   ```bash
   aztec start --sandbox
   ```

   *This command initializes the sandbox environment necessary to test the wallet.*

### Running the Application

Start the development server:
```

### Deploying the Rock Paper Scissors Contract

Before you can use the Rock Paper Scissors game, you need to deploy both a token contract (for betting) and the RPS contract itself. Here's how to do it:

1. **Start the Sandbox Environment**

   First, start the Aztec sandbox environment:

   ```bash
   aztec start --sandbox
   ```

2. **Creating a Wallet**

   Before deploying contracts, you need a wallet. Create one using:

   ```bash
  aztec-wallet create-account -a my-wallet
   ```

   This will create a new wallet and store it as `my-wallet`.

3. **Deploying a Token**

   Deploy the token contract that will be used for betting:

   ```bash
   aztec-wallet deploy TokenContractArtifact \
     --from accounts:my-wallet \
     --args accounts:my-wallet TestToken TST 18 \
     -a testtoken
   ```

   Save the token contract address from the output. It will look something like:
   ```
   Contract deployed at 0x2e79e7b857ad43be762a2c32e5cc09425a743987ed1f1bed6ed520f60aac7702
   ```

4. **Deploying the RPS Contract**

   Deploy the Rock Paper Scissors contract using the token address from the previous step:

   ```bash
   aztec-wallet deploy src/contracts/target/rock_paper_scissors-RockPaperScissors.json \
     --from accounts:my-wallet \
     --args contracts:testtoken \
     -a rps
   ```

   Replace `<TOKEN_ADDRESS>` with the address from step 3.

   The contract will be deployed and you'll see output like:
   ```
   Contract deployed at 0x168c6f6879cbbaec4d82ef8e4b4d081edc39810a06bc110f2f627da1be75f914
   ```

5. **Update Configuration**

   Update the contract addresses in your `src/config.ts`:

   ```typescript
   export const CONFIG = {
     // ...other config
     ROCK_PAPER_SCISSORS_ADDRESS: '<RPS_CONTRACT_ADDRESS>',
     RPS_CONTRACT: {
       TOKEN_ADDRESS: '<TOKEN_ADDRESS>',
       // ...other config
     }
   };
   ```

Now your contracts are deployed and the app is ready to use! You can start the development server and begin playing Rock Paper Scissors.


mint_to_private to a wallet: aztec-wallet send mint_to_private --from accounts:my-wallet --contract-address contracts:testtoken --args accounts:my-wallet <WALLET_ADDRESS> 10000000 




## Project Structure

## License

3



Have to obviosuly send tokens to the address before starting a game.
