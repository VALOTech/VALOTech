#!/usr/bin/env python3
import argparse,re,json
from pathlib import Path
PATTERNS=[
    ('generic_claim', '全面提升|全面增强|全方位|赋能|助力|无缝对接|无缝整合|无缝体验|一站式|打造'),
    ('bureaucratic', '贯彻落实|深入贯彻|切实保障|广大用户|指导思想|大力推进|以.{0,6}为核心'),
    ('ai_filler', '值得注意的是|需要指出的是|众所周知|在当今.{0,10}的时代|我们致力于'),
    ('light_verb', '进行(?:优化|处理|管理|分析)|作出决定'),
]
ap=argparse.ArgumentParser(description="Advisory style-pattern lint; findings require judgment. A clean result is not proof of natural writing — see references/native-chinese.md.")
ap.add_argument("file");a=ap.parse_args();text=Path(a.file).read_text(encoding="utf-8")
findings=[]
for name,pat in PATTERNS:
    for m in re.finditer(pat,text,re.I):findings.append({"type":name,"match":m.group(0),"offset":m.start()})
print(json.dumps(findings,ensure_ascii=False,indent=2))
