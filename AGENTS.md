# AGENTS.md

## Repository Purpose

This is the HAA frontend: a mobile-first, bilingual Next.js App Router application for claimant intake, case status, authentication, and referral flows.

## Working Rules

- Use TypeScript and preserve existing Next.js, React, and App Router patterns.
- Keep `/en` and `/es` behavior and translations in sync.
- Reuse components in `src/components/ui` and shared layout components in `src/components/layout`.
- Put API calls in `src/services`; keep route handlers in `src/app/api` thin and focused.
- Prefer existing hooks and utilities over duplicating behavior.
- Do not read, print, modify, or commit `.env.local`, `.env`, credentials, tokens, or private keys.
- Make the smallest change that satisfies the task and do not mix unrelated refactors into it.

## Localization

- Update both `messages/en.json` and `messages/es.json` for user-visible text.
- Verify routes, links, and redirects in both locales.
- Preserve locale prefixes and existing `next-intl` routing conventions.

## Validation

Run the narrowest relevant check first, then broaden when needed:

- `npm run lint`
- `npm run typecheck`
- `npm run test -- <test-pattern>` or `npm run test:unit`
- `npm run test:e2e` for browser flows
- `npm run build` for production integration checks

For release-sensitive changes, also inspect the scripts in `package.json` and use `npm run validate:release` when appropriate.

## Test Conventions

- Put component and hook tests under nearby `__tests__` directories.
- Use Vitest and Testing Library patterns already used in the repository.
- Test behavior and accessible output, not implementation details.
- Mock network and browser boundaries explicitly.
