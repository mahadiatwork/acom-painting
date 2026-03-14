import { createAdminClient } from '@/lib/supabase/admin'
import { zohoClient } from '@/lib/zoho'

export type SyncPortalCredentialsResult =
  | { success: true; message: string; email: string; userId?: string }
  | { success: false; error: string }

/**
 * Fetches portal_user_email and portal_user_login from Zoho CRM org variables,
 * then ensures a single Supabase Auth user exists with that email and password.
 */
export async function syncPortalCredentialsFromZoho(): Promise<SyncPortalCredentialsResult> {
  const credentials = await zohoClient.getPortalLoginCredentials()
  if (!credentials) {
    return {
      success: false,
      error: 'Could not read portal_user_email or portal_user_login from Zoho CRM variables.',
    }
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { success: false, error: 'Missing SUPABASE_SERVICE_ROLE_KEY' }
  }

  const supabase = createAdminClient()
  const { email, password } = credentials

  const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const existing = listData?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())

  if (existing) {
    const { error: updateError } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    })
    if (updateError) {
      console.error('[Sync Portal Credentials] updateUserById error:', updateError)
      return { success: false, error: updateError.message }
    }
    return {
      success: true,
      message: 'Portal credentials synced; existing user password updated.',
      email,
    }
  }

  const { data: createData, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { source: 'zoho_portal_variables' },
  })
  if (createError) {
    console.error('[Sync Portal Credentials] createUser error:', createError)
    return { success: false, error: createError.message }
  }

  return {
    success: true,
    message: 'Portal credentials synced; new Supabase Auth user created.',
    email,
    userId: createData?.user?.id,
  }
}
