@group(0) @binding(0) var<storage, read_write> data: array<array<u32, 9>>;
 
@compute @workgroup_size(1)fn main(
    @builtin(global_invocation_id) id: vec3<u32>
) {
    let i = id.x;
    let buf = data[i];
    // Hash the buffer
    let len = 34;
    // static const uint64 k2 = 0x9ae16a3b2f90404fULL;
    let k2_low = 797982799;
    let k2_high = 2598464059;

    // uint64 mul = k2 + len * 2;
    let mul_low = k2_low + (len * 2)
    let mul_high = k2_high
    // uint64 a = Fetch64(s) * k2;

    // uint64 b = Fetch64(s + 8);
    // uint64 c = Fetch64(s + len - 24);
    // uint64 d = Fetch64(s + len - 32);
    // uint64 e = Fetch64(s + 16) * k2;
    // uint64 f = Fetch64(s + 24) * 9;
    // uint64 g = Fetch64(s + len - 8);
    // uint64 h = Fetch64(s + len - 16) * mul;
    // uint64 u = Rotate(a + g, 43) + (Rotate(b, 30) + c) * 9;
    // uint64 v = ((a + g) ^ d) + f + 1;
    // uint64 w = bswap_64((u + v) * mul) + h;
    // uint64 x = Rotate(e + f, 42) + c;
    // uint64 y = (bswap_64((v + w) * mul) + g) * mul;
    // uint64 z = e + f + c;
    // a = bswap_64((x + z) * mul + y) + b;
    // b = ShiftMix((z + a) * mul + d + h) * mul;
    // return b + x;
}

// x, y: 64-bit integer
// x_h/x_l: higher/lower 32 bits of x
// y_h/y_l: higher/lower 32 bits of y

// x*y  = ((x_h*2^32 + x_l)*(y_h*2^32 + y_l)) mod 2^64
//      = (x_h*y_h*2^64 + x_l*y_l + x_h*y_l*2^32 + x_l*y_h*2^32) mod 2^64
//      = x_l*y_l + (x_h*y_l + x_l*y_h)*2^32
fn multiply
