# Debugging Rules and Best Practices

## Critical Rule: Always Ask for Specifics FIRST

**RULE #1: When a user reports a visual issue (twitching, flickering, glitching, etc.), IMMEDIATELY ask these questions BEFORE attempting any fixes:**

1. **Which specific component or UI element is experiencing the issue?**
   - Is it the entire page?
   - A specific modal/slideout?
   - A particular button or form field?
   - A sidebar or panel?

2. **When exactly does it happen?**
   - On page load?
   - When clicking a specific button?
   - When opening a modal?
   - Continuously or just once?

3. **What action triggers it?**
   - Opening a slideout?
   - Clicking a button?
   - Typing in a field?
   - Hovering over something?

### Why This Rule Exists

**Case Study: "Twitching" Issue - November 4, 2025**

**What Happened:**
- User reported "still twitching" issue
- I assumed it was the Property Details slideout (the main component being worked on)
- Spent significant time debugging:
  - Fixed useAutosave hook infinite loops
  - Fixed unstable callback references
  - Memoized style objects
  - Added stable function references
- After multiple attempts, user clarified: "its always been with the Add Contact to property modal"
- The actual issue was a simple unstable empty array default parameter `existingContactIds = []`
- Fix took 2 minutes once the correct component was identified

**Time Wasted:** ~30-45 minutes debugging the wrong component

**Actual Fix:**
```typescript
// WRONG - creates new array on every render
existingContactIds = []

// CORRECT - stable reference
const EMPTY_ARRAY: string[] = [];
existingContactIds = EMPTY_ARRAY
```

**Lesson Learned:** Always ask "WHICH specific part of the screen is twitching?" before making any assumptions.

## Common Visual Issues and Their Causes

### 1. Twitching/Flickering/Continuous Re-rendering

**Common Causes:**
- Unstable array/object references in props or dependency arrays
- Default parameters creating new objects/arrays: `prop = []` or `prop = {}`
- Inline functions in dependency arrays
- Missing useCallback/useMemo wrappers
- Infinite loops in useEffect

**Debugging Approach:**
1. Ask which specific component is twitching
2. Add console.log with render counter to that component
3. Check for unstable references in props
4. Check useEffect dependency arrays
5. Look for default parameters with object/array literals

### 2. Component Not Updating

**Common Causes:**
- Missing dependencies in useEffect
- Stale closure capturing old values
- React.memo blocking necessary updates
- Missing state setters

### 3. Initial Flash/Jump on Mount

**Common Causes:**
- Inline style objects triggering CSS transitions
- State initialization happening after first render
- CSS transition-all on mount

## Debugging Checklist

When a user reports ANY visual bug:

- [ ] Ask: "Which specific component/element has the issue?"
- [ ] Ask: "When does it happen?" (mount, click, hover, etc.)
- [ ] Ask: "Does it happen once or continuously?"
- [ ] Add render counting console.logs to the SPECIFIC component
- [ ] Check that component's props for unstable references
- [ ] Check that component's useEffect dependency arrays
- [ ] Look for default parameters with `= []` or `= {}`
- [ ] Check for inline functions/objects in props

## Never Assume

❌ **Wrong Approach:**
```
User: "still twitching"
Developer: *assumes it's the main component being worked on*
Developer: *spends 30 minutes debugging the wrong component*
```

✅ **Correct Approach:**
```
User: "still twitching"
Developer: "Which specific part of the screen is twitching?
           The Property Details slideout itself, or a
           modal/button within it?"
User: "The Add Contact modal when I click the Add button"
Developer: *debugs the correct component, fixes in 2 minutes*
```

## Summary

**The golden rule: ASK FIRST, DEBUG SECOND**

Never waste time making assumptions about which component has an issue. Always get specific clarification from the user about:
1. WHAT is twitching/glitching
2. WHEN does it happen
3. WHAT triggers it

This simple clarification can save hours of debugging time.
