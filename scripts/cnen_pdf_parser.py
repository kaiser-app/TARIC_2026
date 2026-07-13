import re
from collections import defaultdict
from cnen_pdf_core import *

def parse_layout(text,language):
    pages=text.split('\f'); records=[]; current=None; chapter=None; started=False
    general_counts=defaultdict(int)

    def finalize():
        nonlocal current
        if not current: return
        heading=clean(current['heading']); body=dehyphenate_join(current['body'])
        if not (heading or body): current=None; return
        if current['kind']=='general':
            full=clean(f'{heading} {body}')
            refs=[]
            for match in CODE_RE.finditer(full):
                code=norm_code(match.group(0))
                if len(code)>=4 and code not in refs: refs.append(code)
            codes=refs or [current['chapter']]
            scope='list' if len(codes)>1 else ('chapter' if len(codes[0])==2 else 'single')
        else:
            codes=current['codes']; scope=scope_type(codes,current['kinds'])
        records.append({
            'codes':codes,'scopeType':scope,'heading':heading,'text':body,'kind':current['kind'],
            'pairKey':current['pairKey'],'pdfPageStart':current['pdfPageStart'],'pdfPageEnd':current['pdfPageEnd'],
            'printedPageStart':current['printedPageStart'],'printedPageEnd':current['printedPageEnd'],
        }); current=None

    for page_index,page in enumerate(pages,1):
        header=PAGE_HEADER_RE.search(page); printed=int(header.group(2)) if header else None
        for raw_line in page.splitlines():
            if PAGE_HEADER_RE.search(raw_line) or AMEND_RE.match(raw_line): continue
            chapter_match=(re.match(r'^\s*CHAPTER\s+(\d+)\s*$',raw_line) if language=='EN'
                           else re.match(r'^\s*(\d+)\.\s*ÁRUCSOPORT\s*$',raw_line))
            if chapter_match:
                finalize(); chapter=chapter_match.group(1).zfill(2); started=True; continue
            if not started:
                if re.match(r'^\s*0101(?:\s|$)',raw_line): started=True; chapter='01'
                else: continue
            line=re.sub(r'^(\s*)[▼►][A-Z]\d*\s*',r'\1',raw_line).replace('◄','')
            stripped=line.strip(); inline_general=general_heading(stripped,language)
            if inline_general is not None:
                finalize(); general_counts[chapter]+=1
                current={'kind':'general','chapter':chapter,'pairKey':f'G:{chapter}:{general_counts[chapter]}',
                    'codes':[],'kinds':[],'pending':False,'heading':'General' if language=='EN' else 'Általános megjegyzés',
                    'body':[inline_general] if inline_general else [],'pdfPageStart':page_index,'pdfPageEnd':page_index,
                    'printedPageStart':printed,'printedPageEnd':printed}
                continue
            connector_only=CONNECTORS.get(stripped) if len(line)-len(line.lstrip())<=12 else None
            if current is not None and current['kind']=='code' and connector_only:
                current['kinds'].append(connector_only); current['pending']=True; continue
            continuation=re.match(r'^\s{0,12}(and|to|és|–|—|-)\s*(\d{4}(?:\s?\d{2}){0,2})\s*(.*)$',line)
            if current is not None and current['kind']=='code' and continuation:
                current['kinds'].append(CONNECTORS[continuation.group(1)]); current['codes'].append(norm_code(continuation.group(2)))
                current['pending']=False; extra=clean(continuation.group(3))
                if extra: current['heading']=clean(f"{current['heading']} {extra}")
                current['pdfPageEnd']=page_index; current['printedPageEnd']=printed; continue
            # When a pending range endpoint is followed by 'and/és + title text', the connector belongs to the title.
            endpoint_with_title=re.match(r'^\s{0,12}(\d{4}(?:\s?\d{2}){0,2})\s+(and|és)\s+(.+)$',line)
            if current is not None and current['kind']=='code' and current.get('pending') and endpoint_with_title:
                current['codes'].append(norm_code(endpoint_with_title.group(1))); current['pending']=False
                current['heading']=clean(f"{current['heading']} {endpoint_with_title.group(2)} {endpoint_with_title.group(3)}")
                current['pdfPageEnd']=page_index; current['printedPageEnd']=printed; continue
            parsed=parse_code_line(line)
            if parsed and chapter and not all(code.startswith(chapter) for code in parsed['codes']): parsed=None
            if parsed:
                # A wrapped general sentence can begin with its third referenced code and a comma.
                if current is not None and current['kind']=='general' and parsed['text'].startswith((',', ';', ')')):
                    current['body'].append(stripped); current['pdfPageEnd']=page_index; current['printedPageEnd']=printed; continue
                if current is not None and current['kind']=='code' and current.get('pending'):
                    current['codes'].extend(parsed['codes']); current['kinds'].extend(parsed['kinds']); current['pending']=parsed['pending']
                    if parsed['text']: current['heading']=clean(f"{current['heading']} {parsed['text']}")
                    current['pdfPageEnd']=page_index; current['printedPageEnd']=printed; continue
                finalize()
                current={'kind':'code','chapter':chapter,'pairKey':'C:'+('|'.join(parsed['codes'])),
                    'codes':parsed['codes'][:],'kinds':parsed['kinds'][:],'pending':parsed['pending'],'heading':parsed['text'] or '',
                    'body':[],'pdfPageStart':page_index,'pdfPageEnd':page_index,'printedPageStart':printed,'printedPageEnd':printed}
                continue
            if is_structural(stripped,language): finalize(); continue
            if current is not None and stripped:
                current['body'].append(stripped); current['pdfPageEnd']=page_index; current['printedPageEnd']=printed
    finalize(); return records

def repair_records(records, language):
    repaired=[]; index=0
    combined_phrase = re.compile(r'^(?:These subheadings|Ezen alszámok)', re.I)
    while index < len(records):
        current=records[index]
        if index+1 < len(records):
            following=records[index+1]
            same_prefix=(current.get('codes') and following.get('codes')
                and current['codes'][0][:6] == following['codes'][0][:6])
            if (current.get('kind')=='code' and current.get('scopeType')=='list' and not current.get('text')
                and following.get('kind')=='code' and following.get('text') and same_prefix
                and combined_phrase.search(following['text'])):
                merged={**current}
                merged['codes']=list(dict.fromkeys(current['codes']+following['codes']))
                merged['scopeType']='list'; merged['heading']=clean(f"{current['heading']} {following['heading']}")
                merged['text']=following['text']; merged['pdfPageEnd']=following['pdfPageEnd']; merged['printedPageEnd']=following['printedPageEnd']
                repaired.append(merged); index+=2; continue
        repaired.append(current); index+=1
    return repaired

def referenced_codes(text,own_codes):
    values=[]
    for match in CODE_RE.finditer(text):
        code=norm_code(match.group(0))
        if len(code)>=4 and code not in own_codes and code not in values: values.append(code)
    return values

def rule_types(text_en,text_hu):
    text=f'{text_en} {text_hu}'.lower()
    return [kind for matched,kind in [
        (re.search(r'\b(?:include|includes|included|cover|covers|covered|magában foglal|ide tartoz|alá tartoz)\b',text),'inclusion'),
        (re.search(r'\b(?:exclude|excludes|excluded|does not cover|do not cover|not included|nem tartozik|kizár|kivételével)\b',text),'exclusion'),
        (re.search(r'\b(?:means|considered as|for the purposes of|is regarded as|are regarded as|érteni kell|tekintendő|alkalmazásában)\b',text),'definition'),
        (re.search(r'\b(?:see |see also|referred to|reference to|lásd|hivatkoz)\b',text),'cross_reference')
    ] if matched]

def pair_records(en_records,hu_records):
    ge=defaultdict(list); gh=defaultdict(list)
    for r in en_records: ge[r['pairKey']].append(r)
    for r in hu_records: gh[r['pairKey']].append(r)
    pairs=[]; unmatched=[]
    for key in sorted(set(ge)|set(gh)):
        left,right=ge[key],gh[key]; count=min(len(left),len(right)); pairs.extend(zip(left[:count],right[:count]))
        unmatched.extend([('EN',r) for r in left[count:]]); unmatched.extend([('HU',r) for r in right[count:]])
    return pairs,unmatched
