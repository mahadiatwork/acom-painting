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
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refreshing the auth token
  const {
    data: { user },
  } = await supabase.auth.getUser()

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
        // Redirect to dashboard if trying to access login or update password pages
        const url = request.nextUrl.clone()
        url.pathname = '/'
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}

