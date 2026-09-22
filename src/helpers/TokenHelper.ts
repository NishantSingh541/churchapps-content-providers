import { ContentProviderAuthData, ContentProviderConfig } from "../interfaces";

/** Map a raw OAuth token response to ContentProviderAuthData, stamping created_at. */
export function toAuthData(data: Record<string, unknown>, fallbacks?: { refreshToken?: string; scope?: string }): ContentProviderAuthData {
  return {
    access_token: data.access_token as string,
    refresh_token: (data.refresh_token as string) || fallbacks?.refreshToken || "",
    token_type: (data.token_type as string) || "Bearer",
    created_at: Math.floor(Date.now() / 1000),
    expires_in: data.expires_in as number,
    scope: (data.scope as string) || fallbacks?.scope || "",
    userId: typeof data.user_id === "number" ? data.user_id : undefined,
    groupId: typeof data.group_id === "number" ? data.group_id : (data.group_id === null ? null : undefined),
    isLeader: typeof data.is_leader === "boolean" ? data.is_leader : undefined
  };
}

export class TokenHelper {
  isAuthValid(auth: ContentProviderAuthData | null | undefined): boolean {
    if (!auth) return false;
    return !this.isTokenExpired(auth);
  }

  isTokenExpired(auth: ContentProviderAuthData): boolean {
    if (!auth.created_at || !auth.expires_in) return true;
    const expiresAt = (auth.created_at + auth.expires_in) * 1000;
    return Date.now() > expiresAt - 5 * 60 * 1000; // 5-minute buffer
  }

  async refreshToken(config: ContentProviderConfig, auth: ContentProviderAuthData): Promise<ContentProviderAuthData | null> {
    if (!auth.refresh_token) return null;

    try {
      // JSON, matching DeviceFlowHelper.initiateDeviceFlow()'s working pattern
      // against this same backend — form-urlencoded was never confirmed to
      // be parsed by WordPress's $request->get_param() for this route.
      const response = await fetch(`${config.oauthBase}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: auth.refresh_token,
          client_id: config.clientId
        })
      });
      if (!response.ok) {
        console.warn(`[TokenHelper] Token refresh failed: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      return toAuthData(data, { refreshToken: auth.refresh_token, scope: auth.scope });
    } catch {
      return null;
    }
  }
}
