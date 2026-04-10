"""
triage.py — Anthropic-powered Triage Brief generator for TraceVault.

Consumes the list of incidents already retrieved by VectorAI DB and asks
Anthropic to synthesise a short, structured brief from those incidents only.

Design rules (non-negotiable):
- The LLM receives ONLY the retrieved incidents — no open-ended knowledge.
- If ANTHROPIC_API_KEY is absent or the call fails, returns None silently so
  the caller can degrade gracefully without breaking normal search results.
- No chat, no agents, no tool-calling — a single, deterministic completion.
"""

import json
import logging
import os
from typing import Any, Dict, List, Optional

log = logging.getLogger("tracevault.triage")

# ── Config ────────────────────────────────────────────────────────────────────

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL   = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")

# Hard cap: we only feed the top N retrieved incidents to the brief so the
# prompt stays concise. The caller already limits search results to top_k.
MAX_INCIDENTS_FOR_BRIEF = 5

# ── Prompt template ───────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are a triage assistant inside TraceVault, an incident-management tool.
Produce a compact, scannable triage brief from retrieved historical incidents only.

Rules — no exceptions:
1. Every claim must be directly traceable to the retrieved incidents.
2. Do NOT use general engineering knowledge or training data.
3. If a section lacks supporting data, write: "Insufficient data in retrieved incidents."
4. No speculation. No padding. No generic advice.
5. Output valid JSON only — no markdown fences, no preamble.
6. Keep every field SHORT. Judges scan this in seconds. Omit anything redundant.
"""

_USER_TEMPLATE = """\
New incident query submitted. Use ONLY the retrieved incidents below — no other knowledge.

=== QUERY ===
{query}

=== RETRIEVED INCIDENTS ({count} matches) ===
{incidents_block}

=== OUTPUT FORMAT ===
Return a single JSON object with exactly these five keys:

{{
  "failure_family": "<One tight sentence naming the failure category seen across retrieved incidents.>",
  "likely_cause":   "<One sentence: most probable root cause based on retrieved incidents.>",
  "first_response_checks": [
    "<Action-verb first. ≤12 words. Sourced from retrieved incidents.>",
    "<Action-verb first. ≤12 words.>",
    "<Action-verb first. ≤12 words.>"
  ],
  "known_fix_pattern": "<1–2 sentences max. The fix pattern from retrieved incidents. No fluff.>",
  "confidence_note":   "<One honest sentence. State match quality and any gaps. Do not overclaim.>"
}}

Strict length rules:
- failure_family: ≤20 words
- likely_cause: ≤20 words
- first_response_checks: 3 items, each ≤12 words, start with an action verb
- known_fix_pattern: ≤35 words
- confidence_note: ≤25 words, calibrated — avoid words like "strong" or "high" unless the match is exact

Output JSON only — nothing else.
"""


# ── Incident serialiser ───────────────────────────────────────────────────────

def _format_incidents(incidents: List[Dict[str, Any]]) -> str:
    """
    Convert retrieved incident dicts into a numbered plaintext block.
    Only operationally relevant fields are included to keep the prompt lean.
    """
    lines = []
    for i, inc in enumerate(incidents[:MAX_INCIDENTS_FOR_BRIEF], 1):
        lines.append(f"--- Incident {i} ---")
        lines.append(f"Title      : {inc.get('title', 'N/A')}")
        lines.append(f"Severity   : {inc.get('severity', 'N/A')}")
        lines.append(f"Service    : {inc.get('service', 'N/A')}")
        lines.append(f"Component  : {inc.get('component', 'N/A')}")
        lines.append(f"Date       : {inc.get('date', 'N/A')}")
        lines.append(f"Similarity : {inc.get('score', 'N/A')}")

        if inc.get("error_message"):
            lines.append(f"Error      : {inc['error_message'][:500]}")
        if inc.get("root_cause"):
            lines.append(f"Root cause : {inc['root_cause'][:800]}")
        if inc.get("fix"):
            lines.append(f"Fix        : {inc['fix'][:800]}")
        if inc.get("tags"):
            tags = inc["tags"] if isinstance(inc["tags"], list) else []
            lines.append(f"Tags       : {', '.join(tags)}")
        lines.append("")

    return "\n".join(lines)


# ── Main entry point ──────────────────────────────────────────────────────────

def generate_triage_brief(
    query: str,
    results: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """
    Generate a structured Triage Brief using Anthropic.

    Parameters
    ----------
    query   : The raw user query submitted to TraceVault.
    results : The incident list returned by VectorAI DB (already ranked).

    Returns
    -------
    A dict with keys: failure_family, likely_cause, first_response_checks,
    known_fix_pattern, confidence_note — or None if the call is skipped/fails.
    """
    if not ANTHROPIC_API_KEY:
        log.info("ANTHROPIC_API_KEY not set — triage brief skipped")
        return None

    if not results:
        log.info("No retrieved incidents — triage brief skipped")
        return None

    try:
        import anthropic
    except ImportError:
        log.warning("anthropic package not installed — triage brief skipped")
        return None

    incidents_block = _format_incidents(results)
    user_message    = _USER_TEMPLATE.format(
        query          = query.strip(),
        count          = min(len(results), MAX_INCIDENTS_FOR_BRIEF),
        incidents_block= incidents_block,
    )

    try:
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        message = client.messages.create(
            model      = ANTHROPIC_MODEL,
            max_tokens = 500,
            system     = _SYSTEM_PROMPT,
            messages   = [{"role": "user", "content": user_message}],
        )
        raw = message.content[0].text.strip()

        # Strip accidental markdown fences the model sometimes emits
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        brief = json.loads(raw)

        # Sanity-check required keys exist
        required = {
            "failure_family", "likely_cause",
            "first_response_checks", "known_fix_pattern", "confidence_note",
        }
        missing = required - brief.keys()
        if missing:
            log.warning("Triage brief missing keys: %s", missing)
            return None

        # Sanity-check first_response_checks is actually a list
        if not isinstance(brief.get("first_response_checks"), list):
            log.warning(
                "Triage brief: first_response_checks is %s, expected list — discarding brief",
                type(brief.get("first_response_checks")).__name__,
            )
            return None

        log.info("Triage brief generated successfully (model=%s)", ANTHROPIC_MODEL)
        return brief

    except json.JSONDecodeError as e:
        log.error("Triage brief JSON parse error: %s", e)
        return None
    except Exception as e:
        log.error("Triage brief generation failed: %s", e)
        return None
