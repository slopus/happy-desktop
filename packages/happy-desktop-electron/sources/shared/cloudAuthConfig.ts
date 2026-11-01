/** Every desktop build returns through the production Cloud callback protocol. */
export const cloudAuthProductionRedirectUri = "happy-auth://callback";

/**
 * Where a team server's sign-in returns, on every platform and flavor. It is
 * sent as `redirect_uri` exactly as written here.
 */
export const serverOAuthRedirectUri = "happy://oauth/callback";
