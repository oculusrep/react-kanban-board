# PWA Testing Checklist

**Branch:** `feat/pwa`
**Preview URL:** _(paste your Vercel preview URL here)_
**Date:** 2026-04-09
**Tester:** _______________

> Find the preview URL: Vercel Dashboard > Project > Preview Deployments > feat/pwa
> Or: GitHub repo > feat/pwa branch > click "Details" on the Vercel deployment check

---

## 1. Desktop Browser Quick Check (Chrome DevTools)

Open the preview URL in Chrome, then open DevTools (F12).

### Application Tab
- [ ] Application > Manifest — loads with name "OVIS", icons show, display is "standalone"
- [ ] Application > Service Workers — sw.js is registered and active
- [ ] Application > Cache Storage — caches exist (google-fonts-cache, supabase-api-cache, google-maps-cache, plus precache)

### Network Tab
- [ ] Reload page — `sw.js` and `manifest.webmanifest` appear in network requests
- [ ] Check "Offline" checkbox, reload — page still loads from service worker cache
- [ ] Uncheck "Offline" — page works normally again

### Console
- [ ] No errors related to service worker or manifest
- [ ] "SW Registered" message appears

---

## 2. iPad Safari — Before Install

Open the preview URL in Safari on your iPad.

- [ ] Page loads and works normally (no regressions)
- [ ] Map loads, pins display, sidebar works
- [ ] Navigate to a deal or property detail page, then go back — normal behavior
- [ ] Wait 30 seconds — iOS install prompt slides up with "Install OVIS" instructions
- [ ] Tap "Got it!" — prompt dismisses
- [ ] Reload page — prompt does NOT appear again (stored in localStorage)

> **To reset the install prompt for re-testing:**
> Safari > Settings > Clear History and Website Data, or use a private tab

---

## 3. iPad — Install to Home Screen

- [ ] In Safari, tap the **Share** button (box with arrow)
- [ ] Tap **"Add to Home Screen"**
- [ ] Icon shows the Oculus emblem (not a generic icon or screenshot)
- [ ] Name shows "OVIS"
- [ ] Tap **"Add"**
- [ ] Icon appears on your home screen

---

## 4. iPad — Standalone Mode

Launch OVIS from the home screen icon (NOT from Safari).

- [ ] **Splash screen** — briefly see Oculus logo on dark blue background while loading
- [ ] **No browser UI** — no Safari address bar, no tab bar, full screen experience
- [ ] **Status bar** — visible with translucent dark style (clock, wifi, battery visible)
- [ ] **Content not hidden** — nothing cut off by notch area or home indicator at bottom (safe area insets working)

---

## 5. iPad — Navigation in Standalone Mode

Still in the standalone app (launched from home screen).

- [ ] On home page (master pipeline or map) — **no back button visible** (correct)
- [ ] Tap into a deal detail page — **back button appears** (floating circle, top-left)
- [ ] Tap back button — returns to previous page
- [ ] Navigate to `/mapping` — back button does **NOT** appear (top-level page)
- [ ] Navigate to a property detail page — back button **appears**
- [ ] Navigate several pages deep, use back button multiple times — steps back through history correctly

---

## 6. iPad — Offline Experience

Still in the standalone app.

- [ ] **Turn on Airplane Mode** (swipe down from top-right for Control Center)
- [ ] Terracotta/brown banner appears at top: "You're offline — some features may be limited"
- [ ] App is still visible (cached shell)
- [ ] **Turn off Airplane Mode**
- [ ] Banner disappears
- [ ] App resumes working normally

---

## 7. iPad — Orientation

- [ ] Rotate to **landscape** — layout adapts, no content cut off
- [ ] Rotate to **portrait** — layout adapts back
- [ ] In standalone mode, rotation works smoothly without reloading

---

## 8. iPad — Update Flow

- [ ] Close app completely (swipe up from bottom to app switcher, swipe app away)
- [ ] Reopen from home screen
- [ ] If a new deployment happened, toast appears bottom-right: "New content available, click reload to update"
- [ ] Tap "Reload" — app refreshes with new version
- [ ] Tap "Close" — dismisses toast

> **To force-test this:** Push a small change to `feat/pwa` branch, wait for Vercel to deploy, then reopen the app from home screen.

---

## 9. Lighthouse PWA Audit (Desktop Chrome)

Open preview URL in Chrome > DevTools > Lighthouse tab > select "Progressive Web App" > Analyze.

- [ ] "Installable" — passes
- [ ] "Has a service worker" — passes
- [ ] "Configured for a custom splash screen" — passes
- [ ] "Sets a theme color" — passes (`#002147`)
- [ ] "Content is sized correctly for the viewport" — passes
- [ ] "Has a `<meta name="viewport">` tag" — passes

---

## 10. Regression Check

Verify existing features still work on the preview URL.

- [ ] Login / logout works
- [ ] Kanban board loads, cards drag correctly
- [ ] Map page loads, markers display
- [ ] Search works
- [ ] Sidebar opens / closes
- [ ] Deal / property / contact detail pages load
- [ ] Forms submit successfully (create a test note or log a call)
- [ ] Modals open and close properly

---

## Troubleshooting

| Problem | What to check |
|---------|--------------|
| No install option in Safari Share menu | Must be on HTTPS preview URL, not localhost |
| Generic icon on home screen | Clear Safari cache, re-add to home screen |
| Still see browser UI after launching | Must launch from home screen icon, not Safari |
| Back button not appearing | Must be in standalone mode AND on a non-top-level page |
| Install prompt won't show again | Clear localStorage: Safari Settings > Clear Website Data |
| Offline banner doesn't appear | Toggle airplane mode, wait a moment — events can have slight delay |
| Splash screen not showing | Remove from home screen, re-add, and relaunch |
| Content cut off at edges | Check that `viewport-fit=cover` is in the meta tag and safe area CSS is in index.html |

---

## Results

### Pass / Fail Summary

| Section | Result | Notes |
|---------|--------|-------|
| 1. Desktop DevTools | | |
| 2. iPad Safari (pre-install) | | |
| 3. Install to Home Screen | | |
| 4. Standalone Mode | | |
| 5. Navigation | | |
| 6. Offline Experience | | |
| 7. Orientation | | |
| 8. Update Flow | | |
| 9. Lighthouse Audit | | |
| 10. Regression Check | | |

### Issues Found

| # | Section | Description | Severity |
|---|---------|-------------|----------|
| | | | |

---

**After testing:** If all sections pass, merge `feat/pwa` into `main` to deploy to production.
