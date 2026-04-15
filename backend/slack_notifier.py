"""
slack_notifier.py — Incident Autopilot Slack notifications for TraceVault.

Sends a structured Slack message when a new incident is ingested via webhook.
Falls back to terminal output if SLACK_WEBHOOK_URL is not set (offline mode).
"""

import json
import logging
import os
from typing import Any, Dict, List, Optional

log = logging.getLogger("tracevault.slack")

SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL", "")

# Severity → emoji
_SEVERITY_EMOJI = {
    "critical": "🔴",
    "high":     "🟠",
    "medium":   "🟡",
    "low":      "🟢",
}


def _build_slack_message(
    incident: Dict[str, Any],
    results:  List[Dict[str, Any]],
    brief:    Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    severity     = incident.get("severity", "medium")
    emoji        = _SEVERITY_EMOJI.get(severity, "⚪")
    title        = incident.get("title", "Untitled Incident")
    service      = incident.get("service") or "unknown"
    incident_id  = incident.get("id") or "—"
    match_count  = len(results)

    # Header block
    blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": f"{emoji} New Incident: {title[:60]}",
                "emoji": True,
            },
        },
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Severity:*\n{emoji} {severity.upper()}"},
                {"type": "mrkdwn", "text": f"*Service:*\n{service}"},
                {"type": "mrkdwn", "text": f"*Incident ID:*\n{incident_id}"},
                {"type": "mrkdwn", "text": f"*Similar found:*\n{match_count} past incidents"},
            ],
        },
        {"type": "divider"},
    ]

    # Triage brief block
    if brief:
        failure_family = brief.get("failure_family", "—")
        likely_cause   = brief.get("likely_cause", "—")
        known_fix      = brief.get("known_fix_pattern", "—")
        checks         = brief.get("first_response_checks", [])
        confidence     = brief.get("confidence_note", "—")

        checks_text = "\n".join(f"• {c}" for c in checks[:3]) if checks else "—"

        blocks.append({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": (
                    f"*🧠 AI Triage Brief*\n\n"
                    f"*Failure family:* {failure_family}\n"
                    f"*Likely cause:* {likely_cause}\n\n"
                    f"*First response checks:*\n{checks_text}\n\n"
                    f"*Known fix pattern:* {known_fix}\n\n"
                    f"_Confidence: {confidence}_"
                ),
            },
        })
        blocks.append({"type": "divider"})

    # Top similar incidents
    if results:
        similar_lines = []
        for i, r in enumerate(results[:3], 1):
            score     = r.get("score", 0)
            inc_title = r.get("title", "—")[:60]
            inc_id    = r.get("incident_id", "—")
            fix       = r.get("fix", "")[:80] or "—"
            similar_lines.append(
                f"*{i}. {inc_id}* — {inc_title}\n"
                f"   Similarity: `{score:.2f}` | Fix: _{fix}_"
            )

        blocks.append({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": "*🔍 Top Similar Past Incidents*\n\n" + "\n\n".join(similar_lines),
            },
        })

    # Footer
    blocks.append({
        "type": "context",
        "elements": [
            {
                "type": "mrkdwn",
                "text": "🔗 *TraceVault Incident Autopilot* — auto-triggered on webhook ingest",
            }
        ],
    })

    return {
        "text": f"{emoji} New incident: {title} | {match_count} similar found",
        "blocks": blocks,
    }


def _post_to_slack(payload: Dict[str, Any]) -> bool:
    try:
        import httpx
        resp = httpx.post(
            SLACK_WEBHOOK_URL,
            json    = payload,
            timeout = 10,
        )
        if resp.status_code == 200:
            log.info("Autopilot: Slack notification sent")
            return True
        else:
            log.warning("Autopilot: Slack returned %s — %s", resp.status_code, resp.text)
            return False
    except ImportError:
        log.warning("httpx not installed — cannot send Slack notification")
        return False
    except Exception as e:
        log.error("Autopilot: Slack POST failed: %s", e)
        return False


def _print_to_terminal(
    incident: Dict[str, Any],
    results:  List[Dict[str, Any]],
    brief:    Optional[Dict[str, Any]],
) -> None:
    """Offline fallback — print triage output to terminal."""
    severity = incident.get("severity", "medium")
    emoji    = _SEVERITY_EMOJI.get(severity, "⚪")
    title    = incident.get("title", "Untitled")
    service  = incident.get("service") or "unknown"

    print("\n" + "=" * 60)
    print(f"  {emoji}  TRACEVAULT AUTOPILOT — NEW INCIDENT")
    print("=" * 60)
    print(f"  Title    : {title}")
    print(f"  Severity : {severity.upper()}")
    print(f"  Service  : {service}")
    print(f"  Similar  : {len(results)} past incidents found")

    if brief:
        print(f"\n  Failure  : {brief.get('failure_family', '—')}")
        print(f"  Cause    : {brief.get('likely_cause', '—')}")
        print(f"  Fix      : {brief.get('known_fix_pattern', '—')}")
        checks = brief.get("first_response_checks", [])
        if checks:
            print("\n  First response:")
            for c in checks[:3]:
                print(f"    • {c}")

    if results:
        print("\n  Top matches:")
        for i, r in enumerate(results[:3], 1):
            print(f"    {i}. {r.get('incident_id','—')} ({r.get('score',0):.2f}) — {r.get('title','—')[:50]}")

    print("=" * 60 + "\n")


def notify_slack_autopilot(
    incident: Dict[str, Any],
    results:  List[Dict[str, Any]],
    brief:    Optional[Dict[str, Any]],
) -> None:
    """
    Send autopilot notification.
    - Online  (SLACK_WEBHOOK_URL set): POST to Slack
    - Offline (no URL):                print to terminal
    """
    if SLACK_WEBHOOK_URL:
        payload = _build_slack_message(incident, results, brief)
        _post_to_slack(payload)
    else:
        log.info("Autopilot: SLACK_WEBHOOK_URL not set — printing to terminal (offline mode)")
        _print_to_terminal(incident, results, brief)
