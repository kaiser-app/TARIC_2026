import re
import pdfplumber
CODE_RE=re.compile(r"\d{4}(?:\s?\d{2}){0,2}")
PAGE_HEADER_RE=re.compile(r"02019XC0329\(02\).*?—\s+(EN|HU)\s+—.*?—\s+(\d+)\s*$",re.M)
AMEND_RE=re.compile(r"^\s*[▼►][A-Z0-9]+\s*$")
CONNECTORS={"and":"list","és":"list","to":"range","–":"range","-":"range","—":"range"}
STRUCT_EN=re.compile(r"^(?:SECTION\s+[IVXLC]+|CHAPTER\s+\d+|FOREWORD$|SUMMARY$|[A-Z][A-Z ;,()\-’'0-9]{8,})$")
STRUCT_HU=re.compile(r"^(?:[IVXLC]+\.\s*ÁRUOSZTÁLY|\d+\.\s*ÁRUCSOPORT|ÁRUCSOPORT\s+\d+|ELŐSZÓ$|TARTALOMJEGYZÉK$|[A-ZÁÉÍÓÖŐÚÜŰ][A-ZÁÉÍÓÖŐÚÜŰ ;,()\-–’'0-9]{8,})$")

def norm_code(value): return re.sub(r'\D','',str(value or ''))

def clean(value): return re.sub(r'\s+',' ',str(value or '').replace('\u00ad','')).strip()

def dehyphenate_join(lines):
    out=[]
    for raw in lines:
        value=raw.replace('\u00ad','').strip()
        if not value: continue
        if out and out[-1].endswith('-') and value[0].islower(): out[-1]=out[-1][:-1]+value
        else: out.append(value)
    return clean(' '.join(out))

def extract_pdf_layout(path):
    pages=[]
    with pdfplumber.open(path, unicode_norm='NFC') as pdf:
        for page in pdf.pages:
            text=page.extract_text(layout=True, x_tolerance=1, y_tolerance=3) or ''
            # pdfplumber keeps a five-character page margin that pdftotext omits.
            lines=[line[5:] if line.startswith('     ') else line for line in text.splitlines()]
            pages.append('\n'.join(lines))
            page.close()
    return '\f'.join(pages)

def parse_code_line(raw_line):
    line=re.sub(r'^(\s*)[▼►][A-Z]\d*\s*',r'\1',raw_line).replace('◄','')
    indent=len(re.match(r'^\s*',line).group(0))
    if indent>12: return None
    position=indent; match=CODE_RE.match(line,position)
    if not match: return None
    codes=[]; kinds=[]
    while True:
        codes.append(norm_code(match.group(0))); position=match.end()
        whitespace=re.match(r'\s*',line[position:]).group(0); position+=len(whitespace)
        rest=line[position:]; token=None
        if len(whitespace)<=2:
            for candidate in ('and','to','és','–','—','-'):
                if rest.startswith(candidate) and (candidate in '–—-' or len(rest)==len(candidate) or not rest[len(candidate)].isalnum()):
                    token=candidate; break
        if token is None:
            text=line[position:].strip()
            if text and position<18: return None
            return {'codes':codes,'kinds':kinds,'pending':False,'text':text}
        kinds.append(CONNECTORS[token]); position+=len(token)
        position+=len(re.match(r'\s*',line[position:]).group(0)); match=CODE_RE.match(line,position)
        if match: continue
        return {'codes':codes,'kinds':kinds,'pending':True,'text':line[position:].strip(),'connector':token}

def scope_type(codes,kinds):
    if not kinds: return 'single' if len(codes)==1 else 'list'
    unique=set(kinds)
    if unique=={'range'} and len(codes)==2: return 'range'
    if unique=={'list'}: return 'list'
    return 'mixed'

def is_structural(value,language):
    text=value.strip().replace('\u00ad','')
    if not text: return False
    if PAGE_HEADER_RE.search(text) or AMEND_RE.match(text): return True
    if language=='EN': return bool(STRUCT_EN.match(text)) or text.startswith('EXPLANATORY NOTES TO THE COMBINED')
    return bool(STRUCT_HU.match(text)) or text.startswith('AZ EURÓPAI UNIÓ KOMBINÁLT')

def general_heading(stripped, language):
    if language=='EN' and stripped=='General': return ''
    if language=='HU':
        if re.match(r'^Általános megjegyzés(?:ek)?:?$', stripped): return ''
        m=re.match(r'^Általános\s+(A\s+\d{1,2}\..+)$',stripped)
        if m: return m.group(1)
    return None
