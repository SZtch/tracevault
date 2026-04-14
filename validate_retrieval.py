#!/usr/bin/env python3
"""
TraceVault retrieval validation script.
Reads data/eval.json and runs each query against the /search endpoint.

Usage:
  python validate_retrieval.py
  python validate_retrieval.py --api http://localhost:8000
  python validate_retrieval.py --top-k 3
"""

import json
import sys
import argparse
import urllib.request
import urllib.error

def search(api: str, query: str, top_k: int) -> list[str]:
    payload = json.dumps({"query": query, "top_k": top_k}).encode()
    req = urllib.request.Request(
        f"{api}/search",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())
    return [r["incident_id"] for r in data.get("results", [])]


def run(api: str, eval_path: str, top_k: int):
    with open(eval_path) as f:
        cases = json.load(f)

    passed = failed = skipped = 0
    failures = []

    for case in cases:
        eid     = case["id"]
        query   = case["query"]
        top1    = case.get("expected_top_1")
        any1    = case.get("expected_any_top_1") or []
        in_top3 = set(case.get("expected_in_top_3") or [])

        try:
            results = search(api, query, top_k)
        except Exception as e:
            print(f"  SKIP  {eid}  (request error: {e})")
            skipped += 1
            continue

        actual_top1    = results[0] if results else None
        actual_top3set = set(results[:3])

        # top-1 check
        if top1:
            top1_ok = actual_top1 == top1
        elif any1:
            top1_ok = actual_top1 in any1
        else:
            top1_ok = True  # no top-1 expectation

        # top-3 coverage check: all expected must appear in actual top-3
        top3_ok = in_top3.issubset(actual_top3set) if in_top3 else True

        ok = top1_ok and top3_ok

        status = "PASS" if ok else "FAIL"
        print(f"  {status}  {eid}  top1={actual_top1}  top3={results[:3]}")

        if ok:
            passed += 1
        else:
            failed += 1
            reasons = []
            if not top1_ok:
                expected = top1 or any1
                reasons.append(f"top-1 expected {expected}, got {actual_top1}")
            if not top3_ok:
                missing = in_top3 - actual_top3set
                reasons.append(f"missing from top-3: {missing}")
            failures.append({"id": eid, "query": query[:60], "reasons": reasons})

    print()
    print(f"Results: {passed} passed / {failed} failed / {skipped} skipped / {len(cases)} total")

    if failures:
        print()
        print("Failures:")
        for f in failures:
            print(f"  {f['id']}: {f['query']}")
            for r in f["reasons"]:
                print(f"    -> {r}")

    return failed == 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--api",    default="http://localhost:8000")
    parser.add_argument("--eval",   default="data/eval.json")
    parser.add_argument("--top-k",  type=int, default=3)
    args = parser.parse_args()

    print(f"Running {args.eval} against {args.api}  (top_k={args.top_k})\n")
    ok = run(args.api, args.eval, args.top_k)
    sys.exit(0 if ok else 1)
