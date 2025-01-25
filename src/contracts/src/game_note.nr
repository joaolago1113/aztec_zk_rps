use dep::aztec::{
    keys::getters::{get_nsk_app, get_public_keys},
    macros::notes::note,
    note::utils::compute_note_hash_for_nullify,
    protocol_types::{
        address::AztecAddress,
        constants::GENERATOR_INDEX__NOTE_NULLIFIER,
        hash::poseidon2_hash_with_separator,
        traits::{Serialize, Deserialize}
    },
};
use dep::aztec::prelude::{NoteHeader, NullifiableNote, PrivateContext};

global GAME_NOTE_LEN: u32 = 6;

pub struct GameNote {
    pub id: Field,
    pub player2_move: Field,
    pub blocktime: Field,
    pub player2_address: Field,
    bet_amount: Field,
    is_completed: bool,
    header: NoteHeader,
}

impl GameNote {
    pub fn new(id: Field, bet_amount: Field) -> Self {
        GameNote {
            id,
            bet_amount,
            is_completed: false,
            player2_move: 0,
            blocktime: 0,
            player2_address: 0,
            header: NoteHeader::empty()
        }
    }
}

impl Serialize<GAME_NOTE_LEN> for GameNote {
    fn serialize(self) -> [Field; GAME_NOTE_LEN] {
        [
            self.id,
            self.bet_amount,
            self.is_completed as Field,
            self.player2_move,
            self.blocktime,
            self.player2_address
        ]
    }
}

impl Eq for GameNote {
    fn eq(self, other: Self) -> bool {
        self.id == other.id
    }
}

impl Deserialize<GAME_NOTE_LEN> for GameNote {
    fn deserialize(fields: [Field; GAME_NOTE_LEN]) -> GameNote {
        GameNote {
            id: fields[0],
            bet_amount: fields[1],
            is_completed: fields[4] != 0,
            player2_move: fields[3],
            blocktime: fields[4],
            player2_address: fields[5],
            header: NoteHeader::empty()
        }
    }
}
