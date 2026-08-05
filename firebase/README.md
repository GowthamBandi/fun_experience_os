# Firebase Workspace

Local Firebase Emulator foundation for Experience OS.

## Project ID (emulator only)

```
demo-experience-os
```

## Emulator Ports

| Emulator   | Host         | Port |
|------------|-------------|------|
| Auth       | 127.0.0.1   | 9099 |
| Firestore  | 127.0.0.1   | 8080 |
| Functions  | 127.0.0.1   | 5001 |
| UI         | 127.0.0.1   | 4000 |

## Starting the Emulators

From the repository root:

```bash
npm run firebase:emulators
```

Or directly:

```bash
firebase emulators:start --project demo-experience-os
```

## Running Tests

**Firestore rules tests:**

```bash
npm run test:rules
```

**Functions health-check test:**

```bash
npm run test:functions
```

## Directory Structure

```
firebase/
├── functions/           # Cloud Functions (TypeScript)
│   ├── src/index.ts     # checkHealth callable — emulator verification only
│   ├── test/            # Functions tests
│   ├── package.json
│   └── tsconfig.json
├── firestore/           # Firestore configuration
│   ├── firestore.rules  # Deny-all baseline rules
│   ├── firestore.indexes.json
│   ├── test/            # Rules unit tests
│   └── package.json
├── scripts/             # Utility scripts (PR-0C)
└── README.md
```

## Safety Rules

1. **Never run `firebase deploy`** until production approval is granted.
2. **Never select a real Firebase project** — always use `demo-experience-os`.
3. **Never commit `.env.local`** — it is git-ignored.
4. Seed and reset scripts refuse to run unless `FIRESTORE_EMULATOR_HOST` is present.

## Phase Status

- [x] PR-0B — Emulator foundation
- [ ] PR-0C — Domain data migration to Firestore
- [ ] PR-0D — Firebase Authentication
