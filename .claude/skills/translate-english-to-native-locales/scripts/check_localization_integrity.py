#!/usr/bin/env python3
import argparse, json, re, sys, xml.etree.ElementTree as ET
from pathlib import Path
try:
    import yaml
except Exception:
    yaml=None

URL=re.compile(r'https?://[^\s)\]}>"\']+')
PRINTF=re.compile(r'%(?:\d+\$)?[sdif]')
DOUBLE=re.compile(r'\{\{[^{}]+\}\}')
DOLLAR=re.compile(r'\$\{[^{}]+\}')
HTML=re.compile(r'<\/?[A-Za-z][^>]*>')
BRACE_VAR=re.compile(r'\{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*(?:[,}])')
NUM=re.compile(r'(?<![A-Za-z0-9-])[-+]?\d[\d.,]*(?:%|\b)')
DATE_PATTERNS=[re.compile(r'\b(\d{4})-(\d{1,2})-(\d{1,2})\b'),re.compile(r'\b(\d{1,2})/(\d{1,2})/(\d{4})\b')]

def tokens(s):
    out=[]
    for p in (URL,PRINTF,DOUBLE,DOLLAR,HTML): out += p.findall(s)
    out += ['{'+x+'}' for x in BRACE_VAR.findall(s)]
    return sorted(out)

def canon_num(x):
    pct='%' if x.endswith('%') else ''; x=x.rstrip('%')
    if ',' in x and '.' in x:
        dec=',' if x.rfind(',')>x.rfind('.') else '.'; grp='.' if dec==',' else ','
        x=x.replace(grp,'').replace(dec,'.')
    elif x.count(',')==1 and len(x.split(',')[-1]) in (1,2): x=x.replace(',','.')
    else: x=x.replace(',','')
    try: return str(float(x))+pct
    except: return x+pct

def dates(s):
    out=[]
    for i,p in enumerate(DATE_PATTERNS):
        for m in p.finditer(s):
            if i==0: y,mo,d=m.groups()
            else: d,mo,y=m.groups()
            out.append(f'{int(y):04d}-{int(mo):02d}-{int(d):02d}')
    return sorted(out)
def numbers(s):
    t=s
    for p in DATE_PATTERNS: t=p.sub(' ',t)
    return sorted(canon_num(x) for x in NUM.findall(t))
def flatten(o,p=''):
    out={}
    if isinstance(o,dict):
        for k,v in o.items():
            if str(k).startswith('@'): continue
            out.update(flatten(v,f'{p}.{k}' if p else str(k)))
    elif isinstance(o,list):
        for i,v in enumerate(o): out.update(flatten(v,f'{p}[{i}]'))
    elif isinstance(o,str): out[p]=o
    return out

def load_json(path): return flatten(json.loads(path.read_text(encoding='utf-8')))
def load_yaml(path):
    if yaml is None: raise RuntimeError('PyYAML is required for YAML')
    return flatten(yaml.safe_load(path.read_text(encoding='utf-8')))
def unquote_po(v):
    try: return json.loads(v)
    except: return v.strip('"')
def load_po(path):
    entries={}; ctx=''; msgid=None; forms={}; state=None; current_form=0
    def commit():
        nonlocal ctx,msgid,forms,state,current_form
        if msgid not in (None,''):
            key=(ctx+'\x04' if ctx else '')+msgid
            if forms:
                for i,v in sorted(forms.items()): entries[f'{key}[{i}]']=v
            else: entries[key]=''
        ctx=''; msgid=None; forms={}; state=None; current_form=0
    for raw in path.read_text(encoding='utf-8').splitlines()+['']:
        line=raw.strip()
        if not line:
            commit(); continue
        if line.startswith('msgctxt '): ctx=unquote_po(line[8:].strip()); state='ctx'
        elif line.startswith('msgid_plural '): state='plural_id'
        elif line.startswith('msgid '):
            if msgid is not None: commit()
            msgid=unquote_po(line[6:].strip()); state='id'
        elif line.startswith('msgstr['):
            m=re.match(r'msgstr\[(\d+)\]\s+(.*)',line); current_form=int(m.group(1)); forms[current_form]=unquote_po(m.group(2)); state='strn'
        elif line.startswith('msgstr '): current_form=0; forms[0]=unquote_po(line[7:].strip()); state='str'
        elif line.startswith('"'):
            v=unquote_po(line)
            if state=='ctx': ctx+=v
            elif state=='id': msgid=(msgid or '')+v
            elif state in ('str','strn'): forms[current_form]=forms.get(current_form,'')+v
    return entries

def local(tag): return tag.split('}')[-1]
def xml_payload(e):
    if e is None: return ''
    out=[e.text or '']
    for c in list(e):
        attrs=','.join(f'{k}={v}' for k,v in sorted(c.attrib.items()) if k in ('id','rid','equiv-text','ctype','xid'))
        out.append(f'<{local(c.tag)}:{attrs}>')
        out.append(''.join(c.itertext()))
        out.append(f'</{local(c.tag)}>')
        out.append(c.tail or '')
    return ''.join(out)

def load_xliff(path, side):
    root=ET.parse(path).getroot(); out={}
    for unit in root.iter():
        if local(unit.tag) in ('trans-unit','unit'):
            uid=unit.attrib.get('id') or unit.attrib.get('name') or str(len(out))
            wanted='source' if side=='source' else 'target'; node=None
            for e in unit.iter():
                if local(e.tag)==wanted: node=e; break
            out[uid]=xml_payload(node)
    return out

def load_ts(path,side):
    root=ET.parse(path).getroot(); out={}
    for i,m in enumerate(root.iter('message')):
        src=m.find('source'); tr=m.find('translation'); key=(src.text if src is not None else str(i)); source_text=(src.text or '') if src is not None else ''
        forms=tr.findall('numerusform') if tr is not None else []
        if forms:
            for j,f in enumerate(forms): out[f'{key}[{j}]']=source_text if side=='source' else ''.join(f.itertext())
        elif side=='source': out[key]=source_text
        elif tr is None: out[key]=''
        else: out[key]=''.join(tr.itertext())
    return out

def detect(path):
    ext=path.suffix.lower()
    return {'.json':'json','.arb':'json','.yaml':'yaml','.yml':'yaml','.po':'po','.xliff':'xliff','.xlf':'xliff','.ts':'ts'}.get(ext)
def load(path,side):
    f=detect(path)
    if f=='json': return load_json(path)
    if f=='yaml': return load_yaml(path)
    if f=='po': return load_po(path)
    if f=='xliff': return load_xliff(path,side)
    if f=='ts': return load_ts(path,side)
    raise RuntimeError(f'Unsupported format: {path.suffix}')

def main():
    ap=argparse.ArgumentParser(description='Check localization keys/units, placeholders, tags, URLs, and numbers.')
    ap.add_argument('source'); ap.add_argument('target'); ap.add_argument('--allow-reorder',action='store_true')
    ap.add_argument('--strict-newlines',action='store_true')
    ap.add_argument('--strict-emoji',action='store_true')
    ap.add_argument('--reject-bidi-controls',action='store_true')
    ap.add_argument('--normalize-keys',choices=['none','NFC','NFD'],default='none')
    a=ap.parse_args(); sp=Path(a.source); tp=Path(a.target)
    src=load(sp,'source'); tgt=load(tp,'target'); issues=[]
    if a.normalize_keys!='none':
        import unicodedata
        src={unicodedata.normalize(a.normalize_keys,k):v for k,v in src.items()}
        tgt={unicodedata.normalize(a.normalize_keys,k):v for k,v in tgt.items()}
    EMOJI=re.compile(r'[\U0001F300-\U0001FAFF\u2600-\u27BF]')
    BIDI=re.compile(r'[\u202A-\u202E\u2066-\u2069]')
    for k in sorted(set(src)-set(tgt)): issues.append(f'MISSING_UNIT {k}')
    for k in sorted(set(tgt)-set(src)): issues.append(f'EXTRA_UNIT {k}')
    for k in sorted(set(src)&set(tgt)):
        if tgt[k]=='': issues.append(f'EMPTY_TARGET {k}')
        if a.strict_newlines and src[k].count('\n')!=tgt[k].count('\n'): issues.append(f'NEWLINE_MISMATCH {k}')
        if a.strict_emoji and EMOJI.findall(src[k])!=EMOJI.findall(tgt[k]): issues.append(f'EMOJI_MISMATCH {k}')
        if a.reject_bidi_controls and BIDI.search(tgt[k]): issues.append(f'BIDI_CONTROL {k}')
        if tokens(src[k])!=tokens(tgt[k]): issues.append(f'TOKEN_MISMATCH {k}: {tokens(src[k])} != {tokens(tgt[k])}')
        if dates(src[k])!=dates(tgt[k]): issues.append(f'DATE_MISMATCH {k}: {dates(src[k])} != {dates(tgt[k])}')
        if numbers(src[k])!=numbers(tgt[k]): issues.append(f'NUMBER_MISMATCH {k}: {numbers(src[k])} != {numbers(tgt[k])}')
    if not a.allow_reorder and list(src.keys())!=list(tgt.keys()) and set(src)==set(tgt): issues.append('ORDER_MISMATCH')
    print('\n'.join(issues) if issues else 'OK'); sys.exit(1 if issues else 0)
if __name__=='__main__': main()
