# Help After Accident — Release Notes

**Release version:** v0.1.0-beta

## Overview

This first version of HelpAfterAccident beta delivers a mobile-first, bilingual experience that helps injured people get from incident intake to the next legal step, while enabling ambassadors to promote HAA and refer potential clients through dedicated sharing and referral tools.

## Release Scope

### 1) Guided patient intake flow (end-to-end)
- Multi-step, mobile-first intake journey from entry to submission.
- Structured data capture for incident details, injuries, role, location, and supporting information.
- Session-guarded progression to reduce broken or out-of-order flow states.
- Review-and-submit step that finalizes the intake payload.

### 2) OTP-based verification + backend-integrated submission lifecycle
- OTP verification is wired to backend verification contracts.
- Returning patients are recognized and routed through the correct path.
- New patient flow supports start and complete lifecycle calls to backend services.

### 3) Document upload support
- Evidence/document upload UX is included in intake.
- Uploads are handled through Supabase Storage integration.
- Document metadata and flow state are preserved through review/submit.

### 4) Brand Ambassador experience (onboarding & dashboard)
- Brand Ambassador onboarding and login flow.
- Brand Ambassador dashboard with:
  - profile management
  - activity and performance signals (number of QR scans and link clicks, people helped)
  - link to share various HAA BA info
- Share flow includes personal link, personal message, and QR sharing capabilities.
- People list view to track referred individuals and status progression.

### 5) Admin dashboard
- Centralized admin dashboard providing visibility into all patients and brand ambassadors.
- Patient management tools for capturing and managing intake information when a patient prefers to provide their details by phone rather than through the website.
- Case review workflow for evaluating submitted cases and determining the appropriate next step.
- Case disposition controls to decline cases that are not suitable for further processing or request a signed retainer before referring an eligible case to a lawyer.
- Brand ambassador management with visibility into ambassador activity and the people they have referred.
- Referral tracking to monitor the people connected to each brand ambassador and their progression through the intake process.

### 6) Lawyer Patient Review Page
- Secure review route for legal-side case review.
- Case detail visibility with review decision actions.
- Document/retainer review behavior supporting controlled access patterns.

### 7) Bilingual UX (English / Spanish)
- Locale-based routing and translation coverage for the core product surfaces.
- End-user and ambassador-facing flows support multilingual operation.

### 8) Operational and release-readiness foundations
- Health and version endpoints for runtime visibility.
- Build/version metadata for traceability (version, git SHA, environment, build identifiers).
- Validation coverage across unit, integration, contract, compatibility, and E2E suites.
- Optional staging access gate for stakeholder testing in non-production environments.
