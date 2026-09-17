# TaskMaster Pro

Flask + SQLite 기반의 단일 페이지 할 일 관리 웹앱.

- 배포: https://260917v-eosin-three.vercel.app (Vercel, `main` 브랜치 푸시 시 자동 배포)
- 저장소: https://github.com/94jang-hash/260917_G

## 로컬 실행

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

http://127.0.0.1:5000 접속. 첫 실행 시 `todos.db`가 자동 생성됩니다.

## 구조

| 경로 | 설명 |
|---|---|
| `app.py` | Flask 서버 + REST API (`/api/todos`, `/api/stats`) |
| `templates/index.html` | 단일 페이지 UI |
| `static/js/app.js` | 프론트 로직 (바닐라 JS) |
| `static/css/style.css` | 스타일 |

## 참고

Vercel 배포 환경은 서버리스라 SQLite가 `/tmp`에 저장되며, 인스턴스 재시작 시 데이터가 초기화됩니다.
