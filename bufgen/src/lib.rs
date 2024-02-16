extern crate wasm_bindgen;

use numtoa::NumToA;
use wasm_bindgen::prelude::*;

pub fn get_steam_id_from_account_id(steam_account_id: u32) -> u64 {
    u64::from(steam_account_id) | (1 << 32) | (1 << 52) | (1 << 56)
}

const WORKGROUP_SIZE: usize = 64;
const DISPATCH_GROUP_SIZE: usize = 1024;
const TOTAL_INVOCATIONS_PER_DISPATCH: usize = WORKGROUP_SIZE * DISPATCH_GROUP_SIZE;
const PER_INPUT_SIZE: usize = 9 * 4;

#[wasm_bindgen]
pub fn generate_buffer(start: u32, end: u32) -> Vec<u8> {
    // let mut buffer = [0u8; TOTAL_INVOCATIONS_PER_DISPATCH * PER_INPUT_SIZE];
    let mut buffer = vec![0u8; TOTAL_INVOCATIONS_PER_DISPATCH * PER_INPUT_SIZE];
    let mut steam_string = [0u8; 20];
    for steam_account_id in start..(end) {
        get_steam_id_from_account_id(steam_account_id).numtoa_str(10, &mut steam_string);
        let offset_start = (steam_account_id - start) as usize * 34;
        // for i in 0..17 {
        //     buffer[offset_start + (i * 2)] = steam_string[i];
        // }
        // Unroll the loop above
        buffer[offset_start + 0] = steam_string[3];
        buffer[offset_start + 2] = steam_string[4];
        buffer[offset_start + 4] = steam_string[5];
        buffer[offset_start + 6] = steam_string[6];
        buffer[offset_start + 8] = steam_string[7];
        buffer[offset_start + 10] = steam_string[8];
        buffer[offset_start + 12] = steam_string[9];
        buffer[offset_start + 14] = steam_string[10];
        buffer[offset_start + 16] = steam_string[11];
        buffer[offset_start + 18] = steam_string[12];
        buffer[offset_start + 20] = steam_string[13];
        buffer[offset_start + 22] = steam_string[14];
        buffer[offset_start + 24] = steam_string[15];
        buffer[offset_start + 26] = steam_string[16];
        buffer[offset_start + 28] = steam_string[17];
        buffer[offset_start + 30] = steam_string[18];
        buffer[offset_start + 32] = steam_string[19];
    }
    buffer
}
