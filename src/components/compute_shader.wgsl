// input buffer is 34 bytes long, encoded as a 9x4 array of u32 values
@group(0) @binding(0) var<storage, read> input_data: array<array<u32, 9>>;
// each bit represents if the input hashes to the target
@group(0) @binding(1) var<storage, read_write> output_result: array<u32>;
@group(0) @binding(2) var<uniform> target_hash: u32;
// @group(0) @binding(3) var<storage, read_write> debug_output: array<u32>;
 
@compute
@workgroup_size(64)
fn main(
    @builtin(global_invocation_id) id: vec3<u32>
) {
    let i = id.x;
    // Hash the buffer
    const len = 34;
    // static const uint64 k2 = 0x9ae16a3b2f90404fULL;
    let k2 = u32x2_to_u64(797982799, 2598464059);

    // uint64 mul = k2 + len * 2;
    let mul = add_u64_u64(k2, u32_to_u64(len * 2));
    // uint64 a = Fetch64(s) * k2;
    var a = mul_u64_u64(Fetch64(i, 0), k2);
    // uint64 b = Fetch64(s + 8);
    var b = Fetch64(i, 8);
    // uint64 c = Fetch64(s + len - 24);
    let c = Fetch64(i, len - 24);
    // uint64 d = Fetch64(s + len - 32);
    let d = Fetch64(i, len - 32);
    // uint64 e = Fetch64(s + 16) * k2;
    let e = mul_u64_u64(Fetch64(i, 16), k2);
    // uint64 f = Fetch64(s + 24) * 9;
    let f = mul_u64_u64(Fetch64(i, 24), u32_to_u64(9));
    // uint64 g = Fetch64(s + len - 8);
    let g = Fetch64(i, len - 8);
    // uint64 h = Fetch64(s + len - 16) * mul;
    let h = mul_u64_u64(Fetch64(i, len - 16), mul);
    // uint64 u = Rotate(a + g, 43) + (Rotate(b, 30) + c) * 9;
    let u = add_u64_u64(Rotate(add_u64_u64(a, g), 43), mul_u64_u64(add_u64_u64(Rotate(b, 30), c), u32_to_u64(9)));
    // uint64 v = ((a + g) ^ d) + f + 1;
    let v = add_u64_u64(add_u64_u64(xor_u64_u64(add_u64_u64(a, g), d), f), u32_to_u64(1));
    // uint64 w = bswap_64((u + v) * mul) + h;
    let w = add_u64_u64(bswap_64(mul_u64_u64(add_u64_u64(u, v), mul)), h);
    // uint64 x = Rotate(e + f, 42) + c;
    let x = add_u64_u64(Rotate(add_u64_u64(e, f), 42), c);
    // uint64 y = (bswap_64((v + w) * mul) + g) * mul;
    let y = mul_u64_u64(add_u64_u64(bswap_64(mul_u64_u64(add_u64_u64(v, w), mul)), g), mul);
    // uint64 z = e + f + c;
    let z = add_u64_u64(add_u64_u64(e, f), c);
    // a = bswap_64((x + z) * mul + y) + b;
    a = add_u64_u64(bswap_64(add_u64_u64(mul_u64_u64(add_u64_u64(x, z), mul), y)), b);
    // b = ShiftMix((z + a) * mul + d + h) * mul;
    b = mul_u64_u64(ShiftMix(add_u64_u64(mul_u64_u64(add_u64_u64(z, a), mul), add_u64_u64(d, h))), mul);
    // return b + x;
    let result: u64 = add_u64_u64(b, x);
    // Perform Unreal's compression
    let hash: u32 = result.x + (result.y * 23);

    // Check if the hash is the target
    let init_bit: u32 = select(0u, 1u, hash == target_hash);
    // let ipos: u32 = i / 4u;
    // let shift: u32 = 8u * (i % 4u);
    // let bit_set: u32 = init_bit << shift;
    // atomicOr(&output_result[ipos], bit_set);
    output_result[i] = init_bit;
}

fn ShiftMix(val: u64) -> u64 {
    return xor_u64_u64(val, right_shift_u64(val, 47u));
}

fn bswap_64(val: u64) -> u64 {
    return vec2(bswap(val.y), bswap(val.x));
}

fn bswap(val: u32) -> u32 {
    return ((val & 0xff000000u) >> 24u) | ((val & 0x00ff0000u) >> 8u) | ((val & 0x0000ff00u) << 8u) | ((val & 0x000000ffu) << 24u);
}

fn Rotate(val: u64, shift: u32) -> u64 {
    return or_u64_u64(
        right_shift_u64(val, shift),
        left_shift_u64(val, 64u - shift)
    );
}

fn Fetch64(idx: u32, offset: u32) -> u64 {
    let low = read_u8(idx, offset) + (read_u8(idx, offset + 1u) << 8u) + (read_u8(idx, offset + 2u) << 16u) + (read_u8(idx, offset + 3u) << 24u);
    let high = read_u8(idx, offset + 4u) + (read_u8(idx, offset + 5u) << 8u) + (read_u8(idx, offset + 6u) << 16u) + (read_u8(idx, offset + 7u) << 24u);
    return u32x2_to_u64(low, high);
}

fn read_u8(idx: u32, offset: u32) -> u32 {
    let ipos: u32 = offset / 4u;
    let val_u32: u32 = input_data[idx][ipos];
    let shift: u32 = 8u * (offset % 4u);
    let val_u8: u32 = (val_u32 >> shift) & 0xFFu;

    return val_u8;
}

// https://github.com/phetsims/alpenglow/blob/main/wgsl/math/
// The MIT License (MIT)

// Copyright (c) 2023 University of Colorado Boulder

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

// ( a_low + a_high * 2^32 ) * ( b_low + b_high * 2^32 ) mod 2^64
// = a_low * b_low + a_low * b_high * 2^32 + a_high * b_low * 2^32 + a_high * b_high * 2^64 mod 2^64
// = a_low * b_low + ( a_low * b_high + a_high * b_low ) * 2^32 mod 2^64
fn mul_u64_u64(a: u64, b: u64) -> u64 {
    let low = mul_u32_u32_to_u64(a.x, b.x);
    let mid0 = vec2(0u, mul_u32_u32_to_u64(a.x, b.y).x);
    let mid1 = vec2(0u, mul_u32_u32_to_u64(a.y, b.x).x);
    return add_u64_u64(add_u64_u64(low, mid0), mid1);
}

// ( a_low + a_high * 2^16 ) * ( b_low + b_high * 2^16 )
// ( a_low * b_low ) + ( a_low * b_high + a_high * b_low ) * 2^16 + ( a_high * b_high ) * 2^32
fn mul_u32_u32_to_u64(a: u32, b: u32) -> u64 {
    let a_low = a & 0xffffu;
    let a_high = a >> 16u;
    let b_low = b & 0xffffu;
    let b_high = b >> 16u;
    let c_low = a_low * b_low;
    let c_mid = a_low * b_high + a_high * b_low;
    let c_high = a_high * b_high;
    let low = add_u32_u32_to_u64(c_low, c_mid << 16u);
    let high = vec2(0u, (c_mid >> 16u) + c_high);
    return low + high;
}

// ( a_low + a_high * 2^32 ) + ( b_low + b_high * 2^32 ) mod 2^64
// a_low + b_low + ( a_high + b_high ) * 2^32 mod 2^64
fn add_u64_u64(a: u64, b: u64) -> u64 {
    return add_u32_u32_to_u64(a.x, b.x) + vec2(0u, add_u32_u32_to_u64(a.y, b.y).x);
}

fn add_u32_u32_to_u64(a: u32, b: u32) -> u64 {
    let sum = a + b;
    return vec2(sum, select(0u, 1u, sum < a));
}

// store (low, high)
alias u64 = vec2<u32>;

fn u32_to_u64(x: u32) -> u64 {
    return vec2<u32>(x, 0u);
}

fn u32x2_to_u64(low: u32, high: u32) -> u64 {
    return vec2(low, high);
}

fn left_shift_u64(a: u64, b: u32) -> u64 {
    if b == 0u {
        return a;
    } else if b < 32u {
        return vec2(a.x << b, (a.y << b) | (a.x >> (32u - b)));
    } else {
        return vec2(0u, a.x << (b - 32u));
    }
}

fn right_shift_u64(a: u64, b: u32) -> u64 {
    if b == 0u {
        return a;
    } else if b < 32u {
        return vec2((a.x >> b) | (a.y << (32u - b)), a.y >> b);
    } else {
        return vec2(a.y >> (b - 32u), 0u);
    }
}

fn or_u64_u64(a: u64, b: u64) -> u64 {
    return vec2(a.x | b.x, a.y | b.y);
}

fn xor_u64_u64(a: u64, b: u64) -> u64 {
    return vec2(a.x ^ b.x, a.y ^ b.y);
}
