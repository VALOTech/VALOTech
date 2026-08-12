#!/usr/bin/env python3
import argparse,re,json
from pathlib import Path
PATTERNS=[]
ap=argparse.ArgumentParser(description="Advisory style-pattern lint; findings require judgment.")
ap.add_argument("file");a=ap.parse_args();text=Path(a.file).read_text(encoding="utf-8")
findings=[]
for name,pat in PATTERNS:
    for m in re.finditer(pat,text,re.I):findings.append({"type":name,"match":m.group(0),"offset":m.start()})
print(json.dumps(findings,ensure_ascii=False,indent=2))
