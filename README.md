# haa-frontend

Frontend for the HAA (Help After Accident) platform. A mobile-first, bilingual (English/Spanish) intake form that connects accident claimants with doctors and lawyers via QR code or referral link.

## Tech Stack

- **Next.js 16** — App Router, server components
- **TypeScript**
- **Tailwind CSS** + **shadcn/ui** — styling and components
- **next-intl** — English/Spanish localization with prefix-based routing (`/en`, `/es`)
- **Supabase** — Auth (phone OTP, currently mocked on the frontend pending SMS provider setup), file uploads to Storage

Intake forms use plain React state with manual validation (not react-hook-form/zod) — see `src/components/ui/floating-input.tsx` and `floating-select.tsx` for the shared field pattern.

## Project Structure

```
src/
  app/
    [locale]/
      get-help/            ← language picker / entry point
      intake/               ← claimant intake flow (see Intake Form Flow below)
        splash/              ← timed auto-navigate screen
        choose-attorney/, hire-attorney/, you-are-connected/
      case/[submissionId]/   ← claimant case status view (public, by ID)
      auth/                  ← login, sign-up, password flows
      onboarding/lawyer/, portal/  ← NOT READY — blocked at the middleware level (see Architecture)
  components/
    layout/               ← StatusBarPlaceholder, ScreenHeader, ScreenFooter (shared page shell)
    name/, phone/, otp/   ← shared multi-use screens (intake + lawyer onboarding)
    ui/                   ← shadcn components + FloatingInput/FloatingSelect field primitives
    location-input.tsx    ← shared location autosuggest + "use current location" (Google Maps)
    dropzone.tsx           ← file upload UI (Supabase Storage)
  hooks/
    use-require-session-key.ts  ← guards intake pages against being loaded out of order
    use-supabase-upload.ts
  services/
    intake.ts             ← service layer (calls backend API)
  types/
    intake.ts             ← shared constants (incident types, roles) + UploadedFile type
  i18n/
    locales.ts            ← supported locales (en, es)
    routing.ts            ← next-intl routing config
  proxy.ts                ← root middleware: locale routing, auth refresh, blocks unfinished routes
messages/
  en.json                 ← English translations (project root, not inside src/)
  es.json                 ← Spanish translations (project root, not inside src/)
```

## Setup

**Prerequisites**
- Node.js 26.11.1 (the version in `.nvmrc`, used by CI and the Docker image)
- The [haa-backend](../haa-backend) server running on port 4000

**1. Install dependencies**
```bash
npm install
```

**2. Configure environment**
```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```env
# Supabase — Dashboard → Settings → API → Project URL
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co

# Supabase — Dashboard → Settings → API → Project API keys → publishable
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key

# Backend API — must match PORT in haa-backend/.env
NEXT_PUBLIC_API_URL=http://localhost:4000

# Google Maps API key — used for location autosuggest and reverse geocoding
# Enable Places API and Geocoding API in Google Cloud for this key.
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-api-key

# Optional: enables staging password gate at /access (middleware-protected)
# Gate only activates in non-DEV/non-PROD environments.
STAGING_GATE_PASSWORD=your-staging-password

# Primary environment selector for gate behavior.
# PROD / production: gate bypassed
# DEV / development: gate bypassed
# TEST / staging / other: gate can run when STAGING_GATE_PASSWORD is set
APP_ENV=TEST
```

### Optional staging access gate

Set `STAGING_GATE_PASSWORD` in your staging/test environment when you want a lightweight password wall for stakeholder testing.

- Gate is enabled only when both are true:
  - `STAGING_GATE_PASSWORD` is set
  - `APP_ENV` is not `PROD`/`production` and not `DEV`/`development`
- In `PROD`/`production` and `DEV`/`development`, `/access` is bypassed and the app loads normally.
- This is suitable for staging/demo access, but not a replacement for enterprise SSO.

#### Environment matrix

| Environment | `APP_ENV` value | `STAGING_GATE_PASSWORD` | Gate behavior |
|---|---|---|---|
| Local development | `DEV` or `development` | unset | Disabled (no `/access` gate) |
| Staging / test | `TEST` / `staging` / other non-dev/non-prod value | set | Enabled (redirect to `/access` until unlocked) |
| Production | `PROD` or `production` | unset (recommended) | Disabled |

If production accidentally has `STAGING_GATE_PASSWORD` set, the gate is still bypassed while `APP_ENV` is `PROD`/`production`.

**3. Start the backend** (in a separate terminal, from the `haa-backend` folder)
```bash
npm run dev
```

**4. Run the frontend dev server**
```bash
npm run dev
```

App runs at [http://localhost:3000](http://localhost:3000).

## Docker

The frontend image uses Next.js [standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output) for a minimal production build.

`NEXT_PUBLIC_*` variables are baked into the image at build time (they ship to the browser). Pass them as build args:

```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key \
  --build-arg NEXT_PUBLIC_API_URL=https://yourdomain.com/api \
  --build-arg NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-api-key \
  -t haa-frontend .
```

Run the container:
```bash
docker run -p 3000:3000 haa-frontend
```

Or use the root-level `docker-compose.yml` to run both services together — see [Running with Docker Compose](#running-with-docker-compose).

## Running with Docker Compose

From the repository root (`GoMAXPAIN-Software/`):

```bash
# 1. Create a root .env file for compose build args
cat > .env << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=https://yourdomain.com/api
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
STAGING_GATE_PASSWORD=your-staging-password
EOF

# 2. Ensure haa-frontend/.env.local and haa-backend/.env are populated

# 3. Build and start both containers
docker compose up -d --build
```

For hosted staging deployments (Vercel, ECS task definition env vars, etc.), set `STAGING_GATE_PASSWORD` as an environment secret in the staging environment. Do not set it in production unless you intentionally want to gate production behind `/access`.

Frontend → http://localhost:3000  
Backend → http://localhost:4000

## Key Routes

| Route | Description |
|---|---|
| `/en/get-help` | Language picker / entry point (English) |
| `/es/get-help` | Language picker / entry point (Spanish) |
| `/en/intake` | Start of the intake flow (name step) |
| `/en/intake/connected` | Attorney connection confirmation |
| `/en/case/{submissionId}` | Claimant case status view (public, non-sensitive info) |
| `/api/version` | Which build is deployed here — version, commit, environment |
| `/health` | Liveness, used by the container health check |

`/onboarding/lawyer/*` and `/portal/*` are intentionally blocked (404) at the middleware level — see [Architecture](#architecture). Their code exists for future work but isn't reachable yet.

## Intake Form Flow

The intake flow is a linear sequence of single-purpose pages, each writing its answer to `sessionStorage` under an `intake_*` key before advancing. Every page (past the first) uses `useRequireSessionKey` to bounce a user back into the flow if they try to load it directly without completing the prior step.

```
intake (name) → incident → location → phone → otp
  → [existing phone number] → choose-attorney → hire-attorney → connected
  → [new phone number] → reassurance → choose-path → tell → residence → treatment-area
     → role → who-was-with-you → protect-case → evidence → review → ready
     → choose-attorney → hire-attorney → connected
```

**Two backend calls for a new claimant, one for a returning one:**

1. **`POST /intake/start`** — fired right after OTP verification, with everything gathered so far (name, incident type/location, phone, email). If the phone number already has a claimant, the response is `{ existing: true }` and the frontend skips straight to `choose-attorney` — no merge/resume logic yet, by design. Otherwise the backend creates the claimant + a partial submission and returns a `submissionId`.
2. **`POST /intake/complete`** — fired from the review submit step, with everything gathered since `/start` (role, description, injuries, uploaded documents, residence, treatment area, who-was-with-you companions). Marks the submission `submitted`.

OTP verification for intake now delegates to the backend `POST /intake/verify-otp` contract via `verifyOtp(phone, code)` in the frontend service layer; there is no hardcoded OTP value in `src/app/[locale]/intake/otp/page.tsx`.

## Supabase Setup

### Storage Bucket

1. Go to **Storage** in your Supabase dashboard
2. Create a new bucket named **`submissions`**
3. Set it to **Private** (not public)

### RLS Policy for Anonymous Uploads

Run this in **SQL Editor** (Dashboard → SQL Editor):

```sql
CREATE POLICY "Allow all uploads to submissions"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (bucket_id = 'submissions');
```

> **Note:** The standard `TO anon` role does not work with the newer `sb_publishable_*` key format. Use `TO public` to cover all roles.

### Avatar Storage (Ambassador Profiles)

Avatar schema and policy SQL are owned by the backend project migrations.
Use [haa-backend](../haa-backend) and run:

```bash
npm run db:migrate
npm run db:provision-storage
```

The profile avatar path format is `ambassadors/{auth.uid()}/avatar.{ext}`.

### Database Tables

The backend handles table creation via `npm run db:migrate` (see [haa-backend](../haa-backend)). Since the app is pre-first-release, schema changes are made directly in the migration SQL rather than via incremental migrations. Tables:

- `claimants` — identity, one row per phone number (`mobile` is unique). `user_id` is a nullable FK to `auth.users`, reserved for once real phone auth is wired up — currently always null since OTP is mocked.
- `intake_submissions` — one row per accident/case; many can belong to the same claimant (`claimant_id`). Holds `status` (`in_progress`/`submitted`), `treatment_area`, and `communication_consent` (currently hardcoded `true`, no real consent checkbox yet).
- `accidents` — incident details per submission (`incident_type`, `incident_location`, `description`, `role`).
- `documents` — uploaded file metadata (files live in Storage).
- `lawyers` — profile data for the (not-yet-reachable) lawyer onboarding flow.

## Architecture

The frontend never calls Supabase directly for business data. All intake submissions go through `src/services/intake.ts` (`startIntake`/`completeIntake`), which calls the backend API. This makes it easy to swap backends without touching any component code.

File uploads go directly to Supabase Storage (infrastructure concern, not business logic).

`src/proxy.ts` is the app's single middleware entry point: it blocks `/onboarding/lawyer/*` and `/portal/*` (rewritten to a 404, since those flows aren't ready for users yet), refreshes the Supabase auth session, and hands off to `next-intl` for locale routing.

## Scripts

```bash
npm run dev            # development server
npm run build          # production build
npm run lint           # ESLint
npm run format         # Prettier
npm run version:print      # the public version of the checked-out commit, e.g. 0.1.0-rc8
npm run version:build-tag  # its internal build tag, e.g. 0.1.0-rc8.95
npm run test:version   # version derivation, build metadata and /api/version
```

## Versioning and deployment traceability

Every image answers three questions without a database lookup: which release it is, which commit it
was built from, and which environment it is running in.

```bash
curl -s https://beta.helpafteraccident.com/api/version
{
  "application": "haa-frontend",
  "version": "0.1.0-rc8",
  "gitSha": "2c2ba80cc8b7ba974e81a571d8cb899fd4192d6c",
  "environment": "beta",
  "buildId": "gha-17482912-1",
  "builtAt": "2026-09-22T09:15:00.000Z",
  "imageDigest": "sha256:…"
}
```

### Version format

The public version is the `version` field of `package.json`, exactly as written:
`MAJOR.MINOR.PATCH-rcN` for a release candidate, `MAJOR.MINOR.PATCH-beta` for the public beta, and
`MAJOR.MINOR.PATCH` for a release — `0.1.0-rc8`, then `0.1.0-rc9`, `0.1.0-rc10`, the public beta `0.1.0-beta`,
and eventually `0.1.0`. It is what `/api/version` reports, and it is the same for
every build of a release candidate. The environment is deliberately **not** part of it: one immutable
image is promoted from alpha to beta to production carrying the same version and commit, and reports a
different `environment` in each.

To cut the next release candidate, change `version` in `package.json` (rc8 → rc9) in its own commit.
`HAA_APP_VERSION` overrides it for a build that has to be labelled by hand, and is held to the same
format. The candidate is written `rcN` without a dot; semver compares that as text (rc10 sorts before
rc9, and beta before rc10), and nothing in this pipeline sorts versions.

The **build number** is internal and is never part of the public version. It counts commits from the
one that set the current version up to the commit being built, so the bump commit is build 1 and the
count restarts with every release candidate. Nobody edits it, and two people building the same commit
get the same answer. CI tags each image with its commit SHA and with the build tag
`<version>.<build number>` (`npm run version:build-tag`, e.g. `0.1.0-rc8.95`), and records the build
tag as the image label `com.helpafteraccident.build-tag`, so an image always traces to one commit.
Deriving the number needs full history, so CI checks out with `fetch-depth: 0`; a shallow clone fails
loudly unless `HAA_BUILD_NUMBER` is set.

**haa-backend versions independently.** Both repositories use this scheme, each with its own
`package.json` version and its own build count. They are on the same release candidate today, but a
deployment is described by both endpoints together, never by one number.

### Build metadata

Supplied to `docker build` and inlined into the bundle — the container never runs git and never needs
the repository. `src/lib/build-info.ts` reads them back:

| Build argument | Example |
|---|---|
| `NEXT_PUBLIC_APP_VERSION` | `0.1.0-rc8` |
| `NEXT_PUBLIC_FRONTEND_SHA` | `2c2ba80c…` (40 hex) |
| `NEXT_PUBLIC_BUILD_ID` | `gha-17482912-1` |
| `NEXT_PUBLIC_BUILT_AT` | `2026-09-22T09:15:00Z` |

### Deployment configuration

Set where the container runs, never at build time:

| Variable | Values |
|---|---|
| `HAA_ENVIRONMENT` | `local`, `alpha`, `beta`, `staging`, `production` |
| `HAA_IMAGE_DIGEST` | the ECR digest the container was started from (optional) |

Anything absent or malformed reads as `"unknown"` rather than being echoed back, so a container
started without configuration says so instead of inventing an answer.

### ECR tags

Each build pushes the **same image** under two tags, and neither is `latest`:

```
haa-frontend:0.1.0-rc8.95                                 # how a human asks for it (build tag)
haa-frontend:2c2ba80cc8b7ba974e81a571d8cb899fd4192d6c     # source traceability, used by deployments
```

The digest (`sha256:…`) is resolved after the push and recorded in the workflow summary, so version,
commit and digest are readable together without querying the registry. Production deploys by digest;
the version tag is a convenience, not the deployment identity.

### Reading a deployment

```bash
curl -s https://haaaaaaaa.com/api/version               # alpha, frontend
curl -s https://haaaaaaaa.com/api/backend/version       # alpha, backend
curl -s https://beta.helpafteraccident.com/api/version  # beta, frontend
```

The running environment is the source of truth. The newest image in ECR is not necessarily the one
deployed anywhere.

## Purge Dub Domain Links

Use `scripts/purge-dub-domain-links.mjs` to list and optionally delete all Dub link records for a specific domain.

What it does:

- Queries Dub links for a domain (including archived links by default)
- Supports dry-run mode to preview links before deletion
- Deletes links in batches when run with execute mode
- Reads `DUB_API_KEY` from environment, `.env.local`, or `.env`

What it does not do:

- It does **not** delete the Dub domain itself
- It does **not** change primary domain settings, DNS, or domain ownership

Run a preview first:

```bash
npm run dub:purge-domain-links -- --domain go.helpafteraccident.com --dry-run
```

Delete matching links:

```bash
npm run dub:purge-domain-links -- --domain go.helpafteraccident.com --execute --yes
```

Optional flags:

- `--exclude-archived` to skip archived links
- `--page-size <1-100>` to control list page size
- `--batch-size <1-100>` to control bulk delete batch size

Notes:

- Default mode is dry-run for safety
- Deletion is irreversible
- If links belong to a different Dub workspace, your API key may be unable to delete them

## Localization

All UI strings live in `messages/en.json` and `messages/es.json`. Every new string must be added to both files. The locale is determined by the URL prefix (`/en/` or `/es/`).

QR codes point to `/en/get-help` or `/es/get-help` — users are automatically kept in their locale throughout the flow.

## Developer Notes

### UI Components

This project uses **shadcn/ui** as the sole component library. Before building any new UI element:

1. Check if a shadcn component already exists: [ui.shadcn.com/docs/components](https://ui.shadcn.com/docs/components)
2. Install it with: `npx shadcn add <component-name>`
3. It will be added to `src/components/ui/`

**Do not install third-party UI libraries** (e.g. Material UI, Chakra, Ant Design, Radix directly). All components must use shadcn/ui to keep the design language consistent. If a shadcn component doesn't exist for your use case, build it using the existing shadcn primitives and Tailwind CSS.
