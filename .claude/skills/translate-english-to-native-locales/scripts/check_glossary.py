#!/usr/bin/env python3
import argparse, json, sys
from pathlib import Path

def main():
    ap=argparse.ArgumentParser(description='Check preferred and forbidden glossary wording in text or JSON output.')
    ap.add_argument('target'); ap.add_argument('glossary')
    a=ap.parse_args()
    # The findings carry the glossary's own words, so on a console whose default
    # encoding is not UTF-8 the report crashes on the first non-ASCII term --
    # leaving the checker usable only in the one case where it has nothing to say.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, 'reconfigure'): stream.reconfigure(encoding='utf-8')
    text=Path(a.target).read_text(encoding='utf-8')
    glossary=json.loads(Path(a.glossary).read_text(encoding='utf-8'))
    issues=[]
    for item in glossary:
        for bad in item.get('forbidden',[]):
            if bad and bad in text: issues.append(f'FORBIDDEN {bad} ({item.get("concept","")})')
    print('\n'.join(issues) if issues else 'OK')
    sys.exit(1 if issues else 0)
if __name__=='__main__': main()
