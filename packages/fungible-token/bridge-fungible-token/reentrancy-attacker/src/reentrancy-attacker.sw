contract;

use std::execution::run_external;
use standards::{src14::SRC14, src5::{AccessError, State}};
use contract_message_receiver::MessageReceiver;

abi ReentrancyAttacker {
    #[storage(read, write)]
    fn process_message(msg_idx: u64);

    #[storage(read)]
    fn get_success() -> bool;
}

pub enum AttackStage {
    Attacking: (),
    Success: (),
    Finished: (),
}

configurable {
    TARGET: ContractId = ContractId::zero(),
}

#[namespace(SRC14)]
storage {
    attacking: bool = false,
    success: bool = false,
}

impl ReentrancyAttacker for Contract {
    #[storage(read, write)]
    fn process_message(msg_idx: u64) {
        if storage.success.read() {
            log(AttackStage::Finished);
            return;
        }

        log(AttackStage::Attacking);
        storage.attacking.write(true);

        let target = abi(MessageReceiver, TARGET.into());
        target.process_message(msg_idx);

        storage.success.write(true);
        log(AttackStage::Success);
    }

    #[storage(read)]
    fn get_success() -> bool {
        storage.success.read()
    }
}
