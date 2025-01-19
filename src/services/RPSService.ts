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
     * Start a new game
     * @param playerMove - Player's move (0=Rock, 1=Paper, 2=Scissors)
     * @param betAmount - Amount to bet
     * @returns The game ID
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

            // Create the transfer action
            const transferAction = this.tokenContract.methods.transfer_in_private(
                currentWallet.getAddress(),  // from
                this.contractAddress,        // to 
                BigInt(betAmount),                   // amount
                Fr.ZERO                      // nonce
            );

            // Create and add the auth witness
            const witness = await currentWallet.createAuthWit({
                caller: this.contractAddress,
                action: transferAction
            });
            //await currentWallet.addAuthWitness(witness);
            await this.contract.wallet.addAuthWitness(witness);

            // Now make the actual game move
            const nonce = Fr.random();
            const tx = await this.contract.methods.start_game(
                playerMove,
                BigInt(betAmount),
                nonce
            ).send();
            
            await tx.wait();
            console.log('Game started successfully');
            return 1;

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