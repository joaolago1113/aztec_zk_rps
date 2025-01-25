mod game_note;

use dep::aztec::macros::aztec;

/// An Aztec v3 Rock-Paper-Scissors contract with betting functionality.
#[aztec]
contract RockPaperScissors {

    use crate::game_note::GameNote;
    use dep::aztec::{
        encrypted_logs::{
            encrypted_event_emission::encode_and_encrypt_event_unconstrained,
            encrypted_note_emission::{
                encode_and_encrypt_note_unconstrained,
            },
        },
        note::{note_getter_options::NoteGetterOptions},
        protocol_types::public_keys::OvpkM,
        keys::getters::get_public_keys,
        prelude::{PublicImmutable, AztecAddress, PrivateMutable, Map, PrivateSet, PrivateImmutable, PublicMutable, NoteHeader, Point},
        encrypted_logs::encrypted_note_emission::encode_and_encrypt_note,
        macros::{storage::storage, storage::storage_no_init, functions::{private, public, initializer, internal}}
    };
    use dep::aztec::{note::note_getter_options::SortOrder, utils::comparison::Comparator};
    use dep::token::Token;
    use dep::value_note::value_note::ValueNote;
    use aztec::oracle::random::random;

    /// The contract's main storage structure.
    #[storage]
    struct Storage<Context> {
        /// The L2 token used for bets
        token_address: PublicImmutable<AztecAddress, Context>,
        games_length: PublicMutable<Field, Context>,

        plays: Map<Field, PrivateMutable<ValueNote, Context>, Context>,
        games: Map<Field, PublicMutable<GameNote, Context>, Context>
    }

    #[public]
    fn constructor(token_addr: AztecAddress) {
        storage.token_address.initialize(token_addr);
        storage.games_length.write(Field::from(0));
    }

    #[private]
    fn start_game(
        player1_move: Field,
        bet_amount: Field
    ) {
        assert(player1_move as u8 <= 2, "Invalid move!");

        let mut player_move_note = ValueNote::new(player1_move, context.msg_sender());

        let game_id = random();

        storage.plays.at(game_id).initialize(&mut player_move_note).emit(encode_and_encrypt_note_unconstrained(
            &mut context,
            context.msg_sender(),
            context.msg_sender(),
        ));

        // Create and insert game note
        let mut game_note = GameNote::new(
            game_id,
            bet_amount
        );

        RockPaperScissors::at(context.this_address())
            ._add_game(game_note)
            .enqueue(&mut context);
    }

    #[public]
    #[internal]
    fn _add_game(game_note: GameNote) -> Field{

        let current_length = storage.games_length.read();
        storage.games_length.write(current_length + 1);

        storage.games.at(game_note.id).write(game_note);

        let token_address = storage.token_address.read();

        Token::at(token_address)
            .transfer_in_public(context.msg_sender(), context.this_address(), game_note.bet_amount, 0)
            .call(&mut context);

        game_note.id
    }

    #[public]
    fn play_game(
        game_id: Field,
        player2_move: Field,
        bet_match: Field
    ) -> Field {
        //assert(storage.plays.at(game_id).is_some(), "Game not found");  
        let token_addr = storage.token_address.read();

        Token::at(token_addr)
            .transfer_in_public(context.msg_sender(), context.this_address(), bet_match, 0)
            .call(&mut context);

        let mut game_note = storage.games.at(game_id).read();

        game_note.player2_move = player2_move;
        game_note.player2_address = context.msg_sender().to_field();
        game_note.blocktime = context.block_number();

        storage.games.at(game_id).write(game_note);

        game_id
    }

    #[private]
    fn resolve_game(game_id: Field) {
        let play = storage.plays.at(game_id).get_note();
        let player1_move = play.note.value;

        RockPaperScissors::at(context.this_address())
            ._resolve_game(game_id, player1_move)
            .enqueue(&mut context);
    }

    #[public]
    #[internal]
    fn _resolve_game(game_id: Field, player1_move: Field) {
        let mut game_note = storage.games.at(game_id).read();
        assert(!game_note.is_completed, "Game already completed");

        // Get token address
        let token_addr = storage.token_address.read();
        let player2_address = game_note.player2_address;

        // Compare moves and determine winner
        let p1 = player1_move;
        let p2 = game_note.player2_move;
        let bet_amount = game_note.bet_amount;

        // Decide winner. 0=Rock,1=Paper,2=Scissors
        let mut winner: AztecAddress = AztecAddress::zero();
        let mut is_draw = false;

        if p1 == p2 {
            // It's a draw
            is_draw = true;
        } else {
            // RPS logic: if (p1 + 1) mod 3 == p2 => p2 wins
            let p1_plus_one = ((p1 + Field::from(1)) as u32 % 3).to_field();
            if p1_plus_one == p2 {
                // Player2 wins
                winner = AztecAddress { inner: player2_address };
            } else {
                // Player1 wins
                winner = context.msg_sender(); 
            }
        }

        // Handle payouts
        let pot = bet_amount * Field::from(2); // Total pot is 2x bet amount
        
        if is_draw {
            // Return bets to both players
            Token::at(token_addr)
                .transfer_in_public(context.this_address(), context.msg_sender(), bet_amount, 0)
                .call(&mut context);

            Token::at(token_addr)
                .transfer_in_public(context.this_address(), AztecAddress { inner: player2_address }, bet_amount, 0)
                .call(&mut context);
        } else {
            // Send entire pot to winner
            Token::at(token_addr)
                .transfer_in_public(context.this_address(), winner, pot, 0)
                .call(&mut context);
        }

        // Mark game as completed
        game_note.is_completed = true;
        storage.games.at(game_id).write(game_note);
    }

    #[public]
    fn timeout_game(game_id: Field) {
        let mut game_note = storage.games.at(game_id).read();
        
        // Check game isn't already completed
        assert(!game_note.is_completed, "Game already completed");
        
        // Check player2 has made their move (blocktime will be non-zero)
        assert(game_note.blocktime != 0, "Player 2 hasn't played yet");
        
        // Check if enough blocks have passed (e.g., 100 blocks)
        let current_block = context.block_number();
        let blocks_passed = current_block - game_note.blocktime;
        assert(blocks_passed as u32 > 100, "Not enough blocks have passed for timeout");

        // Get token address
        let token_addr = storage.token_address.read();
        let bet_amount = game_note.bet_amount;
        
        // Award both bets to player 2 since player 1 timed out
        let pot = bet_amount * Field::from(2);
        Token::at(token_addr)
            .transfer_in_public(context.this_address(), context.msg_sender(), pot, 0)
            .call(&mut context);

        // Mark game as completed
        game_note.is_completed = true;
        storage.games.at(game_id).write(game_note);
    }

    #[public]
    unconstrained fn get_game_by_id(game_id: Field) -> pub GameNote {
        let game_note = storage.games.at(game_id).read();
        game_note
    }

}

