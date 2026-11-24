# Frontend release safety activation

The repository provides two fail-closed validation paths:

```bash
npm run validate:release
npm run validate:staging
```

`validate:staging` performs deployed frontend/backend smoke checks, CORS validation, live compatibility tests, writes `artifacts/frontend-backend-compatibility.json` only after those tests pass, and runs deployed Playwright. A successful workflow then writes `artifacts/release-record.json`.

The live suite sends invalid request bodies to `POST /intake` and `POST /portal/check-email` and requires a 400/422 error contract, so it exercises the deployed routes without intentionally creating persistent records. Live successful registration is excluded because it creates persistent authentication state; both registration result shapes remain covered by deterministic service and contract tests.

## Required GitHub configuration

Repository or environment variables:

- `AWS_REGION`
- `AWS_ROLE_ARN`
- `ECR_REPOSITORY`
- `STAGING_EC2_INSTANCE_ID`
- `STAGING_FRONTEND_URL`
- `STAGING_BACKEND_URL`
- `STAGING_CASE_ID`
- `BACKEND_SHA`
- `BACKEND_IMAGE_DIGEST`
- `PRODUCTION_EC2_INSTANCE_ID`
- `PRODUCTION_FRONTEND_URL`
- `PRODUCTION_BACKEND_URL`
- `PRODUCTION_CASE_ID`

Secrets:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `STAGING_ACCESS_TOKEN`

The `staging` and `production` GitHub Environments must be created before deployment jobs are enabled. Production promotion is default-off and available only through `workflow_dispatch` with `promote_to_production=true`.

The frontend image is built once with the same-origin backend proxy enabled. Staging and production inject their backend URL through the container's runtime `API_URL`, allowing both environments to deploy the same immutable frontend image digest.
