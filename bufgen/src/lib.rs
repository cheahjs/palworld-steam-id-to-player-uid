extern crate wasm_bindgen;

use wasm_bindgen::prelude::*;

pub fn get_steam_id_from_account_id(steam_account_id: u32) -> u64 {
    u64::from(steam_account_id) | (1 << 32) | (1 << 52) | (1 << 56)
}

#[wasm_bindgen]
pub fn generate_buffer(start: u32, end: u32) -> Vec<u8> {
    let mut buffer = Vec::new();
    for steam_account_id in start..(end) {
        let steam_u64: u64 = get_steam_id_from_account_id(steam_account_id);
        buffer.extend(steam_u64
            .to_string()
            .encode_utf16()
            .map(|x| x.to_le_bytes())
            .flatten());
        buffer.push(0);
        buffer.push(0);
    }
    buffer
}
