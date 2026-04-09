# OVIS PWA Conversion Plan

**Status:** Phases 1-6 implemented, awaiting iPad testing on Vercel preview
**Estimated Time:** 3-4 days (~24 hours)
**Goal:** Convert OVIS web app into a Progressive Web App optimized for iPad — fullscreen, installable, fast, native feel
**Last Updated:** 2026-04-09
**Version:** 2.0
**Branch:** `feat/pwa` (preview deployment — not yet merged to main/production)

---

## Implementation Progress

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Foundation + Manifest + Meta Tags | DONE |
| Phase 2 | Icons & Assets | DONE |
| Phase 3 | Service Worker + Update Prompt | DONE |
| Phase 4 | Safe Area, Navigation & Keyboard Handling | DONE |
| Phase 5 | iOS Install Prompt | DONE |
| Phase 6 | Offline Banner | DONE |
| Phase 7 | Testing & Validation | **NEXT — needs iPad testing** |
| Phase 8 | Deployment (merge to main) | Pending test results |

### What was done (2026-04-09)

**Dependency installed:**
- `vite-plugin-pwa` (dev dependency)

**Existing files modified:**
- `vite.config.ts` — added VitePWA plugin with manifest, Workbox caching strategies, 8MB cache size limit (main bundle is ~6MB)
- `index.html` — added PWA meta tags, iOS standalone meta tags, safe area inset CSS, `viewport-fit=cover`, splash screen links, tap highlight, focus states, slide-up animation
- `src/App.tsx` — added 4 PWA overlay component imports (OfflineBanner, PWABackButton, IOSInstallPrompt, PWAUpdatePrompt)
- `vercel.json` — added Cache-Control and Service-Worker-Allowed headers for sw.js, Content-Type header for manifest.webmanifest

**New files created:**
- `src/components/PWAUpdatePrompt.tsx` — service worker update notification toast (bottom-right)
- `src/components/PWABackButton.tsx` — floating back button for standalone mode (hidden on top-level pages: /, /master-pipeline, /mapping)
- `src/components/IOSInstallPrompt.tsx` — "Add to Home Screen" modal for iOS/iPadOS (shows after 30s, remembers dismissal in localStorage)
- `src/components/OfflineBanner.tsx` — terracotta banner when device goes offline
- `src/hooks/useStandaloneMode.ts` — detects if app is running as installed PWA
- `src/hooks/useKeyboardHeight.ts` — tracks iPad software keyboard height via visualViewport API
- `src/hooks/useOnlineStatus.ts` — online/offline event detection
- `src/vite-pwa.d.ts` — TypeScript declarations for virtual:pwa-register imports
- `public/offline.html` — static fallback page for fully offline state

**Icon assets generated (from Oculus emblem crop):**
- `public/pwa-192x192.png` — emblem on white, 192x192
- `public/pwa-512x512.png` — emblem on white, 512x512
- `public/pwa-512x512-maskable.png` — emblem on #002147 blue, 512x512, for Android adaptive icons
- `public/apple-touch-icon.png` — emblem on white, 180x180, for iOS home screen

**Splash screens generated (white Oculus logo on #002147 background):**
- `public/splash-ipad-portrait.png` — 1536x2048
- `public/splash-ipad-landscape.png` — 2048x1536
- `public/splash-ipad-pro-12-portrait.png` — 2048x2732
- `public/splash-ipad-pro-12-landscape.png` — 2732x2048

**Build verified:**
- `npm run build` passes successfully
- `dist/manifest.webmanifest` generated
- `dist/sw.js` service worker generated
- `dist/workbox-*.js` runtime generated
- 22 entries precached (7424 KiB)

### What's next

1. **Find the Vercel preview URL** — Vercel Dashboard > Project > Preview Deployments > feat/pwa, or GitHub repo > feat/pwa branch > "Details" on Vercel check
2. **Run through the testing checklist** — see `docs/PWA_TESTING_CHECKLIST.md`
3. **Fix any issues found** on the `feat/pwa` branch
4. **Merge to main** once all tests pass to deploy to production

### Design decisions made

- **No `user-scalable=no`** — removed from viewport meta to preserve accessibility zoom; touch-action CSS handles map gestures
- **No global min-height 44px** — was breaking compact UI elements; apply selectively instead
- **No offline data layer (IndexedDB)** — deferred; Workbox runtime caching provides basic offline reads; full offline not needed yet
- **Single SW registration approach** — using React hook (`useRegisterSW`) only, not both hook + imperative `registerSW` (causes conflicts)
- **Brand colors throughout** — all PWA UI uses #002147, #4A6B94, #8FA9C8, #A27B5C instead of generic Tailwind indigo
- **iPadOS detection** — uses `navigator.maxTouchPoints > 1` in addition to user agent, since iPadOS 13+ reports as macOS
- **Back button hidden on top-level pages** — /, /master-pipeline, /mapping excluded since they're primary navigation targets
- **Eruda debug script kept** — only loads on localhost/codespaces via dynamic script injection, doesn't affect production
- **8MB Workbox cache limit** — main JS bundle is ~6MB, raised from default 2MB to precache it

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Phase 1: Foundation + Manifest + Meta Tags](#phase-1-foundation--manifest--meta-tags-day-1)
4. [Phase 2: Icons & Assets](#phase-2-icons--assets-day-1)
5. [Phase 3: Service Worker + Update Prompt](#phase-3-service-worker--update-prompt-day-2)
6. [Phase 4: Safe Area, Navigation & Keyboard Handling](#phase-4-safe-area-navigation--keyboard-handling-day-2)
7. [Phase 5: iOS Install Prompt](#phase-5-ios-install-prompt-day-3)
8. [Phase 6: Offline Banner](#phase-6-offline-banner-day-3)
9. [Phase 7: Testing & Validation](#phase-7-testing--validation-day-3-4)
10. [Phase 8: Deployment](#phase-8-deployment-day-4)
11. [Future Enhancements](#future-enhancements)
12. [Success Criteria](#success-criteria)

---

## Overview

### What is a PWA?

A Progressive Web App uses modern web capabilities to deliver an app-like experience:

- **Install** to device home screen
- **Full-screen mode** (no browser UI)
- **Fast loading** with aggressive caching
- **Automatic updates** (no app store)
- **Works on iPad, iPhone, Android, and Desktop**

### Why PWA for OVIS?

- Keep existing React codebase — no rewrite needed
- No App Store approval required
- No $99/year Apple Developer fee
- Automatic updates for users
- Fullscreen map experience on iPad

### What changes in the existing codebase?

Almost nothing. The PWA conversion is **additive**:

- **4 existing files modified** (small additions only):
  - `vite.config.ts` — add PWA plugin
  - `index.html` — add meta tags to `<head>`
  - `src/main.tsx` — add service worker registration (~5 lines)
  - `src/App.tsx` — mount 2-3 overlay components
- **~8 new files created** (components, hooks, assets)
- **Zero changes** to existing components, routing, data fetching, or feature code

If anything goes wrong, remove the plugin and meta tags and you're back to exactly where you started.

### Current Tech Stack (unchanged)

- Vite + React + TypeScript
- Tailwind CSS
- Supabase backend
- Google Maps integration
- React Router

---

## Prerequisites

Before starting, ensure you have:

- [x] Node.js and npm installed
- [x] Current OVIS codebase
- [x] Access to production deployment
- [x] HTTPS-enabled domain (required for PWA)
- [x] Logo/icon files in high resolution (512x512 or vector) — cropped Oculus emblem from existing logo
- [ ] iPad device for testing (or iPad simulator)

---

## Phase 1: Foundation + Manifest + Meta Tags (Day 1)

**Duration:** 3 hours

This phase gets you installable and fullscreen in one shot.

### 1.1 Install Dependencies

```bash
npm install vite-plugin-pwa -D
```

### 1.2 Configure Vite for PWA

Update `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'OVIS - Commercial Real Estate Management',
        short_name: 'OVIS',
        description: 'Manage commercial real estate deals, properties, and contacts',
        theme_color: '#002147',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        orientation: 'any',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5 // 5 minutes
              },
              networkTimeoutSeconds: 10
            }
          },
          {
            urlPattern: /^https:\/\/maps\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-maps-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 1 week
              }
            }
          }
        ]
      }
    })
  ]
});
```

**Caching Strategies Explained:**
- **CacheFirst**: Check cache first, network if not found (fonts — rarely change)
- **NetworkFirst**: Try network, fallback to cache if offline (API data — want fresh)
- **StaleWhileRevalidate**: Return cached immediately, update in background (maps — balance speed/freshness)

### 1.3 Update index.html

Update the `<head>` section in `index.html`. Note: do NOT set `user-scalable=no` or `maximum-scale=1.0` — this kills accessibility zoom. The touch-action CSS handles map gestures without restricting zoom globally.

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />

    <!-- PWA Meta Tags -->
    <meta name="theme-color" content="#002147" />
    <meta name="description" content="Manage commercial real estate deals, properties, and contacts with OVIS" />

    <!-- iOS Specific -->
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="OVIS" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

    <!-- iPad Splash Screens -->
    <link rel="apple-touch-startup-image" href="/splash-ipad-portrait.png" media="(device-width: 768px) and (device-height: 1024px) and (orientation: portrait)">
    <link rel="apple-touch-startup-image" href="/splash-ipad-landscape.png" media="(device-width: 768px) and (device-height: 1024px) and (orientation: landscape)">
    <link rel="apple-touch-startup-image" href="/splash-ipad-pro-12-portrait.png" media="(device-width: 1024px) and (device-height: 1366px) and (orientation: portrait)">
    <link rel="apple-touch-startup-image" href="/splash-ipad-pro-12-landscape.png" media="(device-width: 1024px) and (device-height: 1366px) and (orientation: landscape)">

    <!-- Prevent iOS link preview -->
    <meta name="format-detection" content="telephone=no" />

    <title>OVIS</title>

    <style>
      /* Prevent horizontal scrolling and viewport issues on mobile */
      html, body {
        overflow-x: hidden;
        width: 100%;
        position: relative;
      }

      #root {
        overflow-x: hidden;
        width: 100%;
      }

      /* Prevent iOS Safari double-tap zoom on UI elements */
      * {
        touch-action: pan-x pan-y;
      }

      /* Allow pinch-to-zoom specifically on the map */
      .gm-style,
      .gm-style div {
        touch-action: pinch-zoom pan-x pan-y !important;
      }

      /* Improve tap highlight */
      * {
        -webkit-tap-highlight-color: rgba(0, 33, 71, 0.1);
      }

      /* Smooth scrolling on iOS */
      body {
        -webkit-overflow-scrolling: touch;
      }

      /* Better focus states for keyboard navigation */
      button:focus-visible, a:focus-visible {
        outline: 2px solid #002147;
        outline-offset: 2px;
      }

      /* Safe area insets for standalone mode (notch, home indicator) */
      body {
        padding-top: env(safe-area-inset-top);
        padding-bottom: env(safe-area-inset-bottom);
        padding-left: env(safe-area-inset-left);
        padding-right: env(safe-area-inset-right);
      }

      /* Slide up animation for install prompt */
      @keyframes slide-up {
        from { transform: translateY(100%); }
        to { transform: translateY(0); }
      }

      .animate-slide-up {
        animation: slide-up 0.3s ease-out;
      }
    </style>
  </head>
  <body class="bg-gray-100">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Key changes from v1:**
- `viewport-fit=cover` added — required for safe area insets to work
- No `user-scalable=no` or `maximum-scale=1.0` — preserves accessibility zoom
- `env(safe-area-inset-*)` padding on body — prevents content hiding behind system UI
- Brand color `#002147` used for theme-color, tap highlight, and focus rings
- Removed global `min-height: 44px` on all inputs/buttons (was breaking compact UI elements)
- Removed Eruda debug script (was downloading CDN on production even though it only initialized on localhost)

### 1.4 Verify Setup

```bash
npm run build
```

Check that `dist/` folder contains:
- `manifest.webmanifest`
- `sw.js` (service worker)
- `workbox-*.js`

---

## Phase 2: Icons & Assets (Day 1)

**Duration:** 2 hours

### 2.1 Icon Requirements

Create icons in these sizes:
- **192x192px** — Android home screen
- **512x512px** — Android splash screen / maskable
- **180x180px** — iOS home screen (apple-touch-icon)

### 2.2 Icon Creation

1. Get OVIS logo in SVG or high-res PNG
2. Use https://www.pwabuilder.com/imageGenerator to generate all sizes
3. Optimize with https://tinypng.com/

### 2.3 Icon Design Guidelines

- Simple & recognizable at small sizes
- Solid background (no transparency for maskable icons)
- 10% padding around logo for safe area
- Use brand color `#002147` as background

### 2.4 File Structure

Place icons in `public/` folder:

```
public/
├── pwa-192x192.png
├── pwa-512x512.png
├── apple-touch-icon.png (180x180)
├── favicon.svg (existing)
└── robots.txt (optional)
```

### 2.5 Create Splash Screens (iPad)

**Required sizes:**
- iPad (9.7"): 1536x2048 (portrait), 2048x1536 (landscape)
- iPad Pro 12.9": 2048x2732 (portrait), 2732x2048 (landscape)

**Design:**
- Centered OVIS logo on `#002147` or white background
- App name below logo
- Simple and clean

Place in `public/`:
```
public/
├── splash-ipad-portrait.png
├── splash-ipad-landscape.png
├── splash-ipad-pro-12-portrait.png
└── splash-ipad-pro-12-landscape.png
```

---

## Phase 3: Service Worker + Update Prompt (Day 2)

**Duration:** 3 hours

### 3.1 Register Service Worker via React Hook

Use only the React hook approach (not the imperative `registerSW` — using both causes conflicts).

Update `src/main.tsx` — no changes needed for registration since `vite-plugin-pwa` with `registerType: 'autoUpdate'` handles it automatically. The React component below manages the UI.

### 3.2 Create Update Notification Component

Create `src/components/PWAUpdatePrompt.tsx`:

```typescript
import { useRegisterSW } from 'virtual:pwa-register/react';

export function PWAUpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered: ' + r);
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  if (!offlineReady && !needRefresh) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-[#002147] text-white p-4 rounded-lg shadow-lg z-50 max-w-sm">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          {offlineReady ? (
            <p className="text-sm">App ready to work offline</p>
          ) : (
            <p className="text-sm">New content available, click reload to update.</p>
          )}
        </div>
        <div className="flex gap-2">
          {needRefresh && (
            <button
              onClick={() => updateServiceWorker(true)}
              className="px-3 py-1 bg-white text-[#002147] rounded text-sm font-medium hover:bg-gray-100"
            >
              Reload
            </button>
          )}
          <button
            onClick={close}
            className="px-3 py-1 bg-[#4A6B94] text-white rounded text-sm font-medium hover:bg-[#8FA9C8]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
```

### 3.3 Add TypeScript Declaration

Create `src/vite-pwa.d.ts`:

```typescript
/// <reference types="vite-plugin-pwa/client" />
```

### 3.4 Add to App Component

Update `App.tsx`:

```typescript
import { PWAUpdatePrompt } from './components/PWAUpdatePrompt';

function App() {
  return (
    <>
      {/* Your existing app content */}
      <PWAUpdatePrompt />
    </>
  );
}
```

---

## Phase 4: Safe Area, Navigation & Keyboard Handling (Day 2)

**Duration:** 3 hours

This phase addresses three critical issues that are missing from most PWA guides but essential for iPad standalone mode.

### 4.1 Back Navigation

In standalone mode on iPad, there is no browser back button. Users need in-app navigation.

Create `src/hooks/useStandaloneMode.ts`:

```typescript
import { useState, useEffect } from 'react';

export function useStandaloneMode() {
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in window.navigator && (window.navigator as any).standalone);
    setIsStandalone(!!standalone);
  }, []);

  return isStandalone;
}
```

Create `src/components/PWABackButton.tsx`:

```typescript
import { useNavigate, useLocation } from 'react-router-dom';
import { useStandaloneMode } from '../hooks/useStandaloneMode';

export function PWABackButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const isStandalone = useStandaloneMode();

  // Only show in standalone mode and not on the home/map page
  if (!isStandalone || location.pathname === '/') return null;

  return (
    <button
      onClick={() => navigate(-1)}
      className="fixed top-[calc(env(safe-area-inset-top)+8px)] left-[calc(env(safe-area-inset-left)+8px)] z-50 bg-white/90 backdrop-blur-sm rounded-full p-2 shadow-md"
      aria-label="Go back"
    >
      <svg className="w-6 h-6 text-[#002147]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  );
}
```

### 4.2 Keyboard Handling

The iPad software keyboard pushes content around in standalone PWA mode. This hook helps reposition modals and forms.

Create `src/hooks/useKeyboardHeight.ts`:

```typescript
import { useState, useEffect } from 'react';

export function useKeyboardHeight() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!window.visualViewport) return;

    const viewport = window.visualViewport;

    function onResize() {
      // The difference between window height and visual viewport height = keyboard
      const height = window.innerHeight - (viewport?.height ?? window.innerHeight);
      setKeyboardHeight(Math.max(0, height));
    }

    viewport.addEventListener('resize', onResize);
    return () => viewport.removeEventListener('resize', onResize);
  }, []);

  return keyboardHeight;
}
```

Use this in modals/forms that need to stay visible when the keyboard opens:

```typescript
const keyboardHeight = useKeyboardHeight();

<div style={{ paddingBottom: keyboardHeight > 0 ? keyboardHeight : undefined }}>
  {/* form content */}
</div>
```

### 4.3 Add Back Button to App

Update `App.tsx`:

```typescript
import { PWABackButton } from './components/PWABackButton';
import { PWAUpdatePrompt } from './components/PWAUpdatePrompt';

function App() {
  return (
    <>
      <PWABackButton />
      {/* Your existing app content */}
      <PWAUpdatePrompt />
    </>
  );
}
```

---

## Phase 5: iOS Install Prompt (Day 3)

**Duration:** 2 hours

### 5.1 Create Install Prompt

Create `src/components/IOSInstallPrompt.tsx`:

```typescript
import { useState, useEffect } from 'react';

function isIOSDevice(): boolean {
  // iPadOS 13+ reports as macOS in user agent, so check touch points too
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return isIOS || isIPadOS;
}

function isInStandaloneMode(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in window.navigator && (window.navigator as any).standalone)
  );
}

export function IOSInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const hasSeenPrompt = localStorage.getItem('ios-install-prompt-seen');

    if (isIOSDevice() && !isInStandaloneMode() && !hasSeenPrompt) {
      // Show prompt after 30 seconds of use
      const timer = setTimeout(() => setShowPrompt(true), 30000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('ios-install-prompt-seen', 'true');
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-50 p-4">
      <div className="bg-white rounded-t-2xl p-6 max-w-md w-full animate-slide-up">
        <div className="text-center mb-4">
          <h3 className="text-xl font-bold text-[#002147] mb-2">
            Install OVIS
          </h3>
          <p className="text-[#4A6B94] text-sm mb-4">
            Install OVIS on your iPad for the best experience — fullscreen map, no browser UI
          </p>
        </div>

        <div className="space-y-3 mb-6">
          <div className="flex items-start gap-3 text-sm">
            <span className="font-bold text-[#002147]">1.</span>
            <p>Tap the <strong>Share</strong> button in Safari's toolbar</p>
          </div>
          <div className="flex items-start gap-3 text-sm">
            <span className="font-bold text-[#002147]">2.</span>
            <p>Scroll down and tap <strong>"Add to Home Screen"</strong></p>
          </div>
          <div className="flex items-start gap-3 text-sm">
            <span className="font-bold text-[#002147]">3.</span>
            <p>Tap <strong>"Add"</strong> in the top right</p>
          </div>
        </div>

        <button
          onClick={handleDismiss}
          className="w-full bg-[#002147] text-white py-3 rounded-lg font-medium hover:bg-[#4A6B94]"
        >
          Got it!
        </button>
      </div>
    </div>
  );
}
```

**Key fix from v1:** Uses `navigator.maxTouchPoints > 1` to detect iPadOS 13+, which reports as macOS in the user agent string.

### 5.2 Add to App Component

Update `App.tsx`:

```typescript
import { PWABackButton } from './components/PWABackButton';
import { PWAUpdatePrompt } from './components/PWAUpdatePrompt';
import { IOSInstallPrompt } from './components/IOSInstallPrompt';

function App() {
  return (
    <>
      <PWABackButton />
      <IOSInstallPrompt />
      {/* Your existing app content */}
      <PWAUpdatePrompt />
    </>
  );
}
```

---

## Phase 6: Offline Banner (Day 3)

**Duration:** 1 hour

A simple banner that shows when the device loses connection. No offline data layer — just user awareness.

### 6.1 Online Status Hook

Create `src/hooks/useOnlineStatus.ts`:

```typescript
import { useEffect, useState } from 'react';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
```

### 6.2 Offline Banner Component

Create `src/components/OfflineBanner.tsx`:

```typescript
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 bg-[#A27B5C] text-white px-4 py-2 text-center z-50"
         style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}>
      <p className="text-sm font-medium">
        You're offline — some features may be limited
      </p>
    </div>
  );
}
```

### 6.3 Create Offline Fallback Page

Create `public/offline.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OVIS - Offline</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #F8FAFC;
    }
    .container { text-align: center; padding: 2rem; }
    h1 { color: #002147; margin-bottom: 1rem; }
    p { color: #4A6B94; margin-bottom: 1.5rem; }
    button {
      background: #002147;
      color: white;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 0.5rem;
      font-size: 1rem;
      cursor: pointer;
    }
    button:hover { background: #4A6B94; }
  </style>
</head>
<body>
  <div class="container">
    <h1>You're Offline</h1>
    <p>OVIS needs an internet connection to load.</p>
    <button onclick="window.location.reload()">Try Again</button>
  </div>
</body>
</html>
```

### 6.4 Final App.tsx

```typescript
import { PWABackButton } from './components/PWABackButton';
import { OfflineBanner } from './components/OfflineBanner';
import { IOSInstallPrompt } from './components/IOSInstallPrompt';
import { PWAUpdatePrompt } from './components/PWAUpdatePrompt';

function App() {
  return (
    <>
      <OfflineBanner />
      <PWABackButton />
      <IOSInstallPrompt />
      {/* Your existing app content */}
      <PWAUpdatePrompt />
    </>
  );
}

export default App;
```

---

## Phase 7: Testing & Validation (Day 3-4)

**Duration:** 4 hours

### 7.1 Local Testing

```bash
npm run build
npm run preview
```

Visit http://localhost:4173

### 7.2 Development Testing Checklist

Open Chrome DevTools (F12) → Application tab:

- [ ] Service worker registers (Application > Service Workers)
- [ ] Manifest loads correctly (Application > Manifest)
- [ ] Icons display properly in manifest
- [ ] Cache storage contains assets (Application > Cache Storage)

Network tab:
- [ ] Enable "Offline" checkbox
- [ ] Reload page — should load from cache
- [ ] Cached resources show "(from ServiceWorker)"

### 7.3 iPad Testing Checklist

**On actual iPad:**

1. **Installation:**
   - [ ] Open Safari and visit deployed URL
   - [ ] Tap Share > "Add to Home Screen"
   - [ ] Verify icon appears correctly on home screen
   - [ ] Tap "Add"

2. **Launch:**
   - [ ] Launch from home screen
   - [ ] App opens in full-screen (no Safari UI)
   - [ ] Splash screen appears
   - [ ] Status bar styled correctly
   - [ ] Content is not hidden behind notch/home indicator (safe area insets)

3. **Navigation:**
   - [ ] Back button appears on non-home pages
   - [ ] Back button works correctly
   - [ ] Back button does not appear on home/map page

4. **Keyboard:**
   - [ ] Open a form/modal
   - [ ] Keyboard appears, content adjusts
   - [ ] Form fields remain visible above keyboard

5. **Offline:**
   - [ ] Enable Airplane Mode
   - [ ] Offline banner appears
   - [ ] Disable Airplane Mode
   - [ ] Banner disappears

6. **Orientation:**
   - [ ] Test portrait mode
   - [ ] Test landscape mode
   - [ ] Layout adapts correctly

7. **Updates:**
   - [ ] Make a change and redeploy
   - [ ] Reload app on iPad
   - [ ] Update prompt appears
   - [ ] Tap "Reload" — new version loads

### 7.4 Lighthouse PWA Audit

```bash
npm install -g lighthouse
lighthouse https://your-ovis-url.com --view --preset=desktop
```

**Required PWA Criteria (all must pass):**
- Installable
- Offline capable
- Fast load time
- Themed address bar

**Common Issues & Fixes:**

| Issue | Fix |
|-------|-----|
| "Not installable" | Check manifest has all required fields |
| "No matching service worker" | Verify sw.js is being served |
| "Does not work offline" | Check service worker caches assets |
| "HTTPS required" | Deploy to HTTPS domain |

---

## Phase 8: Deployment (Day 4)

**Duration:** 2 hours

### 8.1 Build for Production

```bash
npm run build
```

Verify output in `dist/`:
- `manifest.webmanifest`
- `sw.js`
- `workbox-*.js`
- All icon files
- `offline.html`

### 8.2 Configure Deployment Headers

#### For Vercel:

Create `vercel.json` in project root:

```json
{
  "headers": [
    {
      "source": "/sw.js",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=0, must-revalidate"
        },
        {
          "key": "Service-Worker-Allowed",
          "value": "/"
        }
      ]
    }
  ]
}
```

#### For Netlify:

Create `netlify.toml` in project root:

```toml
[[headers]]
  for = "/sw.js"
  [headers.values]
    Cache-Control = "public, max-age=0, must-revalidate"
    Service-Worker-Allowed = "/"

[[headers]]
  for = "/manifest.webmanifest"
  [headers.values]
    Content-Type = "application/manifest+json"
```

### 8.3 Deploy & Verify

```bash
git add .
git commit -m "feat: Add PWA capabilities for iPad standalone experience"
git push
```

1. Visit production URL
2. Open DevTools > Application
3. Check service worker is registered
4. Check manifest loads
5. Test installation on iPad

### 8.4 HTTPS Requirement

**CRITICAL:** PWAs ONLY work over HTTPS (except localhost).

Most hosts provide HTTPS automatically:
- Vercel — Automatic
- Netlify — Automatic
- GitHub Pages — Automatic
- Custom hosting — Configure SSL certificate

---

## Future Enhancements

These are deferred from the initial implementation but can be added later if needed:

### Offline Data Persistence (IndexedDB)

If field users need to work without internet, add IndexedDB caching via the `idb` library to store deals, properties, and contacts locally. This is a significant effort (~8 hours) and should only be done if offline field use becomes a real requirement. The Workbox runtime caching in Phase 1 already provides basic offline reads of previously-fetched API data.

### Install Button for Chrome/Edge

An in-app "Install" button that triggers the `beforeinstallprompt` event on desktop browsers. Not needed for iPad (which uses the Share > Add to Home Screen flow).

### Push Notifications

Requires a push notification service and backend changes. Not available on iOS Safari as of mid-2025 without user opt-in.

### Analytics & Monitoring

Track PWA installs, offline usage, cache performance via Google Analytics or similar. Nice to have but not essential for launch.

---

## Success Criteria

Your PWA is ready when ALL of these are true:

### Technical
- [ ] Lighthouse PWA score is 100
- [ ] Service worker registers without errors
- [ ] Manifest loads correctly
- [ ] All icons display properly
- [ ] HTTPS enabled on production

### User Experience
- [ ] App installs on iPad home screen
- [ ] Opens in full-screen mode (no browser UI)
- [ ] Splash screen displays on launch
- [ ] Content respects safe area insets
- [ ] Back navigation works in standalone mode
- [ ] Keyboard doesn't hide form fields
- [ ] Works in both portrait and landscape

### Functionality
- [ ] Update prompt appears for new versions
- [ ] Install prompt shows on iOS/iPadOS
- [ ] Offline banner appears when disconnected
- [ ] No console errors

---

## File Structure After Implementation

```
react-kanban-board/
├── public/
│   ├── pwa-192x192.png                          # NEW
│   ├── pwa-512x512.png                          # NEW
│   ├── apple-touch-icon.png                     # NEW
│   ├── splash-ipad-portrait.png                 # NEW
│   ├── splash-ipad-landscape.png                # NEW
│   ├── splash-ipad-pro-12-portrait.png          # NEW
│   ├── splash-ipad-pro-12-landscape.png         # NEW
│   ├── offline.html                             # NEW
│   ├── favicon.svg                              # EXISTING
│   └── gps-debug.html                           # EXISTING
├── src/
│   ├── components/
│   │   ├── PWAUpdatePrompt.tsx                  # NEW
│   │   ├── PWABackButton.tsx                    # NEW
│   │   ├── OfflineBanner.tsx                    # NEW
│   │   ├── IOSInstallPrompt.tsx                 # NEW
│   │   └── ... (existing components)
│   ├── hooks/
│   │   ├── useOnlineStatus.ts                   # NEW
│   │   ├── useStandaloneMode.ts                 # NEW
│   │   ├── useKeyboardHeight.ts                 # NEW
│   │   └── ... (existing hooks)
│   ├── vite-pwa.d.ts                            # NEW
│   ├── App.tsx                                  # MODIFIED (add 4 component imports)
│   ├── main.tsx                                 # EXISTING (no changes needed)
│   └── ... (existing files)
├── index.html                                   # MODIFIED (meta tags + CSS)
├── vite.config.ts                               # MODIFIED (add PWA plugin)
├── package.json                                 # MODIFIED (1 new dev dependency)
├── vercel.json                                  # NEW (if using Vercel)
└── PWA_CONVERSION_PLAN.md                       # THIS FILE
```

---

## Resources

- [Vite PWA Plugin](https://vite-pwa-org.netlify.app/)
- [Workbox](https://developers.google.com/web/tools/workbox)
- [PWA Builder](https://www.pwabuilder.com/) — Icon generator & testing
- [Lighthouse](https://developers.google.com/web/tools/lighthouse) — PWA auditing
- [web.dev PWA Guide](https://web.dev/progressive-web-apps/)
