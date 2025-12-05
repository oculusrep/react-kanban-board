# JWT Verification for Edge Functions

## Overview

As of December 2025, Edge Functions use local JWT verification instead of making network calls to Supabase Auth. This improves performance by eliminating round-trip API calls to verify user tokens.

## Changes Made

### 1. Shared JWT Utility (`supabase/functions/_shared/jwt.ts`)

Created a shared utility that:
- Verifies JWT tokens locally using HMAC-SHA256 (HS256)
- Caches the CryptoKey for performance
- Extracts user ID from the JWT `sub` claim

**Exported functions:**
- `verifyJWT(token)` - Verifies and decodes a JWT token
- `getUserIdFromAuthHeader(authHeader)` - Extracts user ID from Authorization header

### 2. Updated `send-site-submit-email` Function

Replaced three instances of:
```typescript
const { data: { user } } = await supabaseClient.auth.getUser(token)
```

With:
```typescript
authUserId = await getUserIdFromAuthHeader(authHeader)
```

The function now queries the `user` table by `auth_user_id` to get user details.

## Required Environment Variable

**`JWT_SECRET`** must be set in Supabase Edge Functions secrets.

### How to Set Up

1. Go to Supabase Dashboard > **Settings** > **API** > **JWT Settings**
2. Copy the **JWT Secret** value
3. Go to **Settings** > **Edge Functions** > **Secrets**
4. Add secret with name `JWT_SECRET` and paste the value

> **Note:** Cannot use `SUPABASE_JWT_SECRET` as the prefix `SUPABASE_` is reserved.

## How It Works

1. Client sends request with `Authorization: Bearer <token>` header
2. Edge Function extracts the token from the header
3. Token is verified locally using the JWT secret (HMAC-SHA256)
4. User ID (`sub` claim) is extracted from the verified token
5. User details are fetched from `user` table using `auth_user_id`

## Troubleshooting

### "JWT_SECRET not configured" error
- Ensure the `JWT_SECRET` environment variable is set in Edge Functions secrets
- Value should match the JWT Secret from Supabase API settings

### "Invalid token" errors
- Check that the JWT secret matches what Supabase Auth uses to sign tokens
- Verify the token hasn't expired
- Ensure you're using the correct JWT secret (not the anon key or service role key)

### User not found after JWT verification
- The `authUserId` from JWT is the `auth.users.id` (Supabase Auth)
- The `user` table lookup uses `auth_user_id` column to match
- Ensure users have their `auth_user_id` populated in the `user` table

## Related Files

- `supabase/functions/_shared/jwt.ts` - Shared JWT verification utility
- `supabase/functions/send-site-submit-email/index.ts` - Uses local JWT verification

## JWT Migration (December 2025)

Supabase migrated to new JWT signing keys. After running the migration in the dashboard:
1. The JWT secret may have changed
2. Update the `JWT_SECRET` in Edge Functions secrets if needed
3. Existing user sessions will continue to work (Supabase handles backward compatibility)
