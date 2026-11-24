# BarberOS native applications

## Decision and cross-layer impact

1. Independent Electron/React Native/Flutter interfaces duplicate business contracts, UI, accessibility and tenant themes; changes require three release cycles. Rejected for this product.
2. Bundled Vite snapshots with Capacitor/Tauri reduce some binary sizes but freeze web changes until installers are updated. OS WebView differences require separate OAuth/file/camera adapters. Rejected for the requested immediate main-to-client delivery.
3. **Selected: sandboxed Electron desktop + Android Trusted Web Activity**, both targeting the exact production HTTPS origin. Chromium provides the existing application, first-party Supabase sessions, files and camera. Android delegates these capabilities to the verified supporting browser, including browser-based OAuth. No native Supabase clients, duplicate schema, new tables, migrations, RLS exceptions or service-role credentials are introduced.

`main → existing Vercel production deployment → same web release in macOS/Windows/Android → existing Supabase APIs/RPCs/Edge/RLS`. A successful GitHub push alone is not a production deployment. Inspect the Vercel deployment and `/native-release.json` sourceCommit to verify delivery. PWA registration already activates new service workers; reopen/refresh to load a newly deployed interface. Offline operation does not accept bookings/orders: those need a server acknowledgement.

## Source and releases

- Native source: `apps/desktop`, `apps/android`, `scripts/native`, workflow `native-release.yml`.
- The native matrix runs from main when native files change, and can be dispatched manually. Web-only changes use the existing deployment workflow and do not need a binary release.
- Version `1.0.<native workflow run_number>` and Android monotonically increasing versionCode use the same run counter. Do not replace this workflow with one whose counter restarts; preserve versionCode continuity.
- Release tag points to the exact main SHA, desktop includes `src/release.json`, all downloadable binaries have SHA-256 checksums. Releases publish only when the complete matrix passes. Never replace existing release assets to hide failed validation; issue a new main commit/release.
- Node 22, JDK21, Gradle9.9.2 / AGP9.5.2 / Android SDK37, npm lockfile, pinned Electron/builder/Playwright/sharp, Gradle wrapper checksum and fixed Android plugin/browser-helper versions. Native signing timestamps/SDK tools make byte-identical rebuilds a separate concern from reproducible dependency/build inputs.

## Environments and secrets

Distributed builds are **production-only**, with an immutable exact-origin allowlist. No user-supplied URL, runtime environment override or secret-bearing native bridge exists. Existing web development and Supabase staging keep their separate environment configuration; production native apps never accept staging sessions. A future staging binary must have a distinct application ID, persistent profile, HTTPS origin, signing/domain association and release channel; it must not repoint this production profile.

Android private signing key is outside the repository and supplied by encrypted GitHub Actions secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`. Its public certificate fingerprint is versioned in `frontend/public/.well-known/assetlinks.json` and compared to the actual APK and live domain. Loss of the private key breaks sideloaded update continuity; retain the protected local original and an approved secure backup. No signing private material belongs in source, logs, release artifacts or frontend.

## Runtime security and capabilities

Desktop: sandbox enabled globally/per window, no Node integration/preload/IPC exposed to remote pages, context isolation and web security enabled. Navigation stays on the exact HTTPS origin; external HTTPS/mail/tel links go to system handlers; new windows and webviews are blocked. Camera is first-party/video-only with OS and application consent; microphone, geolocation and other permissions are denied. Downloads require first-party/blob origin and a native save dialog. No TLS bypass, remote debugging port or certificate-error override.

Android: Android Browser Helper launches the verified TWA, handles back/navigation/lifecycle and falls back to a Custom Tab when trust/browser support is unavailable. Deep links accept only the exact production origin. No WebView JavaScript bridge, additional Android camera/storage permissions or bundled backend keys. Chrome permissions, file chooser, downloads, session persistence and online/offline states follow the production web application.

## Icons

`frontend/public/barberos-icon.svg` is the existing published application mark and single image source. The generator creates macOS ICNS 16–1024px, Windows ICO 16–256px, Android density PNGs and web manifest PNGs. macOS Icon Composer data uses the same foreground with Default/Dark/Tinted specializations; `actool` compiles Assets.car and CFBundleIconName points to AppIcon. Android API26 adaptive foreground/background and API33 monochrome icon are included. Windows NSIS creates Start Menu and desktop shortcuts using the ICO.

## Distribution limitations

macOS test builds use explicit ad-hoc signing. A Developer ID Application certificate, Apple notarization credentials and successful stapling are required for frictionless public distribution and signed Squirrel updates. An Apple Development identity is not a substitute. Until configured, the macOS update menu opens the official release page; online product updates remain automatic through production deployments.

Windows test installers currently have no Authenticode publisher certificate. Installer updates use Electron updater and GitHub SHA-512 metadata, with explicit download/restart consent. SmartScreen reputation is separate from build success.

Android APKs are release-signed for direct testing. AAB is for future Play Console submission; installing the AAB directly is unsupported. Play publication/review and Play App Signing certificate association are separate release steps. Android online product updates require no APK replacement; native changes are released as a new versioned APK and, once configured, through Play.

## Verification

`npm ci --prefix apps/desktop`; `node scripts/native/generate-icons.cjs`; `npm test --prefix apps/desktop`; `npm audit --prefix apps/desktop`; `npm run dist --prefix apps/desktop -- --mac --arm64` (or `--win --x64`). macOS compilation requires Xcode26+ and a macOS26+ runner. Local output on exFAT may expose AppleDouble resource-fork entries to packager integrity discovery; use an APFS output path (`--config.directories.output=/tmp/barberos-native-output`).

`BARBEROS_EXECUTABLE=/Applications/BarberOS.app/Contents/MacOS/BarberOS node apps/desktop/test/runtime.cjs` exercises the actual packaged executable against production, renderer isolation, rejected login, public shop, live catalog/availability, selection flow and network recovery; writes screenshots and JSON evidence. It does not create fictitious production appointments or claim authenticated staff workflows have been newly certified.

Android: JDK21, Android SDK37, stable signing env → `cd apps/android && bash gradlew --no-daemon lintRelease assembleRelease bundleRelease`; `node scripts/native/verify-android.cjs` verifies actual APK certificate against source and public domain. The release pipeline also installs the signed APK on an Android35 emulator, verifies that Chrome renders BarberOS without a URL toolbar (trusted full-screen mode), and saves a screenshot/UI hierarchy. Physical Android device acceptance remains a separate check.

Rollback: preserve main history, revert the offending source through a new commit and redeploy. Native profiles and backend schema are unchanged by installation. Uninstalling a desktop app does not delete the Supabase account or cloud business data.
