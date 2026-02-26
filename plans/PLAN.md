# Passkey Documentation Upgrade (Backend + Frontend)

## Summary
Create a clear, implementation-focused passkey documentation set in two places:
1. Backend/API contract docs in [api_documentation.md](E:/projects/project_ftt_frontend/api_documentation.md).
2. Frontend integration guide in [docs/passkey_frontend_integration.md](E:/projects/project_ftt_frontend/docs/passkey_frontend_integration.md).

This will document your custom recovery endpoints as primary (`/auth/recovery/passkey/start/` and `/auth/recovery/passkey/finish-reset/`) and make frontend implementation unambiguous for Svelte/Tauri developers.

## Scope and File Changes
1. Expand [api_documentation.md](E:/projects/project_ftt_frontend/api_documentation.md) with a new `Authentication & Recovery API` section.
2. Add [passkey_frontend_integration.md](E:/projects/project_ftt_frontend/docs/passkey_frontend_integration.md) as the frontend passkey playbook.
3. Add links in [README.md](E:/projects/project_ftt_frontend/README.md) to both API passkey section and frontend guide.
4. Keep [plans/recovery_plan.md](E:/projects/project_ftt_frontend/plans/recovery_plan.md) as architectural context and link to it from the new frontend guide as “design background.”

## Backend Documentation Content (API Reference)
1. Add `## Authentication & Recovery API` in [api_documentation.md](E:/projects/project_ftt_frontend/api_documentation.md).
2. Add `### Passkey Recovery Overview`:
- What passkeys solve in your no-email/no-phone model.
- Recovery flow summary: start challenge -> WebAuthn assertion -> finish reset.
3. Add `### Start Passkey Challenge` for `POST /auth/recovery/passkey/start/`:
- Request schema, example JSON.
- Response schema using JSON-safe/base64url fields.
- Anti-enumeration behavior note.
4. Add `### Finish Passkey Recovery + Password Reset` for `POST /auth/recovery/passkey/finish-reset/`:
- Request schema including credential payload and `new_password`.
- Success and generic failure responses.
- Token invalidation behavior after successful reset.
5. Add `### Passkey Payload Schemas`:
- `PublicKeyCredentialRequestOptions` wire format.
- `PublicKeyCredential` assertion response format expected by backend.
- Field-by-field table for `id`, `rawId`, `response.authenticatorData`, `clientDataJSON`, `signature`, `userHandle`.
6. Add `### Error Matrix`:
- `400` validation/generic recovery failed.
- `401` if endpoint requires token (if applicable).
- `404` not used for enumeration-sensitive flows.
- `429` throttle exceeded.
7. Add `### Security and Operational Notes`:
- RP ID and origin constraints.
- Challenge TTL and one-time use.
- Rate limits/lockout guidance.
- Logging/audit fields without secrets.

## Frontend Documentation Content (Integration Guide)
1. Add `# Passkey Frontend Integration Guide` in [docs/passkey_frontend_integration.md](E:/projects/project_ftt_frontend/docs/passkey_frontend_integration.md).
2. Add `## Prerequisites`:
- Secure context requirement (`https` or localhost).
- Browser/WebView support caveats for Tauri.
- Backend RP ID/origin alignment requirements.
3. Add `## Data Conversion Helpers`:
- Base64url encode/decode helpers.
- Exact fields that must be converted to/from `ArrayBuffer`.
4. Add `## Recovery Flow (Step-by-Step)`:
- Call `start` endpoint with username.
- Build `navigator.credentials.get({ publicKey })`.
- Serialize credential to JSON-safe payload.
- Call `finish-reset` endpoint with `new_password`.
- Handle success/failure UX states.
5. Add `## Suggested Client API Surface` matching [src/lib/api.ts](E:/projects/project_ftt_frontend/src/lib/api.ts):
- `auth.startPasskeyRecovery(username)`.
- `auth.finishPasskeyRecovery(username, credential, newPassword)`.
6. Add `## UI/UX Guidance` for login page integration in [src/routes/+page.svelte](E:/projects/project_ftt_frontend/src/routes/+page.svelte):
- Where to place “Recover with Passkey.”
- User-safe error messages.
- Fallback path to recovery codes/legacy token.
7. Add `## Troubleshooting`:
- “NotAllowedError”, RP ID mismatch, insecure context, unsupported browser, and timeout cases.
8. Add `## Manual Test Checklist`:
- Happy path, canceled prompt, invalid assertion, expired challenge, throttling behavior.

## Public APIs / Interfaces to Document Explicitly
1. `POST /auth/recovery/passkey/start/`
- Request: `{ "username": "string" }`
- Response: challenge options object with base64url-encoded binary fields.
2. `POST /auth/recovery/passkey/finish-reset/`
- Request: `{ "username": "string", "credential": { ... }, "new_password": "string" }`
- Response: `{ "status": "password_reset" }`
3. Frontend wire types to define in docs:
- `PasskeyStartResponse`
- `SerializedPasskeyCredential`
- `PasskeyFinishRequest`

## Test Cases and Validation Scenarios
1. All JSON examples in docs are syntactically valid.
2. Endpoint examples are consistent with the custom recovery API in [plans/recovery_plan.md](E:/projects/project_ftt_frontend/plans/recovery_plan.md).
3. Frontend snippet flow matches current auth architecture in [src/lib/auth-context.ts](E:/projects/project_ftt_frontend/src/lib/auth-context.ts) and [src/lib/api.ts](E:/projects/project_ftt_frontend/src/lib/api.ts).
4. README links resolve to the new section/file paths.
5. Security notes include anti-enumeration and throttling expectations.

## Assumptions and Defaults
1. Primary API flavor is your custom recovery API (not Djoser endpoint names).
2. Documentation depth is implementation guide level (not full protocol spec).
3. No backend code changes are included in this pass; this is documentation-first.
4. Existing recovery architecture in [plans/recovery_plan.md](E:/projects/project_ftt_frontend/plans/recovery_plan.md) is the source of truth for endpoint intent.
5. Standards references used for correctness baseline: W3C WebAuthn Level 3, MDN Web Authentication API, OWASP/NIST account recovery guidance.
