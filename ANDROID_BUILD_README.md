# Prime Calculator — Capacitor Android preparation (not yet production-ready)

This is a separate preparation copy of the AppDeploy source. The existing live PWA is not modified.

## What's included
- Capacitor configuration (`capacitor.config.ts`)
- Capacitor Android/core/CLI dependencies
- A GitHub Actions workflow that attempts to produce a debug APK in the cloud
- Original React/Vite calculator source and assets

## Important before building
1. Proposed Android package ID is `com.primecalculator.app`. Treat it as a proposed stable identity; confirm before publishing because changing it later creates a different Android app.
2. This scaffold does NOT yet render real AdMob banners. The AdMob plugin dependency is present, but app initialization, native App ID configuration, banner lifecycle, and the provided banner ad-unit ID must be integrated and tested.
3. The current app has backend code under `backend/` that depends on AppDeploy's SDK. A bundled Android WebView cannot automatically serve that backend. AI math requests may need a production API base URL and a deployed backend; this must be audited before release.
4. The workflow is a starting point, not a guarantee of a successful build. Review its first run and fix build errors before installing.
5. Use Google's test ad IDs while testing. Never click live ads yourself. Do not put private keys or service credentials in source code.
6. Keep the original AppDeploy deployment unchanged. This folder is intended for a separate GitHub repository.

## Free cloud build route
1. Create a private GitHub repository for Prime Calculator.
2. Upload the contents of this folder (not the ZIP itself) to the repository root.
3. Open the repository's Actions tab and enable GitHub Actions if prompted.
4. Run “Build Prime Calculator Android (debug)” using “Run workflow”.
5. When it completes, download the `prime-calculator-debug-apk` artifact.
6. The APK is for testing only; it is not signed for Play Store release.

## Package contents
This archive is prepared as a scaffold for the next integration stage. Do not treat it as a finished AdMob-enabled APK.
