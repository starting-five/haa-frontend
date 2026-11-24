// shared timing constants used across pages
export const SPLASH_DURATION_MS = 2500;
export const STEP_SELECTION_ADVANCE_DELAY_MS = 200;
export const SUPPORT_PHONE_DISPLAY = "+1 888-880-4357";
export const SUPPORT_PHONE_TEL = "tel:+18888804357";
export const SUPPORT_PHONE_SMS = "sms:+18888804357";
export const SUPPORT_EMAIL = "help@helpafteraccident.com";
export const SUPPORT_EMAIL_MAILTO = `mailto:${SUPPORT_EMAIL}`;
export const HAA_WEBSITE_URL = "https://helpafteraccident.com/";
export const PRIVACY_POLICY_URL = "https://helpafteraccident.com/privacy-policy/index.html";
export const TERMS_URL = "https://helpafteraccident.com/terms/index.html";

// Ids that arrive in a URL — a review link's claimant and case, a file its page
// opens — are UUIDs; anything else is refused before it reaches the backend.
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Whether the agreement screen opens the DocuSign ceremony. While it is false
// the screen asks the backend for nothing and shows its signing notice with a
// Continue that goes to the Connected screen (Figma 1968:3072), which then does
// not wait for a completed agreement — so the patient is never blocked, but no
// agreement is signed. The backend, the ceremony, locale selection and agreement
// persistence are untouched either way; this flag only decides whether the
// ceremony is launched.
//
// It was set false on 2026-09-10 because the Sandbox account had reached its
// cumulative recipient limit and answered every envelope creation with
// RECIPIENT_LIMIT_EXCEEDED. That limit is a rolling window and has since
// recovered: on 2026-09-17 the full chain was re-verified against the same
// account — envelope 201, recipient view 201 with a demo.docusign.net signing
// URL — so the launch is on again.
//
// If the Sandbox hits the cap again the symptom is the signingCapacity notice,
// not this one; set this to false to stop asking, and see
// _REVIEW-DOCS/docusign-launch.md before turning it back on.
export const DOCUSIGN_LAUNCH_ENABLED = true;

export const INJURY_OPTIONS = ["headNeck", "upperBody", "back", "lowerBody", "somewhereElse"] as const;

export type InjuryOptionKey = (typeof INJURY_OPTIONS)[number];

export const INJURY_TYPE_OPTIONS = [
  "painSoreness",
  "cutsBruises",
  "swelling",
  "burn",
  "fractureBrokenBone",
  "concussionHeadInjury",
  "other",
  "notSure",
] as const;

export type InjuryTypeOptionKey = (typeof INJURY_TYPE_OPTIONS)[number];

export const AMBASSADOR_ROLE_KEYS = [
  "influencer",
  "communityLeader",
  "marketer",
  "dj",
  "promoter",
  "artist",
  "everydayHero",
  "other",
] as const;

export type AmbassadorRoleKey = (typeof AMBASSADOR_ROLE_KEYS)[number];
