# @sweech/engine

`@sweech/engine` is the AI agent runner engine inside the sweech CLI. It provides:

- `sweech run` for executing prompts through the selected engine
- `sweech which` and `sweech config` for routing and account inspection
- the daemon and HTTP APIs used by higher-level tooling

## Install

```bash
npm install @sweech/engine
```

## What it depends on

The package is self-contained for normal OSS installs. If `@vykeai/fed` is
present at runtime, the daemon will emit Fed events and register itself.
Otherwise those integrations are skipped and the rest of the package continues
to work.

## Build

```bash
npm run build
npm test
```
