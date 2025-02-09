import { Fr, PXE, AztecAddress, AccountWallet, getContractInstanceFromDeployParams } from '@aztec/aztec.js';
import { RockPaperScissorsContract } from '../contracts/src/artifacts/RockPaperScissors.js';
import { AccountService } from './AccountService.js';
import { PublicKeys, getContractClassFromArtifact } from '@aztec/circuits.js';
import { CONFIG } from '../config.js';
import { TokenContract, TokenContractArtifact } from '@aztec/noir-contracts.js/Token';

export class RPSService {
    private contract!: RockPaperScissorsContract;
    private tokenContracts: Map<string, TokenContract> = new Map();
    private contractAddress!: AztecAddress;
    private accountService!: AccountService;
    private pxe!: PXE;
    private contractInitialized: boolean = false;
    private TIMEOUT_BLOCKS: number | null = null;
    private userGames: Map<string, { started: string[], joined: string[] }> = new Map();
    private currentWalletAddress: string | null = null;
    private initialized: boolean = false;
    constructor(pxe: PXE) {
      if (!pxe) {
        throw new Error('PXE object is required');
      }
      this.pxe = pxe;
    }
    /**
     * Check if the RPS service has been initialized
     * @returns boolean indicating if the service is initialized
     */
    isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Initialize the RPS contract by deploying or loading an existing instance
     * @param address - (Optional) The address of an existing RPS contract to load
     */
    async initialize(accountService: AccountService) {
        this.accountService = accountService;

        const currentWallet = await accountService.getCurrentWallet();
        if (!currentWallet) {
            console.error('No wallet available. Please create an account first.');
            return;
        }

        if(this.initialized){
            return;
        }

        // Set current wallet address
        this.currentWalletAddress = currentWallet.getAddress().toString();
        
        const contractAddress = AztecAddress.fromString(CONFIG.RPS_CONTRACT.ADDRESS);

        this.contractAddress = contractAddress;
        
        await this.initializeContract(accountService);
        await this.initializeTokenContract(accountService);
        this.loadUserGames();

        this.initialized = true;
    }

    private async initializeContract(accountService: AccountService) {
        const currentWallet = await accountService.getCurrentWallet();
        try {
            this.contractInitialized = true;

            if (!(await this.pxe.isContractPubliclyDeployed(this.contractAddress))) {
                throw new Error('Contract not deployed at the specified address');
            }

            // Register the contract class
            await this.pxe.registerContractClass(RockPaperScissorsContract.artifact);

            // Get constructor artifact
            const constructorArtifact = RockPaperScissorsContract.artifact.functions.find(f => f.name === 'constructor');
            if (!constructorArtifact) {
                throw new Error('Constructor not found in contract artifact');
            }

            const contractClass = getContractClassFromArtifact(RockPaperScissorsContract.artifact);
            const contractClassId = contractClass.id;
            // Create instance using the deployment parameters
            const instance = {
                address: this.contractAddress,
                initializationHash: Fr.fromString(CONFIG.RPS_CONTRACT.INIT_HASH),
                contractClassId: contractClassId,
                version: 1 as const,
                salt: Fr.fromString(CONFIG.RPS_CONTRACT.DEPLOYMENT_SALT),
                deployer: AztecAddress.fromString(CONFIG.RPS_CONTRACT.DEPLOYER),
                publicKeys: PublicKeys.default()
            };

            // Register with the wallet instead of PXE directly
            await currentWallet!.registerContract({
                artifact: RockPaperScissorsContract.artifact,
                instance
            });

            // Create contract interface
            this.contract = await RockPaperScissorsContract.at(this.contractAddress, currentWallet!);

            console.log('RPS Contract initialized at:', this.contract.address.toString());
        } catch (error) {
            console.error('Error initializing RPS contract:', error);
            throw error;
        }
    }

    private async initializeTokenContract(accountService: AccountService) {
        const currentWallet = await accountService.getCurrentWallet();
        if (!currentWallet) {
            throw new Error('No wallet available to initialize token contracts');
        }

        for (const tokenConfig of CONFIG.TOKEN_CONTRACTS) {
            try {
                const tokenAddress = AztecAddress.fromString(tokenConfig.ADDRESS);
                
                if (!(await this.pxe.isContractPubliclyDeployed(tokenAddress))) {
                    console.warn(`Token contract not deployed at address: ${tokenConfig.ADDRESS}`);
                    continue;
                }

                // Register the contract class
                await this.pxe.registerContractClass(TokenContractArtifact);

                // Get constructor artifact
                const constructorArtifact = TokenContractArtifact.functions.find(f => f.name === 'constructor');
                if (!constructorArtifact) {
                    throw new Error('Constructor not found in contract artifact');
                }

                const contractClass = getContractClassFromArtifact(TokenContractArtifact);
                const contractClassId = contractClass.id;

                // Create instance using the deployment parameters
                const instance = {
                    address: tokenAddress,
                    initializationHash: Fr.fromString(tokenConfig.INIT_HASH),
                    contractClassId: contractClassId,
                    version: 1 as const,
                    salt: Fr.fromString(tokenConfig.DEPLOYMENT_SALT),
                    deployer: AztecAddress.fromString(tokenConfig.DEPLOYER),
                    publicKeys: PublicKeys.default(),
                    constructorArgs: [
                        AztecAddress.fromString(tokenConfig.DEPLOYER),
                        tokenConfig.NAME,
                        tokenConfig.SYMBOL,
                        tokenConfig.DECIMALS
                    ]
                };

                // Register with the wallet
                await currentWallet!.registerContract({
                    artifact: TokenContractArtifact,
                    instance
                });

                const tokenContract = await TokenContract.at(
                    tokenAddress,
                    currentWallet
                );

                // Store the contract instance in our map
                this.tokenContracts.set(tokenConfig.ADDRESS, tokenContract);

                console.log(`Initialized token contract for ${tokenConfig.NAME} (${tokenConfig.SYMBOL})`);
            } catch (error) {
                console.error(`Error initializing token contract ${tokenConfig.NAME}:`, error);
            }
        }
    }

    async assignContract() {
        if(!this.initialized){
            await this.initialize(this.accountService);
        }

        const currentWallet = await this.accountService.getCurrentWallet();

        if (!currentWallet) {
            console.log('No wallet available. Please create an account first.');
            return 0;
        } else {
            // Check and initialize RPS contract if needed
            if (!this.contractInitialized) {
                await this.initializeContract(this.accountService);
            } else {
                this.contract = await RockPaperScissorsContract.at(this.contractAddress, currentWallet!);
            }
            
            // Check and initialize token contracts if needed
            if (this.tokenContracts.size === 0) {
                await this.initializeTokenContract(this.accountService);
            }
        }

        return 1;
    }

    /**
     * Start a new game by committing player 1's move privately
     * @param playerMove - Player's move (0=Rock, 1=Paper, 2=Scissors)
     * @param betAmount - Amount to bet
     * @param tokenAddress - Address of the token contract
     * @returns 1 if successful, 0 if failed
     * 
     * Flow:
     * 1. Player 1 transfers their bet to the contract
     * 2. Their move is stored privately (not visible to player 2)
     * 3. A public game note is created for player 2 to join
     */
    async startGame(playerMove: number, betAmount: string, tokenAddress: string): Promise<Fr> {
        if ((await this.assignContract()) == 0) {
            console.log('No wallet available. Please create an account first.');
            return Fr.ZERO;
        }
        
        try {
            const currentWallet = await this.accountService.getCurrentWallet();
            if (!currentWallet) {
                throw new Error('No wallet available');
            }

            // Store wallet address
            this.currentWalletAddress = currentWallet.getAddress().toString();

            const nonce = 0; 
            
            // First approve the transfer
            const transferAction = this.tokenContracts.get(tokenAddress)?.methods.transfer_in_public(
                currentWallet.getAddress(),
                this.contractAddress,
                BigInt(betAmount),
                nonce
            );

            await currentWallet.setPublicAuthWit(
                {
                    caller: this.contractAddress,
                    action: transferAction!
                },
                true
            ).send().wait();

            const game_id = Fr.random();

            // Now call start_game
            const tx = this.contract.methods.start_game(
                game_id,
                playerMove,
                BigInt(betAmount),
                Fr.fromString(tokenAddress)
            );

            (await tx.send()).wait();

            // Convert the Fr to a proper string using its bigint value.
            const gameStr = game_id.toBigInt().toString();

            // Add game to user's started games using the converted string.
            const userGames = this.userGames.get(this.currentWalletAddress) || { started: [], joined: [] };
            userGames.started.push(gameStr);
            this.userGames.set(this.currentWalletAddress, userGames);
            
            console.log('Added game to started games:', gameStr);
            this.saveUserGames();
            return game_id;

        } catch (error: any) {
            console.error('Error starting game:', error);
            throw error;
        }
    }

    /**
     * Join an existing game as player 2
     * @param gameId - ID of the game to join
     * @param playerMove - Your move (0=Rock, 1=Paper, 2=Scissors)
     * @returns 0 if no wallet available, 1 if game joined successfully
     * 
     * Flow:
     * 1. Player 2 matches the bet amount
     * 2. Their move is stored publicly in the game note
     * 3. The game is ready for player 1 to resolve
     */
    async joinGame(gameId: string, playerMove: number): Promise<{ success: boolean, gameInfo?: any }> {
        if ((await this.assignContract()) == 0) {
            console.log('No wallet available. Please create an account first.');
            return { success: false };
        }

        try {
            const gameIdFr = Fr.fromString(gameId);
            
            // Get game details to match bet amount
            const gameNote = await this.contract.methods.get_game_by_id(gameIdFr).simulate();
            const betMatch = gameNote.bet_amount;

            const currentWallet = await this.accountService.getCurrentWallet();
            if (!currentWallet) {
                throw new Error('No wallet available');
            }

            // Store wallet address
            this.currentWalletAddress = currentWallet.getAddress().toString();

            const nonce = 0; 

            const tokenContractKey = '0x'+Fr.fromString(gameNote.token_address.toString()).toBuffer().toString('hex');

            

            console.log("Looking for token contract with key:", tokenContractKey);
            console.log("Available token contract keys:", Array.from(this.tokenContracts.keys()));
            const tokenContract = this.tokenContracts.get(tokenContractKey);
            if (!tokenContract) {
                throw new Error(`Token contract not found for token address: ${tokenContractKey}`);
            }

            // Create transfer action for matching bet
            const transferAction = tokenContract!.methods.transfer_in_public(
                this.contract.wallet.getAddress(),  // from
                this.contractAddress,               // to 
                BigInt(betMatch),                  // amount
                nonce                              // Use random nonce
            );

            console.log(currentWallet);

            // Set public auth with the transfer action
            await currentWallet.setPublicAuthWit(
                {
                    caller: this.contractAddress,
                    action: transferAction
                },
                true
            ).send().wait();
            
            // Join the game
            const tx = await this.contract.methods.play_game(
                gameIdFr,
                playerMove,
                betMatch
            ).send();
            
            await tx.wait();

            // Add game to user's joined games
            const userGames = this.userGames.get(this.currentWalletAddress) || { started: [], joined: [] };
            userGames.joined.push(gameId);
            this.userGames.set(this.currentWalletAddress, userGames);
            
            console.log('Added game to joined games:', gameId);
            this.saveUserGames();
            
            // Get updated game info
            const updatedGame = await this.contract.methods.get_game_by_id(gameIdFr).simulate();
            
            const gameInfo = {
                id: BigInt(gameId),
                betAmount: updatedGame.bet_amount.toString(),
                isCompleted: updatedGame.is_completed,
                player2Move: updatedGame.player2_move.toString(),
                blocktime: updatedGame.blocktime.toString()
            };

            return { success: true, gameInfo };

        } catch (error: any) {
            console.error('Error joining game:', error);
            throw error;
        }
    }

    /**
     * Resolve the game by revealing player 1's move and distributing rewards
     * @param gameId - ID of the game to resolve
     * @returns 1 if successful, 0 if failed
     * 
     * Flow:
     * 1. Player 1 reveals their original move
     * 2. The contract compares moves and determines winner
     * 3. The total pot is distributed to the winner (or split if draw)
     */
    async resolveGame(gameId: string): Promise<number> {
        if ((await this.assignContract()) == 0) {
            console.log('No wallet available. Please create an account first.');
            return 0;
        }

        try {
            const gameIdFr = Fr.fromString(gameId);
            
            const tx = await this.contract.methods.resolve_game(gameIdFr).send();
            await tx.wait();
            
            console.log(`Game ${gameId} resolved successfully`);
            return 1;

        } catch (error: any) {
            console.error('Error resolving game:', error);
            throw error;
        }
    }

    /**
     * Get game details including bet amount, completion status, and player 2's move
     * Note: Player 1's move remains private until the game is resolved
     * @param gameId - ID of the game
     * @returns Game details including moves, completion status, and timing
     */
    async getGameDetails(gameId: string) {
        const gameNote = await this.contract.methods.get_game_by_id(Fr.fromString(gameId)).simulate();
        return {
            betAmount: gameNote.bet_amount.toString(),
            isCompleted: gameNote.is_completed,
            player2Move: gameNote.player2_move.toString(),
            blocktime: gameNote.blocktime.toString(),
            player2Address: gameNote.player2_address
        };
    }

    private tokenNameSymboltoString(value: bigint) {
        const vals: number[] = Array.from(new Fr(value).toBuffer());
        
        let str = '';
        for (let i = 0; i < vals.length; i++) {
            if (vals[i] != 0) {
            str += String.fromCharCode(Number(vals[i]));
            }
        }
        return str;
    };

    async getTokenDetails(tokenAddress: string): Promise<{ name: string, symbol: string }> {
        const tokenContract = this.tokenContracts.get(tokenAddress);
        if (!tokenContract) {
            throw new Error(`Token contract not found for address ${tokenAddress}`);
        }

        try {
            let name = ((await tokenContract.methods.public_get_name().simulate()).value);
            let symbol = ((await tokenContract.methods.public_get_symbol().simulate()).value);

            name = this.tokenNameSymboltoString(name);
            symbol = this.tokenNameSymboltoString(symbol);

            return { name, symbol };
        } catch (error) {
            console.error('Error getting token details:', error);
            throw error;
        }
    }

    async getPublicBalance(tokenAddress: string): Promise<string> {
        if ((await this.assignContract()) == 0) {
            return '0';
        }

        try {
            const currentWallet = await this.accountService.getCurrentWallet();
            if (!currentWallet) {
                throw new Error('No wallet available');
            }

            const tokenContract = this.tokenContracts.get(tokenAddress);
            if (!tokenContract) {
                throw new Error(`Token contract not found for address ${tokenAddress}`);
            }

            const balance = await tokenContract.methods.balance_of_public(
                currentWallet.getAddress()
            ).simulate();
                
            console.log('Current Wallet:', currentWallet.getAddress().toString());
            console.log('Balance:', balance);

            // Convert from base units (1e9) to display units
            return ((balance)).toString();
        } catch (error) {
            console.error('Error getting balance:', error);
            return '0';
        }
    }

    async getGamesCount(): Promise<number> {
        if(!this.contract) return 0;
        try {
            const gamesLength = await this.contract.methods.get_games_length().simulate();
            return Number(gamesLength);
        } catch (error) {
            console.error('Error getting games count:', error);
            return 0;
        }
    }

    async getAllGames() {
        const games = [];
        const count = await this.getGamesCount();
        
        for(let i = 0; i < count; i++) {
            try {
                // Get game ID for this index
                const gameId = await this.contract.methods.get_game_id_by_index(i).simulate();
                
                // Get game details
                const gameNote = await this.contract.methods.get_game_by_id(gameId).simulate();

                console.log(gameNote);
                
                games.push({
                    id: gameId.toString(),
                    betAmount: gameNote.bet_amount.toString(),
                    isCompleted: gameNote.is_completed,
                    player2Move: gameNote.player2_move.toString(),
                    blocktime: gameNote.blocktime.toString()
                });
            } catch (error) {
                console.error(`Error getting game at index ${i}:`, error);
            }
        }
        
        return games;
    }

    async getGameIdByIndex(index: number): Promise<Fr> {
        let gameId = await this.contract.methods.get_game_id_by_index(index).simulate();

        gameId = Fr.fromString(gameId.toString());
        return gameId;
    }

    async getGameById(gameId: Fr): Promise<any> {
        return await this.contract.methods.get_game_by_id(gameId).simulate();
    }

    async getContractBalance(tokenAddress: string): Promise<string> {
        if ((await this.assignContract()) == 0) {
            return '0';
        }

        try {
            const tokenContract = this.tokenContracts.get(tokenAddress);
            if (!tokenContract) {
                throw new Error(`Token contract not found for address ${tokenAddress}`);
            }

            const balance = await tokenContract.methods.balance_of_public(
                this.contractAddress
            ).simulate();
            
            return balance.toString();
        } catch (error) {
            console.error('Error getting contract balance:', error);
            return '0';
        }
    }

    async getTimeoutBlocks(): Promise<number> {
        // Cache the value since it's a constant
        if (this.TIMEOUT_BLOCKS !== null) {
            return this.TIMEOUT_BLOCKS;
        }

        try {
            const timeoutBlocks = await this.contract.methods.get_timeout_blocks().simulate();
            this.TIMEOUT_BLOCKS = Number(timeoutBlocks);
            return this.TIMEOUT_BLOCKS;
        } catch (error) {
            console.error('Error getting timeout blocks:', error);
            return 2; // Default to match contract's initial value
        }
    }

    async checkGameTimeout(gameId: string): Promise<{canTimeout: boolean, blocksLeft?: number}> {
        try {
            // Clean the gameId string to ensure it's just the number
            const cleanGameId = gameId.replace(/^(timeout-|info-)/, '');

            console.log('Checking timeout for game:', cleanGameId);
            const gameNote = await this.contract.methods.get_game_by_id(BigInt(cleanGameId)).simulate();
            
            // If game is completed or player 2 hasn't played yet (blocktime will be 0)
            if (gameNote.is_completed || gameNote.blocktime === 0n) {
                return { canTimeout: false };
            }

            const currentBlock = await this.pxe.getBlockNumber();
            const timeoutBlocks = await this.getTimeoutBlocks();

            console.log('Current block:', currentBlock);
            console.log('Game blocktime:', gameNote.blocktime.toString());
            
            const blocksPassed = currentBlock - Number(gameNote.blocktime);
            console.log('Blocks passed:', blocksPassed);
            
            if (blocksPassed >= timeoutBlocks) {
                return { 
                    canTimeout: true,
                    blocksLeft: 0
                };
            } else {
                return { 
                    canTimeout: false, 
                    blocksLeft: timeoutBlocks - blocksPassed 
                };
            }
        } catch (error) {
            console.error('Error checking game timeout:', error);
            return { canTimeout: false };
        }
    }

    async timeoutGame(gameId: string) {
        try {
            await this.contract.methods.timeout_game(Fr.fromString(gameId)).send().wait();
            return true;
        } catch (error) {
            console.error('Error timing out game:', error);
            throw error;
        }
    }

    async getUserStartedGames(): Promise<any[]> {
        if (!this.currentWalletAddress) {
            console.warn('No wallet address available');
            return [];
        }
        
        const userGames = this.userGames.get(this.currentWalletAddress);
        if (!userGames) {
            console.warn('No games found for current wallet');
            return [];
        }
        
        console.log('User started games:', userGames.started);
        
        const games = [];
        for (const gameId of userGames.started) {
            try {
                const game = await this.getGameDetails(gameId);
                games.push({ ...game, id: gameId });
            } catch (err) {
                console.error(`Error fetching game ${gameId}:`, err);
            }
        }
        return games;
    }

    async getUserJoinedGames(): Promise<any[]> {
        if (!this.currentWalletAddress) {
            console.warn('No wallet address available');
            return [];
        }
        
        const userGames = this.userGames.get(this.currentWalletAddress);
        if (!userGames) {
            console.warn('No games found for current wallet');
            return [];
        }
        
        console.log('User joined games:', userGames.joined);
        
        const games = [];
        for (const gameId of userGames.joined) {
            try {
                const game = await this.getGameDetails(gameId);
                games.push({ ...game, id: gameId });
            } catch (err) {
                console.error(`Error fetching game ${gameId}:`, err);
            }
        }
        return games;
    }

    private saveUserGames() {
        if (!this.currentWalletAddress) {
            console.warn('No wallet address available to save games');
            return;
        }
        
        const userGames = this.userGames.get(this.currentWalletAddress);
        if (userGames) {
            localStorage.setItem(`userGames_${this.currentWalletAddress}`, JSON.stringify(userGames));
            console.log('Saved user games:', userGames);
        }
    }

    private loadUserGames() {
        if (!this.currentWalletAddress) {
            console.warn('No wallet address available to load games');
            return;
        }
        
        const storedGames = localStorage.getItem(`userGames_${this.currentWalletAddress}`);
        if (storedGames) {
            this.userGames.set(this.currentWalletAddress, JSON.parse(storedGames));
            console.log('Loaded user games:', JSON.parse(storedGames));
        }
    }
}