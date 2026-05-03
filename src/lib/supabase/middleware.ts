import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          const FIFTEEN_DAYS_SECONDS = 15 * 24 * 60 * 60 // 1,296,000 s
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              maxAge: FIFTEEN_DAYS_SECONDS,
            })
          )
        },
      },
    }
  )

  // Refreshing the auth token.
  // getUser() throws an AuthApiError when there is no valid session/refresh token
  // (e.g. first visit, expired cookies). This is expected and handled below by
  // redirecting to /login — suppress the error so it doesn't spam the console.
  let user = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch {
    // No session — user will be redirected to /login below.
  }

  // Define paths
  const path = request.nextUrl.pathname
  const isAuthPath = path.startsWith('/login') || path.startsWith('/forgot-password')
  const isUpdatePasswordPath = path.startsWith('/update-password')
  const isPublicPath = path.startsWith('/assets') || path.startsWith('/api') || path.startsWith('/_next') || path.startsWith('/favicon.ico')

  if (isPublicPath) {
    return supabaseResponse
  }

  // 1. Unauthenticated User
  if (!user && !isAuthPath) {
    // Redirect to login if trying to access protected route
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // 2. Authenticated User
  if (user) {
    const forcePasswordChange = user.user_metadata?.force_password_change

    // Case A: Forced Password Change
    if (forcePasswordChange) {
      if (!isUpdatePasswordPath) {
        // Redirect to update password if not already there
        const url = request.nextUrl.clone()
        url.pathname = '/update-password'
        return NextResponse.redirect(url)
      }
    } 
    // Case B: Normal User
    else {
      if (isAuthPath || isUpdatePasswordPath) {
        // Redirect away from auth pages since user is already logged in.
        // Go to select-foreman so the user picks their submitter first.
        const url = request.nextUrl.clone()
        url.pathname = '/select-foreman'
        return NextResponse.redirect(url)
      }
      // Note: "/" → "/select-foreman" redirect is intentionally handled client-side
      // by ForemanGuard, NOT here. Doing it server-side blocks navigation to the
      // dashboard after the user selects a submitter (router.replace("/")).
    }
  }

  return supabaseResponse
}



