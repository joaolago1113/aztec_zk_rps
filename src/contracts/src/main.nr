mod game_note;

use dep::aztec::macros::aztec;

/// An Aztec v3 Rock-Paper-Scissors contract with betting functionality.
#[aztec]
contract RockPaperScissors {

    use dep::aztec::{
        prelude::{PublicImmutable, AztecAddress, Map, PrivateImmutable, PublicMutable},
        macros::{storage::storage, functions::{private, public, initializer, internal}}
    };
    use crate::game_note::GameNote;
    use dep::token::Token;
    use dep::value_note::value_note::ValueNote;

    /// The contract's main storage structure.
    #[storage]
    struct Storage<Context> {
        games_length: PublicMutable<Field, Context>,

        plays: Map<Field, PrivateImmutable<ValueNote, Context>, Context>,
        games: Map<Field, PublicMutable<GameNote, Context>, Context>,
        game_ids: Map<Field, PublicImmutable<Field, Context>, Context>,

        owner: PublicImmutable<AztecAddress, Context>,
        timeout_blocks: PublicMutable<Field, Context>,
    }

    #[public]
    #[initializer]
    fn constructor(owner: AztecAddress, timeout_blocks: Field) {
        storage.owner.initialize(owner);
        storage.games_length.write(0);
        storage.timeout_blocks.write(timeout_blocks);
    }

    #[public]
    fn set_timeout_blocks(new_timeout: Field) {
        assert(context.msg_sender() == storage.owner.read(), "Only owner can set timeout blocks");
        storage.timeout_blocks.write(new_timeout);
    }

    #[private]
    fn start_game(
        game_id: Field,
        player1_move: Field,
        bet_amount: Field,
        token_addr: Field
    ) {
        assert(game_id == (3822144077627251854035011622902885184873307115484470706343825839640586629797 as Field), "not game id");

        assert(player1_move as u8 <= 2, "Invalid move!");

        let mut player_move_note = ValueNote::new(player1_move, context.msg_sender());

        storage.plays.at(game_id).initialize(&mut player_move_note);

        // Create and insert game note
        let mut game_note = GameNote::new(
            game_id,
            bet_amount,
            token_addr
        );

        RockPaperScissors::at(context.this_address())
            ._add_game(context.msg_sender(), game_note)
            .enqueue(&mut context);
    }

    #[public]
    #[internal]
    fn _add_game(sender: AztecAddress, game_note: GameNote){

        let current_length = storage.games_length.read();
        storage.games_length.write(current_length + 1);

        storage.game_ids.at(current_length).initialize(game_note.id);

        storage.games.at(game_note.id).write(game_note);

        Token::at(AztecAddress { inner: game_note.token_address })
            .transfer_in_public(sender, context.this_address(), U128::from_integer(game_note.bet_amount), 0)
            .call(&mut context);
    }

    #[public]
    fn play_game(
        game_id: Field,
        player2_move: Field,
        bet_match: Field
    ) {
        assert(game_id == (3822144077627251854035011622902885184873307115484470706343825839640586629797 as Field), "not game id");

        // Retrieve token address from the game note
        let mut game_note = storage.games.at(game_id).read();
        let token_addr = AztecAddress { inner: game_note.token_address };

        Token::at(token_addr)
            .transfer_in_public(context.msg_sender(), context.this_address(), U128::from_integer(bet_match), 0)
            .call(&mut context);

        game_note.player2_move = player2_move;
        game_note.player2_address = context.msg_sender().to_field();
        game_note.blocktime = context.block_number();

        storage.games.at(game_id).write(game_note);
    }

    #[private]
    fn resolve_game(game_id: Field) {

        assert(game_id == (3822144077627251854035011622902885184873307115484470706343825839640586629797 as Field), "not game id");

        let play = storage.plays.at(game_id).get_note();
        let player1_move = play.value;

        RockPaperScissors::at(context.this_address())
            ._resolve_game(game_id, player1_move, context.msg_sender())
            .enqueue(&mut context);
    }

    #[public]
    #[internal]
    fn _resolve_game(game_id: Field, player1_move: Field, player1_address: AztecAddress) {
        let mut game_note = storage.games.at(game_id).read();
        assert(!game_note.is_completed, "Game already completed");

        // Retrieve token address from the game note
        let token_addr = AztecAddress { inner: game_note.token_address };
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
            let p1_plus_one = ((p1 + 1) as u32 % 3) as Field;
            if p1_plus_one == p2 {
                // Player2 wins
                winner = AztecAddress { inner: player2_address };
            } else {
                // Player1 wins
                winner = player1_address;
            }
        }

        // Handle payouts
        let pot = bet_amount * 2; // Total pot is 2x bet amount
        
        if is_draw {
            // Return bets to both players
            Token::at(token_addr)
                .transfer_in_public(context.this_address(), player1_address, U128::from_integer(bet_amount), 0)
                .call(&mut context);

            Token::at(token_addr)
                .transfer_in_public(context.this_address(), AztecAddress { inner: player2_address }, U128::from_integer(bet_amount), 0)
                .call(&mut context);
        } else {
            // Send entire pot to winner
            Token::at(token_addr)
                .transfer_in_public(context.this_address(), winner, U128::from_integer(pot), 0)
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
        
        // Check if enough blocks have passed
        let current_block = context.block_number();
        let blocks_passed = current_block - game_note.blocktime;
        let timeout_blocks = storage.timeout_blocks.read();
        assert(blocks_passed as u32 > timeout_blocks as u32, "Not enough blocks have passed for timeout");

        // Retrieve token address from the game note
        let token_addr = AztecAddress { inner: game_note.token_address };
        let bet_amount = game_note.bet_amount;
        
        // Award both bets to player 2 since player 1 timed out
        let pot = bet_amount * Field::from(2);
        Token::at(token_addr)
            .transfer_in_public(context.this_address(), AztecAddress { inner: game_note.player2_address }, U128::from_integer(pot), 0)
            .call(&mut context);

        // Mark game as completed
        game_note.is_completed = true;
        storage.games.at(game_id).write(game_note);
    }

    unconstrained fn get_game_by_id(game_id: Field) -> pub GameNote {
        storage.games.at(game_id).read()
    }

    unconstrained fn get_game_id_by_index(index: Field) -> pub Field {
        storage.game_ids.at(index).read()
    }

    unconstrained fn get_games_length() -> pub Field {
        storage.games_length.read()
    }

    unconstrained fn get_timeout_blocks() -> pub Field {
        storage.timeout_blocks.read()
    }

}

