mod serde_bench;

criterion::criterion_main!{
    serde_bench::serialize,
    serde_bench::deserialize
}
