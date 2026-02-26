# Account Recovery Without Email/Phone (Recovery Codes + Passkey + Legacy Admin Fallback)

## Summary
- Build self-service recovery around one-time offline recovery codes (primary) and passkeys (secondary).
- Use a soft-prompt enrollment policy: users can skip initially, but are repeatedly prompted to enroll.
- Add a restricted admin-assisted fallback only for legacy users who never enrolled.
- Keep responses non-enumerable and heavily rate-limited per OWASP/NIST guidance.

## Current State Verified
- Frontend auth uses token login at `/auth/token/login/` and user endpoints at `/auth/users/...` in [api.ts](E:/projects/project_ftt_frontend/src/lib/api.ts).
- Login/register UI exists, but no forgot-password/recovery flow in [+page.svelte](E:/projects/project_ftt_frontend/src/routes/+page.svelte).
- Profile page has account-edit UI but no security/recovery section in [+page.svelte](E:/projects/project_ftt_frontend/src/routes/profile/+page.svelte).
- `api_documentation.md` currently has no auth/recovery section despite README claiming auth docs in [api_documentation.md](E:/projects/project_ftt_frontend/api_documentation.md).
- Backend API source is not in this repo, so backend work below targets the external Django/DRF service.

## Public API Changes (Decision-Complete Contract)

### New backend endpoints
1. `GET /auth/recovery/status/` (auth required)
- Response:
```json
{
  "has_recovery_codes": true,
  "recovery_codes_remaining": 7,
  "has_passkey": false,
  "recovery_setup_completed": false,
  "prompt_snooze_until": "2026-03-04T00:00:00Z",
  "legacy_fallback_allowed": false
}
```

2. `POST /auth/recovery/codes/generate/` (auth required)
- Request: `{"confirm_password":"...","count":10}`
- Response returns plaintext codes once:
```json
{"codes":["ABCD-EFGH-JKLM", "..."], "generated_at":"..."}
```
- Behavior: invalidate all previous unused recovery codes for that user.

3. `POST /auth/recovery/codes/regenerate/` (auth required)
- Same contract/behavior as generate, plus audit event.

4. `POST /auth/recovery/prompt/snooze/` (auth required)
- Request: `{"days":7}` (server clamps 1..30)
- Response: `{"prompt_snooze_until":"..."}`

5. `POST /auth/recovery/codes/verify-reset/` (public)
- Request: `{"username":"...","recovery_code":"...","new_password":"..."}`
- Response on success: `{"status":"password_reset","login_hint":"use new password"}`
- Response on failure: generic 400 `{"detail":"Recovery failed"}` with indistinguishable body/timing.

6. `POST /auth/recovery/passkey/start/` (public)
- Request: `{"username":"..."}`
- Response: WebAuthn challenge payload (or fake-equivalent shape for non-existing users).

7. `POST /auth/recovery/passkey/finish-reset/` (public)
- Request: `{"username":"...","credential":{...},"new_password":"..."}`
- Response on success: `{"status":"password_reset"}`

8. `POST /auth/recovery/admin/issue-legacy-token/` (staff-only)
- Request: `{"username":"...","reason":"legacy_no_enrollment"}`
- Response: `{"legacy_token":"XXXX-XXXX-XXXX","expires_at":"..."}` (shown once)

9. `POST /auth/recovery/legacy/verify-reset/` (public)
- Request: `{"username":"...","legacy_token":"...","new_password":"..."}`
- Response on success: `{"status":"password_reset"}`

### Existing endpoint behavior change
- After any successful recovery reset, invalidate all existing auth tokens for that user (force re-login).

### Frontend API interface additions
- Add methods/types in [api.ts](E:/projects/project_ftt_frontend/src/lib/api.ts):
- `auth.getRecoveryStatus()`
- `auth.generateRecoveryCodes(confirmPassword)`
- `auth.regenerateRecoveryCodes(confirmPassword)`
- `auth.snoozeRecoveryPrompt(days)`
- `auth.recoverWithCode(username, code, newPassword)`
- `auth.startPasskeyRecovery(username)`
- `auth.finishPasskeyRecovery(username, credential, newPassword)`
- `auth.recoverWithLegacyToken(username, token, newPassword)`

## Backend Implementation Design

### Data model
1. `UserRecoveryProfile` (one-to-one user)
- `recovery_setup_completed_at`
- `prompt_snooze_until`
- `legacy_fallback_allowed` (true until enrolled once)

2. `RecoveryCode`
- `user`
- `code_hash` (Django password hasher)
- `code_prefix` (display/audit only, last 4 or first block)
- `created_at`, `used_at`, `revoked_at`
- `attempts` (optional per-code)

3. `RecoveryEvent` (audit)
- `user` nullable
- `event_type` (`generate`, `regenerate`, `verify_fail`, `verify_success`, `legacy_issue`, etc.)
- `ip`, `user_agent`, `created_at`, `metadata`

4. `LegacyRecoveryToken`
- `user`
- `token_hash`
- `expires_at`
- `used_at`
- `issued_by`

### Core rules
- Recovery codes are single-use, hashed at rest, and shown only at creation.
- Code generation requires authenticated confirmation (`confirm_password`) to prevent token theft abuse.
- Password reset through recovery requires strong password validation (reuse existing Django validators).
- On success: rotate password, revoke tokens, mark recovery code used, create audit event, optionally push in-app notification.

### Security controls
- Generic error body and similar response timing for all recovery failures.
- DRF throttles:
- per-IP: strict for public recovery endpoints.
- per-username: custom throttle/cache key to prevent targeted guessing.
- Temporary lockouts after repeated failures.
- Never log plaintext recovery codes/tokens.
- Use secure randomness for code generation and short expiries for legacy tokens.
- Admin legacy endpoint requires staff permission and audit trail.

## Frontend Implementation Design

### Login page
- In [+page.svelte](E:/projects/project_ftt_frontend/src/routes/+page.svelte), add “Forgot password?” action.
- Open a recovery modal with three methods:
- `Recovery code`
- `Passkey`
- `Legacy support token`
- Keep all server errors mapped to generic copy for anti-enumeration.

### Profile security section
- In [profile +page.svelte](E:/projects/project_ftt_frontend/src/routes/profile/+page.svelte), add “Account Recovery” card:
- status badges (codes configured, passkey configured)
- generate/regenerate codes flow (download/copy once confirmation)
- passkey enroll/remove actions
- “Last updated” and remaining code count

### Soft prompt enrollment
- After login in [auth-context.ts](E:/projects/project_ftt_frontend/src/lib/auth-context.ts), fetch recovery status.
- If not enrolled and not snoozed, show dismissible prompt on dashboard/layout with:
- `Set up now`
- `Remind me later (7 days)`

### Feature-flagged rollout
- Add flags: `account-recovery-ui`, `account-recovery-backend` in [PROJECT_FEATURE_FLAGS.md](E:/projects/project_ftt_frontend/PROJECT_FEATURE_FLAGS.md).
- Hide all UI unless flag is enabled (fail-secure).

## Documentation Changes
- Expand [api_documentation.md](E:/projects/project_ftt_frontend/api_documentation.md):
- Add missing auth section (existing login/register/me endpoints).
- Add full recovery section with request/response, throttling, and security notes.
- Add legacy fallback operational policy and deprecation timeline.

## Tests and Acceptance Criteria

### Backend tests
1. Recovery code generation stores only hash and returns plaintext once.
2. Used recovery code cannot be reused.
3. Recovery with invalid username/code returns generic failure and non-enumerable response shape.
4. Successful recovery changes password and invalidates all prior tokens.
5. Throttling and lockout behavior triggers correctly.
6. Admin legacy token endpoint enforces staff-only access.
7. Legacy token expires and is single-use.
8. Passkey start/finish flows validate challenge and fail safely.

### Frontend tests
1. Forgot-password modal appears and submits each flow.
2. Recovery setup card renders correctly in profile.
3. Soft prompt appears for non-enrolled users and snooze suppresses it until expiry.
4. Passkey option auto-hides when `PublicKeyCredential` unavailable.
5. Generic error messaging is preserved for failure paths.

### UAT scenarios
1. Enrolled user recovers account with a recovery code and logs in with new password.
2. User recovers via passkey path and sets new password.
3. Legacy locked-out user recovers through admin-issued token.
4. Attacker attempts username enumeration and receives indistinguishable responses.

## Rollout Plan
1. Ship backend models + endpoints behind `account-recovery-backend` flag.
2. Ship frontend UI behind `account-recovery-ui` flag.
3. Enable for internal users first; monitor failure/success rates and throttle hits.
4. Enable for all users.
5. After adoption window, disable `legacy_fallback_allowed` for users who have enrolled.

## Assumptions and Defaults Chosen
- Selected by you:
- Recovery mode: `Codes + Passkey`.
- Enrollment policy: `Soft Prompt`.
- Legacy strategy: `Admin Fallback`.
- Backend is Django/DRF with Djoser-like auth conventions.
- Context7 tool is not available in this environment; plan is based on repo inspection plus web primary sources.

## External References
- OWASP Forgot Password Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
- NIST SP 800-63B (Account recovery guidance): https://pages.nist.gov/800-63-4/sp800-63b.html
- Djoser base endpoints: https://djoser.readthedocs.io/en/latest/base_endpoints.html
- Djoser WebAuthn endpoints: https://djoser.readthedocs.io/en/latest/webauthn.html
- DRF Throttling: https://www.django-rest-framework.org/api-guide/throttling/
- Django password hashers: https://docs.djangoproject.com/en/dev/topics/auth/passwords/
- django-otp static tokens (backup code concept): https://django-otp-official.readthedocs.io/en/stable/overview.html
- Tauri Stronghold plugin (secure local secret storage): https://v2.tauri.app/plugin/stronghold/
