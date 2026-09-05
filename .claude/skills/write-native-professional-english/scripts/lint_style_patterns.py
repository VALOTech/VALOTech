#!/usr/bin/env python3
import argparse,re,json
from pathlib import Path

import sys

# This script prints typographic punctuation, and a Windows console defaults to cp1252,
# where that raises UnicodeEncodeError - on the run that HAS something to report, never
# on a quiet one. No-op where the stream already encodes UTF-8.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
PATTERNS=[
    ('corporate_filler', '\\b(?:leverage|utilize|robust|seamless|comprehensive|cutting-edge|transformative|pivotal|holistic|streamline|empower|unlock|elevate|foster|harness|synergy)\\b'),
    ('formulaic_transition', '\\b(?:Furthermore|Moreover|Additionally|In conclusion|That being said)\\b'),
    ('ai_signpost', "it'?s worth noting|it'?s important to note|needless to say|at the end of the day"),
    ('ai_vocab', '\\b(?:delve|tapestry|realm|testament to|underscore)\\b|navigating the complexities'),
    ('grand_opener', "in today'?s (?:fast-paced|digital|ever-evolving|modern) (?:world|age|landscape|era)"),
]
ap=argparse.ArgumentParser(description="Advisory style-pattern lint; findings require judgment. A clean result is not proof of natural writing — see references/native-english.md.")
ap.add_argument("file");a=ap.parse_args();text=Path(a.file).read_text(encoding="utf-8")
findings=[]
for name,pat in PATTERNS:
    for m in re.finditer(pat,text,re.I):findings.append({"type":name,"match":m.group(0),"offset":m.start()})
print(json.dumps(findings,ensure_ascii=False,indent=2))
