import os
import sqlite3
from datetime import datetime
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)
DB_PATH = os.path.join(os.path.dirname(__file__), 'todos.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS todos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                category TEXT DEFAULT '일반',
                priority TEXT DEFAULT 'normal',
                due_date TEXT DEFAULT '',
                completed INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                completed_at TEXT
            )
        ''')
        # 샘플 데이터가 전혀 없다면 기본 안내 데이터 2개 추가
        cur = conn.cursor()
        cur.execute('SELECT COUNT(*) FROM todos')
        if cur.fetchone()[0] == 0:
            now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            today = datetime.now().strftime('%Y-%m-%d')
            samples = [
                ('Flask 웹앱 프로젝트 시작하기', '가상환경 설정 및 웹 서버 구동 확인하기', '업무', 'high', today, 1, now, now),
                ('오늘의 핵심 할 일 작성하기', '우선순위와 카테고리를 설정하여 체계적으로 관리해보세요.', '개인', 'normal', today, 0, now, None),
                ('완료된 작업 확인 및 리포트 점검', '대시보드 상단의 진행률과 통계를 확인합니다.', '공부', 'low', today, 0, now, None),
            ]
            conn.executemany('''
                INSERT INTO todos (title, description, category, priority, due_date, completed, created_at, completed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', samples)
        conn.commit()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/todos', methods=['GET'])
def get_todos():
    status_filter = request.args.get('status', 'all')
    category_filter = request.args.get('category', 'all')
    search_query = request.args.get('search', '').strip()

    query = 'SELECT * FROM todos WHERE 1=1'
    params = []

    if status_filter == 'active':
        query += ' AND completed = 0'
    elif status_filter == 'completed':
        query += ' AND completed = 1'

    if category_filter != 'all' and category_filter:
        query += ' AND category = ?'
        params.append(category_filter)

    if search_query:
        query += ' AND (title LIKE ? OR description LIKE ?)'
        params.extend([f'%{search_query}%', f'%{search_query}%'])

    query += ' ORDER BY completed ASC, CASE priority WHEN "high" THEN 1 WHEN "normal" THEN 2 WHEN "low" THEN 3 ELSE 4 END, id DESC'

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(query, params)
        rows = cursor.fetchall()
        todos = [dict(row) for row in rows]

    return jsonify({'success': True, 'todos': todos})

@app.route('/api/todos', methods=['POST'])
def add_todo():
    data = request.get_json() or {}
    title = data.get('title', '').strip()
    if not title:
        return jsonify({'success': False, 'message': '할 일 제목을 입력해주세요.'}), 400

    description = data.get('description', '').strip()
    category = data.get('category', '일반').strip() or '일반'
    priority = data.get('priority', 'normal')
    due_date = data.get('due_date', '').strip()
    created_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO todos (title, description, category, priority, due_date, completed, created_at)
            VALUES (?, ?, ?, ?, ?, 0, ?)
        ''', (title, description, category, priority, due_date, created_at))
        conn.commit()
        new_id = cursor.lastrowid

    return jsonify({'success': True, 'id': new_id, 'message': '할 일이 등록되었습니다.'}), 201

@app.route('/api/todos/<int:todo_id>', methods=['PUT'])
def update_todo(todo_id):
    data = request.get_json() or {}
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM todos WHERE id = ?', (todo_id,))
        todo = cursor.fetchone()
        if not todo:
            return jsonify({'success': False, 'message': '항목을 찾을 수 없습니다.'}), 404

        title = data.get('title', todo['title'])
        description = data.get('description', todo['description'])
        category = data.get('category', todo['category'])
        priority = data.get('priority', todo['priority'])
        due_date = data.get('due_date', todo['due_date'])
        
        # 완료 상태 토글 여부
        if 'completed' in data:
            completed = 1 if data['completed'] else 0
            completed_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S') if completed else None
        else:
            completed = todo['completed']
            completed_at = todo['completed_at']

        cursor.execute('''
            UPDATE todos
            SET title = ?, description = ?, category = ?, priority = ?, due_date = ?, completed = ?, completed_at = ?
            WHERE id = ?
        ''', (title, description, category, priority, due_date, completed, completed_at, todo_id))
        conn.commit()

    return jsonify({'success': True, 'message': '할 일이 업데이트되었습니다.'})

@app.route('/api/todos/<int:todo_id>', methods=['DELETE'])
def delete_todo(todo_id):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM todos WHERE id = ?', (todo_id,))
        if cursor.rowcount == 0:
            return jsonify({'success': False, 'message': '항목을 찾을 수 없습니다.'}), 404
        conn.commit()

    return jsonify({'success': True, 'message': '할 일이 삭제되었습니다.'})

@app.route('/api/todos/clear-completed', methods=['POST'])
def clear_completed():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM todos WHERE completed = 1')
        deleted_count = cursor.rowcount
        conn.commit()

    return jsonify({'success': True, 'deleted': deleted_count, 'message': f'{deleted_count}개의 완료된 항목이 삭제되었습니다.'})

@app.route('/api/stats', methods=['GET'])
def get_stats():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) FROM todos')
        total = cursor.fetchone()[0]
        cursor.execute('SELECT COUNT(*) FROM todos WHERE completed = 1')
        completed = cursor.fetchone()[0]
        active = total - completed
        percentage = round((completed / total * 100)) if total > 0 else 0

        # 카테고리 목록
        cursor.execute('SELECT DISTINCT category FROM todos WHERE category IS NOT NULL AND category != ""')
        categories = [row[0] for row in cursor.fetchall()]

    return jsonify({
        'total': total,
        'completed': completed,
        'active': active,
        'percentage': percentage,
        'categories': categories
    })

if __name__ == '__main__':
    init_db()
    print("Todo Flask Application running at http://127.0.0.1:5000")
    app.run(host='127.0.0.1', port=5000, debug=True)
