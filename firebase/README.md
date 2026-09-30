# Experience OS — Firebase backend

Authoritative docs: `docs/ARCHITECTURE.md`, `docs/API_CONTRACT.md`, ADR-0002…0006,
`docs/runbooks/ENVIRONMENTS_AND_DEPLOYMENT.md`.

| Path | What |
| --- | --- |
| `functions/src/identity` | profile, organizer applications & codes, staff invites/codes/permissions |
| `functions/src/catalog` | experiences, events (lifecycle, responsibility, publish), reviews |
| `functions/src/commerce` | reserveSeat, payments (Razorpay), webhook, tickets & scanning, refunds, ledger, settlements, schedules |
| `functions/src/governance` | Super Admin decisions (cases), entity status |
| `functions/src/access` | permission catalog (WHAT × WHERE) |
| `functions/src/platform` | security (HMAC, codes, secrets), audit, rate limits, callable wrapper, notify |
| `firestore/firestore.rules` | least-privilege rules (no client writes of authority) |
| `storage/storage.rules` | KYC private, org media, avatars |

## Local verification

```sh
npm run test:rules        # Firestore rules suites (emulator)
npm run test:functions    # functions suites (emulator)
npm run firebase:emulators
cd functions && npm run seed:emulator   # governance seed + local admin
```

Only the `demo-experience-os` project is configured here. Staging/production projects
must be created by the owner and added as separate aliases — never guess project ids.
