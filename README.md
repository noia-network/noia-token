# NOIA Crowdsale and Token contracts

## Testing

Before running test suite you need to start `ganache-cli` with the following command

`ganache-cli -a 200 -e 1000000`

After that start test suite with `truffle test` in a separate terminal session.

## Deployment

1. Before deployment you have to change addresses in NOIACrowdsale.sol for:
    - WALLET (line 16)
    - TEAM_WALLET (line 18)
    - ADVISORS_WALLET (line 20)
    - COMMUNITY_WALLET (line 22)
    - FUTURE_WALLET (line 24)
2. Change the following constants in NOIACrowdsale.sol to correct values:
    - PRE_SALE_TOKENS (line 27)
    - START_TIME (line 28)
    - END_TIME (line 29)
    - maxPurchaseUsd (line 57) (you can change it later using `setMaxPurchaseUsd()` function)
3. Recheck token name and symbol in NOIAToken.sol (lines 21, 22).
4. First you have to deploy Whitelist.
5. Then you have to deploy NOIAToken.
6. Then, you have to deploy NOIACrowdsale and give deployed token and whitelist smart-contracts addresses into it.
7. Then you have to execute `transferOwnership` function on NOIAToken with address of NOIACrowdsale smart-contract.

P.S. You can also deploy it using `truffle migrate`.
