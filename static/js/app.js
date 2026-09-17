/**
 * TaskMaster Pro - Frontend Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    // State
    let currentFilter = 'all';
    let currentCategory = 'all';
    let currentSearch = '';
    let searchDebounceTimer = null;

    // DOM Elements
    const todoForm = document.getElementById('todo-form');
    const todoTitleInput = document.getElementById('todo-title');
    const todoDescInput = document.getElementById('todo-desc');
    const todoPriorityInput = document.getElementById('todo-priority');
    const todoCategoryInput = document.getElementById('todo-category');
    const todoDueDateInput = document.getElementById('todo-due-date');
    const btnDueToday = document.getElementById('btn-due-today');
    const btnDueTomorrow = document.getElementById('btn-due-tomorrow');

    const todoListContainer = document.getElementById('todo-list');
    const emptyState = document.getElementById('empty-state');
    const filterTabs = document.getElementById('filter-tabs');
    const searchInput = document.getElementById('search-input');
    const btnClearSearch = document.getElementById('btn-clear-search');
    const categoryFilterSelect = document.getElementById('category-filter');
    const btnClearCompleted = document.getElementById('btn-clear-completed');

    // Stats Elements
    const statPercentage = document.getElementById('stat-percentage');
    const progressBar = document.getElementById('progress-bar');
    const statTotal = document.getElementById('stat-total');
    const statActive = document.getElementById('stat-active');
    const statCompleted = document.getElementById('stat-completed');
    const currentDateText = document.getElementById('current-date-text');

    // Modal Elements
    const editModal = document.getElementById('edit-modal');
    const editForm = document.getElementById('edit-form');
    const editTodoId = document.getElementById('edit-todo-id');
    const editTitle = document.getElementById('edit-title');
    const editDesc = document.getElementById('edit-desc');
    const editPriority = document.getElementById('edit-priority');
    const editCategory = document.getElementById('edit-category');
    const editDueDate = document.getElementById('edit-due-date');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnCancelEdit = document.getElementById('btn-cancel-edit');

    // Toast Container
    const toastContainer = document.getElementById('toast-container');

    // Initialize Date Header
    displayTodayHeader();

    // Load initial data
    fetchTodos();
    fetchStats();

    // Event Listeners
    todoForm.addEventListener('submit', handleAddTodo);
    btnDueToday.addEventListener('click', () => setQuickDate(0));
    btnDueTomorrow.addEventListener('click', () => setQuickDate(1));

    // Filter Tabs
    filterTabs.addEventListener('click', (e) => {
        const tabBtn = e.target.closest('.tab-btn');
        if (!tabBtn) return;
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        tabBtn.classList.add('active');
        currentFilter = tabBtn.dataset.filter;
        fetchTodos();
    });

    // Category Filter Dropdown
    categoryFilterSelect.addEventListener('change', (e) => {
        currentCategory = e.target.value;
        fetchTodos();
    });

    // Search Input with Debounce
    searchInput.addEventListener('input', (e) => {
        currentSearch = e.target.value.trim();
        btnClearSearch.classList.toggle('hidden', currentSearch.length === 0);
        
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            fetchTodos();
        }, 250);
    });

    btnClearSearch.addEventListener('click', () => {
        searchInput.value = '';
        currentSearch = '';
        btnClearSearch.classList.add('hidden');
        fetchTodos();
    });

    // Clear Completed Button
    btnClearCompleted.addEventListener('click', handleClearCompleted);

    // Modal Listeners
    btnCloseModal.addEventListener('click', closeEditModal);
    btnCancelEdit.addEventListener('click', closeEditModal);
    editModal.addEventListener('click', (e) => {
        if (e.target === editModal) closeEditModal();
    });
    editForm.addEventListener('submit', handleSaveEdit);

    // ==========================================
    // API Calls
    // ==========================================

    async function fetchTodos() {
        try {
            const params = new URLSearchParams();
            if (currentFilter !== 'all') params.append('status', currentFilter);
            if (currentCategory !== 'all') params.append('category', currentCategory);
            if (currentSearch) params.append('search', currentSearch);

            const res = await fetch(`/api/todos?${params.toString()}`);
            const data = await res.json();

            if (data.success) {
                renderTodoList(data.todos);
            }
        } catch (error) {
            console.error('Error fetching todos:', error);
            showToast('할 일 목록을 불러오는 중 오류가 발생했습니다.', 'error');
        }
    }

    async function fetchStats() {
        try {
            const res = await fetch('/api/stats');
            const stats = await res.json();

            statPercentage.textContent = `${stats.percentage}%`;
            progressBar.style.width = `${stats.percentage}%`;
            statTotal.textContent = stats.total;
            statActive.textContent = stats.active;
            statCompleted.textContent = stats.completed;

            updateCategoryOptions(stats.categories);
        } catch (error) {
            console.error('Error fetching stats:', error);
        }
    }

    async function handleAddTodo(e) {
        e.preventDefault();
        const title = todoTitleInput.value.trim();
        if (!title) return;

        const payload = {
            title: title,
            description: todoDescInput.value.trim(),
            priority: todoPriorityInput.value,
            category: todoCategoryInput.value.trim() || '일반',
            due_date: todoDueDateInput.value
        };

        try {
            const res = await fetch('/api/todos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.success) {
                todoTitleInput.value = '';
                todoDescInput.value = '';
                todoDueDateInput.value = '';
                showToast('할 일이 추가되었습니다!', 'success');
                fetchTodos();
                fetchStats();
            } else {
                showToast(data.message || '추가 실패', 'error');
            }
        } catch (error) {
            console.error('Error adding todo:', error);
            showToast('서버 통신 중 오류가 발생했습니다.', 'error');
        }
    }

    async function toggleTodoStatus(id, currentCompleted) {
        try {
            const res = await fetch(`/api/todos/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completed: !currentCompleted })
            });
            const data = await res.json();

            if (data.success) {
                fetchTodos();
                fetchStats();
            }
        } catch (error) {
            console.error('Error toggling todo:', error);
            showToast('상태 변경 실패', 'error');
        }
    }

    async function deleteTodo(id) {
        if (!confirm('이 할 일을 삭제하시겠습니까?')) return;

        try {
            const res = await fetch(`/api/todos/${id}`, {
                method: 'DELETE'
            });
            const data = await res.json();

            if (data.success) {
                showToast('할 일이 삭제되었습니다.', 'info');
                fetchTodos();
                fetchStats();
            } else {
                showToast(data.message || '삭제 실패', 'error');
            }
        } catch (error) {
            console.error('Error deleting todo:', error);
            showToast('삭제 중 오류가 발생했습니다.', 'error');
        }
    }

    async function handleClearCompleted() {
        if (!confirm('완료된 모든 할 일을 정리하시겠습니까?')) return;

        try {
            const res = await fetch('/api/todos/clear-completed', {
                method: 'POST'
            });
            const data = await res.json();

            if (data.success) {
                showToast(data.message, 'info');
                fetchTodos();
                fetchStats();
            }
        } catch (error) {
            console.error('Error clearing completed todos:', error);
            showToast('정리 중 오류 발생', 'error');
        }
    }

    async function handleSaveEdit(e) {
        e.preventDefault();
        const id = editTodoId.value;
        const payload = {
            title: editTitle.value.trim(),
            description: editDesc.value.trim(),
            priority: editPriority.value,
            category: editCategory.value.trim() || '일반',
            due_date: editDueDate.value
        };

        try {
            const res = await fetch(`/api/todos/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.success) {
                closeEditModal();
                showToast('할 일이 수정되었습니다.', 'success');
                fetchTodos();
                fetchStats();
            } else {
                showToast(data.message || '수정 실패', 'error');
            }
        } catch (error) {
            console.error('Error saving todo:', error);
            showToast('수정 중 오류 발생', 'error');
        }
    }

    // ==========================================
    // Render Functions
    // ==========================================

    function renderTodoList(todos) {
        todoListContainer.innerHTML = '';

        if (!todos || todos.length === 0) {
            emptyState.classList.remove('hidden');
            return;
        }

        emptyState.classList.add('hidden');

        todos.forEach(todo => {
            const card = document.createElement('div');
            card.className = `todo-card priority-${todo.priority} ${todo.completed ? 'completed' : ''}`;
            card.dataset.id = todo.id;

            // Due Date Badge Logic
            const dueBadgeHtml = getDueBadgeHtml(todo.due_date, todo.completed);
            const priorityText = {
                high: '높음 🔥',
                normal: '보통',
                low: '낮음'
            }[todo.priority] || '보통';

            card.innerHTML = `
                <div class="checkbox-wrap">
                    <div class="custom-checkbox" role="button" aria-label="완료 토글" title="완료 상태 변경">
                        <i class="fa-solid fa-check"></i>
                    </div>
                </div>
                <div class="todo-card-body">
                    <div class="todo-meta-top">
                        <span class="badge badge-${todo.priority}">${priorityText}</span>
                        <span class="badge badge-category"><i class="fa-solid fa-tag"></i> ${escapeHtml(todo.category)}</span>
                        ${dueBadgeHtml}
                    </div>
                    <div class="todo-title">${escapeHtml(todo.title)}</div>
                    ${todo.description ? `<div class="todo-desc">${escapeHtml(todo.description)}</div>` : ''}
                    <div class="todo-timestamp">
                        <i class="fa-regular fa-clock"></i> 등록: ${todo.created_at.slice(0, 16)}
                        ${todo.completed && todo.completed_at ? ` &bull; 완료: ${todo.completed_at.slice(0, 16)}` : ''}
                    </div>
                </div>
                <div class="todo-card-actions">
                    <button class="btn-icon btn-icon-edit" title="수정" aria-label="수정">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn-icon btn-icon-delete" title="삭제" aria-label="삭제">
                        <i class="fa-regular fa-trash-can"></i>
                    </button>
                </div>
            `;

            // Card Event Listeners
            const checkbox = card.querySelector('.custom-checkbox');
            checkbox.addEventListener('click', () => toggleTodoStatus(todo.id, todo.completed));

            const btnEdit = card.querySelector('.btn-icon-edit');
            btnEdit.addEventListener('click', () => openEditModal(todo));

            const btnDelete = card.querySelector('.btn-icon-delete');
            btnDelete.addEventListener('click', () => deleteTodo(todo.id));

            todoListContainer.appendChild(card);
        });
    }

    function updateCategoryOptions(categories) {
        const selected = categoryFilterSelect.value;
        categoryFilterSelect.innerHTML = '<option value="all">모든 카테고리</option>';
        if (!categories) return;

        categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            if (cat === selected) opt.selected = true;
            categoryFilterSelect.appendChild(opt);
        });
    }

    function getDueBadgeHtml(dueDateStr, isCompleted) {
        if (!dueDateStr) return '';

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const due = new Date(dueDateStr);
        due.setHours(0, 0, 0, 0);

        const diffTime = due.getTime() - today.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

        let text = dueDateStr;
        let isOverdue = false;

        if (diffDays < 0) {
            text = `기한 초과 (${Math.abs(diffDays)}일 전)`;
            isOverdue = !isCompleted;
        } else if (diffDays === 0) {
            text = `오늘 마감 🔥`;
        } else if (diffDays === 1) {
            text = `내일 마감`;
        } else {
            text = `D-${diffDays} (${dueDateStr})`;
        }

        return `<span class="badge badge-due ${isOverdue ? 'overdue' : ''}"><i class="fa-regular fa-calendar"></i> ${text}</span>`;
    }

    // ==========================================
    // Modal & Quick Helpers
    // ==========================================

    function openEditModal(todo) {
        editTodoId.value = todo.id;
        editTitle.value = todo.title;
        editDesc.value = todo.description || '';
        editPriority.value = todo.priority || 'normal';
        editCategory.value = todo.category || '일반';
        editDueDate.value = todo.due_date || '';
        editModal.classList.remove('hidden');
        editTitle.focus();
    }

    function closeEditModal() {
        editModal.classList.add('hidden');
    }

    function setQuickDate(daysOffset) {
        const target = new Date();
        target.setDate(target.getDate() + daysOffset);
        const yyyy = target.getFullYear();
        const mm = String(target.getMonth() + 1).padStart(2, '0');
        const dd = String(target.getDate()).padStart(2, '0');
        todoDueDateInput.value = `${yyyy}-${mm}-${dd}`;
    }

    function displayTodayHeader() {
        const now = new Date();
        const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
        currentDateText.textContent = `${now.toLocaleDateString('ko-KR', options)} &bull; 오늘의 목표를 달성해보세요!`;
        currentDateText.innerHTML = `${now.toLocaleDateString('ko-KR', options)} &nbsp;&bull;&nbsp; 오늘의 목표를 달성해보세요!`;
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const icon = {
            success: 'fa-circle-check',
            error: 'fa-circle-exclamation',
            info: 'fa-circle-info'
        }[type] || 'fa-circle-info';

        toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
});
