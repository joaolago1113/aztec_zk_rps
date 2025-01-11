use dep::aztec::{
    keys::getters::{get_nsk_app, get_public_keys},
    macros::notes::note,
    note::utils::compute_note_hash_for_nullify,
    protocol_types::{
        address::AztecAddress,
        constants::GENERATOR_INDEX__NOTE_NULLIFIER,
        hash::poseidon2_hash_with_separator,
        traits::Serialize
    },
};
use dep::aztec::prelude::{NoteHeader, NullifiableNote, PrivateContext};

global GAME_NOTE_LEN: u32 = 5;

#[note]
pub struct GameNote {
    id: Field,             // Unique game ID
    player1_move: Field,   // 0=Rock, 1=Paper, 2=Scissors
    player1_address: AztecAddress,
    bet_amount: Field,
    is_completed: bool,
}

impl Eq for GameNote {
    fn eq(self, other: Self) -> bool {
        self.id == other.id  // Only compare IDs since they're unique
    }
}

impl GameNote {
    pub fn new(id: Field, player1_move: Field, player1_address: AztecAddress, bet_amount: Field) -> Self {
        GameNote {
            id,
            player1_move,
            player1_address,
            bet_amount,
            is_completed: false,
            header: NoteHeader::empty()
        }
    }
}

impl NullifiableNote for GameNote {
    fn compute_nullifier(self, context: &mut PrivateContext, note_hash_for_nullify: Field) -> Field {
        let owner_npk_m_hash: Field = get_public_keys(self.player1_address).npk_m.hash();
        let secret = context.request_nsk_app(owner_npk_m_hash);
        poseidon2_hash_with_separator(
            [note_hash_for_nullify, secret],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field,
        )
    }

    unconstrained fn compute_nullifier_without_context(self) -> Field {
        let note_hash_for_nullify = compute_note_hash_for_nullify(self);
        let owner_npk_m_hash: Field = get_public_keys(self.player1_address).npk_m.hash();
        let secret = get_nsk_app(owner_npk_m_hash);
        poseidon2_hash_with_separator(
            [note_hash_for_nullify, secret],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field,
        )
    }
}

impl Serialize<5> for GameNote {
    fn serialize(self) -> [Field; 5] {
        [
            self.id,
            self.bet_amount,
            self.player1_move,
            self.player1_address.to_field(),
            self.is_completed as Field
        ]
    }
} 