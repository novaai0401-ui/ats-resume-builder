import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isProd = process.env.NODE_ENV === 'production';

// Narrow Content-Security-Policy for the web app. The Razorpay checkout script
// must be allow-listed in script-src / frame-src; the browser API URL must be
// allow-listed in connect-src so AJAX calls from the client succeed. If you
// move the API to a different host you MUST add it here.
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

// Trusted Types is intentionally NOT enforced. Razorpay and Stripe both
// load their checkout SDKs by assigning to <script>.src directly — that
// pattern fails the `require-trusted-types-for 'script'` directive in
// Chromium and breaks payment flows entirely (visible error:
// "Failed to set the 'src' property on 'HTMLScriptElement': This
// document requires 'TrustedScriptURL' assignment"). Until both SDKs
// publish Trusted-Types-compliant loaders we ship the rest of the
// hardened CSP without this directive.

const csp = [
  "default-src 'self'",
  // Next.js dev/prod both need 'unsafe-inline' for some inlined critical CSS.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // Razorpay checkout loads from checkout.razorpay.com; Next injects small
  // inline bootstrap scripts so 'unsafe-inline' is required. 'unsafe-eval'
  // is needed for Next dev hot reload but can be removed in pure prod
  // without turbopack if desired.
  `script-src 'self' 'unsafe-inline' ${isProd ? '' : "'unsafe-eval'"} https://checkout.razorpay.com`,
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src 'self' ${apiUrl} https://api.razorpay.com https://lumberjack.razorpay.com https://api.stripe.com`,
  "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://js.stripe.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isProd ? ['upgrade-insecure-requests', 'block-all-mixed-content'] : []),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    // Lock down every powerful surface; the resume builder needs none of these.
    value: [
      'accelerometer=()',
      'autoplay=()',
      'camera=()',
      'clipboard-read=(self)',
      'clipboard-write=(self)',
      'display-capture=()',
      'geolocation=()',
      'gyroscope=()',
      'magnetometer=()',
      'microphone=()',
      'midi=()',
      'payment=(self "https://checkout.razorpay.com" "https://js.stripe.com")',
      'usb=()',
      'xr-spatial-tracking=()',
    ].join(', '),
  },
  // Cross-origin isolation: prevents Spectre-style side-channels and
  // SharedArrayBuffer leaks. We use same-origin-allow-popups so the
  // Razorpay/Stripe popup flows still work.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
  { key: 'Origin-Agent-Cluster', value: '?1' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  ...(isProd
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '..'),
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  experimental: {
    optimizePackageImports: ['zustand'],
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Service workers must not be cached by the browser; otherwise users
      // get stuck on a stale SW that never picks up new app shells.
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      // The web manifest is small and rarely changes; allow short caching.
      {
        source: '/manifest.json',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=3600' }],
      },
    ];
  },
};

export default nextConfig;
