/**
 * 금융상품 동향 KR — 프론트 로직
 * 서버 API(/api/*)에서 데이터를 받아 KPI·차트·표·타임라인을 그린다.
 */
document.addEventListener('DOMContentLoaded', () => {
    // ---------- 상태 ----------
    const state = {
        instType: 'all',
        range: 12,
        categories: [],          // 선택된 상품 유형 id 목록
        trendMode: 'indexed',
        rankCategory: 'fund',
        issueCategory: 'all',
        product: { category: 'all', institution: 'all', q: '', sort: 'balance', order: 'desc' },
    };
    let meta = null;
    let institutions = [];
    const charts = {};

    // 상품 유형 → 색 슬롯 (엔티티에 고정, 순위/필터에 따라 바뀌지 않음)
    const CATEGORY_SLOT = { fund: 's1', trust: 's2', wrap: 's3', els: 's4', deposit: 's5', isa: 's6', pension: 's7' };
    const INST_TYPE_NAME = { securities: '증권사', bank: '은행' };
    const IMPACT_LABEL = { positive: ['fa-arrow-trend-up', '긍정'], negative: ['fa-arrow-trend-down', '부정'], neutral: ['fa-minus', '중립'] };

    // ---------- 유틸 ----------
    const $ = (sel) => document.querySelector(sel);
    const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const catColor = (id) => token(`--${CATEGORY_SLOT[id] || 's8'}`);
    const fmtTrillion = (v) => v.toLocaleString('ko-KR', { maximumFractionDigits: 1 });
    const fmtPct = (v, digits = 1) => (v === null || v === undefined) ? '–' : `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`;
    const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const catName = (id) => (meta.categories.find((c) => c.id === id) || {}).name || id;
    const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

    async function getJSON(url, params = {}) {
        const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '')).toString();
        const res = await fetch(qs ? `${url}?${qs}` : url);
        if (!res.ok) throw new Error(`${url} → ${res.status}`);
        return res.json();
    }

    function deltaHtml(v) {
        if (v === null || v === undefined) return '<span class="delta flat">–</span>';
        const cls = v > 0.05 ? 'up' : v < -0.05 ? 'down' : 'flat';
        const icon = cls === 'up' ? 'fa-caret-up' : cls === 'down' ? 'fa-caret-down' : 'fa-minus';
        return `<span class="delta ${cls}"><i class="fa-solid ${icon}"></i>${fmtPct(v)}</span>`;
    }

    function setSegmented(container, value) {
        container.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.value === String(value)));
    }

    // Chart.js 공통 옵션: 은은한 격자, 얇은 축, 텍스트는 텍스트 토큰
    function baseOptions() {
        Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
        Chart.defaults.color = token('--muted');
        return {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 250 },
            plugins: {
                legend: { labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, color: token('--text-2'), padding: 14 } },
                tooltip: {
                    backgroundColor: token('--surface'), titleColor: token('--text'), bodyColor: token('--text-2'),
                    borderColor: token('--border'), borderWidth: 1, padding: 10, boxPadding: 4, usePointStyle: true,
                },
            },
            scales: {
                x: { grid: { display: false }, border: { color: token('--axis') }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
                y: { grid: { color: token('--grid') }, border: { display: false }, ticks: { padding: 6 } },
            },
        };
    }

    // 선 그래프 끝단 직접 라벨 (시리즈 4개 이하일 때만)
    const endLabelPlugin = {
        id: 'endLabels',
        afterDatasetsDraw(chart) {
            if (chart.data.datasets.length > 4) return;
            const { ctx } = chart;
            ctx.save();
            ctx.font = `600 11px ${Chart.defaults.font.family}`;
            ctx.textBaseline = 'middle';
            ctx.fillStyle = token('--text-2');
            const placed = [];
            chart.data.datasets.forEach((ds, i) => {
                const m = chart.getDatasetMeta(i);
                if (m.hidden || !m.data.length) return;
                const pt = m.data[m.data.length - 1];
                let y = pt.y;
                placed.forEach((py) => { if (Math.abs(py - y) < 12) y = py + 12; });
                placed.push(y);
                ctx.fillText(ds.label, pt.x + 8, y);
            });
            ctx.restore();
        },
    };

    // ---------- 초기화 ----------
    async function init() {
        meta = await getJSON('/api/meta');
        state.categories = meta.categories.filter((c) => c.required).map((c) => c.id);
        institutions = [];
        renderCategoryChips();
        fillCategorySelect($('#rank-category'), false);
        fillCategorySelect($('#issue-category'), true);
        fillCategorySelect($('#product-category'), true);
        bindEvents();
        await refreshAll();
    }

    function fillCategorySelect(select, withAll) {
        select.innerHTML = (withAll ? '<option value="all">모든 유형</option>' : '') +
            meta.categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    }

    function renderCategoryChips() {
        $('#category-chips').innerHTML = meta.categories.map((c) => `
            <button class="chip ${state.categories.includes(c.id) ? 'active' : ''}" data-id="${c.id}"
                    style="--chip-color:${catColor(c.id)}" aria-pressed="${state.categories.includes(c.id)}">
                <span class="dot"></span>${escapeHtml(c.name)}${c.required ? '<span class="req">필수</span>' : ''}
            </button>`).join('');
    }

    async function refreshAll() {
        await Promise.all([loadSummary(), loadTrends(), loadSplit(), loadRank(), loadIssues(), loadInstitutions()]);
        await loadProducts();
    }

    // ---------- KPI ----------
    async function loadSummary() {
        const data = await getJSON('/api/summary', { inst_type: state.instType });
        $('#kpi-grid').innerHTML = data.items.map((it) => `
            <div class="kpi ${state.categories.includes(it.category) ? '' : 'dimmed'}" data-id="${it.category}"
                 style="--kpi-color:${catColor(it.category)}" title="${escapeHtml(it.desc)}">
                <div class="kpi-label"><span>${escapeHtml(it.name)}</span>${it.required ? '<span class="req-badge">필수</span>' : ''}</div>
                <div class="kpi-value">${fmtTrillion(it.balance)}<small>조원</small></div>
                <div class="kpi-delta"><span>전월 ${deltaHtml(it.mom_pct)}</span><span>전년 ${deltaHtml(it.yoy_pct)}</span></div>
                <div class="kpi-share" title="구성비 ${it.share_pct}%"><i style="width:${it.share_pct}%"></i></div>
            </div>`).join('');
    }

    // ---------- 잔고 추이 ----------
    let trendData = null;
    async function loadTrends() {
        trendData = await getJSON('/api/trends', { inst_type: state.instType, categories: state.categories.join(','), months: state.range });
        drawTrend();
        renderTrendTable();
    }

    function drawTrend() {
        const indexed = state.trendMode === 'indexed';
        $('#trend-sub').textContent = indexed
            ? '선택한 상품 유형의 월별 잔고 · 시작월 = 100 지수 (규모가 다른 유형을 같은 축에서 비교)'
            : '선택한 상품 유형의 월별 잔고, 조원';
        const datasets = trendData.series.map((s) => ({
            label: s.name,
            data: indexed ? s.indexed : s.values,
            borderColor: catColor(s.category),
            backgroundColor: catColor(s.category),
            borderWidth: 2, tension: 0.25, pointRadius: 0, pointHoverRadius: 5,
            pointHoverBorderWidth: 2, pointHoverBorderColor: token('--surface'),
        }));
        const opts = baseOptions();
        opts.interaction = { mode: 'index', intersect: false };
        opts.layout = { padding: { right: datasets.length <= 4 ? 56 : 8 } };
        opts.plugins.tooltip.callbacks = {
            label: (c) => ` ${c.dataset.label}: ${indexed ? c.parsed.y.toFixed(1) : fmtTrillion(c.parsed.y) + '조원'}`,
        };
        opts.scales.y.ticks.callback = (v) => indexed ? v : fmtTrillion(v);
        if (charts.trend) charts.trend.destroy();
        charts.trend = new Chart($('#trend-chart'), { type: 'line', data: { labels: trendData.months, datasets }, options: opts, plugins: [endLabelPlugin] });
    }

    function renderTrendTable() {
        const months = trendData.months;
        const head = `<tr><th>유형</th>${months.map((m) => `<th>${m}</th>`).join('')}</tr>`;
        const rows = trendData.series.map((s) => `<tr><td>${escapeHtml(s.name)}</td>${s.values.map((v) => `<td>${fmtTrillion(v)}</td>`).join('')}</tr>`).join('');
        $('#trend-table').innerHTML = `<table><thead>${head}</thead><tbody>${rows}</tbody></table><p class="sub-cell">단위: 조원</p>`;
    }

    // ---------- 증권사 vs 은행 ----------
    async function loadSplit() {
        const data = await getJSON('/api/split');
        const items = data.items.filter((it) => state.categories.includes(it.category));
        const opts = baseOptions();
        opts.indexAxis = 'y';
        opts.scales.x = { stacked: true, grid: { color: token('--grid') }, border: { display: false }, ticks: { callback: (v) => fmtTrillion(v) } };
        opts.scales.y = { stacked: true, grid: { display: false }, border: { color: token('--axis') } };
        opts.plugins.tooltip.callbacks = { label: (c) => ` ${c.dataset.label}: ${fmtTrillion(c.parsed.x)}조원` };
        const mk = (key, label, slot) => ({
            label, data: items.map((i) => i[key]), backgroundColor: token(`--${slot}`),
            borderColor: token('--surface'), borderWidth: 1, borderSkipped: false, borderRadius: 3, barThickness: 18,
        });
        if (charts.split) charts.split.destroy();
        charts.split = new Chart($('#split-chart'), {
            type: 'bar',
            data: { labels: items.map((i) => i.name), datasets: [mk('securities', '증권사', 's1'), mk('bank', '은행', 's7')] },
            options: opts,
        });
    }

    // ---------- 기관별 순위 ----------
    async function loadRank() {
        const data = await getJSON('/api/institutions', { inst_type: state.instType, category: state.rankCategory });
        const items = data.items.slice(0, 10);
        $('#rank-cat-name').textContent = `· ${catName(state.rankCategory)}`;
        const opts = baseOptions();
        opts.indexAxis = 'y';
        opts.layout = { padding: { right: 48 } };
        opts.plugins.legend = { display: false };
        opts.scales.x = { grid: { color: token('--grid') }, border: { display: false }, ticks: { callback: (v) => fmtTrillion(v) } };
        opts.scales.y = { grid: { display: false }, border: { color: token('--axis') }, ticks: { autoSkip: false } };
        opts.plugins.tooltip.callbacks = {
            label: (c) => ` ${fmtTrillion(c.parsed.x)}조원 · 점유 ${items[c.dataIndex].share_pct}% · 전년 ${fmtPct(items[c.dataIndex].yoy_pct)}`,
        };
        const valueLabels = {
            id: 'rankValues',
            afterDatasetsDraw(chart) {
                const { ctx } = chart; const m = chart.getDatasetMeta(0);
                ctx.save(); ctx.font = `600 11px ${Chart.defaults.font.family}`; ctx.fillStyle = token('--text-2'); ctx.textBaseline = 'middle';
                m.data.forEach((bar, i) => ctx.fillText(fmtTrillion(items[i].balance), bar.x + 6, bar.y));
                ctx.restore();
            },
        };
        if (charts.rank) charts.rank.destroy();
        charts.rank = new Chart($('#rank-chart'), {
            type: 'bar',
            data: {
                labels: items.map((i) => i.name),
                datasets: [{ data: items.map((i) => i.balance), backgroundColor: catColor(state.rankCategory), borderRadius: 4, borderSkipped: false, barThickness: 16 }],
            },
            options: opts, plugins: [valueLabels],
        });
    }

    // ---------- 동향 이슈 ----------
    async function loadIssues() {
        const data = await getJSON('/api/issues', { category: state.issueCategory });
        $('#issue-list').innerHTML = data.items.length ? data.items.map((it) => {
            const [icon, label] = IMPACT_LABEL[it.impact] || IMPACT_LABEL.neutral;
            return `<li class="tl-item">
                <div class="tl-date">${escapeHtml(it.date)}</div>
                <div>
                    <div class="tl-title">${escapeHtml(it.title)} <span class="impact ${it.impact}"><i class="fa-solid ${icon}"></i>${label}</span></div>
                    <p class="tl-summary">${escapeHtml(it.summary)}</p>
                    <div class="tl-tags">${it.categories.map((c) => `<span class="tag" style="--tag-color:${catColor(c)}"><span class="dot"></span>${escapeHtml(catName(c))}</span>`).join('')}</div>
                </div>
            </li>`;
        }).join('') : '<li class="empty">해당 유형의 이슈가 없습니다.</li>';
    }

    // ---------- 상품 목록 ----------
    async function loadInstitutions() {
        const sel = $('#product-institution');
        const secs = await getJSON('/api/institutions', { category: 'fund', inst_type: 'securities' });
        const banks = await getJSON('/api/institutions', { category: 'deposit', inst_type: 'bank' });
        institutions = [...secs.items, ...banks.items].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
        sel.innerHTML = '<option value="all">모든 기관</option>' +
            ['securities', 'bank'].map((t) => `<optgroup label="${INST_TYPE_NAME[t]}">${institutions.filter((i) => i.type === t)
                .map((i) => `<option value="${i.id}">${escapeHtml(i.name)}</option>`).join('')}</optgroup>`).join('');
    }

    const PAGE_SIZE = 30;
    let productItems = [];
    let productShown = 0;

    async function loadProducts() {
        const p = state.product;
        const data = await getJSON('/api/products', { inst_type: state.instType, category: p.category, institution: p.institution, q: p.q, sort: p.sort, order: p.order });
        productItems = data.items;
        productShown = 0;
        $('#product-count').textContent = `${data.count}건`;
        $('#product-empty').classList.toggle('hidden', data.count > 0);
        $('#product-table tbody').innerHTML = '';
        renderMoreProducts();
        document.querySelectorAll('#product-table th[data-sort]').forEach((th) => {
            th.classList.toggle('sorted', th.dataset.sort === p.sort);
            th.classList.toggle('asc', th.dataset.sort === p.sort && p.order === 'asc');
        });
    }

    function renderMoreProducts() {
        const slice = productItems.slice(productShown, productShown + PAGE_SIZE);
        productShown += slice.length;
        $('#product-table tbody').insertAdjacentHTML('beforeend', slice.map((it) => `
            <tr data-id="${it.id}">
                <td><strong>${escapeHtml(it.name)}</strong><div class="sub-cell">${escapeHtml(it.subtype)}</div></td>
                <td>${escapeHtml(it.institution)}<div class="inst-type">${INST_TYPE_NAME[it.inst_type]}</div></td>
                <td><span class="cat-cell" style="--tag-color:${catColor(it.category)}"><span class="dot"></span>${escapeHtml(catName(it.category))}</span></td>
                <td class="num">${it.balance.toLocaleString('ko-KR')}</td>
                <td class="num ${it.return_1y >= 0 ? 'pos' : 'neg'}">${fmtPct(it.return_1y, 2)}</td>
                <td class="num"><span class="risk">${it.risk_grade}등급</span></td>
                <td>${it.launch_date}</td>
            </tr>`).join(''));
        const more = $('#product-more');
        more.classList.toggle('hidden', productShown >= productItems.length);
        more.textContent = `더 보기 (${productShown} / ${productItems.length})`;
    }

    async function openProduct(id) {
        const it = await getJSON(`/api/products/${id}`);
        const risk = ['', '매우 높음', '높음', '다소 높음', '보통', '낮음', '매우 낮음'][it.risk_grade] || '';
        $('#modal-title').textContent = it.name;
        $('#modal-body').innerHTML = `
            <dt>기관</dt><dd>${escapeHtml(it.institution)} <span class="inst-type">(${INST_TYPE_NAME[it.inst_type]})</span></dd>
            <dt>상품 유형</dt><dd><span class="cat-cell" style="--tag-color:${catColor(it.category)}"><span class="dot"></span>${escapeHtml(catName(it.category))}</span> · ${escapeHtml(it.subtype)}</dd>
            <dt>잔고</dt><dd class="big">${it.balance.toLocaleString('ko-KR')} <small class="sub-cell">억원</small></dd>
            <dt>1년 수익률</dt><dd class="${it.return_1y >= 0 ? 'pos' : 'neg'}">${fmtPct(it.return_1y, 2)}</dd>
            <dt>위험등급</dt><dd>${it.risk_grade}등급 (${risk})</dd>
            <dt>최소 가입금액</dt><dd>${it.min_amount.toLocaleString('ko-KR')}만원</dd>
            <dt>출시일</dt><dd>${it.launch_date}</dd>
            ${it.is_sample ? '<dt>비고</dt><dd class="sub-cell">예시 데이터 — 실제 상품이 아닙니다.</dd>' : ''}`;
        $('#product-modal').classList.remove('hidden');
    }

    // ---------- 이벤트 ----------
    function bindEvents() {
        $('#inst-type-seg').addEventListener('click', async (e) => {
            const b = e.target.closest('.seg-btn'); if (!b) return;
            state.instType = b.dataset.value; setSegmented($('#inst-type-seg'), state.instType);
            await Promise.all([loadSummary(), loadTrends(), loadRank(), loadProducts()]);
        });
        $('#range-seg').addEventListener('click', async (e) => {
            const b = e.target.closest('.seg-btn'); if (!b) return;
            state.range = Number(b.dataset.value); setSegmented($('#range-seg'), state.range);
            await loadTrends();
        });
        $('#trend-mode-seg').addEventListener('click', (e) => {
            const b = e.target.closest('.seg-btn'); if (!b) return;
            state.trendMode = b.dataset.value; setSegmented($('#trend-mode-seg'), state.trendMode);
            drawTrend();
        });
        $('#trend-table-toggle').addEventListener('click', (e) => {
            const btn = e.currentTarget; const on = btn.getAttribute('aria-pressed') !== 'true';
            btn.setAttribute('aria-pressed', on);
            $('#trend-table').classList.toggle('hidden', !on);
            $('#trend-chart').parentElement.classList.toggle('hidden', on);
        });

        const toggleCategory = async (id) => {
            const i = state.categories.indexOf(id);
            if (i >= 0) { if (state.categories.length === 1) return; state.categories.splice(i, 1); }
            else state.categories.push(id);
            state.categories = meta.categories.map((c) => c.id).filter((c) => state.categories.includes(c)); // 고정 순서 유지
            renderCategoryChips();
            await Promise.all([loadSummary(), loadTrends(), loadSplit()]);
        };
        $('#category-chips').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) toggleCategory(c.dataset.id); });
        $('#kpi-grid').addEventListener('click', (e) => { const k = e.target.closest('.kpi'); if (k) toggleCategory(k.dataset.id); });

        $('#rank-category').addEventListener('change', (e) => { state.rankCategory = e.target.value; loadRank(); });
        $('#issue-category').addEventListener('change', (e) => { state.issueCategory = e.target.value; loadIssues(); });
        $('#product-category').addEventListener('change', (e) => { state.product.category = e.target.value; loadProducts(); });
        $('#product-institution').addEventListener('change', (e) => { state.product.institution = e.target.value; loadProducts(); });
        $('#product-search').addEventListener('input', debounce((e) => { state.product.q = e.target.value.trim(); loadProducts(); }, 250));
        $('#product-table thead').addEventListener('click', (e) => {
            const th = e.target.closest('th[data-sort]'); if (!th) return;
            const key = th.dataset.sort;
            if (state.product.sort === key) state.product.order = state.product.order === 'desc' ? 'asc' : 'desc';
            else { state.product.sort = key; state.product.order = key === 'name' ? 'asc' : 'desc'; }
            loadProducts();
        });
        $('#product-more').addEventListener('click', renderMoreProducts);
        $('#product-table tbody').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) openProduct(tr.dataset.id); });

        const closeModal = () => $('#product-modal').classList.add('hidden');
        $('#modal-close').addEventListener('click', closeModal);
        $('#product-modal').addEventListener('click', (e) => { if (e.target.id === 'product-modal') closeModal(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

        // 다크/라이트 전환 시 토큰이 바뀌므로 차트를 다시 그린다
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { drawTrend(); loadSplit(); loadRank(); });
    }

    init().catch((err) => {
        console.error(err);
        $('#kpi-grid').innerHTML = `<p class="empty">데이터를 불러오지 못했습니다. (${escapeHtml(err.message)})</p>`;
    });
});
