# Restaurant Trends Excel Files

Place your annual Restaurant Trends Excel files here.

## File Naming Requirements

Files MUST contain `YE##` in the name where ## is the 2-digit year:

✅ **Valid Names:**
- `YE24 Oculus SG.xlsx`
- `YE25 Data.xlsx`
- `YE26_restaurant_trends.xlsx`

❌ **Invalid Names:**
- `Restaurant Trends 2024.xlsx` (missing YE##)
- `Trends YE-24.xlsx` (wrong format)

## Quick Start

When you receive a new file:

1. **Place file here** (in `Screen Shots/` folder)

2. **Run the test script:**
   ```bash
   cd /Users/mike/Documents/GitHub/react-kanban-board
   ./etl/test-annual-load.sh "Screen Shots/YE25 Oculus SG.xlsx"
   ```

3. **Follow the prompts** - the script will guide you through each step

## Full Instructions

See: [etl/ANNUAL_LOAD_GUIDE.md](../etl/ANNUAL_LOAD_GUIDE.md)

---

**Last Updated:** 2025-11-05
