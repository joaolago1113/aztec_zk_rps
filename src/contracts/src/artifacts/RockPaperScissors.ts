
/* Autogenerated file, do not edit! */

/* eslint-disable */
import {
  type AbiType,
  AztecAddress,
  type AztecAddressLike,
  CompleteAddress,
  Contract,
  type ContractArtifact,
  ContractBase,
  ContractFunctionInteraction,
  type ContractInstanceWithAddress,
  type ContractMethod,
  type ContractStorageLayout,
  type ContractNotes,
  decodeFromAbi,
  DeployMethod,
  EthAddress,
  type EthAddressLike,
  EventSelector,
  type FieldLike,
  Fr,
  type FunctionSelectorLike,
  L1EventPayload,
  loadContractArtifact,
  type NoirCompiledContract,
  NoteSelector,
  Point,
  type PublicKey,
  PublicKeys,
  type UnencryptedL2Log,
  type Wallet,
  type WrappedFieldLike,
} from '@aztec/aztec.js';
import RockPaperScissorsContractArtifactJson from '../../target/rock_paper_scissors-RockPaperScissors.json' assert { type: 'json' };
export const RockPaperScissorsContractArtifact = loadContractArtifact(RockPaperScissorsContractArtifactJson as NoirCompiledContract);



/**
 * Type-safe interface for contract RockPaperScissors;
 */
export class RockPaperScissorsContract extends ContractBase {
  
  private constructor(
    instance: ContractInstanceWithAddress,
    wallet: Wallet,
  ) {
    super(instance, RockPaperScissorsContractArtifact, wallet);
  }
  

  
  /**
   * Creates a contract instance.
   * @param address - The deployed contract's address.
   * @param wallet - The wallet to use when interacting with the contract.
   * @returns A promise that resolves to a new Contract instance.
   */
  public static async at(
    address: AztecAddress,
    wallet: Wallet,
  ) {
    return Contract.at(address, RockPaperScissorsContract.artifact, wallet) as Promise<RockPaperScissorsContract>;
  }

  
  /**
   * Creates a tx to deploy a new instance of this contract.
   */
  public static deploy(wallet: Wallet, token_addr: AztecAddressLike) {
    return new DeployMethod<RockPaperScissorsContract>(PublicKeys.default(), wallet, RockPaperScissorsContractArtifact, RockPaperScissorsContract.at, Array.from(arguments).slice(1));
  }

  /**
   * Creates a tx to deploy a new instance of this contract using the specified public keys hash to derive the address.
   */
  public static deployWithPublicKeys(publicKeys: PublicKeys, wallet: Wallet, token_addr: AztecAddressLike) {
    return new DeployMethod<RockPaperScissorsContract>(publicKeys, wallet, RockPaperScissorsContractArtifact, RockPaperScissorsContract.at, Array.from(arguments).slice(2));
  }

  /**
   * Creates a tx to deploy a new instance of this contract using the specified constructor method.
   */
  public static deployWithOpts<M extends keyof RockPaperScissorsContract['methods']>(
    opts: { publicKeys?: PublicKeys; method?: M; wallet: Wallet },
    ...args: Parameters<RockPaperScissorsContract['methods'][M]>
  ) {
    return new DeployMethod<RockPaperScissorsContract>(
      opts.publicKeys ?? PublicKeys.default(),
      opts.wallet,
      RockPaperScissorsContractArtifact,
      RockPaperScissorsContract.at,
      Array.from(arguments).slice(1),
      opts.method ?? 'constructor',
    );
  }
  

  
  /**
   * Returns this contract's artifact.
   */
  public static get artifact(): ContractArtifact {
    return RockPaperScissorsContractArtifact;
  }
  

  public static get storage(): ContractStorageLayout<'games' | 'token_address' | 'games_length'> {
      return {
        games: {
      slot: new Fr(1n),
    },
token_address: {
      slot: new Fr(2n),
    },
games_length: {
      slot: new Fr(3n),
    }
      } as ContractStorageLayout<'games' | 'token_address' | 'games_length'>;
    }
    

  public static get notes(): ContractNotes<'UintNote' | 'GameNote' | 'ValueNote'> {
    return {
      UintNote: {
          id: new NoteSelector(202136239),
        },
GameNote: {
          id: new NoteSelector(4012853617),
        },
ValueNote: {
          id: new NoteSelector(1038582377),
        }
    } as ContractNotes<'UintNote' | 'GameNote' | 'ValueNote'>;
  }
  

  /** Type-safe wrappers for the public methods exposed by the contract. */
  public declare methods: {
    
    /** compute_note_hash_and_optionally_a_nullifier(contract_address: struct, nonce: field, storage_slot: field, note_type_id: field, compute_nullifier: boolean, serialized_note: array) */
    compute_note_hash_and_optionally_a_nullifier: ((contract_address: AztecAddressLike, nonce: FieldLike, storage_slot: FieldLike, note_type_id: FieldLike, compute_nullifier: boolean, serialized_note: FieldLike[]) => ContractFunctionInteraction) & Pick<ContractMethod, 'selector'>;

    /** constructor(token_addr: struct) */
    constructor: ((token_addr: AztecAddressLike) => ContractFunctionInteraction) & Pick<ContractMethod, 'selector'>;

    /** play_game(game_id: field, player2_move: field, bet_match: field) */
    play_game: ((game_id: FieldLike, player2_move: FieldLike, bet_match: FieldLike) => ContractFunctionInteraction) & Pick<ContractMethod, 'selector'>;

    /** start_game(player1_move: field, bet_amount: field, nonce: field) */
    start_game: ((player1_move: FieldLike, bet_amount: FieldLike, nonce: FieldLike) => ContractFunctionInteraction) & Pick<ContractMethod, 'selector'>;

    /** sync_notes() */
    sync_notes: (() => ContractFunctionInteraction) & Pick<ContractMethod, 'selector'>;
  };

  
}
