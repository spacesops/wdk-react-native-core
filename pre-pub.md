# Pre-publish checklist — `@spacesops/wdk-react-native-core`

Align **`wdk-react-native-core`** with the **Spacesops beta.40 pipeline** on branch **`repackage`**, then publish to [npmjs.org](https://www.npmjs.com/).

---

## Pipeline versions (pin these)

| Package | npm version | Role |
|---------|-------------|------|
| `@spacesops/wdk-wallet-btc` | **1.0.0-beta.20** | Inside pear bundle only (not a direct core dep) |
| `@spacesops/pear-wrk-wdk` | **1.1.1-beta.40** | Mobile worklet JS bundle + HRPC (evm + spark + **bitcoin**) |
| `@spacesops/react-native-bare-kit` | **0.11.0-beta.40** | Bare runtime + nested native addon linking |
| `@spacesops/wdk-react-native-core` | **new** (e.g. `1.0.0-beta.40`) | This repo after republish |

**Starter today (legacy):** `github:tetherto/wdk-react-native-core#0b2be6eb…` + `pear-wrk-wdk#v2` + `wire-worklet.js` stripping btc. **Replace** with this package—do not patch pear in the app.

---

## 0. Git baseline

- [ ] Branch **`repackage`**, tracking `origin/repackage`
- [ ] Base commit includes starter-compatible fixes (currently **`0b2be6eb`** or later)
- [ ] **Commit** local wallet provider fixes if still unstaged:
  - `src/provider/WdkAppProvider.tsx` — SecureStorage registered in **`useMemo`** (sync), not deferred `useEffect`
  - `src/hooks/useWallet.ts` — skip wallet switch when `!WalletSetupService.isSecureStorageInitialized()`
- [ ] Push repackage before publish

---

## 1. `package.json` — identity

- [ ] `"name": "@spacesops/wdk-react-native-core"`
- [ ] Bump **`version`** (e.g. **`1.0.0-beta.40`** — align with pipeline naming)
- [ ] `"publishConfig": { "access": "public", "registry": "https://registry.npmjs.org/" }`
- [ ] `"repository"` → `git+https://github.com/spacesops/wdk-react-native-core.git` (or your canonical remote)
- [ ] Update `"author"` / `"homepage"` for Spacesops

---

## 2. `package.json` — dependencies (beta.40 pipeline)

**Remove:**

```json
"@tetherto/pear-wrk-wdk": "github:tetherto/pear-wrk-wdk#v2",
"react-native-bare-kit": "^0.11.0"
```

**Add:**

```json
"@spacesops/pear-wrk-wdk": "1.1.1-beta.40",
"@spacesops/react-native-bare-kit": "0.11.0-beta.40"
```

**Keep** (unless you fork them too):

- `@tetherto/wdk-react-native-secure-storage` (git or npm pin)
- `@tanstack/react-query`, `expo-crypto`, `react-native-mmkv`, `zod`, `zustand`

**Do not add** `@spacesops/wdk-wallet-btc` — bitcoin runs **inside** pear’s bundle only.

- [ ] Run **`npm install`** and commit **`package-lock.json`**
- [ ] Verify lock resolves pear **1.1.1-beta.44** and bare-kit **0.11.0-beta.44** from registry (not git `a800d4a0…`)

---

## 3. Source imports — pear

Replace every **`@tetherto/pear-wrk-wdk`** with **`@spacesops/pear-wrk-wdk`**:

| File |
|------|
| `src/services/workletLifecycleService.ts` |
| `src/store/workletStore.ts` |
| `src/hooks/useWorklet.ts` |
| `src/types/hrpc.ts` |
| `src/utils/storeHelpers.ts` |
| `jest.config.cjs` (transformIgnorePatterns) |
| `src/__tests__/setup.ts` |
| `src/__tests__/services/workletLifecycleService.test.ts` |
| `src/__tests__/types/hrpc.test.ts` |

- [ ] Dynamic import in `workletLifecycleService.ts` loads **`@spacesops/pear-wrk-wdk`** bundle (~18 MB, btc-inclusive)
- [ ] Type imports still work: `@spacesops/pear-wrk-wdk/types/rpc`
- [ ] Update error strings / comments mentioning old package name

---

## 4. Source imports — Bare Kit

Replace **`react-native-bare-kit`** with **`@spacesops/react-native-bare-kit`**:

| File |
|------|
| `src/services/workletLifecycleService.ts` |
| `src/store/workletStore.ts` |
| `src/hooks/useWorklet.ts` |
| `src/__tests__/setup.ts` |
| `src/__tests__/services/workletLifecycleService.test.ts` |
| `jest.config.cjs` |

- [ ] `Worklet` import path updated
- [ ] Jest mocks use new module name

---

## 5. README and host app notes

- [ ] Document required deps: `@spacesops/pear-wrk-wdk@1.1.1-beta.40`, `@spacesops/react-native-bare-kit@0.11.0-beta.40`
- [ ] Document **Android `keepDebugSymbols`** for `libbare*.so` (see `@spacesops/react-native-bare-kit` README)—host Expo app or config plugin
- [ ] State that **`wire-worklet.js`** and **`relink-bare-addons.js`** are **not** needed when using this core version
- [ ] App must pass **`bitcoin`** in `NetworkConfigs` (electrum, etc.) matching pear `networks: ["bitcoin"]`

---

## 6. Build and tests

```bash
npm run build:strict   # or npm run typecheck
npm test
```

- [ ] `npm run build` / `prepack` succeeds (`dist/` for non-RN consumers)
- [ ] All Jest tests pass with updated mocks
- [ ] Optional: smoke `import('@spacesops/pear-wrk-wdk')` in Node (bundle length check)

---

## 7. Tarball / `files`

Current `"files": ["dist", "src", "README.md", "LICENSE"]` is fine for RN (Metro uses `src`).

- [ ] **`npm pack --dry-run`** shows `@spacesops/wdk-react-native-core` and no secrets
- [ ] **`prepack`** runs `npm run build`

---

## 8. Integration test (host app — before or right after publish)

Use **`wdk-starter-react-native-develop`** on branch **`repackage`**:

```json
"@spacesops/wdk-react-native-core": "file:../wdk-react-native-core"
```

or after publish:

```json
"@spacesops/wdk-react-native-core": "1.0.0-beta.40"
```

Host app changes (Phase 5 — can overlap):

- [ ] Remove **`postinstall` / `wire-worklet.js`**
- [ ] Remove direct **`@tetherto/wdk-wallet-btc`**
- [ ] Keep or trim **`withBareKitAndroid.js`**: **only** `keepDebugSymbols` (no Gradle link override to `relink-bare-addons.js`)
- [ ] Add **`bitcoin`** to `MAINNET_CHAINS` in `get-chains-config.ts`
- [ ] `npm install` → `expo prebuild` → Android build (bare-kit **link** runs on `preBuild`)
- [ ] Device: wallet create + **bitcoin** address/balance via HRPC (no `ADDON_NOT_FOUND`)

---

## 9. Publish

```bash
npm login
npm publish --access public
npm view @spacesops/wdk-react-native-core version
```

- [ ] Git tag matches npm version (e.g. `v1.0.0-beta.40`)
- [ ] Pin starter to published core version

---

## 10. Quick status

| Check | Done? | Notes |
|-------|-------|--------|
| SecureStorage + useWallet fixes committed | | |
| `@spacesops/pear-wrk-wdk@1.1.1-beta.40` | | |
| `@spacesops/react-native-bare-kit@0.11.0-beta.40` | | |
| All imports updated | | |
| Tests pass | | |
| Host app E2E (wallet + bitcoin) | | |
| Published `@spacesops/wdk-react-native-core` | | |

---

## References

- Pear: `@spacesops/pear-wrk-wdk@1.1.1-beta.40` — [`pear-wrk-wdk/pre-publish.md`](../pear-wrk-wdk/pre-publish.md)
- Bare Kit: `@spacesops/react-native-bare-kit@0.11.0-beta.40` — [`react-native-bare-kit/pre-pub.md`](../react-native-bare-kit/pre-pub.md)
- BTC module: `@spacesops/wdk-wallet-btc@1.0.0-beta.20`
- Starter integration notes: [`wdk-starter-react-native-develop/docs/phase-2-pear-integration.md`](../wdk-starter-react-native-develop/docs/phase-2-pear-integration.md)
