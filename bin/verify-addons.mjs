#!/usr/bin/env node
/**
 * Verifies that every native addon the pear worklet bundle links is actually
 * present on disk, at the exact version the bundle expects.
 *
 * Deliberately checks files rather than `addons-lock.json`: the lock records
 * what link intended to write, so comparing against it can pass while a `.so`
 * is missing.
 */
import fs from 'node:fs'
import path from 'node:path'

const ABIS = ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64']

const root = process.cwd()
const req = (p) => path.join(root, 'node_modules', p)

const pearDir = req('@spacesops/pear-wrk-wdk')
const addonsDir = req('@spacesops/react-native-bare-kit/android/src/main/addons')

function fail(message, hint) {
  console.error(`[verify-addons] ${message}`)
  if (hint) console.error(`\n${hint}`)
  process.exit(1)
}

function expectedAddons() {
  const manifest = path.join(pearDir, 'generated/pear-linked-addons.json')
  if (fs.existsSync(manifest)) {
    return JSON.parse(fs.readFileSync(manifest, 'utf8')).linkedAddons
  }

  // Older pear releases did not ship the manifest.
  const bundle = path.join(pearDir, 'generated/bundle/wdk-worklet.mobile.bundle.js')
  if (!fs.existsSync(bundle)) {
    fail(
      'could not find the pear worklet bundle',
      'Is @spacesops/pear-wrk-wdk installed? Expected:\n  ' + bundle
    )
  }
  const text = fs.readFileSync(bundle, 'utf8')
  const names = [...text.matchAll(/linked\\?:lib[^"'\\]+/g)].map((m) =>
    m[0].replace(/^linked\\?:/, '')
  )
  return [...new Set(names)].sort()
}

/**
 * A missing `.so` is expected when the package ships no Android prebuild at
 * all — `bare-posix` maps `android` to `unsupported.js` in its exports, so the
 * bundle references it but nothing can ever link it.
 */
function shipsAndroidPrebuild(addonFile) {
  const name = addonFile.replace(/^lib/, '').replace(/\.\d+\.\d+\.\d+\.so$/, '')
  const pkg = name.includes('__') ? '@' + name.replace('__', '/') : name
  const prebuilds = req(path.join(pkg, 'prebuilds'))
  if (!fs.existsSync(prebuilds)) return false
  return fs.readdirSync(prebuilds).some((d) => d.startsWith('android-'))
}

const expected = expectedAddons()
if (expected.length === 0) fail('the pear bundle links no native addons, which cannot be right')

if (!fs.existsSync(addonsDir)) {
  fail(
    'no linked addons directory',
    'bare-kit link has not run yet. It runs automatically on Android preBuild;\n' +
      'to run it now:\n  node node_modules/@spacesops/react-native-bare-kit/android/link.mjs'
  )
}

let failed = false

for (const abi of ABIS) {
  const dir = path.join(addonsDir, abi)
  if (!fs.existsSync(dir)) {
    console.error(`[verify-addons] ${abi}: missing entirely`)
    failed = true
    continue
  }

  const present = new Set(fs.readdirSync(dir).filter((f) => f.endsWith('.so')))
  const missing = expected.filter((n) => !present.has(n))

  const hard = missing.filter(shipsAndroidPrebuild)
  const expectedAbsent = missing.filter((n) => !shipsAndroidPrebuild(n))

  // Two versions of one addon means a duplicate package in the tree: the
  // bundle only ever loads one, so the other is dead weight in the APK.
  const byName = new Map()
  for (const f of present) {
    const base = f.replace(/\.\d+\.\d+\.\d+\.so$/, '')
    byName.set(base, (byName.get(base) ?? 0) + 1)
  }
  const duplicated = [...byName].filter(([, n]) => n > 1).map(([b]) => b)

  if (hard.length) {
    console.error(`[verify-addons] ${abi}: ${hard.length} addon(s) the bundle needs are missing:`)
    hard.forEach((n) => console.error(`  - ${n}`))
    failed = true
  } else {
    const notes = []
    if (expectedAbsent.length) notes.push(`${expectedAbsent.length} with no Android prebuild`)
    if (duplicated.length) notes.push(`${duplicated.length} duplicated`)
    console.log(
      `[verify-addons] ${abi}: ${expected.length - missing.length}/${expected.length} present` +
        (notes.length ? ` (${notes.join(', ')})` : '')
    )
  }

  for (const n of duplicated) {
    console.warn(`[verify-addons] ${abi}: ${n} is linked at more than one version`)
  }
}

if (failed) {
  fail(
    'the installed tree does not match the pear bundle',
    'pear pins every addon it links as an exact dependency, so a mismatch usually\n' +
      'means a stale lockfile kept an older resolution. Re-resolve from scratch:\n' +
      '  rm -rf node_modules package-lock.json && npm install\n\n' +
      'If it persists, the pear release is inconsistent — see\n' +
      'node_modules/@spacesops/react-native-bare-kit/TROUBLESHOOTING.md'
  )
}

console.log('[verify-addons] OK')
