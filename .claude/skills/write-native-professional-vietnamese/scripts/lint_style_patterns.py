#!/usr/bin/env python3
import argparse,re,json
from pathlib import Path
PATTERNS=[
    ('generic_claim', 'nâng cao|tăng cường|tối ưu hóa|toàn diện|liền mạch|bền vững|đặt lên hàng đầu'),
    ('empty_filler', 'công nghệ (?:hiện đại|tiên tiến)|đảm bảo rằng|mang tính'),
    ('adverbial_calque', 'một cách\\s+\\S+'),
    ('nominalization', 'việc thực hiện|quá trình triển khai|công tác quản lý|giúp\\s+[^.]{0,40}\\s+có thể'),
    ('translationese', 'được thiết kế (?:nhằm|để)|cho phép\\s+[^.]{0,30}\\s+có thể|trao quyền cho|Điều này có nghĩa là|Bằng việc sử dụng'),
]
ap=argparse.ArgumentParser(description="Advisory style-pattern lint; findings require judgment. A clean result is not proof of natural writing — see references/native-vietnamese.md.")
ap.add_argument("file");a=ap.parse_args();text=Path(a.file).read_text(encoding="utf-8")
findings=[]
for name,pat in PATTERNS:
    for m in re.finditer(pat,text,re.I):findings.append({"type":name,"match":m.group(0),"offset":m.start()})
print(json.dumps(findings,ensure_ascii=False,indent=2))
