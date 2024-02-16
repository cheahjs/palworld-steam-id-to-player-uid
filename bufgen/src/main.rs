use bufgen::generate_buffer;

const WORKGROUP_SIZE: usize = 64;
const DISPATCH_GROUP_SIZE: usize = 1024;
const TOTAL_INVOCATIONS_PER_DISPATCH: usize = WORKGROUP_SIZE * DISPATCH_GROUP_SIZE;

pub fn main() {
    generate_buffer(0, TOTAL_INVOCATIONS_PER_DISPATCH.try_into().unwrap());
}