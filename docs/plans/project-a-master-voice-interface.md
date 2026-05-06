# Project A — Master Voice Interface ("Hey OVIS")

**Status:** Planning scaffold — pending detailed interview
**Source:** [ovis-openclaw-agent-architecture-specs.md §2.A](ovis-openclaw-agent-architecture-specs.md)

---

## Goal

One-tap voice interface from the iPhone (especially while driving) that routes to OVIS agents and reads responses back aloud.

## Current State

Nothing built. Telegram exists for text-based agent interaction but is reserved for scheduled push briefings, not real-time voice.

## Target Architecture

```
iPhone Shortcut (1 tap)
   → record audio
   → POST to Whisper API (transcription)
   → POST to OpenClaw master orchestrator
       → master agent reasons about intent
       → routes to sub-agent (CFO, Hunter, Tasks, Briefing, etc.)
       → sub-agent calls OVIS tools
       → returns structured response
   → POST text to TTS (ElevenLabs or Google Cloud TTS)
   → play audio back through Shortcut
```

Direct API path — no Telegram in the loop. Telegram stays for scheduled push.

## Components to Build

**iOS side:**
- Apple Shortcut: record → upload → playback
- Auth/secret handling for the OpenClaw endpoint

**OpenClaw side:**
- Master orchestrator agent with intent-routing logic
- Sub-agent registry / dispatch mechanism
- Whisper integration (OpenAI hosted or local on Mac Mini)
- TTS integration

**OVIS side:**
- API endpoint(s) that sub-agents call as tools (most reuse from other projects)
- Optional: voice transcript dashboard for review/debug

## Cost Profile

- Whisper: pennies per query
- Agent reasoning: standard Claude API cost per call (no idle loops)
- TTS: fraction of a cent per thousand characters
- Pure pay-as-you-go — set spending alerts

## Dependencies

- This is the unlock for D (morning briefing), E (news/inbox triage), and ad-hoc CFO queries
- Sub-agents must exist before they're useful here, but the orchestrator + plumbing can be built first against a stubbed sub-agent

## Open Questions for Interview

1. **TTS provider:** ElevenLabs (premium voice) vs. Google Cloud TTS (cheaper)?
2. **Whisper:** OpenAI-hosted vs. local Whisper on the Mac Mini?
3. **Conversation memory:** Does the master agent remember across Shortcut invocations, or is each tap standalone?
4. **Auth model:** How does the Shortcut authenticate to OpenClaw? (Static token? Per-device key?)
5. **Wake-word vs. tap-to-talk:** Confirmed tap-only via Shortcut, or do we want anything ambient?
6. **Latency budget:** What's the acceptable round-trip ceiling before this feels broken in the car?
7. **Failure mode:** What happens when no signal / API error mid-drive — silent fail, retry, cached response?
8. **Multi-modal:** Should responses ever include a text/SMS fallback for things you'd want to see (e.g., a list)?

## Build Effort Estimate

~1–2 weeks of focused Claude Code work for the backend. Shortcut itself is hours.
