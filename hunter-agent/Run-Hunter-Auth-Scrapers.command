#!/bin/bash
# Double-click this file to run the auth-required scrapers (NRN + BizJournals)
# These require login and work better from your Mac's residential IP

cd "$(dirname "$0")"
echo "Starting Hunter Auth Scrapers..."
echo ""

# Run the scraper
npx ts-node --transpile-only scripts/run-auth-scrapers.ts

echo ""
echo "Press any key to close..."
read -n 1
