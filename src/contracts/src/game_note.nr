use dep::aztec::protocol_types::traits::{Deserialize, Serialize};

global GAME_NOTE_LEN: u32 = 7;

pub struct GameNote {
    pub id: Field,
    pub bet_amount: Field,
    pub token_address: Field,
    pub is_completed: bool,
    pub blocktime: Field,
    pub player2_address: Field,
    pub player2_move: Field,
}

impl GameNote {
    pub fn new(id: Field, bet_amount: Field, token_address: Field) -> Self {
        GameNote {
            id,
            bet_amount,
            token_address,
            is_completed: false,
            blocktime: 0,
            player2_address: 0,
            player2_move: 0
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
            self.player2_move
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
            token_address: fields[2],
            is_completed: fields[3] != 0,
            blocktime: fields[4],
            player2_address: fields[5],
            player2_move: fields[6]
        }
    }
}
