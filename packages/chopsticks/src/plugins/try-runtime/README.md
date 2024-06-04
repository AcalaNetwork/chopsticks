# Try-Runtime CLI

🚧 EXPERIMENTAL FEATURE 🚧

You can use Chopsticks to perform runtime migration checks. It doesn't support PoV measure yet, only weight check is support.

```bash
# try-runtime print help
npx @acala-network/chopsticks try-runtime --help
```

Basic example:

```bash
npx @acala-network/chopsticks try-runtime \
  --endpoint <wss://remote.endpoint> \
  --runtime <wasm_runtime_path> \
  --checks PreAndPost
```

__NOTE__: You can also use `--config` to pass arguments
