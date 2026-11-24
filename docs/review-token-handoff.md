# Lawyer Review Token Flow Handoff

## Current behavior

- Lawyer review access is token-based. There are no lawyer accounts in this flow: the review link is the lawyer's credential.
- A valid tokenized link sets an HttpOnly cookie holding the link's two ids and its token.
- Invalid/missing token redirects to `/`.
- The review page reads the case from the backend (`POST /portal/review-case`) on every render, with the token from the cookie. It does not read patient tables itself and holds no service-role key.
- **Until the lawyer accepts, the case is anonymized by the backend**: the patient's name, phone, email, address and treatment area, the accident's date and location, the names and contacts of the people with them, and every uploaded file are not sent to the browser at all. The page shows "Shared after you accept" in their place.
- The review page is lawyer-only and supports only Accept Case / Reject Case.

## Link format

Use this URL pattern:

- /en/review/:claimantUserId?submissionId=:submissionId&t=:token

Notes:

- `submissionId` is required for unlock.
- `t` is the canonical token query parameter.
- When `t` is present, the app re-verifies it before allowing access, then removes it from the address bar.
- After a verified link, `/api/review/unlock-link` always redirects to that case's own review page. The destination is built from the verified ids. Only the locale (`/en/` or `/es/`) is read from `next`, so no `next` value can send the browser to another site: absolute, protocol-relative, backslashed and encoded values all land on the review page.
- `/es/review/...` renders the same page in Spanish.

## What the lawyer sees

| | Before acceptance (pending, rejected, expired) | After acceptance |
|---|---|---|
| Patient name, phone, email, residence, treatment area | withheld | shown |
| Accident date and location | withheld | shown |
| Incident type, role, injuries, language | shown | shown |
| The patient's story | shown, with phone numbers and email addresses replaced by `•••` | shown as written |
| People who were with the patient | relation only | name, relation, cell, email |
| Documents and photos | count per category only; no file names, no images, no URLs | every file, through signed URLs valid for one hour (see below) |
| Response deadline | shown with the time left while the review is open | none |

- After acceptance every file opens according to the type Storage serves it with. The type the upload claimed is not used, because the bucket accepts any type.
  - Images (JPEG, PNG, GIF, WebP, BMP) show in the gallery.
  - PDFs open in the browser's viewer ("View document").
  - Anything else is download-only ("Download"). That covers HEIC, SVG, HTML, and a `.pdf` that is really something else.
  - Links open in a new tab with `rel="noopener noreferrer"`.
  - Only files inside the case's own storage folder are ever signed.
- The deadline is the assignment's own expiry (`review_assignments.expires_at`, 14 days after pass-to-lawyer). The page counts it down for display only and locks Accept/Reject when it passes; the backend refuses a late decision independently.
- An expired link shows the masked case and no decision, even if the lawyer had accepted before it expired. A revoked link shows nothing and redirects to `/`.
- **The story is free text.** Phone numbers and email addresses in it are hidden before acceptance, but a name, a street or a date written in words is not. Admins should read the story before passing a case on.

## Frontend routes involved

- [src/app/[locale]/lawyers/review/[userId]/page.tsx](src/app/[locale]/lawyers/review/[userId]/page.tsx)
- [src/app/[locale]/review/[userId]/page.tsx](src/app/[locale]/review/[userId]/page.tsx)
- [src/app/api/review/unlock-link/route.ts](src/app/api/review/unlock-link/route.ts)
- [src/app/api/review/decision/route.ts](src/app/api/review/decision/route.ts)
- [src/lib/review-access.ts](src/lib/review-access.ts) — the cookie
- `getLawyerReviewCase` in [src/services/intake.ts](src/services/intake.ts) — the backend call
- [src/lib/supabase/proxy.ts](src/lib/supabase/proxy.ts)

`portal/review-case`, `portal/review-access/verify` and `portal/review-decision-link` are not on the `/api/backend` proxy's allowlist; only the frontend's server reaches them.

## Admin integration contract (backend)

Admin dashboard should call backend decision endpoint with:

- `claimantUserId`
- `submissionId`
- `action = pass_to_lawyer`

The caller must be in `admin_users`; any other session gets `403 admin_only`.

Expected result:

- backend returns `reviewLink`
- admin copies/sends that link to the law firm

Lawyer actions from the review page use the token cookie and submit:

- `action = accept_case` or `action = reject_case`

The frontend's decision route sends the cookie's ids and token to `POST /portal/review-decision-link`, which finds the assignment by the token. An assignment id is not accepted as a credential.

## DB prerequisites

Backend DB migrations required:

- 017_create_review_workflow_tables.sql
- 018_add_review_token_usage_columns.sql
- 019_add_admin_user_policies.sql (`admin_users`)

## Deploying

The backend and frontend change together. A new frontend needs `POST /portal/review-case`; a new backend refuses decisions that carry no token. Deploy the backend first, then the frontend straight after. Cookies set before the change hold no token, so a lawyer with the review page already open is sent to `/` and must open their link again.

## What admin work still needs to do

- Trigger pass-to-lawyer from admin dashboard.
- Display and copy `reviewLink` from backend response.
- Optionally add regenerate/revoke token controls.

## Release checklist

1. Run backend migration in target environment.
2. Verify admin pass-to-lawyer returns a link with `submissionId` and `t`.
3. Open link in clean browser session and verify access works.
4. Before accepting, verify the page and its network responses carry no patient name, phone, email, address, accident date or location, and no file or image.
5. Tamper token and verify redirect to `/`.
6. Accept, and verify the patient's details and the documents appear.
7. Confirm Accept/Reject updates case status.
