use dep::aztec::protocol_types::traits::{Deserialize, Serialize, Packable, Hash};
use dep::aztec::{
    hash::poseidon2_hash_with_separator,
    keys::getters::{get_nsk_app, get_public_keys},
    macros::notes::note,
    note::utils::compute_note_hash_for_nullify,
    oracle::random::random,
    prelude::{NoteHeader, NullifiableNote, PrivateContext},
    protocol_types::{
        address::AztecAddress, constants::GENERATOR_INDEX__NOTE_NULLIFIER,
    },
};


global GAME_NOTE_LEN: u32 = 8;

pub struct GameNote {
    pub id: Field,
    pub bet_amount: Field,
    pub token_address: Field,
    pub is_completed: bool,
    pub blocktime: Field,
    pub player2_address: Field,
    pub player2_move: Field,
    pub randomness: Field,
    pub header: NoteHeader,
    pub owner: Field,
}


impl GameNote {
    pub fn new(id: Field, bet_amount: Field, token_address: Field) -> Self {
        let randomness = unsafe { random() };
        GameNote {
            id,
            bet_amount,
            token_address,
            is_completed: false,
            blocktime: 0,
            player2_address: 0,
            player2_move: 0,
            randomness,
            header: NoteHeader::empty(),
            owner: 0,
        }
    }
}

impl Serialize<GAME_NOTE_LEN> for GameNote {
    fn serialize(self) -> [Field; GAME_NOTE_LEN] {
        [
            self.id,
            self.bet_amount,
            self.token_address,
            self.is_completed as Field,
            self.blocktime,
            self.player2_address,
            self.player2_move,
            self.randomness
        ]
    }
}

impl Deserialize<GAME_NOTE_LEN> for GameNote {
    fn deserialize(fields: [Field; GAME_NOTE_LEN]) -> Self {
        GameNote {
            id: fields[0],
            bet_amount: fields[1],
            token_address: fields[2],
            is_completed: fields[3] != 0,
            blocktime: fields[4],
            player2_address: fields[5],
            player2_move: fields[6],
            randomness: fields[7],
            header: NoteHeader::empty(),
            owner: 0,
        }
    }
}

impl Eq for GameNote {
    fn eq(self, other: Self) -> bool {
        self.id == other.id
    }
}

impl Packable<GAME_NOTE_LEN> for GameNote {
    fn pack(self) -> [Field; GAME_NOTE_LEN] {
        [
            self.id,
            self.bet_amount,
            self.token_address,
            self.is_completed as Field,
            self.blocktime,
            self.player2_address,
            self.player2_move,
            self.randomness
        ]
    }

    fn unpack(fields: [Field; GAME_NOTE_LEN]) -> Self {
        GameNote {
            id: fields[0],
            bet_amount: fields[1],
            token_address: fields[2],
            is_completed: fields[3] != 0,
            blocktime: fields[4],
            player2_address: fields[5],
            player2_move: fields[6],
            randomness: fields[7],
            header: NoteHeader::empty(),
            owner: 0,
        }
    }
}
