# Operations Console — deployment

The console is a Next.js 15 App Router app that runs as a **Node server** (`next start`).
It is deployed with **Firebase App Hosting**, one backend per Firebase project (staging, production).

Why App Hosting and not static Firebase Hosting:
- the security headers (CSP, HSTS, X-Frame-Options, …) come from `next.config.mjs`, and a static export would drop them;
- the archived prototype still has dynamic `[id]` routes, and `output: "export"` can't build those.

Any Node host (Cloud Run, a container) also works. It must run `npm ci && npm run build:production && npm start`.

Backend (rules, indexes, functions) deployment is separate and unchanged: `docs/runbooks/ENVIRONMENTS_AND_DEPLOYMENT.md` §4.
**Deploy the backend to an environment before its console.**

---

## 1. Files

| File | Purpose |
| --- | --- |
| `apphosting.yaml` | Shared App Hosting settings: run config, `buildCommand: npm run build:production`, `NEXT_PUBLIC_DATA_MODE=firebase-live`, archived prototype off |
| `apphosting.staging.yaml` / `apphosting.production.yaml` | Per-environment values. App Hosting merges the file whose name matches the backend's **environment name**. Templates: replace every `REPLACE_*` / `your-org` value |
| `.env.staging.example` / `.env.production.example` | The same variables as `KEY=value`, for CI or a non-App-Hosting host. Templates only |
| `.env.example` | Local development against the emulators (`cp .env.example .env.local`) |
| `scripts/verify-production-env.mjs` | Runs before `next build` in `build:production`, and fails the build on a wrong environment (see §3) |
| `security-headers.mjs` | CSP and hardening headers served by Next for every route |

The repository's root `firebase.json` is **not** changed. The `apphosting*.yaml` files do nothing until a backend is created (§4), so `firebase deploy --only firestore,functions,storage` behaves exactly as before.

## 2. Environment variables

Every `NEXT_PUBLIC_*` value is inlined into the browser bundle **at build time**, so changing one requires a new rollout. They are public web config, not secrets. Never put server secrets in `NEXT_PUBLIC_*`.

| Variable | Staging | Production | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_DATA_MODE` | `firebase-live` | `firebase-live` | `firebase-emulator` is local only. Anything else fails closed (login shows a configuration notice) |
| `NEXT_PUBLIC_APP_ENV` | `staging` | `production` | Sets the header/login badge (amber **Staging**, red **Production**) and the `[Staging]` tab title, and drives the project-id cross-check |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | web app config | web app config | Firebase Console → Project settings → Your apps → Web |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `<staging-project>.firebaseapp.com` | `<prod-project>.firebaseapp.com` | A custom auth domain is allowed; the CSP adds it to `frame-src` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | must contain `staging`/`stage`/`stg` | must not contain `staging`/`stage`/`stg`/`dev`/`test`/`qa`/`demo` | Enforced by the verify script |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | web app config | web app config | Must belong to the same project when it's a Firebase bucket |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | web app config | web app config | |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | web app config | web app config | |
| `NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY` | staging key | production key | App Check. The console refuses to start without it in live mode |
| `NEXT_PUBLIC_SHOW_ARCHIVED_PROTOTYPE` | `false` | `false` | `true` is refused by the build and ignored at runtime in `firebase-live` (ADR-0006) |
| `EXPECTED_FIREBASE_PROJECT_ID` | exact staging id | exact prod id | Build-only (not `NEXT_PUBLIC`). An exact match stops a copy-paste of the other environment's values |

Don't create `.env.production` in the app folder. `next build` loads it automatically, including for a staging build. Set the values in the hosting/CI environment instead; `.env.staging` and `.env.production` are git-ignored as a safety net.

## 3. What `npm run build:production` checks

It refuses to build when any of these is true:
- the data mode isn't `firebase-live`;
- `NEXT_PUBLIC_APP_ENV` isn't `staging` or `production`;
- a required variable is missing or still a template placeholder;
- the project is a `demo-*` project;
- the project id contradicts the declared environment;
- `EXPECTED_FIREBASE_PROJECT_ID` differs from the project id;
- the auth domain or bucket belongs to another project;
- the archived prototype flag is on.

Verify locally before the first rollout, with the real values exported in your shell:

```sh
cd apps/operations-web
npm ci
npm run typecheck && npm run lint && npm test
node scripts/verify-production-env.mjs     # prints "(staging → <project id>)" on success
npm run build:production
```

## 4. One-time setup per environment (staging first, then production)

Do these in the environment's own Firebase or Google Cloud project.

1. **Web app.** Firebase Console → Project settings → *Add app → Web*. Copy the config into `apphosting.<env>.yaml`, replacing the `REPLACE_*` and `your-org` placeholders. These are public values and may be committed.
2. **Auth.** Authentication → Sign-in method: enable **Email/Password**. Authentication → Settings → *Authorized domains*: add the App Hosting domain (`<backend>--<project>.<region>.hosted.app`) and the custom console domain.
3. **reCAPTCHA Enterprise.** Google Cloud → Security → reCAPTCHA → *Create key*:
   - type **Website**;
   - domains: the App Hosting domain and the custom console domain.
   Put the key in `NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY`.
4. **App Check.** Firebase Console → App Check:
   - register the web app with the **reCAPTCHA Enterprise** provider and the same key;
   - after a successful staging sign-in, check the metrics and **enforce** for Cloud Functions. The callables already run with `enforceAppCheck` outside the emulator.
5. **Backend.** Create the App Hosting backend with the Firebase CLI (App Hosting support is required):
   ```sh
   firebase apphosting:backends:create --project staging
   #   region:         a supported App Hosting region close to your operators (the CLI lists them)
   #   GitHub repo:    this repository
   #   root directory: apps/operations-web
   #   live branch:    the branch you release from
   #   backend id:     operations-console
   ```
   Then Firebase Console → App Hosting → `operations-console` → **Settings → Environment**: set the environment name to `staging` (or `production`), so `apphosting.staging.yaml` (or `apphosting.production.yaml`) is merged.
6. **Custom domain (optional).** App Hosting → backend → *Settings → Domains*. Add the same domain to Auth authorized domains and to the reCAPTCHA key.
7. **First platform owner.** Once per project, run the bootstrap script from the runbook (§3 "First platform owner").
   The script covers the owner. Every other operator account:
   1. is created in Firebase Console → Authentication → *Add user*;
   2. signs in once and uses **Send verification email** on the "Verify your email" screen;
   3. is granted a role by a platform owner on **Operator access** (`/operators`).
   Keep at least two active admins: dual control needs two different ones.

## 5. Deploy (rollout)

- **Automatic:** every push to the backend's live branch builds and rolls out.
- **Manual:**
  ```sh
  firebase apphosting:rollouts:create operations-console --git-branch <branch> --project staging
  ```
Promote to production only after the staging checks in §6 pass. Run the same command with `--project production` against the production backend.

## 6. Post-deploy checks

```sh
curl -sI https://<console-domain>/login | grep -iE 'content-security-policy|strict-transport|x-frame-options|x-content-type|referrer-policy|permissions-policy'
```

1. The header badge reads **Staging** (amber) or **Production** (red) and shows the expected project id (hover). Staging tabs are titled `[Staging] Experience OS`.
2. The browser DevTools console shows no `Content-Security-Policy` violations on `/login` and after sign-in. App Check's reCAPTCHA script loads from `www.google.com/recaptcha`.
3. Sign-in checks, one per role:
   - **Platform owner:** the Command Center loads, and **Operator access** shows **Grant access**.
   - **Super admin:** Operator access is read-only.
   - **Auditor:** lands on **Audit**, can open **Settlements** read-only, and every other route shows "Not available for your role".
4. An unverified account sees "Verify your email to continue". An account without a role sees "Your account has no console access".
5. Archived routes (e.g. `/missions`) show the archived notice, never the prototype.
6. Then run the runbook §6 post-deploy smoke list.

## 7. Rollback

App Hosting keeps previous rollouts. In Firebase Console → App Hosting → backend → **Rollouts**, roll back to the last good rollout. Alternatively, create a rollout from the previous commit:

```sh
firebase apphosting:rollouts:create operations-console --git-commit <sha> --project <alias>
```

The console holds no data of its own, so rollback is safe at any time. Firestore rules and functions are rolled back separately (runbook §4).

## 8. Optional: `firebase deploy --only apphosting`

To deploy from the CLI via `firebase.json`, a maintainer can add the snippet below to the root `firebase.json`. It is **not** applied: the root config is shared with the backend deploys.

```json
"apphosting": [
  {
    "backendId": "operations-console",
    "rootDir": "apps/operations-web",
    "ignore": ["node_modules", ".git", ".next", ".next-smoke", "firebase-debug.log", "firebase-debug.*.log", "functions"]
  }
]
```

Once it is added, a bare `firebase deploy` also deploys the console. Keep passing `--only` (for example `--only firestore:rules,firestore:indexes,storage,functions`) as the runbook already does.

## 9. Security headers

These are served for every route by `next.config.mjs` → `security-headers.mjs`.

**CSP:**
- `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`;
- `connect-src` limited to:
  - Firebase Auth (`identitytoolkit`, `securetoken`, `www.googleapis.com`);
  - Firestore;
  - Installations;
  - App Check;
  - `*.cloudfunctions.net` and `*.run.app`;
  - reCAPTCHA;
  - the local emulator ports in emulator builds only;
- `script-src` and `frame-src` add reCAPTCHA Enterprise; `frame-src` also allows `*.firebaseapp.com` and `*.web.app` for the Auth helper iframe;
- `upgrade-insecure-requests` in live builds.

**Other headers:**
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (live builds);
- `X-Frame-Options: DENY`;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: strict-origin-when-cross-origin` (reCAPTCHA needs the origin);
- a restrictive `Permissions-Policy`;
- `Cross-Origin-Opener-Policy: same-origin-allow-popups`.

`X-Powered-By` is disabled.

`script-src` keeps `'unsafe-inline'`: Next.js App Router hydration requires it unless a per-request nonce is added via middleware, and a nonce forces every page to render dynamically. Tightening this with a nonce is a possible follow-up.

The HSTS `preload` directive is only a request. Submit the domain to hstspreload.org only if every subdomain of that domain is HTTPS-only.
