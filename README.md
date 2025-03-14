# Aztec Rock Paper Scissors

A decentralized, Rock Paper Scissors game built on the Aztec Protocol. Play head-to-head matches with cryptocurrency betting, with game mechanics secured through Aztec's zero-knowledge proof technology.

![RPS Game Dashboard](https://github.com/user-attachments/assets/def9e1ac-3d17-40fc-bd1d-95b34e6f4877)

## Table of Contents

- [Introduction](#introduction)
- [How to Play](#how-to-play)
- [Game Mechanics](#game-mechanics)
- [Building and Deploying](#building-and-deploying)
- [Minting Tokens](#minting-tokens)
- [UI Walkthrough](#ui-walkthrough)
- [Troubleshooting](#troubleshooting)

## Introduction

This Rock Paper Scissors (RPS) game demonstrates the power of zk blockchain applications built on Aztec. Players can challenge each other to matches, place bets using tokens, and enjoy secure gameplay where moves are kept private until the game resolves.

## How to Play

The game follows standard Rock Paper Scissors rules with a cryptocurrency betting layer:

1. **Starting a Game**: Choose a token, select your move (Rock, Paper, or Scissors), set a bet amount, and create a new game.
2. **Joining a Game**: Find a game you want to join, enter the game ID, select your move, and match the bet.
3. **Resolving a Game**: After both players have made their moves, the creator must resolve the game to determine the winner or the game times out and the second player wins.
4. **Game Results**: The winner receives both players' bets. In case of a tie, each player gets their bet back.

## Game Mechanics

The game leverages Aztec's privacy features to ensure fair play:

1. **Player 1 (Game Creator)**:
   - Selects a move (Rock, Paper, Scissors)
   - Deposits the bet amount
   - Their move is stored *privately* on-chain - only they know what they played

2. **Player 2 (Game Joiner)**:
   - Enters the game ID of an existing game
   - Selects their move and matches the bet amount
   - Their move is stored *publicly* on-chain

3. **Game Resolution**:
   - Only Player 1 can resolve the game since only they can access their private move
   - The contract compares both moves and distributes winnings accordingly

4. **Timeout Protection**:
   - If Player 1 doesn't resolve within a set timeframe, Player 2 can claim the entire pot
   - This prevents Player 1 from abandoning the game after seeing Player 2's move

## Building and Deploying

### Prerequisites

- Aztec version 0.75.0 installed
- Node.js v18 or higher
- Access to an Aztec node (local or remote)

### Starting the Aztec Sandbox

Before running the application, you need to start a local Aztec sandbox:

```bash
aztec start --sandbox
```

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/joaolago1113/aztec_zk_rps.git
   cd aztec-rock-paper-scissors
   ```

2. Install dependencies:
   ```bash
   yarn install
   ```

3. Start the UI:
   ```bash
   yarn dev
   ```

### Deploying the Contracts

Use the provided deployment script to set up the necessary contracts:

```bash
./launch.sh
```

This script:
1. Creates a wallet account
2. Deploys three token contracts (TST1, TST2, TST3)
3. Deploys the RockPaperScissors contract for each token

Alternatively, you can deploy each contract manually:

```bash
# Create account
aztec-wallet create-account -a my-wallet

# Deploy tokens
aztec-wallet deploy TokenContractArtifact --from accounts:my-wallet --args "accounts:my-wallet TestToken1 TST1 18" -a testtoken1

# Deploy RPS contract
aztec-wallet deploy src/contracts/target/rock_paper_scissors-RockPaperScissors.json --from accounts:my-wallet --args "accounts:my-wallet 2" -a rps
```

## Minting Tokens

Before playing, you'll need tokens in your wallet. Mint some with:

```bash
aztec-wallet send mint_to_public --from accounts:my-wallet --contract-address contracts:testtoken1 --args <YOUR_WALLET_ADDRESS> 10000000
```

Replace `<YOUR_WALLET_ADDRESS>` with your actual wallet address.

## UI Walkthrough

### Game Dashboard
The main game interface shows your balance, active games, and game statistics.

![RPS Game Dashboard](https://github.com/user-attachments/assets/def9e1ac-3d17-40fc-bd1d-95b34e6f4877)

### Starting a Game
To start a new game, select a token to bet with, choose your move (Rock, Paper, or Scissors), enter your bet amount, and click "Start Game".

![Start Game Modal](https://github.com/user-attachments/assets/cb020d86-1842-49c0-bf49-6fa7bf0097d6)

### Joining a Game
To join an existing game, enter the game ID, select your move, and click "Join Game". The required bet amount will be automatically matched.

![Join Game Modal](https://github.com/user-attachments/assets/b450a92f-ab25-47b8-9c5f-cf989f6f1a45)

### Active Games
The games table shows all games on the network, including:
- Games you've created
- Games you've joined
- Games created by others
- Completed games with results

![Active Games Table](https://github.com/user-attachments/assets/0c18195d-0f40-4e3d-95e2-1e3b33f0bf77)

## License

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.