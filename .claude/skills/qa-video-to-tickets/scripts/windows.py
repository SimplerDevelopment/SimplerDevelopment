#!/usr/bin/env python3
"""Merge QA-moment timestamps into frame-extraction windows.

Input  (stdin JSON): [{"t": <seconds>, ...arbitrary keys...}, ...]
Output (stdout JSON): [{"start": s, "end": e, "moments": [<original objects>]}, ...]

Rule (locked spec): each moment becomes a symmetric +/-HALF window; windows that
overlap OR sit within GAP seconds of each other merge into one. Frames only get
pulled per merged window, so this is what caps redundant extraction.

  echo '[{"t":30},{"t":45},{"t":300}]' | python3 windows.py
  python3 windows.py --selftest
"""
import json
import sys

HALF = 10  # +/- seconds around each moment
GAP = 10   # merge windows within this many seconds of each other


def merge(moments, half=HALF, gap=GAP):
    # ponytail: O(n log n) sort + linear sweep; n = QA callouts (tens), never large.
    items = sorted(moments, key=lambda m: m["t"])
    out = []
    for m in items:
        s, e = m["t"] - half, m["t"] + half
        if out and s <= out[-1]["end"] + gap:
            out[-1]["end"] = max(out[-1]["end"], e)
            out[-1]["moments"].append(m)
        else:
            out.append({"start": max(0, s), "end": e, "moments": [m]})
    return out


def _selftest():
    # overlapping -> one window
    r = merge([{"t": 30}, {"t": 45}])
    assert len(r) == 1 and r[0]["start"] == 20 and r[0]["end"] == 55, r
    # within-gap (edge: 40+10 gap reaches 50-10) -> merged
    r = merge([{"t": 40}, {"t": 60}])
    assert len(r) == 1, r
    # far apart -> two windows
    r = merge([{"t": 30}, {"t": 300}])
    assert len(r) == 2, r
    # start never negative
    r = merge([{"t": 3}])
    assert r[0]["start"] == 0 and r[0]["end"] == 13, r
    # unsorted input still merges correctly + keeps all moments
    r = merge([{"t": 300}, {"t": 30}, {"t": 45}])
    assert len(r) == 2 and len(r[0]["moments"]) == 2, r
    print("windows.py selftest OK")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
    else:
        json.dump(merge(json.load(sys.stdin)), sys.stdout, indent=2)
        print()
