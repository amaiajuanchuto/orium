/**
 * Supabase OAuth access-token verification, shared between the MCP
 * transport and the REST API — both need to know "which user is this
 * request for," verified the same way.
 */
import { createRemoteJWKSet, jwtVerify } from "jose";

export type TokenVerifier = (token: string) => Promise<string | null>;

/**
 * Builds a function that verifies a Supabase-issued access token and
 * returns the authenticated user's id (the JWT's `sub` claim), or null if
 * the token is invalid. The returned JWKS is fetched once and cached,
 * refetching only if a token references an unrecognized key id — reuse a
 * single verifier instance across the whole server rather than creating
 * one per transport.
 *
 * @param supabaseUrl - The Supabase project URL.
 */
export function createTokenVerifier(supabaseUrl: string): TokenVerifier {
  const jwks = createRemoteJWKSet(
    new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
  );
  const issuer = `${supabaseUrl}/auth/v1`;

  return async function verifySupabaseToken(token: string): Promise<string | null> {
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer,
        audience: "authenticated",
      });
      return typeof payload.sub === "string" ? payload.sub : null;
    } catch {
      return null;
    }
  };
}
