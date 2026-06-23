import { NextResponse } from 'next/server';

/**
 * Custom sign-out endpoint that clears session cookies on both the bare domain
 * and the wildcard domain. This handles the transition from old cookies scoped
 * to simplerdevelopment.com to new cookies on .simplerdevelopment.com.
 */
export async function POST() {
  const response = NextResponse.json({ success: true });
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieNames = [
    isProduction ? '__Secure-authjs.session-token' : 'authjs.session-token',
    'authjs.csrf-token',
    'authjs.callback-url',
    '__Secure-authjs.csrf-token',
    '__Secure-authjs.callback-url',
    'sd-active-client',
  ];

  for (const name of cookieNames) {
    // Clear on bare domain
    response.cookies.set(name, '', {
      expires: new Date(0),
      path: '/',
      secure: isProduction,
      domain: isProduction ? 'simplerdevelopment.com' : undefined,
    });
    // Clear on wildcard domain
    if (isProduction) {
      response.cookies.set(name, '', {
        expires: new Date(0),
        path: '/',
        secure: true,
        domain: '.simplerdevelopment.com',
      });
    }
  }

  return response;
}
