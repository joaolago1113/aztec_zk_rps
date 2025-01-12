import { Fr, PXE, AccountContract, AztecAddress, AccountWallet, AccountManager } from '@aztec/aztec.js';
import { RockPaperScissorsContract } from '../contracts/src/artifacts/RockPaperScissors.js';
import { AccountService } from './AccountService.js';

export class RPSService {
    private contract!: RockPaperScissorsContract;
    private contractAddress!: AztecAddress;
    private accountService!: AccountService;
    private pxe!: PXE;

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
    async initialize(contractAddress: AztecAddress, accountService: AccountService) {

        const currentWallet = await accountService.getCurrentWallet();

        if (!currentWallet) {

            console.log('No wallet available. Please create an account first.');

        }else{
            this.contract = await RockPaperScissorsContract.at(contractAddress, currentWallet);
        }

        this.contractAddress = contractAddress;
        this.accountService = accountService;

        console.log('RPS Contract initialized at:', this.contract.address.toString());
    }

    async assignContract(){

        const currentWallet = await this.accountService.getCurrentWallet();

        if (!currentWallet) {

            console.log('No wallet available. Please create an account first.');

            return 0;

        }else{
            this.contract = await RockPaperScissorsContract.at(this.contractAddress, currentWallet);
        }

        return 1;
    }

    /**
     * Start a new game
     * @param playerMove - Player's move (0=Rock, 1=Paper, 2=Scissors)
     * @param betAmount - Amount to bet
     * @returns The game ID
     */
    async startGame(playerMove: number, betAmount: string): Promise<Fr> {

        if ((await this.assignContract()) == 0){
            console.log('No wallet available. Please create an account first.');
            return Fr.fromString("0");
        }

        try {
            const betAmountFr = Fr.fromString(betAmount);
            const nonce = Fr.random(); // Generate random nonce for the transaction
            
            const tx = await this.contract.methods.start_game(
                playerMove,
                betAmountFr,
                nonce
            ).send();
            
            const receipt = await tx.wait();
            console.log('Game started with receipt:', receipt);
            
            // Get game ID from transaction receipt or event
            const gameId = Fr.fromString("1"); // TODO: Get actual game ID
            return gameId;
        } catch (error: any) {
            console.error('Error starting game:', error);
            throw error;
        }
    }

    /**
     * Join an existing game
     * @param gameId - ID of the game to join
     * @param playerMove - Your move (0=Rock, 1=Paper, 2=Scissors)
     * @returns 0 if no wallet available, 1 if game joined successfully
     */
    async joinGame(gameId: string, playerMove: number): Promise<number> {

        if ((await this.assignContract()) == 0){
            console.log('No wallet available. Please create an account first.');
            return 0;
        }

        try {
            const gameIdFr = Fr.fromString(gameId);
            const betMatch = Fr.fromString("1"); // TODO: Get actual bet amount from game
            const nonce = Fr.random(); // Generate random nonce for the transaction
            
            const tx = await this.contract.methods.play_game(
                gameIdFr,
                playerMove,
                betMatch
            ).send();
            
            await tx.wait();
            console.log(`Joined game ${gameId}`);
        } catch (error: any) {
            console.error('Error joining game:', error);
            throw error;
        }
        return 1;
    }

    /**
     * Get game details
     * @param gameId - ID of the game
     * @returns Game details including moves, players, and status
     */
    async getGameDetails(gameId: string) {
        try {
            // TODO: Implement game details retrieval
            // This will depend on your contract's storage and getter methods
            return {
                id: gameId,
                status: 'pending',
                player1Move: null,
                player2Move: null,
                betAmount: '0'
            };
        } catch (error: any) {
            console.error('Error getting game details:', error);
            throw error;
        }
    }
}