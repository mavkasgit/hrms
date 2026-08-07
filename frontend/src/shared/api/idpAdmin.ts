/**
 * IdP deep-links (SSO-D). Token never leaves the backend.
 */

import api from "@/shared/api/client"

export type IdpConfig = {
  oidc_enabled: boolean
  idp_admin_enabled: boolean
  public_url: string | null
  user_settings_url: string | null
  sso_dashboard_url: string | null
  admin_url: string | null
  ops_url: string | null
  groups: string[]
}

export type IdpLinks = {
  oidc_enabled: boolean
  user_settings_url: string | null
  sso_dashboard_url: string | null
}

export async function fetchIdpConfig(): Promise<IdpConfig> {
  const { data } = await api.get<IdpConfig>("/idp/config")
  return data
}

export async function fetchIdpLinks(): Promise<IdpLinks> {
  const { data } = await api.get<IdpLinks>("/auth/me/links")
  return data
}
