# EVM+ trace transaction plugin

This plugin allows you to trace the execution of a transaction on the Acala & Karura EVM+. The plugin will take a transaction hash as input and will look up the mainnet for transaction details and perform a trace call for the transaction. You can do either call trace or VM trace

Example usage:
To trace transaction calls, you can use the following command:

```bash
npx @acala-network/chopsticks trace-transaction <tx-hash> --config acala --output trace.json
```

VM trace can be enabled by add `--vm` flag to the command
