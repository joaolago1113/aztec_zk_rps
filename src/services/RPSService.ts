import { Fr, PXE, AztecAddress, AccountWallet, getContractInstanceFromDeployParams } from '@aztec/aztec.js';
import { RockPaperScissorsContract } from '../contracts/src/artifacts/RockPaperScissors.js';
import { AccountService } from './AccountService.js';
import { PublicKeys, getContractClassFromArtifact } from '@aztec/circuits.js';
import { CONFIG } from '../config.js';
import { TokenContract, TokenContractArtifact } from '@aztec/noir-contracts.js/Token';

export class RPSService {
    private contract!: RockPaperScissorsContract;
    private tokenContract!: TokenContract;
    private contractAddress!: AztecAddress;
    private accountService!: AccountService;
    private tokenContractAddress!: AztecAddress;
    private pxe!: PXE;
    private contractInitialized: boolean = false;
    private tokenContractInitialized: boolean = false;

    constructor(pxe: PXE) {
      if (!pxe) {
        throw new Error('PXE object is required');
      }
      this.pxe = pxe;
    }

    /**
     * Initialize the RPS contract by deploying or loading an existing instance
     * @param address - (Optional) The address of an existing RPS contract to load
     */
    async initialize(accountService: AccountService) {

        const contractAddress = AztecAddress.fromString(CONFIG.RPS_CONTRACT.ADDRESS);
        const tokenContractAddress = AztecAddress.fromString(CONFIG.TOKEN_CONTRACT.ADDRESS);

        this.tokenContractAddress = tokenContractAddress;
        this.contractAddress = contractAddress;
        this.accountService = accountService;
        

        const currentWallet = await accountService.getCurrentWallet();

        if (!currentWallet) {
            console.error('No wallet available. Please create an account first.');
            return;
        }

        
        await this.initializeContract(accountService);
        await this.initializeTokenContract(accountService);
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
                publicKeys: PublicKeys.default(),
                constructorArgs: [AztecAddress.fromString(CONFIG.TOKEN_CONTRACT.ADDRESS)]
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
        try {

            this.tokenContractInitialized = true;

            if (!(await this.pxe.isContractPubliclyDeployed(this.tokenContractAddress))) {
                throw new Error('Contract not deployed at the specified address');
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
                address: this.tokenContractAddress,
                initializationHash: Fr.fromString(CONFIG.TOKEN_CONTRACT.INIT_HASH),
                contractClassId: contractClassId,
                version: 1 as const,
                salt: Fr.fromString(CONFIG.TOKEN_CONTRACT.DEPLOYMENT_SALT),
                deployer: AztecAddress.fromString(CONFIG.TOKEN_CONTRACT.DEPLOYER),
                publicKeys: PublicKeys.default(),
                constructorArgs: [AztecAddress.fromString(CONFIG.TOKEN_CONTRACT.DEPLOYER), 
                    (CONFIG.TOKEN_CONTRACT.NAME), 
                    (CONFIG.TOKEN_CONTRACT.SYMBOL), 
                    (CONFIG.TOKEN_CONTRACT.DECIMALS)]
            };

            // Register with the wallet instead of PXE directly
            await currentWallet!.registerContract({
                artifact: TokenContractArtifact,
                instance
            });

            // Create contract interface
            this.tokenContract = await TokenContract.at(this.tokenContractAddress, currentWallet!);

            console.log('Token Contract initialized at:', this.tokenContract.address.toString());
        } catch (error) {
            console.error('Error initializing RPS contract:', error);
            throw error;
        }
    }

    async assignContract(){

        const currentWallet = await this.accountService.getCurrentWallet();

        if (!currentWallet) {

            console.log('No wallet available. Please create an account first.');

            return 0;

        }else{

            if(this.tokenContractInitialized){
                this.tokenContract = await TokenContract.at(this.tokenContractAddress, currentWallet!);
            }else{
                await this.initializeTokenContract(this.accountService);
            }

            if(this.contractInitialized){
                this.contract = await RockPaperScissorsContract.at(this.contractAddress, currentWallet!);
            }else{
                await this.initializeContract(this.accountService);
            }
        }

        return 1;
    }

    /**
     * Start a new game by committing player 1's move privately
     * @param playerMove - Player's move (0=Rock, 1=Paper, 2=Scissors)
     * @param betAmount - Amount to bet
     * @returns 1 if successful, 0 if failed
     * 
     * Flow:
     * 1. Player 1 transfers their bet to the contract
     * 2. Their move is stored privately (not visible to player 2)
     * 3. A public game note is created for player 2 to join
     */
    async startGame(playerMove: number, betAmount: string): Promise<number> {
        if ((await this.assignContract()) == 0) {
            console.log('No wallet available. Please create an account first.');
            return 0;
        }
        
        try {
            const currentWallet = await this.accountService.getCurrentWallet();
            if (!currentWallet) {
                throw new Error('No wallet available');
            }

            const nonce = 0; 
            
            // First approve the transfer
            const transferAction = this.tokenContract.methods.transfer_in_public(
                currentWallet.getAddress(),  // from
                this.contractAddress,        // to 
                BigInt(betAmount),          // amount
                nonce                       // Use random nonce instead of 0
            );

            // Add authorization witness
            await currentWallet.setPublicAuthWit(
                {
                    caller: this.contractAddress,
                    action: transferAction
                },
                true
            ).send().wait();

            const game_id = Fr.random();

            // Now call start_game
            const tx = this.contract.methods.start_game(
                game_id,
                playerMove,
                BigInt(betAmount)
            );

            (await tx.send()).wait();

            console.log('Game started successfully');
            return 1;

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
    async joinGame(gameId: string, playerMove: number): Promise<number> {
        if ((await this.assignContract()) == 0) {
            console.log('No wallet available. Please create an account first.');
            return 0;
        }

        try {
            const gameIdFr = Fr.fromString(gameId);
            
            // Get game details to match bet amount
            const gameNote = await this.contract.methods.get_game_by_id(gameIdFr).simulate();
            const betMatch = gameNote.bet_amount;

            // Create transfer action for matching bet
            const transferAction = this.tokenContract.methods.transfer_in_public(
                this.contract.wallet.getAddress(),  // from
                this.contractAddress,               // to 
                betMatch,                          // amount
                Fr.random()                        // Use random nonce
            );

            // Create and add auth witness
            const witness = await this.contract.wallet.createAuthWit({
                caller: this.contractAddress,
                action: transferAction
            });
            await this.contract.wallet.addAuthWitness(witness);
            
            // Join the game
            const tx = await this.contract.methods.play_game(
                gameIdFr,
                playerMove,
                betMatch
            ).send();
            
            await tx.wait();
            console.log(`Joined game ${gameId}`);
            return 1;

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
        try {
            const gameNote = await this.contract.methods.get_game_by_id(Fr.fromString(gameId)).simulate();
            return {
                id: gameId,
                betAmount: gameNote.bet_amount.toString(),
                isCompleted: gameNote.is_completed,
                player2Move: gameNote.player2_move.toString(),
                blocktime: gameNote.blocktime.toString()
            };
        } catch (error: any) {
            console.error('Error getting game details:', error);
            throw error;
        }
    }

    async getPublicBalance(): Promise<string> {
        if ((await this.assignContract()) == 0) {
            return '0';
        }

        try {
            const currentWallet = await this.accountService.getCurrentWallet();
            if (!currentWallet) {
                throw new Error('No wallet available');
            }

            const balance = await this.tokenContract.methods.balance_of_public(
                currentWallet.getAddress()
            ).simulate();
                
            console.log('Current Wallet:', currentWallet.getAddress().toString());
            console.log('Balance:', balance);

            // Convert from base units (1e9) to display units
            return (Number(balance) / 1e9).toString();
        } catch (error) {
            console.error('Error getting balance:', error);
            return '0';
        }
    }

    async getGamesCount(): Promise<number> {
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
}