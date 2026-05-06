# Project H — Local Mac Mini OpenClaw Server

**Status:** Planning scaffold — pending detailed interview
**Source:** [ovis-openclaw-agent-architecture-specs.md §3](ovis-openclaw-agent-architecture-specs.md)

---

## Goal

Run OpenClaw on an always-on Mac Mini at the office to provide:
- Residential IP for scraping (cloud IPs get blocked)
- Local execution wrapper for terminal commands that need to run from your network
- Always-on availability without keeping a laptop running
- Optional local Llama hosting for cheap repetitive work

## Current State

OpenClaw runs from your laptop / cloud. No always-on server. Some scraping fails because cloud IPs are blocked or sites require a logged-in session that only works from your network.

## Target State

A dedicated Mac Mini at the office running OpenClaw 24/7, addressable via Tailscale, optionally hosting a local Llama model for bulk work that doesn't need Claude-level reasoning.

## Why Local

- **Residential IP:** sites that block cloud data center IPs (Hunter target sites, news sites you can't reach from cloud)
- **Logged-in scraping:** wrap working terminal commands as OpenClaw tools that execute locally with your existing session
- **Remote trigger:** you trigger via OpenClaw API from anywhere; the Mac Mini executes from the residential IP
- **No laptop dependency:** runs while you're traveling/asleep

## Caveat

Residential IP isn't a silver bullet. Sites that fingerprint behavior (headers, request patterns, rate limits) will block regardless. Plan for:
- Rotating user-agent headers
- Request throttling / human-like timing
- Session/cookie management for logged-in scraping

## Setup Checklist

- Mac Mini hardware (sufficient RAM for OpenClaw + any local Llama)
- Static local network / Tailscale for remote access
- OpenClaw installed with persistent session (tmux or launchd)
- API endpoint exposed via Tailscale only — **no public internet exposure**
- Optional: local Llama model for cheap repetitive tasks
- Backup / recovery plan for the agent state

## Dependencies

- This unlocks Project C (Hunter) at full effectiveness
- Indirectly enables E (news scraping) to work for blocked sources
- Llama deployment decision feeds into C and E cost profiles

## Open Questions for Interview

1. **Hardware spec:** Which Mac Mini config? (M-series chip? RAM size? Storage?) Drives Llama model-size ceiling.
2. **Llama deployment:** Same Mac Mini, or separate hardware? Which model size? (7B, 13B, 70B?)
3. **Office network:** Static IP available? Router-level configuration access for port forwarding to Tailscale?
4. **Tailscale already set up:** Or fresh install? Account/billing in place?
5. **Persistent session strategy:** tmux + auto-restart? launchd? Docker?
6. **Backup:** What state needs to survive a crash/reboot? OpenClaw transcripts, scrape state, anything else?
7. **Monitoring:** How do you know the Mac Mini is healthy / agents are running? (Push alert to Telegram on failure?)
8. **Power/network resilience:** Office UPS? What happens during an internet outage?
9. **Update cadence:** Who/what keeps OpenClaw + dependencies updated? Manual or scripted?
10. **Multi-tenant agents:** Can multiple agents (Hunter, news scraper) run concurrently without colliding?

## Build Effort Estimate

Hardware + base setup: 1–2 days once Mac Mini is procured.
OpenClaw + Tailscale + persistent-session config: ~2 days.
Llama deployment (if pursued): ~1 week to get a model running well, with prompt-tuning ongoing.
