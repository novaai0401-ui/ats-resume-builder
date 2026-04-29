import { Controller, Get, Headers, Query } from '@nestjs/common';

/**
 * Public release manifest for sideloaded clients.
 *
 * Why this lives outside the store ecosystem:
 *   We distribute the Android APK from our own site and offer the iOS
 *   build via TestFlight + a PWA. Without store auto-update we must:
 *     1. Tell the running app whether it's still the latest version
 *        (the mobile client polls this endpoint on cold start).
 *     2. Publish a verifiable hash of the download so users can confirm
 *        the file wasn't swapped in transit.
 *     3. Publish the APK signing-cert fingerprint so users (and the app
 *        itself) can verify the artefact was signed by us.
 *
 * Operational note:
 *   The actual download URL and SHA-256 are read from environment
 *   variables, which the deploy pipeline writes after each EAS build.
 *   The signing fingerprint is stable across releases (same upload key)
 *   so it lives in env too, written once.
 */
@Controller('app')
export class AppMetaController {
  @Get('version')
  version(
    @Query('platform') platform = 'unknown',
    @Query('v') clientVersion = '',
    @Headers('user-agent') ua = '',
  ) {
    const e = process.env;
    return {
      latest: e.APP_LATEST_VERSION || '1.0.0',
      minSupported: e.APP_MIN_SUPPORTED_VERSION || '1.0.0',
      forceUpgrade: e.APP_FORCE_UPGRADE === 'true',
      releasedAt: e.APP_RELEASED_AT || null,
      notes: e.APP_RELEASE_NOTES || '',
      android: {
        url: e.APP_ANDROID_DOWNLOAD_URL || '',
        sha256: e.APP_ANDROID_SHA256 || '',
        signatureSha256: e.APP_ANDROID_SIGNATURE_SHA256 || '',
        size: e.APP_ANDROID_SIZE_BYTES ? Number(e.APP_ANDROID_SIZE_BYTES) : undefined,
      },
      ios: {
        testflightUrl: e.APP_IOS_TESTFLIGHT_URL || '',
      },
      web: {
        url: e.APP_WEB_URL || 'https://pocketresume.app',
      },
      _meta: {
        platform,
        clientVersion,
        ua: ua.slice(0, 80),
      },
    };
  }

  /**
   * Compact endpoint the download page hits on revalidate. Mirrors a
   * subset of /version so we can change the public-facing shape without
   * breaking the mobile-update contract.
   */
  @Get('release-manifest')
  releaseManifest() {
    const e = process.env;
    return {
      latest: e.APP_LATEST_VERSION || '1.0.0',
      android: {
        url: e.APP_ANDROID_DOWNLOAD_URL || '',
        sha256: e.APP_ANDROID_SHA256 || '',
        signatureSha256: e.APP_ANDROID_SIGNATURE_SHA256 || '',
      },
      ios: { testflightUrl: e.APP_IOS_TESTFLIGHT_URL || '' },
      web: { url: e.APP_WEB_URL || 'https://pocketresume.app' },
    };
  }
}
