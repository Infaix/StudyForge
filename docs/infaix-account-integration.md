# INFAIX Account integration contract

This repository is prepared for a future INFAIX Account provider. Shared INFAIX login is **not implemented** here.

## Provider boundary

Study server code resolves the caller through `getCurrentStudyIdentity(request)`, returning `StudyIdentity`:

```ts
{ userId: string; email?: string; displayName?: string; roles?: string[] }
```

`legacyStudyAuthProvider` is the current compatibility provider. It verifies the existing HttpOnly `studyforge-session` cookie. The future `InfaixAccountAuthProvider` must implement the same `StudyAuthProvider` contract.

## Required INFAIX provider contract

INFAIX must provide a server-verifiable authenticated identity with a canonical user ID, optional verified email/display name, expiry, revocation behavior, disabled-account behavior, login URL, logout semantics, and an approved return URL contract. Study must receive the verification mechanism and its operational configuration from INFAIX; it must not guess an issuer, audience, key, token format, or cookie name.

## Identity mapping

Migration `0005_external_identities.sql` adds `external_identities`. It maps `(provider, external_user_id)` to an existing Study `users.id` without rewriting sessions, goals, subjects, history, preferences, or XP. Both the external identity and Study user side are unique per provider. Linking must happen only in a trusted, verified server flow; display names, browser input, and unverified email matches are insufficient.

## Login and logout handoff

The future Study login flow may redirect to INFAIX login with a server-generated, allowlisted return destination. Arbitrary `returnTo` URLs are forbidden. Logout must first flush pending/open study time, then follow the canonical INFAIX logout semantics when Study adopts that provider. No cross-product logout is assumed today.

## Invitation boundary

Invitation tokens belong to INFAIX account creation only. Study must never validate invitations as database credentials or require an invitation from an already authenticated INFAIX account.

## Anonymous migration

Anonymous timer segments, recovery state, offline queue, local goals, and grouped history remain Study-local. Existing migration code can later submit them after the verified INFAIX identity resolves to a Study profile. No local keys or current migration behavior are changed by this preparation.

## Database isolation and security

The browser never receives D1 credentials. Study continues to use the server-only `DATABASE` binding for `studyforge-db`; every user-scoped query uses the resolved Study identity. Missing, expired, revoked, malformed, or disabled identities must fail closed.

## Information still required from INFAIX

Before activation, obtain the real session validation protocol, cookie or exchange behavior, identity endpoint/verification contract, canonical ID format, revocation and disabled-user behavior, CORS/origin policy, login/logout URLs, allowlisted return routes, and the migration/linking policy for existing Study users.
