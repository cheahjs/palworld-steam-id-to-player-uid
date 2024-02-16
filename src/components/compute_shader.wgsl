// each bit represents if the input hashes to the target
@group(0) @binding(0) var<storage, read_write> output_result: array<u32>;
@group(0) @binding(1) var<uniform> target_hash: u32;
@group(0) @binding(2) var<uniform> start_account_id: u32;

@compute
@workgroup_size(64)
fn main(
    @builtin(global_invocation_id) id: vec3<u32>
) {
    let i = id.x;
    var in_d = array<u32, 9>();
    let in_ptr = &in_d;
    steam_itoa(in_ptr, u64(start_account_id + i, 17825793u));
    // Hash the buffer
    const len = 34;
    // static const uint64 k2 = 0x9ae16a3b2f90404fULL;
    const k2 = u64(797982799u, 2598464059u);

    // uint64 mul = k2 + len * 2;
    // mul = 0x9ae16a3b2f90404f + (34 * 2) = 0x9ae16a3b2f90404f + 68 = 0x9ae16a3b2f9040bb
    // let mul = add_u64_u64(k2, u32_to_u64(len * 2));
    const mul = u64(797982867u, 2598464059u);
    // uint64 a = Fetch64(s) * k2;
    // let a = mul_u64_u64(Fetch64(i, 0), k2);
    // Fetch64(0) = 15199876379181111
    // a = 169635456293653574892571274399699193
    const a = vec2(3366441209u, 410069887u);
    // uint64 b = Fetch64(s + 8);
    let b = Fetch64(in_ptr, 8);
    // uint64 c = Fetch64(s + len - 24);
    // let c = Fetch64(i, 10);
    let c = Fetch64(in_ptr, len - 24);
    // uint64 d = Fetch64(s + len - 32);
    // let d = Fetch64(i, 2) = 13792505790529590;
    // let d = Fetch64(i, len - 32);
    const d = u64(3473462u, 3211318u);
    // uint64 e = Fetch64(s + 16) * k2;
    let e = mul_u64_u64(Fetch64(in_ptr, 16), k2);
    // uint64 f = Fetch64(s + 24) * 9;
    let f = mul_u64_u64(Fetch64(in_ptr, 24), vec2(9, 0));
    // uint64 g = Fetch64(s + len - 8);
    let g = Fetch64(in_ptr, len - 8);
    // uint64 h = Fetch64(s + len - 16) * mul;
    let h = mul_u64_u64(Fetch64(in_ptr, len - 16), mul);
    // uint64 u = Rotate(a + g, 43) + (Rotate(b, 30) + c) * 9;
    let u = add_u64_u64(Rotate(add_u64_u64(a, g), 43), mul_u64_u64(add_u64_u64(Rotate(b, 30), c), vec2(9u, 0u)));
    // uint64 v = ((a + g) ^ d) + f + 1;
    let v = add_u64_u64(add_u64_u64(xor_u64_u64(add_u64_u64(a, g), d), f), vec2(1u, 0u));
    // uint64 w = bswap_64((u + v) * mul) + h;
    let w = add_u64_u64(bswap_64(mul_u64_u64(add_u64_u64(u, v), mul)), h);
    // uint64 x = Rotate(e + f, 42) + c;
    let x = add_u64_u64(Rotate(add_u64_u64(e, f), 42), c);
    // uint64 y = (bswap_64((v + w) * mul) + g) * mul;
    let y = mul_u64_u64(add_u64_u64(bswap_64(mul_u64_u64(add_u64_u64(v, w), mul)), g), mul);
    // uint64 z = e + f + c;
    let z = add_u64_u64(add_u64_u64(e, f), c);
    // a = bswap_64((x + z) * mul + y) + b;
    let a2 = add_u64_u64(bswap_64(add_u64_u64(mul_u64_u64(add_u64_u64(x, z), mul), y)), b);
    // b = ShiftMix((z + a) * mul + d + h) * mul;
    let b2 = mul_u64_u64(ShiftMix(add_u64_u64(mul_u64_u64(add_u64_u64(z, a2), mul), add_u64_u64(d, h))), mul);
    // return b + x;
    let result: u64 = add_u64_u64(b2, x);
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

fn Fetch64(data: ptr<function,array<u32, 9>>, offset: u32) -> u64 {
    let low = read_u8(data, offset) + (read_u8(data, offset + 1u) << 8u) + (read_u8(data, offset + 2u) << 16u) + (read_u8(data, offset + 3u) << 24u);
    let high = read_u8(data, offset + 4u) + (read_u8(data, offset + 5u) << 8u) + (read_u8(data, offset + 6u) << 16u) + (read_u8(data, offset + 7u) << 24u);
    return u32x2_to_u64(low, high);
}

fn read_u8(data: ptr<function,array<u32, 9>>, offset: u32) -> u32 {
    let ipos: u32 = offset >> 2u;
    let val_u32: u32 = (*data)[ipos];
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

fn div_steam_u64_10(a: u64) -> vec3<u32> {
    var result = vec2(0u, 0u);
    var remainder = a;
    const b = vec2(10u, 0u);

    var count = 60u;
    var divisor = vec2(0u, 2684354560);

    while !is_zero_u64(remainder) {
        if cmp_u64_u64(remainder, divisor) >= 0i {
            remainder = subtract_i64_i64(remainder, divisor);
            result = result | left_shift_u64(vec2(1u, 0u), count);
        }
        if count == 0u {
            break;
        }
        divisor = right_shift_u64(divisor, 1u);
        count -= 1u;
    }

    return vec3(result, remainder.x);
}

fn is_zero_u64(a: u64) -> bool {
    return a.x == 0u && a.y == 0u;
}

fn cmp_u64_u64(a: u64, b: u64) -> i32 {
    if a.y < b.y {
        return -1i;
    } else if a.y > b.y {
        return 1i;
    } else {
        if a.x < b.x {
            return -1i;
        } else if a.x > b.x {
            return 1i;
        } else {
            return 0i;
        }
    }
}

fn subtract_i64_i64(a: i64, b: i64) -> i64 {
    return add_i64_i64(a, negate_i64(b));
}

fn negate_i64(a: i64) -> i64 {
    return add_u64_u64(~a, vec2(1u, 0u));
}

fn add_i64_i64(a: i64, b: i64) -> i64 {
    return add_u64_u64(a, b);
}

fn first_leading_bit_u64(a: u64) -> u32 {
    if a.y != 0u {
        return firstLeadingBit(a.y) + 32u;
    } else {
        return firstLeadingBit(a.x);
    }
}

alias i64 = vec2<u32>;

// https://github.com/compute-toys/include/blob/146065171bd09afff4bec5823f0b1d2397d28b51/std/string.wgsl
// MIT License

// Copyright (c) 2022 compute-toys

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

fn steam_itoa(data: ptr<function,array<u32, 9>>, num: u64) {
    var n = num;
    for (var i = 1u; i < 17u; i += 1u) {
        let div = div_steam_u64_10(n);
        let remainder = div.z;
        let shift = select(0u, 16u, (i & 1) == 0);
        (*data)[8 - (i >> 1)] |= ((0x30 + remainder) << shift);
        n = vec2(div.x, div.y);
    }
    // For some reason it yields a final digit of 1, so just hack it
    (*data)[0] = (*data)[0] | 0x37;
}
