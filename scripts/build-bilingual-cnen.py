#!/usr/bin/env python3
import argparse
import base64
import gzip
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

from cnen_pdf_core import clean, extract_pdf_layout
from cnen_pdf_parser import (
    pair_records,
    parse_layout,
    referenced_codes,
    repair_records,
    rule_types,
)


def combined_text(record):
    return clean(f"{record.get('heading', '')} {record.get('text', '')}")


def paired_payload(identifier, en_record, hu_record, discrepancies):
    discrepancy = en_record['scopeType'] != hu_record['scopeType']
    scope = (
        'list'
        if discrepancy and 'list' in (en_record['scopeType'], hu_record['scopeType'])
        else en_record['scopeType']
    )
    codes = list(dict.fromkeys((en_record.get('codes') or []) + (hu_record.get('codes') or [])))
    if discrepancy:
        discrepancies.append({
            'codes': codes,
            'enScope': en_record['scopeType'],
            'huScope': hu_record['scopeType'],
            'headingEn': en_record.get('heading', ''),
            'headingHu': hu_record.get('heading', ''),
        })
    text_en = combined_text(en_record)
    text_hu = combined_text(hu_record)
    return {
        'id': identifier,
        'c': codes,
        's': scope,
        'se': en_record['scopeType'],
        'sh': hu_record['scopeType'],
        **({'d': True} if discrepancy else {}),
        'he': en_record.get('heading', ''),
        'te': text_en,
        'hh': hu_record.get('heading', ''),
        'th': text_hu,
        'y': rule_types(text_en, text_hu),
        'r': list(dict.fromkeys(
            referenced_codes(text_en, codes) + referenced_codes(text_hu, codes)
        )),
        'pe': en_record.get('pdfPageStart'),
        'qe': en_record.get('pdfPageEnd'),
        'ne': en_record.get('printedPageStart'),
        'oe': en_record.get('printedPageEnd'),
        'ph': hu_record.get('pdfPageStart'),
        'qh': hu_record.get('pdfPageEnd'),
        'nh': hu_record.get('printedPageStart'),
        'oh': hu_record.get('printedPageEnd'),
        **({'g': True} if en_record.get('kind') == 'general' or hu_record.get('kind') == 'general' else {}),
    }


def supplemental_payload(identifier, language, record):
    text = combined_text(record)
    heading = record.get('heading', '')
    pages = {
        'pdfPageStart': record.get('pdfPageStart'),
        'pdfPageEnd': record.get('pdfPageEnd'),
        'printedPageStart': record.get('printedPageStart'),
        'printedPageEnd': record.get('printedPageEnd'),
    }
    return {
        'id': identifier,
        'c': record.get('codes') or [],
        's': record['scopeType'],
        'se': record['scopeType'],
        'sh': record['scopeType'],
        'he': heading,
        'te': text,
        'hh': heading,
        'th': text,
        'y': rule_types(text, text),
        'r': referenced_codes(text, record.get('codes') or []),
        'pe': pages['pdfPageStart'],
        'qe': pages['pdfPageEnd'],
        'ne': pages['printedPageStart'],
        'oe': pages['printedPageEnd'],
        'ph': pages['pdfPageStart'],
        'qh': pages['pdfPageEnd'],
        'nh': pages['printedPageStart'],
        'oh': pages['printedPageEnd'],
        'ml': language,
        **({'g': True} if record.get('kind') == 'general' else {}),
    }


def validate_document(text, language):
    pattern = rf'02019XC0329\(02\).*{language}.*13\.02\.2026.*016\.001'
    if not re.search(pattern, text, re.S):
        raise RuntimeError(
            f'A {language} PDF verziófejléce nem a 2026-02-13-i 016.001 egységes szerkezetű változat.'
        )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('english_pdf', type=Path)
    parser.add_argument('hungarian_pdf', type=Path)
    parser.add_argument('--output', type=Path, default=Path('data/generated/cnen-bilingual-source.json'))
    parser.add_argument('--parts-base', type=Path, default=Path('data/source/cnen-bilingual-source.json'))
    parser.add_argument('--qa', type=Path, default=Path('data/source/cnen-bilingual-qa.json'))
    parser.add_argument('--part-size', type=int, default=500000)
    args = parser.parse_args()

    en_text = extract_pdf_layout(args.english_pdf)
    hu_text = extract_pdf_layout(args.hungarian_pdf)
    validate_document(en_text, 'EN')
    validate_document(hu_text, 'HU')

    en_records = repair_records(parse_layout(en_text, 'EN'), 'EN')
    hu_records = repair_records(parse_layout(hu_text, 'HU'), 'HU')
    pairs, unmatched = pair_records(en_records, hu_records)

    records = []
    discrepancies = []
    for en_record, hu_record in pairs:
        records.append(paired_payload(len(records), en_record, hu_record, discrepancies))

    supplemental = []
    excluded = []
    for language, record in unmatched:
        if language == 'HU':
            supplemental.append((language, record))
            records.append(supplemental_payload(len(records), language, record))
        else:
            excluded.append((language, record))

    general_count = sum(1 for record in records if record.get('g'))
    pairing = {
        'matched': len(pairs),
        'monolingualSupplemental': len(supplemental),
        'unmatchedExcluded': len(excluded),
        'generalRecords': general_count,
        'scopeDiscrepancies': len(discrepancies),
        'scopeDiscrepancyPolicy': 'list-preferred-conservative',
    }
    source = {
        'schemaVersion': '2.0.0',
        'generatorVersion': 'cnen-bilingual-pdfplumber-v3',
        'source': {
            'titleEn': 'Explanatory notes to the Combined Nomenclature of the European Union',
            'titleHu': 'Az Európai Unió Kombinált Nómenklatúrájának magyarázata',
            'celex': '02019XC0329(02)',
            'documentDate': '2026-02-13',
            'consolidation': '016.001',
            'languages': ['EN', 'HU'],
            'authority': 'interpretive_guidance',
            'legallyBinding': False,
            'sourceCodeEdition': 2019,
            'currentCodeEdition': 2026,
            'pageCount': 596,
            'pdfSha256En': hashlib.sha256(args.english_pdf.read_bytes()).hexdigest(),
            'pdfSha256Hu': hashlib.sha256(args.hungarian_pdf.read_bytes()).hexdigest(),
        },
        'pairing': pairing,
        'recordCount': len(records),
        'records': records,
    }

    expected = {
        'matched': 2671,
        'supplemental': 1,
        'recordCount': 2672,
        'generalRecords': 41,
        'scopeDiscrepancies': 4,
    }
    actual = {
        'matched': len(pairs),
        'supplemental': len(supplemental),
        'recordCount': len(records),
        'generalRecords': general_count,
        'scopeDiscrepancies': len(discrepancies),
    }
    if actual != expected or excluded:
        raise RuntimeError(
            f'Párosítási ellenőrzés sikertelen: várt={expected}, tényleges={actual}, kizárt={len(excluded)}.'
        )

    serialized = (json.dumps(source, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf8')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(serialized)

    encoded = base64.b64encode(gzip.compress(serialized, compresslevel=9)).decode('ascii')
    args.parts_base.parent.mkdir(parents=True, exist_ok=True)
    for old in args.parts_base.parent.glob(args.parts_base.name + '.gz.b64.part*'):
        old.unlink()
    for offset in range(0, len(encoded), args.part_size):
        part = offset // args.part_size
        Path(f'{args.parts_base}.gz.b64.part{part:02d}').write_text(
            encoded[offset:offset + args.part_size], encoding='ascii'
        )

    qa = {
        'sourceRecordsEn': len(en_records),
        'sourceRecordsHu': len(hu_records),
        'matchedRecords': len(pairs),
        'monolingualSupplemental': len(supplemental),
        'recordCount': len(records),
        'generalRecords': general_count,
        'unmatchedExcluded': len(excluded),
        'unmatched': [
            {
                'language': language,
                'codes': record.get('codes') or [],
                'heading': record.get('heading', ''),
                'page': record.get('printedPageStart'),
                'includedAsSupplemental': language == 'HU',
            }
            for language, record in unmatched
        ],
        'scopeDiscrepancies': discrepancies,
        'scopeCounts': dict(Counter(record['s'] for record in records)),
        'sourceSha256': hashlib.sha256(serialized).hexdigest(),
        'compressedPartCount': (len(encoded) + args.part_size - 1) // args.part_size,
    }
    args.qa.parent.mkdir(parents=True, exist_ok=True)
    args.qa.write_text(json.dumps(qa, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(
        f"Kétnyelvű CNEN-forrás: EN {len(en_records)}, HU {len(hu_records)}, "
        f"párosítva {len(pairs)}, kiegészítő {len(supplemental)}, "
        f"összesen {len(records)}, részek {qa['compressedPartCount']}."
    )


if __name__ == '__main__':
    main()
