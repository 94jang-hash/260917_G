"""
예시 데이터 생성기.

실제 통계가 아닌, 화면 구성을 위한 재현 가능한(seed 고정) 예시 수치를 만든다.
실데이터로 교체하려면 data/*.json 을 같은 스키마로 덮어쓰면 된다.

    python scripts/generate_sample_data.py
"""
import json
import math
import os
import random

random.seed(260917)

BASE_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
LAST_MONTH = (2026, 8)   # 데이터 기준월
MONTHS = 24

CATEGORIES = [
    {'id': 'fund',    'name': '펀드',     'required': True,  'desc': '공모·사모펀드 및 ETF 판매잔고'},
    {'id': 'trust',   'name': '신탁',     'required': True,  'desc': '특정금전신탁·재산신탁 수탁고'},
    {'id': 'wrap',    'name': '랩',       'required': True,  'desc': '일임형 랩어카운트 계약자산'},
    {'id': 'els',     'name': 'ELS/DLS',  'required': False, 'desc': '파생결합증권 발행잔액'},
    {'id': 'deposit', 'name': '예·적금',  'required': False, 'desc': '정기예금·적금 잔액'},
    {'id': 'isa',     'name': 'ISA',      'required': False, 'desc': '개인종합자산관리계좌 가입금액'},
    {'id': 'pension', 'name': '퇴직연금', 'required': False, 'desc': 'DC·IRP 적립금'},
]

# (id, 이름, 유형, 규모 가중치)
INSTITUTIONS = [
    ('mirae',        '미래에셋증권', 'securities', 1.00),
    ('kis',          '한국투자증권', 'securities', 0.95),
    ('nh',           'NH투자증권',   'securities', 0.85),
    ('samsung',      '삼성증권',     'securities', 0.90),
    ('kb_sec',       'KB증권',       'securities', 0.80),
    ('kiwoom',       '키움증권',     'securities', 0.55),
    ('shinhan_sec',  '신한투자증권', 'securities', 0.65),
    ('hana_sec',     '하나증권',     'securities', 0.55),
    ('meritz',       '메리츠증권',   'securities', 0.45),
    ('daishin',      '대신증권',     'securities', 0.40),
    ('yuanta',       '유안타증권',   'securities', 0.25),
    ('hanwha',       '한화투자증권', 'securities', 0.25),
    ('kb_bank',      'KB국민은행',   'bank', 1.00),
    ('shinhan_bank', '신한은행',     'bank', 0.95),
    ('hana_bank',    '하나은행',     'bank', 0.90),
    ('woori',        '우리은행',     'bank', 0.85),
    ('nh_bank',      'NH농협은행',   'bank', 0.80),
    ('ibk',          'IBK기업은행',  'bank', 0.60),
    ('sc',           'SC제일은행',   'bank', 0.25),
    ('kakao',        '카카오뱅크',   'bank', 0.30),
    ('kbank',        '케이뱅크',     'bank', 0.15),
    ('toss',         '토스뱅크',     'bank', 0.15),
    ('im',           'iM뱅크',       'bank', 0.25),
    ('busan',        'BNK부산은행',  'bank', 0.25),
]

# 카테고리별 (기관유형 → 시작 잔고, 종료 잔고) 단위: 조원 — 예시 스케일
SCALE = {
    'fund':    {'securities': (330, 385), 'bank': (108, 118)},
    'trust':   {'securities': (262, 305), 'bank': (620, 690)},
    'wrap':    {'securities': (104, 126)},
    'els':     {'securities': (56, 47)},
    'deposit': {'bank': (1010, 1085)},
    'isa':     {'securities': (18, 27), 'bank': (12, 14)},
    'pension': {'securities': (100, 132), 'bank': (210, 236)},
}


def month_list():
    y, m = LAST_MONTH
    out = []
    for _ in range(MONTHS):
        out.append(f'{y:04d}-{m:02d}')
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return list(reversed(out))


def series(start, end, n, noise=0.012, season=0.0):
    vals = []
    for i in range(n):
        t = i / (n - 1)
        base = start + (end - start) * (t ** 0.9)
        wobble = 1 + random.gauss(0, noise) + season * math.sin(2 * math.pi * i / 12)
        vals.append(round(base * wobble, 1))
    return vals


def build_trends(months):
    rows = []
    for cat in CATEGORIES:
        for inst_type, (s, e) in SCALE[cat['id']].items():
            season = 0.01 if cat['id'] in ('deposit', 'isa') else 0.0
            for month, v in zip(months, series(s, e, len(months), season=season)):
                rows.append({'month': month, 'category': cat['id'], 'inst_type': inst_type, 'balance': v})
    return rows


def build_institution_balances(trends, months):
    last = months[-1]
    prev = months[-13]
    latest = {(r['category'], r['inst_type']): r['balance'] for r in trends if r['month'] == last}
    yearago = {(r['category'], r['inst_type']): r['balance'] for r in trends if r['month'] == prev}
    out = []
    for cat in CATEGORIES:
        for inst_type in SCALE[cat['id']]:
            members = [i for i in INSTITUTIONS if i[2] == inst_type]
            weights = [w * random.uniform(0.75, 1.25) for (_, _, _, w) in members]
            total_w = sum(weights)
            for (iid, name, _, _), w in zip(members, weights):
                share = w / total_w
                bal = round(latest[(cat['id'], inst_type)] * share, 1)
                ya = round(yearago[(cat['id'], inst_type)] * share * random.uniform(0.9, 1.1), 1)
                out.append({'institution_id': iid, 'category': cat['id'], 'balance': bal,
                            'yoy_pct': round((bal / ya - 1) * 100, 1) if ya else None})
    return out


PRODUCT_TEMPLATES = {
    'fund': [
        ('글로벌 배당주 펀드', '주식형', 3), ('국내 채권 인덱스 펀드', '채권형', 5),
        ('AI·반도체 테마 펀드', '주식형', 2), ('TDF 2045', '혼합형', 4), ('MMF (법인용)', '단기금융', 6),
    ],
    'trust': [
        ('특정금전신탁 (채권형)', '특정금전신탁', 5), ('ELT (지수연계신탁)', '특정금전신탁', 3),
        ('유언대용신탁', '재산신탁', 5), ('정기예금형 신탁', '특정금전신탁', 6),
    ],
    'wrap': [
        ('글로벌 테마 랩', '일임형', 2), ('채권형 랩 (단기)', '일임형', 5),
        ('자문형 밸류 랩', '일임형', 3), ('ETF 자산배분 랩', '일임형', 4),
    ],
    'els': [('스텝다운 ELS (3종목)', '원금비보장', 2), ('지수형 ELB', '원금보장', 5)],
    'deposit': [('정기예금 12개월', '정기예금', 6), ('청년 우대 적금', '적금', 6), ('파킹통장', '수시입출금', 6)],
    'isa': [('ISA 중개형', '중개형', 4), ('ISA 신탁형', '신탁형', 5)],
    'pension': [('IRP 디폴트옵션 (중위험)', 'IRP', 4), ('DC형 TDF 라인업', 'DC', 4)],
}

RETURN_RANGE = {  # 유형별 1년 수익률(%) 예시 범위
    'fund': (-8, 28), 'trust': (2, 7), 'wrap': (-5, 22), 'els': (3, 9),
    'deposit': (2.3, 3.6), 'isa': (1, 12), 'pension': (2, 9),
}


def build_products(months):
    products = []
    pid = 1
    for iid, name, inst_type, w in INSTITUTIONS:
        short = name.replace('증권', '').replace('은행', '').replace('투자', '')
        for cat in CATEGORIES:
            if inst_type not in SCALE[cat['id']]:
                continue
            templates = PRODUCT_TEMPLATES[cat['id']]
            k = 2 if w >= 0.6 else 1
            for tname, subtype, risk in random.sample(templates, k):
                lo, hi = RETURN_RANGE[cat['id']]
                launch_idx = random.randint(0, len(months) - 1)
                products.append({
                    'id': pid,
                    'name': f'{short} {tname}',
                    'institution_id': iid,
                    'category': cat['id'],
                    'subtype': subtype,
                    'risk_grade': risk,                     # 1(매우높음) ~ 6(매우낮음)
                    'return_1y': round(random.uniform(lo, hi), 2),
                    'balance': round(random.uniform(300, 9000) * w),   # 억원
                    'launch_date': months[launch_idx] + '-' + f'{random.randint(1, 28):02d}',
                    'min_amount': random.choice([10, 100, 500, 1000, 3000]),  # 만원
                    'is_sample': True,
                })
                pid += 1
    return products


ISSUES = [
    # (날짜, 제목, 카테고리들, 요약, 영향)
    ('2023-06-15', '청년도약계좌 출시', ['deposit'],
     '만 19~34세 청년 대상 5년 만기 정책 적금이 11개 은행에서 출시되며 은행권 적금 신규 유입이 확대됨.', 'positive'),
    ('2023-07-12', '퇴직연금 디폴트옵션(사전지정운용제도) 본격 시행', ['pension', 'fund'],
     '가입자가 운용지시를 하지 않으면 사전에 지정한 상품으로 자동 운용. TDF·BF 등 펀드형 상품으로의 자금 이동 촉진.', 'positive'),
    ('2023-12', '금감원, 증권사 채권형 랩·신탁 운용 검사 결과 발표', ['wrap', 'trust'],
     '만기 불일치 운용과 계좌 간 손익 이전(돌려막기) 관행이 확인되어 랩·신탁 영업 관행 전반의 개선 요구. 이후 채권형 랩·신탁 잔고 조정 국면.', 'negative'),
    ('2024-01-17', '정부, ISA 세제혜택 확대 방안 발표', ['isa'],
     '납입한도 연 2천만원→4천만원, 비과세 한도 200만원→500만원 확대 추진. 증권사 중개형 ISA 가입 증가 기대.', 'positive'),
    ('2024-03-11', '금감원, 홍콩 H지수 ELS 분쟁조정 기준안 발표', ['els', 'trust'],
     '대규모 손실이 발생한 홍콩 H지수 연계 ELS·ELT에 대한 배상 기준 제시. 은행 창구 ELT 판매가 중단·축소되며 발행잔액 감소.', 'negative'),
    ('2024-05', '공모펀드 직접 상장거래 방안 발표', ['fund'],
     '금융위원회가 공모펀드를 ETF처럼 거래소에서 매매할 수 있도록 하는 방안을 추진. 공모펀드 활성화 대책의 일환.', 'neutral'),
    ('2024-06-05', '대구은행, 시중은행 전환 후 iM뱅크로 사명 변경', ['deposit'],
     '32년 만의 신규 시중은행 출범. 전국 단위 예·적금 영업 확대로 은행권 수신 경쟁 심화.', 'neutral'),
    ('2024-10-11', '한국은행 기준금리 3.50%→3.25% 인하', ['deposit', 'fund', 'wrap'],
     '3년 2개월 만의 통화정책 전환. 예금금리 하락으로 예·적금에서 투자상품으로의 자금 이동(머니무브) 논의 본격화.', 'neutral'),
    ('2024-10-31', '퇴직연금 실물이전 서비스 개시', ['pension'],
     '보유 상품을 매도하지 않고 다른 금융사로 계좌를 옮길 수 있게 되어 증권사·은행 간 퇴직연금 유치 경쟁 격화.', 'neutral'),
    ('2024-11', '국내 ETF 순자산 170조원 돌파', ['fund'],
     '월배당·커버드콜·해외지수 ETF로 개인 자금이 집중되며 공모펀드 시장의 성장을 ETF가 주도.', 'positive'),
    ('2024-12', '퇴직연금 로보어드바이저(RA) 일임 서비스 혁신금융서비스 지정', ['pension', 'wrap'],
     '알고리즘 기반 일임 운용을 퇴직연금에 허용. 증권사의 랩·일임 역량이 퇴직연금 상품 경쟁력으로 연결.', 'positive'),
    ('2024-12-10', '금융투자소득세 폐지 확정', ['fund', 'wrap', 'els'],
     '소득세법 개정안 국회 통과로 금투세 도입이 백지화. 국내 주식형 펀드·랩 등 투자상품 심리 개선.', 'positive'),
    ('2025-05-29', '한국은행 기준금리 2.50%로 인하', ['deposit', 'trust'],
     '연속 인하로 예금금리가 2%대에 진입. 정기예금형 신탁·MMF 등 단기 자금 대체상품 수요 증가.', 'neutral'),
    ('2025-09-01', '예금자보호한도 1억원으로 상향 시행', ['deposit'],
     '24년 만에 보호한도가 5천만원에서 1억원으로 상향. 저축은행·인터넷은행으로의 예금 분산 및 은행권 수신 구조 변화.', 'positive'),
    ('2025-Q4', '은행권 유언대용신탁·상속신탁 라인업 확대', ['trust'],
     '고령화에 따른 자산승계 수요로 은행 재산신탁 상품이 다변화. 신탁 수탁고 내 재산신탁 비중 증가 추세.', 'positive'),
    ('2026-H1', '증권사 글로벌 테마·자문형 랩 출시 경쟁', ['wrap'],
     '채권형 랩 조정 이후 주식형·글로벌 자산배분형 랩으로 라인업이 재편되며 랩 잔고 회복세.', 'positive'),
]


def main():
    months = month_list()
    trends = build_trends(months)
    inst_bal = build_institution_balances(trends, months)
    products = build_products(months)
    issues = [
        {'id': i + 1, 'date': d, 'title': t, 'categories': c, 'summary': s, 'impact': imp}
        for i, (d, t, c, s, imp) in enumerate(sorted(ISSUES, key=lambda x: x[0], reverse=True))
    ]

    os.makedirs(BASE_DIR, exist_ok=True)

    def dump(name, obj):
        with open(os.path.join(BASE_DIR, name), 'w', encoding='utf-8') as f:
            json.dump(obj, f, ensure_ascii=False, indent=1)

    dump('meta.json', {
        'as_of': months[-1],
        'months': months,
        'is_sample': True,
        'disclaimer': '본 화면의 수치(잔고·수익률·상품 목록)는 화면 구성을 위한 예시 데이터이며 실제 통계가 아닙니다. '
                      '동향 이슈는 공개 보도를 바탕으로 요약한 것입니다.',
        'categories': CATEGORIES,
        'inst_types': [{'id': 'securities', 'name': '증권사'}, {'id': 'bank', 'name': '은행'}],
    })
    dump('institutions.json', [{'id': i, 'name': n, 'type': t} for i, n, t, _ in INSTITUTIONS])
    dump('trends.json', trends)
    dump('institution_balances.json', inst_bal)
    dump('products.json', products)
    dump('issues.json', issues)
    print(f'generated: {len(trends)} trend rows, {len(inst_bal)} inst rows, {len(products)} products, {len(issues)} issues')


if __name__ == '__main__':
    main()
