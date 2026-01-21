# Restaurant Sales Trend Chart - Fix Documentation

**Date:** January 15, 2026
**Issue:** `TypeError: X is not a constructor` when clicking restaurant pins to view sales trend chart
**Status:** FIXED - Replaced nivo with recharts

---

## The Problem

When users clicked the "Trend" button on restaurant pins in the OVIS mapping feature, the app crashed with a white screen and console errors like:
- `TypeError: Dv is not a constructor`
- `TypeError: r1 is not a constructor`
- `TypeError: wv is not a constructor`

These are minified class names from the `@nivo/line` chart library.

---

## Root Cause

The `@nivo/line` library has fundamental incompatibilities with Vite's ES module bundling. The error persisted even when reverting to the exact package-lock.json from when the chart was first implemented (commit `c6c15e1` from Nov 5, 2025). This indicates transitive dependency drift over the 2+ months since implementation.

---

## What We Tried (Did NOT Work)

### 1. Vite optimizeDeps Configuration
```typescript
// vite.config.ts
optimizeDeps: {
  include: [
    '@nivo/line',
    '@nivo/core',
    '@nivo/colors',
    '@nivo/scales',
    '@nivo/axes',
    '@nivo/legends',
    '@nivo/tooltip'
  ]
}
```
**Result:** Still crashed with constructor error

### 2. CommonJS/ESM Transform
```typescript
// vite.config.ts
build: {
  commonjsOptions: {
    transformMixedEsModules: true
  }
}
```
**Result:** Still crashed with constructor error

### 3. Manual Chunks (Code Splitting)
```typescript
// vite.config.ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'charts': ['@nivo/line', '@nivo/core', 'recharts']
      }
    }
  }
}
```
**Result:** Still crashed with constructor error

### 4. React.lazy() with Dynamic Import
Created separate `SalesTrendChart.tsx` component and lazy loaded it:
```typescript
const SalesTrendChart = React.lazy(() => import('../../charts/SalesTrendChart'));

// In render:
<Suspense fallback={<div>Loading chart...</div>}>
  <SalesTrendChart data={chartData} />
</Suspense>
```
**Result:** Still crashed with constructor error

### 5. Full Revert to "Working" State
- Reverted `package-lock.json` to commit `887a1b2`
- Reverted `PinDetailsSlideout.tsx` to commit `887a1b2`
- Ran `npm ci` for exact dependency installation
- Reverted `vite.config.ts` to simple config

**Result:** STILL CRASHED - proving the error existed before but wasn't noticed

---

## Investigation Findings

### Timeline
- **Nov 5, 2025** (commit `c6c15e1`): Chart first implemented with @nivo/line
- **Jan 8, 2026** (commit `71282df`): exceljs added for Excel download feature
- **Jan 15, 2026**: Error discovered during testing

### Key Insight
The error was already present in the codebase but wasn't noticed until testing on Jan 15, 2026. Over 2+ months of npm package updates caused transitive dependency incompatibilities that cannot be fixed by reverting.

### exceljs Conflict Investigation
User asked if exceljs could be conflicting. While exceljs was added after the chart, it was ruled out as the cause since reverting to pre-exceljs state still produced the error.

---

## The Fix (WORKED)

Replaced `@nivo/line` with `recharts` (already installed in the project):

### 1. Changed Import
```typescript
// Before
import { ResponsiveLine } from '@nivo/line';

// After
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
```

### 2. Replaced Chart Component
The recharts `AreaChart` was configured to match the same visual styling:
- Dark gradient background
- Orange gradient fill (`#fb923c` to `#ea580c`)
- Custom tooltip with animated pulse dot
- Cardinal curve type
- Same axis labels and formatting

### 3. Removed @nivo/line Dependency
```bash
# Removed from package.json
"@nivo/line": "^0.99.0"

# npm install removed 46 packages (nivo ecosystem)
```

---

## Files Changed

1. **`src/components/mapping/slideouts/PinDetailsSlideout.tsx`**
   - Line 29: Changed import from `@nivo/line` to `recharts`
   - Lines 1246-1333: Replaced `ResponsiveLine` with `AreaChart`

2. **`package.json`**
   - Removed `@nivo/line` dependency

3. **`package-lock.json`**
   - Removed 46 nivo-related packages

---

## Deployment

Deployed to **ovis-online** on Vercel:
```bash
vercel link --project ovis-online --yes
vercel --prod --yes
```

Build output: `index-5c524491.js`

---

## Lessons Learned

1. **nivo + Vite = Problems**: The @nivo library has known bundling issues with Vite. Consider using recharts or other chart libraries that work better with ES modules.

2. **Transitive Dependencies**: Even with locked package-lock.json, transitive dependencies can cause issues over time. Regular testing of all features is important.

3. **recharts is Reliable**: recharts works well with Vite and provides similar functionality to nivo with less complexity.

---

## If Issues Return

If chart issues return in the future:
1. Check that recharts imports are correct
2. Verify recharts version compatibility (currently using 3.3.0)
3. Do NOT go back to @nivo/line - it has fundamental bundling issues with Vite
