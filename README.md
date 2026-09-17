# 금융상품 동향 KR

한국 증권사·은행의 금융상품 동향을 한눈에 보는 Flask 대시보드.
**펀드 / 신탁 / 랩**을 필수 축으로 하고 ELS·예적금·ISA·퇴직연금을 함께 다룬다.

- 배포: https://260917v-eosin-three.vercel.app (Vercel, `main` 푸시 시 자동 배포)
- 저장소: https://github.com/94jang-hash/260917_G

## 화면 구성

| 영역 | 내용 |
|---|---|
| 필터 행 | 기관 유형(전체/증권사/은행) · 기간(6/12/24개월) · 상품 유형 칩 |
| KPI 타일 | 유형별 기준월 잔고, 전월비·전년비, 구성비 |
| 잔고 추이 | 월별 선 그래프. 지수(시작월=100) / 금액 전환, 표 보기 |
| 증권사 vs 은행 구성 | 유형별 채널 구성 누적 막대 |
| 기관별 순위 | 선택 유형의 상위 10개 기관 잔고 |
| 주요 동향 이슈 | 정책·시장 이벤트 타임라인 (공개 보도 요약) |
| 상품 라인업 | 기관·유형별 상품 표. 정렬·검색·상세 모달 |

## ⚠️ 데이터 안내

`data/*.json`의 **잔고·수익률·상품 목록은 화면 구성을 위한 예시 데이터**이며 실제 통계가 아니다
(`scripts/generate_sample_data.py`로 seed 고정 생성). 동향 이슈 타임라인은 공개 보도를 요약한 것이다.

실데이터로 바꾸려면 같은 스키마로 JSON을 덮어쓰면 된다. 출처 후보:
금융투자협회 통계(펀드·랩·신탁), 금융감독원 금융상품통합비교공시(예적금), 각사 공시.

```
data/meta.json                 기준월, 월 목록, 상품 유형 정의, 면책 문구
data/institutions.json         기관 목록 {id, name, type: securities|bank}
data/trends.json               {month, category, inst_type, balance(조원)}
data/institution_balances.json {institution_id, category, balance(조원), yoy_pct}
data/products.json             상품 {id, name, institution_id, category, subtype, risk_grade, return_1y, balance(억원), launch_date, min_amount}
data/issues.json               이슈 {id, date, title, categories[], summary, impact}
```

## API

| 경로 | 설명 |
|---|---|
| `GET /api/meta` | 메타 정보 |
| `GET /api/summary?inst_type=` | 유형별 잔고 요약 (전월비·전년비·구성비) |
| `GET /api/trends?inst_type=&categories=fund,trust&months=12` | 월별 추이 (금액·지수) |
| `GET /api/split` | 유형별 증권사/은행 구성 |
| `GET /api/institutions?category=&inst_type=` | 기관별 잔고 순위 |
| `GET /api/products?category=&inst_type=&institution=&q=&sort=&order=` | 상품 목록 |
| `GET /api/products/<id>` | 상품 상세 |
| `GET /api/issues?category=` | 동향 이슈 |

## 로컬 실행

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

http://127.0.0.1:5000 접속. 예시 데이터를 다시 만들려면 `python scripts/generate_sample_data.py`.

## 구조

```
app.py                  Flask 서버 + JSON API (data/*.json 읽기 전용)
templates/index.html    단일 페이지 UI
static/js/app.js        프론트 로직 (Chart.js, 바닐라 JS)
static/css/style.css    스타일 (라이트/다크 토큰)
data/                   데이터 JSON
scripts/                예시 데이터 생성기
```
