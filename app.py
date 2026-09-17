"""
금융상품 동향 KR — 한국 증권사·은행의 펀드/신탁/랩 등 금융상품 동향 대시보드.

데이터는 data/*.json 에서 읽는다(서버리스 환경에서도 읽기 전용이라 안전).
수치는 예시 데이터이며, 같은 스키마의 실데이터로 교체하면 그대로 동작한다.
"""
import json
import os
from collections import defaultdict

from flask import Flask, abort, jsonify, render_template, request

app = Flask(__name__)
app.json.ensure_ascii = False

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')


def load(name):
    with open(os.path.join(DATA_DIR, name), encoding='utf-8') as f:
        return json.load(f)


META = load('meta.json')
INSTITUTIONS = load('institutions.json')
TRENDS = load('trends.json')
INST_BALANCES = load('institution_balances.json')
PRODUCTS = load('products.json')
ISSUES = load('issues.json')

INST_BY_ID = {i['id']: i for i in INSTITUTIONS}
CATEGORY_IDS = [c['id'] for c in META['categories']]
MONTHS = META['months']
INST_TYPES = {'securities', 'bank'}


def pct(cur, prev):
    return round((cur / prev - 1) * 100, 1) if prev else None


def parse_inst_type():
    """?inst_type=all|securities|bank → None(전체) 또는 유형 문자열."""
    v = request.args.get('inst_type', 'all')
    return v if v in INST_TYPES else None


def parse_categories():
    raw = request.args.get('categories', '')
    ids = [c for c in raw.split(',') if c in CATEGORY_IDS]
    return ids or CATEGORY_IDS


def aggregate_trends(inst_type=None):
    """(category, month) → 잔고 합계. inst_type 이 None 이면 증권사+은행 합산."""
    agg = defaultdict(float)
    for r in TRENDS:
        if inst_type and r['inst_type'] != inst_type:
            continue
        agg[(r['category'], r['month'])] += r['balance']
    return agg


@app.route('/')
def index():
    return render_template('index.html', meta=META)


@app.route('/api/meta')
def api_meta():
    return jsonify(META)


@app.route('/api/summary')
def api_summary():
    inst_type = parse_inst_type()
    agg = aggregate_trends(inst_type)
    last, prev, year_ago = MONTHS[-1], MONTHS[-2], MONTHS[-13]
    out = []
    for cat in META['categories']:
        cid = cat['id']
        cur = agg.get((cid, last), 0.0)
        if cur == 0.0:
            continue  # 해당 기관유형이 취급하지 않는 상품(예: 은행의 랩)
        out.append({
            'category': cid,
            'name': cat['name'],
            'required': cat['required'],
            'desc': cat['desc'],
            'balance': round(cur, 1),
            'mom_pct': pct(cur, agg.get((cid, prev))),
            'yoy_pct': pct(cur, agg.get((cid, year_ago))),
        })
    total = sum(o['balance'] for o in out)
    for o in out:
        o['share_pct'] = round(o['balance'] / total * 100, 1) if total else 0
    return jsonify({'as_of': last, 'inst_type': inst_type or 'all', 'total': round(total, 1), 'items': out})


@app.route('/api/trends')
def api_trends():
    inst_type = parse_inst_type()
    cats = parse_categories()
    try:
        n = max(3, min(len(MONTHS), int(request.args.get('months', len(MONTHS)))))
    except ValueError:
        n = len(MONTHS)
    months = MONTHS[-n:]
    agg = aggregate_trends(inst_type)
    series = []
    for cat in META['categories']:
        if cat['id'] not in cats:
            continue
        values = [round(agg.get((cat['id'], m), 0.0), 1) for m in months]
        if not any(values):
            continue
        base = values[0] or 1
        series.append({
            'category': cat['id'],
            'name': cat['name'],
            'values': values,
            'indexed': [round(v / base * 100, 1) for v in values],
        })
    return jsonify({'months': months, 'unit': '조원', 'series': series})


@app.route('/api/split')
def api_split():
    """카테고리별 증권사/은행 구성(기준월)."""
    last = MONTHS[-1]
    by_cat = defaultdict(lambda: {'securities': 0.0, 'bank': 0.0})
    for r in TRENDS:
        if r['month'] == last:
            by_cat[r['category']][r['inst_type']] += r['balance']
    items = [{'category': c['id'], 'name': c['name'],
              'securities': round(by_cat[c['id']]['securities'], 1),
              'bank': round(by_cat[c['id']]['bank'], 1)}
             for c in META['categories']]
    return jsonify({'as_of': last, 'unit': '조원', 'items': items})


@app.route('/api/institutions')
def api_institutions():
    inst_type = parse_inst_type()
    category = request.args.get('category', 'fund')
    if category not in CATEGORY_IDS:
        abort(400, '알 수 없는 상품 유형입니다.')
    rows = []
    for r in INST_BALANCES:
        inst = INST_BY_ID[r['institution_id']]
        if r['category'] != category or (inst_type and inst['type'] != inst_type):
            continue
        rows.append({'id': inst['id'], 'name': inst['name'], 'type': inst['type'],
                     'balance': r['balance'], 'yoy_pct': r['yoy_pct']})
    rows.sort(key=lambda x: x['balance'], reverse=True)
    total = sum(r['balance'] for r in rows)
    for r in rows:
        r['share_pct'] = round(r['balance'] / total * 100, 1) if total else 0
    return jsonify({'category': category, 'unit': '조원', 'items': rows})


@app.route('/api/products')
def api_products():
    inst_type = parse_inst_type()
    category = request.args.get('category', 'all')
    institution = request.args.get('institution', 'all')
    q = request.args.get('q', '').strip().lower()
    sort = request.args.get('sort', 'balance')
    order = request.args.get('order', 'desc')

    rows = []
    for p in PRODUCTS:
        inst = INST_BY_ID[p['institution_id']]
        if inst_type and inst['type'] != inst_type:
            continue
        if category != 'all' and p['category'] != category:
            continue
        if institution != 'all' and p['institution_id'] != institution:
            continue
        if q and q not in p['name'].lower() and q not in inst['name'].lower() and q not in p['subtype'].lower():
            continue
        rows.append({**p, 'institution': inst['name'], 'inst_type': inst['type']})

    if sort not in ('balance', 'return_1y', 'risk_grade', 'launch_date', 'name'):
        sort = 'balance'
    rows.sort(key=lambda x: x[sort], reverse=(order == 'desc'))
    return jsonify({'count': len(rows), 'unit': {'balance': '억원', 'return_1y': '%', 'min_amount': '만원'}, 'items': rows})


@app.route('/api/products/<int:product_id>')
def api_product(product_id):
    p = next((x for x in PRODUCTS if x['id'] == product_id), None)
    if not p:
        abort(404)
    inst = INST_BY_ID[p['institution_id']]
    return jsonify({**p, 'institution': inst['name'], 'inst_type': inst['type']})


@app.route('/api/issues')
def api_issues():
    category = request.args.get('category', 'all')
    items = [i for i in ISSUES if category == 'all' or category in i['categories']]
    return jsonify({'count': len(items), 'items': items})


@app.errorhandler(400)
@app.errorhandler(404)
def handle_error(err):
    return jsonify({'error': err.description}), err.code


if __name__ == '__main__':
    print('금융상품 동향 KR running at http://127.0.0.1:5000')
    app.run(host='127.0.0.1', port=5000, debug=True)
