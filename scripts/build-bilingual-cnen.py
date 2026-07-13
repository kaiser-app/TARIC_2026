#!/usr/bin/env python3
import argparse, base64, gzip, hashlib, json, re, subprocess
from collections import Counter, defaultdict
from pathlib import Path

CODE_RE = re.compile(r'\d{4}(?:\s?\d{2}){0,2}')
STRUCT_EN = re.compile(r'^(?:SECTION\s+[IVXLC]+|CHAPTER\s+\d+|GENERAL$|FOREWORD$|SUMMARY$|[A-Z][A-Z ;,()\-’\'0-9]{8,})$')
STRUCT_HU = re.compile(r'^(?:[IVXLC]+\.\s*ÁRUOSZTÁLY|\d+\.\s*ÁRUCSOPORT|ÁRUCSOPORT\s+\d+|ELŐSZÓ$|TARTALOMJEGYZÉK$|ÁLTALÁNOS$|[A-ZÁÉÍÓÖŐÚÜŰ][A-ZÁÉÍÓÖŐÚÜŰ ;,()\-–’\'0-9]{8,})$')
PAGE_HEADER_RE = re.compile(r'02019XC0329\(02\).*?—\s+(EN|HU)\s+—.*?—\s+(\d+)\s*$')
AMEND_RE = re.compile(r'^\s*[▼►][A-Z0-9]+\s*$')
CONNECTORS = {'and': 'list', 'és': 'list', 'to': 'range', '–': 'range', '-': 'range', '—': 'range'}


def norm_code(value):
    return re.sub(r'\D', '', str(value or ''))


def clean(value):
    return re.sub(r'\s+', ' ', str(value or '').replace('\u00ad', '')).strip()


def dehyphenate_join(lines):
    output = []
    for raw in lines:
        value = raw.replace('\u00ad', '').strip()
        if not value:
            continue
        if output and output[-1].endswith('-') and value[0].islower():
            output[-1] = output[-1][:-1] + value
        else:
            output.append(value)
    return clean(' '.join(output))


def parse_code_line(raw_line):
    line = re.sub(r'^(\s*)[▼►][A-Z]\d*\s*', r'\1', raw_line).replace('◄', '')
    indent = len(re.match(r'^\s*', line).group(0))
    if indent > 12:
        return None
    position = indent
    match = CODE_RE.match(line, position)
    if not match:
        return None
    codes, kinds = [], []
    while True:
        codes.append(norm_code(match.group(0)))
        position = match.end()
        whitespace = re.match(r'\s*', line[position:]).group(0)
        position += len(whitespace)
        rest = line[position:]
        token = None
        if len(whitespace) <= 2:
            for candidate in ('and', 'to', 'és', '–', '—', '-'):
                if rest.startswith(candidate) and (candidate in '–—-' or len(rest) == len(candidate) or not rest[len(candidate)].isalnum()):
                    token = candidate
                    break
        if token is None:
            text = line[position:].strip()
            if text and position < 18:
                return None
            return {'codes': codes, 'kinds': kinds, 'pending': False, 'text': text}
        kinds.append(CONNECTORS[token])
        position += len(token)
        position += len(re.match(r'\s*', line[position:]).group(0))
        match = CODE_RE.match(line, position)
        if match:
            continue
        return {'codes': codes, 'kinds': kinds, 'pending': True, 'text': line[position:].strip()}


def is_structural(value, language):
    text = value.strip().replace('\u00ad', '')
    if not text:
        return False
    if PAGE_HEADER_RE.search(text) or AMEND_RE.match(text):
        return True
    if language == 'EN':
        return bool(STRUCT_EN.match(text)) or text.startswith('EXPLANATORY NOTES TO THE COMBINED')
    return bool(STRUCT_HU.match(text)) or text.startswith('AZ EURÓPAI UNIÓ KOMBINÁLT')


def scope_type(codes, kinds):
    if not kinds:
        return 'single' if len(codes) == 1 else 'list'
    unique = set(kinds)
    if unique == {'range'} and len(codes) == 2:
        return 'range'
    if unique == {'list'}:
        return 'list'
    return 'mixed'


def parse_layout(text, language):
    pages = text.split('\f')
    records, current = [], None
    chapter, started = None, False

    def finalize():
        nonlocal current
        if not current:
            return
        heading = clean(current['heading'])
        body = dehyphenate_join(current['body'])
        if heading or body:
            records.append({
                'codes': current['codes'], 'scopeType': scope_type(current['codes'], current['kinds']),
                'heading': heading, 'text': body,
                'pdfPageStart': current['pdfPageStart'], 'pdfPageEnd': current['pdfPageEnd'],
                'printedPageStart': current['printedPageStart'], 'printedPageEnd': current['printedPageEnd'],
            })
        current = None

    for page_index, page in enumerate(pages, 1):
        header = PAGE_HEADER_RE.search(page)
        printed_page = int(header.group(2)) if header else None
        for raw_line in page.splitlines():
            if PAGE_HEADER_RE.search(raw_line) or AMEND_RE.match(raw_line):
                continue
            chapter_match = re.match(r'^\s*CHAPTER\s+(\d+)\s*$', raw_line) if language == 'EN' else re.match(r'^\s*(\d+)\.\s*ÁRUCSOPORT\s*$', raw_line)
            if chapter_match:
                finalize()
                chapter = chapter_match.group(1).zfill(2)
                started = True
                continue
            if not started:
                if re.match(r'^\s*0101(?:\s|$)', raw_line):
                    started, chapter = True, '01'
                else:
                    continue
            line = re.sub(r'^(\s*)[▼►][A-Z]\d*\s*', r'\1', raw_line).replace('◄', '')
            stripped = line.strip()
            connector_only = CONNECTORS.get(stripped) if len(line) - len(line.lstrip()) <= 12 else None
            if current is not None and connector_only:
                current['kinds'].append(connector_only)
                current['pending'] = True
                continue
            continuation = re.match(r'^\s{0,12}(and|to|és|–|—|-)\s*(\d{4}(?:\s?\d{2}){0,2})\s*(.*)$', line)
            if current is not None and continuation:
                current['kinds'].append(CONNECTORS[continuation.group(1)])
                current['codes'].append(norm_code(continuation.group(2)))
                current['pending'] = False
                extra = clean(continuation.group(3))
                if extra:
                    if current['heading']:
                        current['body'].append(extra)
                    else:
                        current['heading'] = extra
                current['pdfPageEnd'], current['printedPageEnd'] = page_index, printed_page
                continue
            parsed = parse_code_line(line)
            if parsed and chapter and not all(code.startswith(chapter) for code in parsed['codes']):
                parsed = None
            if parsed:
                if current is not None and current.get('pending'):
                    current['codes'].extend(parsed['codes'])
                    current['kinds'].extend(parsed['kinds'])
                    current['pending'] = parsed['pending']
                    if parsed['text']:
                        if current['heading']:
                            current['body'].append(parsed['text'])
                        else:
                            current['heading'] = parsed['text']
                    current['pdfPageEnd'], current['printedPageEnd'] = page_index, printed_page
                    continue
                finalize()
                current = {
                    'codes': parsed['codes'][:], 'kinds': parsed['kinds'][:], 'pending': parsed['pending'],
                    'heading': parsed['text'] or '', 'body': [],
                    'pdfPageStart': page_index, 'pdfPageEnd': page_index,
                    'printedPageStart': printed_page, 'printedPageEnd': printed_page,
                }
                continue
            if is_structural(stripped, language):
                finalize()
                continue
            if current is not None and stripped:
                current['body'].append(stripped)
                current['pdfPageEnd'], current['printedPageEnd'] = page_index, printed_page
    finalize()
    return records


def referenced_codes(text, own_codes):
    values = []
    for match in CODE_RE.finditer(text):
        code = norm_code(match.group(0))
        if len(code) >= 4 and code not in own_codes and code not in values:
            values.append(code)
    return values


def rule_types(text_en, text_hu):
    text = f'{text_en} {text_hu}'.lower()
    return [kind for matched, kind in [
        (re.search(r'\b(?:include|includes|included|cover|covers|covered|magában foglal|ide tartoz|alá tartoz)\b', text), 'inclusion'),
        (re.search(r'\b(?:exclude|excludes|excluded|does not cover|do not cover|not included|nem tartozik|kizár|kivételével)\b', text), 'exclusion'),
        (re.search(r'\b(?:means|considered as|for the purposes of|is regarded as|are regarded as|érteni kell|tekintendő|alkalmazásában)\b', text), 'definition'),
        (re.search(r'\b(?:see |see also|referred to|reference to|lásd|hivatkoz)\b', text), 'cross_reference'),
    ] if matched]


def pair_records(en_records, hu_records):
    grouped_en, grouped_hu = defaultdict(list), defaultdict(list)
    for record in en_records:
        grouped_en[tuple(record['codes'])].append(record)
    for record in hu_records:
        grouped_hu[tuple(record['codes'])].append(record)
    pairs, unmatched = [], []
    for key in sorted(set(grouped_en) | set(grouped_hu)):
        left, right = grouped_en[key], grouped_hu[key]
        count = min(len(left), len(right))
        pairs.extend(zip(left[:count], right[:count]))
        unmatched.extend([('EN', record) for record in left[count:]])
        unmatched.extend([('HU', record) for record in right[count:]])
    return pairs, unmatched


def pdf_text(path):
    return subprocess.check_output(['pdftotext', '-layout', str(path), '-'], text=True, encoding='utf8', errors='replace')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('english_pdf', type=Path)
    parser.add_argument('hungarian_pdf', type=Path)
    parser.add_argument('--output', type=Path, default=Path('data/generated/cnen-bilingual-source.json'))
    parser.add_argument('--parts-base', type=Path, default=Path('data/source/cnen-bilingual-source.json'))
    parser.add_argument('--qa', type=Path, default=Path('data/source/cnen-bilingual-qa.json'))
    parser.add_argument('--part-size', type=int, default=45000)
    args = parser.parse_args()

    en_text, hu_text = pdf_text(args.english_pdf), pdf_text(args.hungarian_pdf)
    if not re.search(r'02019XC0329\(02\).*EN.*13\.02\.2026.*016\.001', en_text, re.S) or not re.search(r'02019XC0329\(02\).*HU.*13\.02\.2026.*016\.001', hu_text, re.S):
        raise RuntimeError('A PDF verziófejléce nem a 2026-02-13-i 016.001 egységes szerkezetű változat.')
    en_records, hu_records = parse_layout(en_text, 'EN'), parse_layout(hu_text, 'HU')
    pairs, unmatched = pair_records(en_records, hu_records)
    records, discrepancies = [], []
    for identifier, (en, hu) in enumerate(pairs):
        discrepancy = en['scopeType'] != hu['scopeType']
        scope = 'list' if discrepancy and 'list' in (en['scopeType'], hu['scopeType']) else en['scopeType']
        if discrepancy:
            discrepancies.append({'codes': en['codes'], 'enScope': en['scopeType'], 'huScope': hu['scopeType'], 'headingEn': en['heading'], 'headingHu': hu['heading']})
        text_en, text_hu = clean(f"{en['heading']} {en['text']}"), clean(f"{hu['heading']} {hu['text']}")
        records.append({
            'id': identifier, 'c': en['codes'], 's': scope, 'se': en['scopeType'], 'sh': hu['scopeType'], **({'d': True} if discrepancy else {}),
            'he': en['heading'], 'te': text_en, 'hh': hu['heading'], 'th': text_hu,
            'y': rule_types(text_en, text_hu), 'r': list(dict.fromkeys(referenced_codes(text_en, en['codes']) + referenced_codes(text_hu, en['codes']))),
            'pe': en['pdfPageStart'], 'qe': en['pdfPageEnd'], 'ne': en['printedPageStart'], 'oe': en['printedPageEnd'],
            'ph': hu['pdfPageStart'], 'qh': hu['pdfPageEnd'], 'nh': hu['printedPageStart'], 'oh': hu['printedPageEnd'],
        })
    source = {
        'schemaVersion': '2.0.0', 'generatorVersion': 'cnen-bilingual-parser-v2',
        'source': {
            'titleEn': 'Explanatory notes to the Combined Nomenclature of the European Union',
            'titleHu': 'Az Európai Unió Kombinált Nómenklatúrájának magyarázata',
            'celex': '02019XC0329(02)', 'documentDate': '2026-02-13', 'consolidation': '016.001',
            'languages': ['EN', 'HU'], 'authority': 'interpretive_guidance', 'legallyBinding': False,
            'sourceCodeEdition': 2019, 'currentCodeEdition': 2026, 'pageCount': 596,
            'pdfSha256En': hashlib.sha256(args.english_pdf.read_bytes()).hexdigest(),
            'pdfSha256Hu': hashlib.sha256(args.hungarian_pdf.read_bytes()).hexdigest(),
        },
        'pairing': {'matched': len(records), 'unmatchedExcluded': len(unmatched), 'scopeDiscrepancies': len(discrepancies), 'scopeDiscrepancyPolicy': 'list-preferred-conservative'},
        'recordCount': len(records), 'records': records,
    }
    if len(records) != 2619 or len(unmatched) != 1 or len(discrepancies) != 4:
        raise RuntimeError(f'Párosítási ellenőrzés sikertelen: {len(records)} pár, {len(unmatched)} páratlan, {len(discrepancies)} jelölési eltérés.')
    serialized = (json.dumps(source, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf8')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(serialized)
    encoded = base64.b64encode(gzip.compress(serialized, compresslevel=9)).decode('ascii')
    args.parts_base.parent.mkdir(parents=True, exist_ok=True)
    for old in args.parts_base.parent.glob(args.parts_base.name + '.gz.b64.part*'):
        old.unlink()
    for offset in range(0, len(encoded), args.part_size):
        part = offset // args.part_size
        Path(f'{args.parts_base}.gz.b64.part{part:02d}').write_text(encoded[offset:offset + args.part_size], encoding='ascii')
    qa = {
        'sourceRecordsEn': len(en_records), 'sourceRecordsHu': len(hu_records), 'matchedRecords': len(records),
        'unmatched': [{'language': language, 'codes': record['codes'], 'heading': record['heading'], 'page': record['printedPageStart']} for language, record in unmatched],
        'scopeDiscrepancies': discrepancies, 'scopeCounts': dict(Counter(record['s'] for record in records)),
        'sourceSha256': hashlib.sha256(serialized).hexdigest(), 'compressedPartCount': (len(encoded) + args.part_size - 1) // args.part_size,
    }
    args.qa.parent.mkdir(parents=True, exist_ok=True)
    args.qa.write_text(json.dumps(qa, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(f"Kétnyelvű CNEN-forrás: EN {len(en_records)}, HU {len(hu_records)}, párosítva {len(records)}, részek {qa['compressedPartCount']}.")


if __name__ == '__main__':
    main()
