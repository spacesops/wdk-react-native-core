# AGENTS.md — @spacesops/wdk-react-native-core

The single package consuming apps install. It owns provider/hook/lifecycle code and, just as importantly, **pins the versions of `@spacesops/pear-wrk-wdk` and `@spacesops/react-native-bare-kit` that are known to work together**. Consumers must not install those directly.

## Release order

Publish upstream first, then bump here, then the app: `wdk-wallet-btc` → `pear-wrk-wdk` → `react-native-bare-kit` → **this** → app. Both `@spacesops/*` dependencies are exact pins, so **publishing this package before an upstream version exists makes it uninstallable** (`ETARGET / notarget`) — verify each pin resolves on npm before publishing.

Regenerate `package-lock.json` from scratch when bumping either pin. npm preserves existing lock entries instead of re-resolving, so an incremental install keeps an old addon version hoisted and nests the correct one beneath it — two copies, and two `.so` files in every consumer APK.

## Non-obvious invariants

**No Expo config plugin can live here.** This package is `"type": "module"` and Expo does a plain `require()` of `app.plugin.js`, so a CJS plugin throws `ERR_REQUIRE_ESM` at prebuild. The Android packaging plugin lives in `react-native-bare-kit`, which is CJS; consumers reference `"@spacesops/react-native-bare-kit"` in `plugins`. `bin/verify-addons.mjs` is fine as ESM.

**Do not add `@expo/*` packages as dependencies.** They use Expo-SDK-aligned versions (`@expo/config-plugins` is `54.x`, not `10.x`), so a guessed range installs a second incompatible copy. Use optional peers.

**Some things genuinely cannot be fixed from here.** npm `overrides` only work from the root manifest, so a bad transitive range in a dependency is the *app's* problem to override — document it in the README rather than attempting a fix. `@tetherto/wdk-react-native-secure-storage` targets Expo SDK 55 while apps on SDK 54 must override `expo-crypto` and `expo-local-authentication`.

**Never add a `postinstall` that builds.** It runs in every consumer install, needs TypeScript present, and `dist` already ships.

## Triage

Native addon failures (`ADDON_NOT_FOUND`, release-only crashes) belong to `react-native-bare-kit` — see its `TROUBLESHOOTING.md`. Failures scoped to one chain (a wrong or `undefined` address, `MODULE_NOT_FOUND` for a wallet file) come from the versions packed inside pear's bundle and need a pear release; the copies in an app's `node_modules` never execute.
