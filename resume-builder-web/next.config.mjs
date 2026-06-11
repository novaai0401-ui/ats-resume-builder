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
  // Razorpay checkout loads from checkout.razorpay.com; the risk-detection
  // bundle (fraud check that the "Confirming Payment" step waits on) loads
  // from cdn.razorpay.com. Both must be allow-listed in script-src.
  // Without cdn.razorpay.com the post-payment confirmation hangs because
  // Razorpay's SDK keeps waiting for the risk-detection global it could
  // never inject — the user saw exactly this on the live preview.
  // Next injects small inline bootstrap scripts so 'unsafe-inline' stays.
  // 'unsafe-eval' is dev-only.
  `script-src 'self' 'unsafe-inline' ${isProd ? '' : "'unsafe-eval'"} https://checkout.razorpay.com https://cdn.razorpay.com`,
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  // Risk detection POSTs telemetry to cdn.razorpay.com — needs to be in
  // connect-src too or the same hang reproduces from a different angle.
  `connect-src 'self' ${apiUrl} https://api.razorpay.com https://cdn.razorpay.com https://lumberjack.razorpay.com https://api.stripe.com`,
  "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://js.stripe.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // 'self' (not 'none') because the editor's "Print preview" button
  // mounts a same-origin iframe pointing at /resume/template?print=1
  // and calls iframe.contentWindow.print() on it. 'none' blocks that
  // along with cross-origin embeds; 'self' keeps the clickjacking
  // protection against external sites while letting us frame our
  // own routes.
  "frame-ancestors 'self'",
  ...(isProd ? ['upgrade-insecure-requests', 'block-all-mixed-content'] : []),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  // SAMEORIGIN — not DENY — for the same reason as frame-ancestors
  // 'self' above: the print-preview iframe is same-origin. Modern
  // browsers prefer the CSP directive, but legacy browsers still
  // honour X-Frame-Options, so keep both in sync.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
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
