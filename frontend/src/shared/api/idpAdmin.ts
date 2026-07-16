/**
 * IdP admin proxy client (SSO-D).
 * Token never leaves the backend — only deep-links + proxy responses.
 */

import api from "@/shared/api/axios"

export type IdpConfig = {
  oidc_enabled: boolean
  idp_admin_enabled: boolean
  public_url: string | null
  user_settings_url: string | null
  admin_url: string | null
  groups: string[]
}

export type IdpLinks = {
  oidc_enabled: boolean
  user_settings_url: string | null
}

export type IdpAccessLevel = "admin" | "viewer" | "none"

export type IdpUser = {
  pk: number
  username: string
  name: string
  email: string
  is_active: boolean
  groups: string[]
  access_level?: IdpAccessLevel | string | null
}

export async function fetchIdpConfig(): Promise<IdpConfig> {
  const { data } = await api.get<IdpConfig>("/idp/config")
  return data
}

export async function fetchIdpLinks(): Promise<IdpLinks> {
  const { data } = await api.get<IdpLinks>("/idp/links")
  return data
}

export async function fetchIdpUsers(): Promise<IdpUser[]> {
  const { data } = await api.get<{ items: IdpUser[] }>("/idp/users")
  return data.items || []
}

export async function setIdpUserAccess(
  pk: number,
  accessLevel: IdpAccessLevel,
): Promise<IdpUser> {
  const { data } = await api.put<IdpUser>(`/idp/users/${pk}/access`, {
    access_level: accessLevel,
  })
  return data
}
