This document breaks down the entire architecture: the headless browser (Crawler), the Gemini Vision integration (Analyst), the database schema, and the Admin Dashboard.

Project Spec: OVIS "UX Whisperer" Agent
Executive Summary
We are implementing an Autonomous Visual QA Agent ("The UX Whisperer") to continuously audit the OVIS user interface. Unlike our code-based agents, this agent uses Computer Vision (Gemini 2.5 Flash) to "look" at the application just like a user does.

The goal is to catch visual regressions, layout bugs, mobile responsiveness issues, and inconsistent styling without manual testing.

System Architecture
1. The Crawler (Cron Job)

Wakes up on a schedule (e.g., nightly).

Logs into OVIS as a test user.

Navigates to critical paths (Dashboard, Email, Deals).

Captures high-res Screenshots (Desktop & Mobile viewports).

Uploads images to Supabase Storage.

2. The Analyst (Gemini Vision)

Receives the screenshots.

Analyzes them using the gemini-2.5-flash model.

Identifies UI/UX issues (contrast, alignment, broken layouts).

Outputs structured JSON suggestions.

3. The Reviewer (Admin Dashboard)

A new UI view where the Admin reviews the "Audit Report."

Allows the Admin to Accept (create a dev task) or Dismiss (ignore) suggestions.

Phase 1: The Crawler (Backend)
We need a headless browser solution to capture the state of the UI.

Implementation Logic:

Technology: Use puppeteer-core (running in a Supabase Edge Function if binary limits allow, or via an external browserless service/container).

Authentication: The script must handle Supabase Auth login to access protected routes.

Target Routes:

/dashboard

/emails/:id (Detail View)

/deals (Pipeline View)

/settings

Viewports: For each route, capture:

Desktop: 1920 x 1080

Mobile: 390 x 844 (iPhone 14 equivalent)

Output:

Save images to Supabase Storage Bucket: ux-audit-screenshots.

Naming convention: YYYY-MM-DD/[route]_[viewport].png.

Phase 2: The Database Schema
We need two tables to track audits and specific suggestions.

Table 1: ux_audit_runs
id (uuid, PK)

created_at (timestamp)

page_route (text) - e.g., "/deals"

viewport (text) - "desktop" | "mobile"

screenshot_url (text) - Supabase Storage URL

status (text) - "analyzing" | "completed" | "failed"

Table 2: ux_suggestions
id (uuid, PK)

audit_run_id (uuid, FK)

issue_type (text) - "layout", "contrast", "typography", "consistency"

severity (text) - "low", "medium", "high"

description (text) - The AI's finding (e.g., "The Save button is cut off")

suggested_fix (text) - The AI's technical suggestion (e.g., "Add pb-4 to container")

status (text) - "pending", "accepted", "dismissed"

admin_notes (text) - Optional feedback from user

Phase 3: The Analyst (Gemini Integration)
Edge Function: ux-analyzer

Model Config:

Model: gemini-2.5-flash (Using the paid tier / v1beta).

Input: Multi-modal (Text Prompt + Image Data).

System Prompt:

"You are the Lead UX Architect for OVIS, a high-end Real Estate CRM.

Your Task: Analyze the attached screenshot of our application. Look For:

Layout Bugs: Overlapping elements, cut-off text, misalignment.

Mobile Issues: Elements that are too small to tap or break the viewport.

Consistency: Fonts or buttons that don't match the design system.

Aesthetics: Poor contrast or whitespace usage.

Output: Return a JSON array of specific issues. Be technical (reference CSS concepts like padding, margins, flexbox). If the UI looks perfect, return an empty array."

Phase 4: The Dashboard (Frontend)
Create a new page: /admin/ux-audit

Layout: "The Inspector"

Left Pane (60%): Displays the screenshot.

Include a toggle to switch between Desktop/Mobile screenshots.

(Bonus) Allow "Drawing/Annotating" on the image in the future.

Right Pane (40%): A list of "Insight Cards" from Gemini.

The Insight Card:

Header: Issue Type + Severity Badge (Red/Yellow/Blue).

Body: The description and suggested_fix.

Action Footer:

Button [Dismiss]: Marks status as 'dismissed'.

Button [Create Task]: Marks status as 'accepted'.

Logic: In the future, this will trigger a Claude coding task. For now, it just flags it as "To Do."

Implementation Plan
Database: Run migrations to create ux_audit_runs and ux_suggestions.

Storage: Create the ux-audit-screenshots bucket in Supabase (Public).

Backend: Create the ux-audit-crawler Edge Function to take/upload screenshots.

AI: Connect the ux-analyzer logic to send those images to Gemini 2.5.

Frontend: Build the /admin/ux-audit dashboard to visualize the results.