This is the smart move. Providing the "Search" and "Auth" logic in a file ensures Claude Code builds the exact infrastructure you need without getting lost in the weeds.

I have refined the **Scraper Logic** to use **Playwright's "User-Facing Locators"** instead of brittle CSS classes (which break every time a website updates).

Here is the final, comprehensive `hunter_spec.md` file. Save this locally, and then you are ready to launch.

###**Filename: `hunter_spec.md**````markdown
# OVIS Agent Specification: "The Hunter" (Commercial Real Estate Prospecting)

## 1. Project Overview
We are building "The Hunter," an autonomous Python-based agent for OVIS (our internal operating system). 
**Role:** Commercial Real Estate Scouting Engine.
**User:** Mike, Principal Broker at Oculus Real Estate Partners (Tenant Rep for Retail/Restaurant).
**Goal:** Scrape industry news, podcasts, and social signals daily to identify "Emerging Concepts" (Retail/Restaurant brands) expanding in the Southeast.
**Core Philosophy:** "Speed and Volume." Identify the lead, find the decision-maker, and draft the outreach before the competition knows the brand is looking.

## 2. Technical Architecture
* **Language:** Python 3.10+
* **Framework:** `LangChain` (for LLM Logic) + `Playwright` (for Scraping).
* **Database:** PostgreSQL (OVIS internal DB) with `pgvector` for storing embedding search.
* **LLM Model:** Gemini 2.0 Flash (Fast/Creative) via Vertex AI or Google AI Studio.
* **Scheduling:** Scripts will be triggered via `pg_cron` daily at 09:00 AM.

## 3. Module 1: The Gatherer (Scraping & Recon)

### A. Authentication Strategy (The "VIP Pass")
The agent uses a Headless Browser (Playwright) to log in. We use **User-Facing Locators** (e.g., `get_by_placeholder`) rather than brittle CSS selectors.

**Target Sites & Login Patterns:**

**1. Nation's Restaurant News (NRN)**
* **Login URL:** `https://www.nrn.com/user/login` (or typically `/account`)
* **Strategy:**
    * `page.get_by_label("Email Address").fill(os.getenv("NRN_USER"))`
    * `page.get_by_label("Password").fill(os.getenv("NRN_PASS"))`
    * `page.get_by_role("button", name="Log In").click()`
* **Target URL for Scraping:** `https://www.nrn.com/emerging-chains`

**2. QSR Magazine**
* **Login URL:** `https://www.qsrmagazine.com/login`
* **Strategy:** Look for "Sign In" link in Nav -> Fill "Email" / "Password" -> Click "Login".
* **Target URL for Scraping:** `https://www.qsrmagazine.com/growth`

**3. Atlanta Business Chronicle (BizJournals)**
* **Login URL:** `https://www.bizjournals.com/atlanta/login`
* **Strategy:** This site often detects bots.
    * *Action:* Use `playwright-stealth` plugin.
    * *Action:* Randomize mouse movements before clicking "Sign In".

### B. Podcast Monitor (RSS)
The agent consumes RSS feeds, downloads audio if < 24h old, and transcribes it.
* **Feeds:** * *Restaurant Unstoppable:* `https://restaurantunstoppable.libsyn.com/rss`
    * *Franchise Times Dealmakers:* (Find RSS URL)
* **Process:** Fetch RSS -> Parse XML -> Check Date -> `transcribe_audio(mp3_url)` -> Return Text.

### C. Social Signals (API/Search)
* **Method:** Use `Nitter` (Twitter frontend) or official API if available to search specific strings.
* **Query:** `("VP of Real Estate" OR "Director of Construction") AND ("hiring" OR "opening soon") AND ("Atlanta" OR "Southeast")`

## 4. Module 2: The Brain (Analysis & Extraction)
Raw text is passed to the LLM with the "Mike Persona" to extract structured data.

### Input Data
Raw HTML body text or Podcast Transcript.

### Output Data (Pydantic Model)
The LLM must return a JSON object adhering to this schema:
```python
from pydantic import BaseModel, Field
from typing import Optional, Literal

class LeadCard(BaseModel):
    concept_name: str = Field(description="Name of the retail/restaurant brand")
    industry_segment: str = Field(description="e.g., QSR, Fast Casual, Fine Dining")
    signal_source: str = Field(description="Where this intel came from")
    signal_strength: Literal["HOT", "WARM", "COLD"] = Field(description="HOT if Southeast specific, WARM if National growth, COLD if unrelated")
    summary_reasoning: str = Field(description="1-2 sentences in Mike's voice explaining why we care")
    target_geography: Optional[str] = Field(description="Specific regions mentioned (e.g. 'Atlanta', 'Sunbelt')")
    key_person_name: Optional[str] = Field(description="Name of the VP/Director mentioned")
    key_person_role: Optional[str] = Field(description="Job title of the key person")
    suggested_action: Literal["Draft Email", "Social DM", "Monitor"]

```

##5. Module 3: The "Mike" Persona (System Prompt)*Copy this exact prompt into the LLM logic:*

"You are The Hunter, the elite prospecting scout for Mike at Oculus Real Estate Partners.
**Your User (Mike):** A Commercial Tenant Rep broker who values Speed, Volume, and Proprietary Intel. He helps Retail/Restaurant brands expand.
**Your Job:** Analyze this text. Look for MONEY (Private Equity raises), MOVEMENT (Expansion plans), and MANDATES (Hiring Real Estate VPs).
**Constraint:** Specifically look for interest in the 'Southeast', 'Georgia', or 'Atlanta'.
**Tone:** Professional, direct, 'Insider'. No marketing fluff.
**Output:** Extract the data into the JSON format provided."

##6. Development Phases (Instructions for Claude Code)**Phase 1: The Scraper Skeleton**

* Create `scrapers/auth_browser.py`: A reusable Playwright class.
* Create `scrapers/rss_monitor.py`: The podcast fetcher.
* *Note:* Ensure `requirements.txt` includes `playwright`, `beautifulsoup4`, `feedparser`, `pydantic`.

**Phase 2: The Analyst**

* Create `analysis/llm_wrapper.py`: The function that sends text to Gemini and validates the JSON response.

**Phase 3: The Reporter**

* Create `run_hunter.py`: The main loop that orchestrates the daily run.

```

---

### **Action Item: Launching Claude Code**

1.  **Save** the content above as `hunter_spec.md`.
2.  **Run** this command in your terminal:

```bash
claude "I need to build the OVIS Hunter Agent. Please read 'hunter_spec.md'. Start by initializing the project structure and writing the 'scrapers/auth_browser.py' module using Playwright. Use 'get_by_label' locators for robustness."

```
```bash
claude "Install the dependencies we just discussed"

```

