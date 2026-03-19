## Examples

### Pure helper / library test (`#[test]`)

Use when the test is deterministic and does not take a `psibase::Chain`.

```rust
#[test]
fn test_to_fixed() {
    // Call helper directly and assert on pure outputs.
    assert_eq!(to_fixed("123.4", 2), "123.40");
    assert_eq!(to_fixed("0.5", 3), "0.500");
}
```

### Chain-backed integration test (`#[psibase::test_case(packages("..."))]`)

Use when the test needs to boot/init chain state, install packages, or call wrapper methods that mutate on-chain state.

```rust
#[psibase::test_case(packages("Tokens"))]
fn test_basics(chain: psibase::Chain) -> Result<(), psibase::Error> {
    Wrapper::push(&chain).init();

    let alice = account!("alice");
    chain.new_account(alice).unwrap();
    let a = Wrapper::push_from(&chain, alice);

    // Drive behavior via wrapper methods; assert on chain-visible effects.
    let tid = a.create(4.try_into().unwrap(), 80000.into()).get()?;
    assert_eq!(0, a.getBalance(tid, alice).get().unwrap().value);

    Ok(())
}
```

