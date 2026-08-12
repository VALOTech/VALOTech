#!/usr/bin/env python3
import argparse, json, sys
from pathlib import Path

def main():
    ap=argparse.ArgumentParser(description='Check preferred and forbidden glossary wording in text or JSON output.')
    ap.add_argument('target'); ap.add_argument('glossary')
    a=ap.parse_args()
    text=Path(a.target).read_text(encoding='utf-8')
    glossary=json.loads(Path(a.glossary).read_text(encoding='utf-8'))
    issues=[]
    for item in glossary:
        for bad in item.get('forbidden',[]):
            if bad and bad in text: issues.append(f'FORBIDDEN {bad} ({item.get("concept","")})')
    print('\n'.join(issues) if issues else 'OK')
    sys.exit(1 if issues else 0)
if __name__=='__main__': main()
