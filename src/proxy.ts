import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decrypt } from '@/lib/auth/jwt';

// Define paths that do not require authentication
const publicPaths = ['/login', '/request-access', '/api/auth'];

// Define paths that are only accessible to specific roles
const adminPaths = ['/admin'];

export async function proxy(request: NextRequest) {
  return NextResponse.next();
  const { pathname } = request.nextUrl;

  // Ignore static files, images, and next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.match(/\.(png|jpg|jpeg|svg|gif|webp)$/)
  ) {
    return NextResponse.next();
  }

  // Check if it's a public path
  const isPublicPath = publicPaths.some(path => pathname.startsWith(path));

  // Get session cookie
  const sessionCookie = request.cookies.get('session');
  let payload: any = null;

  if (sessionCookie?.value) {
    try {
      payload = await decrypt(sessionCookie!.value);
    } catch (e) {
      // Invalid token
    }
  }

  // If user is not authenticated and trying to access a private path
  if (!payload && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }

  // If user is authenticated
  if (payload) {
    // Prevent access to login/request-access pages
    if (isPublicPath) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }

    // Handle user status (Pending Approval Workflow)
    if (payload.status === 'pending' && pathname !== '/pending') {
      const url = request.nextUrl.clone();
      url.pathname = '/pending';
      return NextResponse.redirect(url);
    }

    if (payload.status !== 'pending' && pathname === '/pending') {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
    
    if (payload.status === 'suspended' || payload.status === 'rejected') {
      const url = request.nextUrl.clone();
      url.pathname = '/rejected';
      return NextResponse.redirect(url);
    }

    // Handle MFA Workflow
    if (!payload.mfaVerified && pathname !== '/mfa-verify' && payload.status === 'approved') {
      const url = request.nextUrl.clone();
      url.pathname = '/mfa-verify';
      return NextResponse.redirect(url);
    }
    
    if (payload.mfaVerified && pathname === '/mfa-verify') {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }

    // Role-based Access Control for Admin routes
    const isAdminPath = adminPaths.some(path => pathname.startsWith(path));
    if (isAdminPath && !['Super Administrator', 'System Administrator'].includes(payload.role)) {
      const url = request.nextUrl.clone();
      url.pathname = '/unauthorized';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
