// Shared JWT verification utilities for Supabase Edge Functions
// Uses local JWT verification with public keys for better performance

import { decode, verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

interface JWTPayload {
  sub: string; // User ID
  email?: string;
  role?: string;
  aud?: string;
  exp?: number;
  iat?: number;
}

interface VerifyResult {
  userId: string;
  email?: string;
  payload: JWTPayload;
}

// Cache for the crypto key to avoid recreating it on every request
let cachedKey: CryptoKey | null = null;

/**
 * Get the JWT secret from environment and convert to CryptoKey
 * Uses HS256 algorithm which is standard for Supabase JWTs
 */
async function getJWTKey(): Promise<CryptoKey> {
  if (cachedKey) {
    return cachedKey;
  }

  // Use JWT_SECRET (without SUPABASE_ prefix as that's reserved)
  const jwtSecret = Deno.env.get('JWT_SECRET');
  if (!jwtSecret) {
    throw new Error('JWT_SECRET not configured');
  }

  // Supabase uses HMAC-SHA256 (HS256) for JWT signing with symmetric key
  // Convert the secret string to a CryptoKey for HMAC verification
  const encoder = new TextEncoder();
  const keyData = encoder.encode(jwtSecret);

  cachedKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );

  return cachedKey;
}

/**
 * Verify a JWT token locally without making network calls
 *
 * @param token - The JWT token (without 'Bearer ' prefix)
 * @returns The verified payload with user information
 * @throws Error if token is invalid or expired
 */
export async function verifyJWT(token: string): Promise<VerifyResult> {
  try {
    const key = await getJWTKey();

    // Verify and decode the token
    const payload = await verify(token, key) as JWTPayload;

    // Check if token is expired
    if (payload.exp && payload.exp < Date.now() / 1000) {
      throw new Error('Token has expired');
    }

    if (!payload.sub) {
      throw new Error('Token missing subject (user ID)');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      payload
    };
  } catch (error) {
    console.error('JWT verification failed:', error);
    throw new Error(`Invalid token: ${error.message}`);
  }
}

/**
 * Extract user ID from Authorization header using local JWT verification
 *
 * @param authHeader - The Authorization header value (e.g., "Bearer <token>")
 * @returns The user ID if valid, null otherwise
 */
export async function getUserIdFromAuthHeader(authHeader: string | null): Promise<string | null> {
  if (!authHeader) {
    return null;
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const result = await verifyJWT(token);
    return result.userId;
  } catch (error) {
    console.error('Failed to extract user ID from auth header:', error);
    return null;
  }
}

/**
 * Decode a JWT without verification (for debugging/logging only)
 * DO NOT use this for authentication - use verifyJWT instead
 */
export function decodeJWTUnsafe(token: string): JWTPayload | null {
  try {
    const [_header, payload, _signature] = decode(token);
    return payload as JWTPayload;
  } catch {
    return null;
  }
}
