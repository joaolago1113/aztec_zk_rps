mod game_note;

use dep::aztec::macros::aztec;

/// An Aztec v3 Rock-Paper-Scissors contract with betting functionality.
#[aztec]
contract RockPaperScissors {

    use dep::aztec::{
        note::{note_getter_options::NoteGetterOptions},
        protocol_types::public_keys::OvpkM,
        keys::getters::get_public_keys,
        prelude::{AztecAddress, PrivateMutable, Map, PrivateSet, PrivateImmutable, NoteInterface, NoteHeader, Point},
        encrypted_logs::encrypted_note_emission::encode_and_encrypt_note,
        macros::{storage::storage, functions::{private, public, initializer}}
    };
    use dep::aztec::{note::note_getter_options::SortOrder, utils::comparison::Comparator};
    use dep::token::Token;
    use crate::game_note::GameNote;
    use dep::value_note::value_note::ValueNote;

    /// The contract's main storage structure.
    #[storage]
    struct Storage<Context> {
        /// Map of game ID to game notes
        games: PrivateSet<GameNote, Context>,
        /// The L2 token used for bets
        token_address: PrivateImmutable<ValueNote, Context>,

        games_length: PrivateMutable<ValueNote, Context>,
    }

    // ---------------------------------------------------------------------
    // 1. Contract Constructor
    // ---------------------------------------------------------------------
    #[private]
    #[initializer]
    fn constructor(token_addr: AztecAddress) {
        
        // Initialize token address with the provided address
        let mut token_note = ValueNote::new(token_addr.to_field(), context.msg_sender());
        storage.token_address.initialize(&mut token_note);


        let mut games_length_note = ValueNote::new(Field::from(0), context.msg_sender());
        storage.games_length.initialize(&mut games_length_note);

    }

    #[private]
    fn start_game(
        player1_move: Field,
        bet_amount: Field,
        nonce: Field
    ) {
        assert(player1_move as u8 <= 2, "Invalid move!");
        
        let token_address = AztecAddress { inner: storage.token_address.get_note().value };

        // Transfer bet to contract
        Token::at(token_address)
            .transfer_in_private(context.msg_sender(), context.this_address(), bet_amount, nonce)
            .call(&mut context);

        // Get the current length of games
        let games_length = storage.games_length.get_note().note.value;
        let game_id = games_length + Field::from(1);
        
        // Create game note with ID
        let mut game_note = GameNote::new(
            game_id,
            player1_move, 
            context.msg_sender(), 
            bet_amount
        );

       // Set the note header
        
        // Insert the note into storage
        storage.games.insert(&mut game_note);

        // Update games length
        let mut new_length_note = ValueNote::new(game_id, context.msg_sender());
        storage.games_length.replace(&mut new_length_note);
    }

    #[private]
    fn play_game(
        game_id: Field,
        player2_move: Field,
        bet_match: Field
    ) {
        // 1. Retrieve the GameNote from the private set by game_id.
        //    We'll do it by filtering on game_id property.
        let mut options = NoteGetterOptions::new();
        options = options
            .select(GameNote::properties().id, Comparator.EQ, game_id)
            .set_limit(1);

        let notes = storage.games.get_notes(options);

        assert(notes.len() > 0, "No game found for this ID");
        let mut game_note = notes.get_unchecked(0);

        // 2. Basic checks
        assert(!game_note.is_completed, "Game already completed");
        assert(bet_match == game_note.bet_amount, "Bet mismatch!");

        let stored_token_addr = storage.token_address.get_note().value;
        let token_addr = AztecAddress { inner: stored_token_addr };

        Token::at(token_addr)
            .transfer_in_private(context.msg_sender(), context.this_address(), bet_match, Field::from(0))
            .call(&mut context);
        // 4. Compare moves
        let p1 = game_note.player1_move;
        let p2 = player2_move;

        // Decide winner. 0=Rock,1=Paper,2=Scissors
        let mut winner: AztecAddress = AztecAddress::zero(); // We'll store the winner's address here
        let mut is_draw = false;

        if p1 == p2 {
            // It's a draw
            is_draw = true;
        } else {
            // RPS logic: if (p1 + 1) mod 3 == p2 => p2 wins
            // We'll do a simple check:
            let p1_plus_one = ((p1 + Field::from(1)) as u32 % 3).to_field();
            if p1_plus_one == p2 {
                // Player2 wins
                winner = context.msg_sender(); // Because msg_sender is Player2
            } else {
                // Player1 wins
                winner = game_note.player1_address;
            }
        }

        // 5. Payout logic
        // The pot is game_note.bet_amount (from Player1) + bet_match (from Player2)
        let pot = game_note.bet_amount + bet_match;
        if is_draw {
            // For a draw, each player gets their bet back.
            // So we send Player1's bet back to Player1
            Token::at(token_addr)
                .transfer_in_private(context.this_address(), game_note.player1_address, game_note.bet_amount, Field::from(0))
                .call(&mut context);

            // And we send Player2's bet back to Player2
            Token::at(token_addr)
                .transfer_in_private(context.this_address(), context.msg_sender(), bet_match, Field::from(0))
                .call(&mut context);
        } else {
            // Send entire pot to the winner
            Token::at(token_addr)
                .transfer_in_private(context.this_address(), winner, pot, Field::from(0))
                .call(&mut context);
        }

        // 6. Mark the game as completed
        storage.games.remove(game_note);
        game_note.is_completed = true;
        storage.games.insert(&mut game_note);

    }


}
