document.addEventListener('DOMContentLoaded', function () {
    const path = window.location.pathname;
    if (path.startsWith('/doctor')) {
        initDoctorPage();
    } else if (path.startsWith('/admin')) {
        initAdminPage();
    }
});

// --- Doctor Page Logic ---
function initDoctorPage() {
    const nameInput = document.getElementById('doctor-name-input');
    const loginBtn = document.getElementById('doctor-login-btn');
    const yearSelect = document.getElementById('year-select');
    const monthSelect = document.getElementById('month-select');
    const calendarDiv = document.getElementById('calendar');
    const calendarTitle = document.getElementById('calendar-title');
    const submitBtn = document.getElementById('submit-schedule-btn');
    const modifyBtn = document.getElementById('modify-schedule-btn');
    const submittedInfo = document.getElementById('submitted-info');
    const doctorInfoCard = document.getElementById('doctor-info-card');
    const mainContent = document.getElementById('main-content');
    const welcomeMessage = document.getElementById('welcome-message');
    const pointsDisplay = document.getElementById('days-off-points');
    const pointsWarning = document.getElementById('points-warning');
    let currentDoctor = null;
    let currentYear = new Date().getFullYear();
    let currentMonth = new Date().getMonth() + 1;
    let holidays = [];
    let isDragging = false, dragStartDay = null, dragToggleState = false;
    let isCalendarReadOnly = false;
    for (let y = currentYear; y <= currentYear + 2; y++) yearSelect.add(new Option(y, y));
    for (let m = 1; m <= 12; m++) monthSelect.add(new Option(m, m));
    yearSelect.value = currentYear;
    monthSelect.value = currentMonth;
    const startSession = () => { const name = nameInput.value.trim(); if (name) { currentDoctor = name; welcomeMessage.classList.add('d-none'); mainContent.classList.remove('d-none'); doctorInfoCard.classList.remove('d-none'); document.getElementById('info-card-name').textContent = currentDoctor; nameInput.disabled = true; loginBtn.disabled = true; loadAndRenderCalendar(); } else { alert('請輸入您的姓名'); } };
    loginBtn.addEventListener('click', startSession);
    nameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') startSession(); });
    [yearSelect, monthSelect].forEach(el => el.addEventListener('change', () => { currentYear = parseInt(yearSelect.value); currentMonth = parseInt(monthSelect.value); loadAndRenderCalendar(); }));
    modifyBtn.addEventListener('click', () => setCalendarMode(false));
    submitBtn.addEventListener('click', submitDaysOff);
    calendarDiv.addEventListener('mousedown', e => { if (isCalendarReadOnly || !e.target.classList.contains('available')) return; e.preventDefault(); isDragging = true; dragStartDay = parseInt(e.target.dataset.day); dragToggleState = !e.target.classList.contains('selected'); e.target.classList.toggle('selected', dragToggleState); });
    calendarDiv.addEventListener('mouseover', e => { if (!isDragging || isCalendarReadOnly || !e.target.classList.contains('available')) return; const currentDay = parseInt(e.target.dataset.day); const start = Math.min(dragStartDay, currentDay); const end = Math.max(dragStartDay, currentDay); calendarDiv.querySelectorAll('.available').forEach(cell => { const day = parseInt(cell.dataset.day); if (day >= start && day <= end) { cell.classList.toggle('selected', dragToggleState); } }); });
    document.addEventListener('mouseup', () => { if (!isDragging) return; isDragging = false; dragStartDay = null; updatePointsCount(); });
    async function loadAndRenderCalendar() { if (!currentDoctor) return; const response = await fetch(`/api/schedule_data/${currentYear}/${currentMonth}`); const data = await response.json(); const doctorSchedule = data.submissions[currentDoctor] || { days_off: [], submitted: false }; holidays = data.holidays || []; renderCalendar(doctorSchedule.days_off); setCalendarMode(doctorSchedule.submitted); }
    function renderCalendar(selectedDays) { calendarDiv.innerHTML = ''; calendarTitle.textContent = `${currentYear} 年 ${currentMonth} 月`; const daysInMonth = new Date(currentYear, currentMonth, 0).getDate(); const firstDayOfMonth = new Date(currentYear, currentMonth - 1, 1).getDay(); const dayHeaders = ['日', '一', '二', '三', '四', '五', '六']; dayHeaders.forEach(h => { const el = document.createElement('div'); el.className = 'calendar-day header'; el.textContent = h; calendarDiv.appendChild(el); }); for (let i = 0; i < firstDayOfMonth; i++) { const el = document.createElement('div'); el.className = 'calendar-day other-month'; calendarDiv.appendChild(el); } for (let day = 1; day <= daysInMonth; day++) { const dayEl = document.createElement('div'); dayEl.className = 'calendar-day available'; dayEl.textContent = day; dayEl.dataset.day = day; const dayOfWeek = new Date(currentYear, currentMonth - 1, day).getDay(); if (holidays.includes(day)) { dayEl.classList.add('national-holiday'); } else if (dayOfWeek === 0 || dayOfWeek === 6) { dayEl.classList.add('weekend'); } if (selectedDays.includes(day)) dayEl.classList.add('selected'); calendarDiv.appendChild(dayEl); } updatePointsCount(); }
    function setCalendarMode(isReadOnly) { isCalendarReadOnly = isReadOnly; calendarDiv.classList.toggle('is-readonly', isReadOnly); submittedInfo.classList.toggle('d-none', !isReadOnly); submitBtn.classList.toggle('d-none', isReadOnly); modifyBtn.classList.toggle('d-none', !isReadOnly); }
    function updatePointsCount() { let totalPoints = 0; calendarDiv.querySelectorAll('.calendar-day.selected').forEach(dayEl => { if (dayEl.classList.contains('weekend') || dayEl.classList.contains('national-holiday')) { totalPoints += 2; } else { totalPoints += 1; } }); pointsDisplay.textContent = totalPoints; pointsWarning.classList.toggle('d-none', totalPoints <= 4); }
    async function submitDaysOff() { const daysOff = Array.from(calendarDiv.querySelectorAll('.selected')).map(el => parseInt(el.dataset.day)); submitBtn.disabled = true; submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> 儲存中...`; try { const response = await fetch('/api/submit_days_off', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doctor: currentDoctor, year: currentYear, month: currentMonth, daysOff }) }); const result = await response.json(); if(result.status === 'success') { alert('預休日期已成功儲存！'); setCalendarMode(true); } else { alert(`儲存失敗：${result.message}`); } } catch (error) { console.error("Submit error:", error); alert('提交時發生錯誤。'); } finally { submitBtn.disabled = false; submitBtn.innerHTML = `<i class="bi bi-check-circle-fill"></i> 提交本月預休`; } }
}

// --- Admin Page Logic (v2.15.1 - Bug Fix) ---
function initAdminPage() {
    const yearSelect = document.getElementById('admin-year-select');
    const monthSelect = document.getElementById('admin-month-select');
    const loadTemplateBtn = document.getElementById('load-template-btn');
    const clearMonthBtn = document.getElementById('clear-month-btn');
    const runButton = document.getElementById('run-scheduler-btn');
    const helpText = document.getElementById('run-scheduler-help');
    const logCardBody = document.getElementById('log-card-body');
    const toggleLogBtn = document.getElementById('toggle-log-btn');
    const resultsSection = document.getElementById('results-section');
    const settingsMonthTitle = document.getElementById('settings-month-title');
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    const fullscreenModal = new bootstrap.Modal(document.getElementById('fullscreen-modal'));
    const logTimer = document.getElementById('log-timer');
    const scheduleFilters = document.getElementById('schedule-filters');
    const areaFilter = document.getElementById('area-filter');
    const dateFilter = document.getElementById('date-filter');
    const resetFiltersBtn = document.getElementById('reset-filters-btn');
    const areaLists = { UNCLASSIFIED: document.getElementById('doctor-list-UNCLASSIFIED'), A: document.getElementById('doctor-list-A'), B: document.getElementById('doctor-list-B'), C: document.getElementById('doctor-list-C'), I: document.getElementById('doctor-list-I') };
    const addDoctorModal = new bootstrap.Modal(document.getElementById('add-doctor-modal'));
    const newDoctorNameInput = document.getElementById('new-doctor-name');
    const newDoctorAreaSelect = document.getElementById('new-doctor-area');
    const saveNewDoctorBtn = document.getElementById('save-new-doctor-btn');
    let currentYear = new Date().getFullYear();
    let currentMonth = new Date().getMonth() + 1;
    let eventSource = null, logTimerInterval = null, fullScheduleData = null;
    let doctorTemplate = {};
    let isFirstLog = true;
    let saveTimeout;

    for (let y = currentYear; y <= currentYear + 2; y++) yearSelect.add(new Option(y, y));
    for (let m = 1; m <= 12; m++) monthSelect.add(new Option(`${m} 月`, m));
    yearSelect.value = currentYear; monthSelect.value = currentMonth;
    
    [yearSelect, monthSelect].forEach(el => el.addEventListener('change', () => { currentYear = parseInt(yearSelect.value); currentMonth = parseInt(monthSelect.value); loadDoctorSettings(); }));
    loadTemplateBtn.addEventListener('click', () => { if (confirm("這將會用預設的醫師資料覆蓋目前的醫師設定，確定要載入嗎？")) { loadTemplateData(); } });
    clearMonthBtn.addEventListener('click', async () => { if (confirm(`這將會永久刪除 ${currentYear} 年 ${currentMonth} 月的所有資料，確定要清空嗎？`)) { try { const response = await fetch('/api/clear_month_data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year: currentYear, month: currentMonth }) }); const result = await response.json(); alert(result.message); if (result.status === 'success') { loadDoctorSettings(); } } catch (error) { alert('清除資料時發生錯誤。'); } } });
    
    saveNewDoctorBtn.addEventListener('click', async () => {
        const name = newDoctorNameInput.value.trim();
        const area = newDoctorAreaSelect.value;
        if (!name) { alert('醫師姓名不可為空！'); return; }
        saveNewDoctorBtn.disabled = true; saveNewDoctorBtn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> 新增中...`;
        try {
            const response = await fetch('/api/add_doctor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year: currentYear, month: currentMonth, name: name, area: area }) });
            const result = await response.json();
            if (result.status === 'success') {
                const placeholder = document.getElementById('no-data-placeholder');
                if (placeholder) placeholder.remove();
                renderDoctorItem({ name: name, data: result.new_doctor_data });
                sortAreaList(areaLists[area]);
                addDoctorModal.hide(); newDoctorNameInput.value = '';
            } else { alert(`新增失敗：${result.message}`); }
        } catch (error) { console.error("Add doctor error:", error); alert('新增醫師時發生網路錯誤。'); } finally { saveNewDoctorBtn.disabled = false; saveNewDoctorBtn.innerHTML = `確認新增`; }
    });

    runButton.addEventListener('click', () => {
        const settingsCollapse = bootstrap.Collapse.getInstance('#doctor-settings-collapse') || new bootstrap.Collapse('#doctor-settings-collapse', {toggle: false});
        settingsCollapse.hide();
        runScheduler();
    });
    toggleLogBtn.addEventListener('click', () => logCardBody.classList.toggle('minimized'));
    fullscreenBtn.addEventListener('click', () => fullscreenModal.show());
    [areaFilter, dateFilter].forEach(el => el.addEventListener('change', applyTableFilters));
    resetFiltersBtn.addEventListener('click', () => { areaFilter.value = 'all'; dateFilter.value = 'all'; applyTableFilters(); });

    Object.keys(areaLists).forEach(area => { 
        new Sortable(areaLists[area], { 
            group: 'doctors', animation: 150, handle: '.drag-handle',
            onEnd: function(evt) {
                const itemEl = evt.item; const toList = evt.to; const newArea = toList.dataset.area;
                const pointsWrapper = itemEl.querySelector('.points-input-wrapper');
                if (pointsWrapper) { pointsWrapper.classList.toggle('d-none', newArea === 'UNCLASSIFIED'); }
                setTimeout(() => {
                    sortAreaList(evt.from);
                    if (evt.from !== toList) sortAreaList(toList);
                    const movedItem = toList.querySelector(`[data-doctor-name="${itemEl.dataset.doctorName}"]`);
                    if (movedItem) {
                        movedItem.classList.remove('flash-A', 'flash-B', 'flash-C', 'flash-I', 'flash-UNCLASSIFIED');
                        requestAnimationFrame(() => { movedItem.classList.add(`flash-${newArea}`); movedItem.addEventListener('animationend', () => movedItem.classList.remove(`flash-${newArea}`), { once: true }); });
                    }
                    debouncedSave();
                }, 0);
            }
        }); 
    });

    function debouncedSave() {
        clearTimeout(saveTimeout);
        helpText.textContent = '儲存中...';
        helpText.classList.remove('text-success');
        saveTimeout = setTimeout(saveDoctorSettings, 1000);
    }

    async function saveDoctorSettings() {
        const settingsPayload = {};
        Object.entries(areaLists).forEach(([area, listEl]) => {
            listEl.querySelectorAll('.list-group-item').forEach(item => {
                const name = item.dataset.doctorName; if (!name) return;
                settingsPayload[name] = { days_off: JSON.parse(item.dataset.daysOff), area: area, points_limit: parseInt(item.querySelector('.points-input').value) || 8, submitted: item.dataset.submitted === 'true' };
            });
        });
        try { 
            const response = await fetch('/api/update_doctor_settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year: currentYear, month: currentMonth, settings: settingsPayload }) }); 
            const result = await response.json(); 
            if (result.status === 'success') { 
                helpText.textContent = '✓ 所有變更已儲存';
                helpText.classList.add('text-success');
            } else { 
                helpText.textContent = `儲存失敗：${result.message}`; 
                helpText.classList.remove('text-success');
            } 
        } catch (error) { 
            helpText.textContent = '儲存時發生網路錯誤。';
            helpText.classList.remove('text-success');
        }
    }

    async function loadDoctorSettings() {
        settingsMonthTitle.textContent = `${currentYear} 年 ${currentMonth} 月`;
        try {
            const response = await fetch(`/api/schedule_data/${currentYear}/${currentMonth}`);
            const data = await response.json();
            doctorTemplate = data.doctor_template || {};
            Object.values(areaLists).forEach(list => list.innerHTML = ''); 
            const submissions = data.submissions || {};
            const doctorsToRender = Object.entries(submissions).filter(([name, _]) => name !== 'final_schedule');
            if (doctorsToRender.length > 0) {
                doctorsToRender.forEach(([name, docData]) => renderDoctorItem({ name, data: docData }));
                Object.values(areaLists).forEach(sortAreaList);
            } else {
                 areaLists.A.innerHTML = `<li id="no-data-placeholder" class="list-group-item text-muted" style="background-color: var(--area-a-light);">本月尚無資料</li>`;
            }
        } catch (error) { console.error("Failed to load doctor settings:", error); alert("讀取醫師設定失敗。"); }
    }

    function loadTemplateData() { 
        const placeholder = document.getElementById('no-data-placeholder');
        if (placeholder) placeholder.remove();
        Object.values(areaLists).forEach(list => list.innerHTML = '');
        Object.entries(doctorTemplate).forEach(([name, template]) => { renderDoctorItem({ name: name, data: { ...template, submitted: true } }); }); 
        Object.values(areaLists).forEach(sortAreaList);
        debouncedSave();
    }
    
    function sortAreaList(listEl) {
        if (!listEl || listEl.dataset.area === 'UNCLASSIFIED') return;
        const items = Array.from(listEl.children);
        items.sort((a, b) => {
            const pointsA_el = a.querySelector('.points-input'); const pointsB_el = b.querySelector('.points-input');
            if (!pointsA_el || !pointsB_el) return 0;
            const pointsA = parseInt(pointsA_el.value, 10) || 0; const pointsB = parseInt(pointsB_el.value, 10) || 0;
            return pointsB - pointsA;
        });
        items.forEach(item => listEl.appendChild(item));
    }

    function renderDoctorItem({ name, data }) {
        const area = data.area || 'UNCLASSIFIED';
        const targetList = areaLists[area];
        if (!targetList) { console.warn(`Area list for "${area}" not found.`); return; }
        const item = document.createElement('div');
        item.className = 'list-group-item';
        item.dataset.doctorName = name; item.dataset.daysOff = JSON.stringify(data.days_off || []); item.dataset.submitted = data.submitted || false;
        const isUnclassified = (area === 'UNCLASSIFIED');
        item.innerHTML = `
            <i class="bi bi-grip-vertical drag-handle"></i>
            <div class="doctor-list-item-content">
                <div class="doctor-name">${name}</div>
                <div class="points-input-wrapper ${isUnclassified ? 'd-none' : ''}">
                    <label class="form-label mb-0 small">點數</label>
                    <input type="number" class="form-control form-control-sm points-input" value="${data.points_limit || 8}" min="0" max="20">
                </div>
                <button class="btn btn-sm btn-outline-danger remove-btn" title="移除此醫師"><i class="bi bi-trash-fill"></i></button>
            </div>
        `;
        targetList.appendChild(item);
        const nameEl = item.querySelector('.doctor-name');
        if (name.length >= 5) nameEl.classList.add('name-len-5'); else if (name.length === 4) nameEl.classList.add('name-len-4'); else if (name.length === 3) nameEl.classList.add('name-len-3'); else if (name.length === 2) nameEl.classList.add('name-len-2');
        item.querySelector('.remove-btn').addEventListener('click', () => { if (confirm(`確定要從本月排班中移除 ${name} 嗎？`)) { item.remove(); debouncedSave(); } });
        item.querySelector('.points-input').addEventListener('change', debouncedSave);
    }

    // 【主要修改】將遺失的函式加回來
    function handleLogMessage(data) {
        const logOutput = document.getElementById('log-output');
        if (isFirstLog) {
            logOutput.textContent = '';
            isFirstLog = false;
        }
        logOutput.textContent += data + '\n';
        logOutput.scrollTop = logOutput.scrollHeight;
    }

    function runScheduler() { 
        if (eventSource) eventSource.close(); 
        if (logTimerInterval) clearInterval(logTimerInterval); 
        runButton.disabled = true; 
        runButton.innerHTML = `<span class="spinner-border spinner-border-sm"></span> 運算中...`; 
        logCardBody.classList.remove('minimized'); 
        isFirstLog = true; 
        handleLogMessage('正在連接後端排班引擎...'); 
        logTimer.textContent = '0s'; 
        logTimer.classList.remove('bg-success'); 
        logTimer.classList.add('bg-secondary'); 
        const startTime = Date.now(); 
        logTimerInterval = setInterval(() => { logTimer.textContent = formatTime(Date.now() - startTime); }, 1000); 
        const url = `/api/run_scheduler?year=${currentYear}&month=${currentMonth}`; 
        eventSource = new EventSource(url); 
        eventSource.onmessage = e => handleLogMessage(e.data); 
        eventSource.addEventListener('DONE', e => handleDoneEvent(JSON.parse(e.data), startTime)); 
        eventSource.onerror = () => { handleLogMessage('\n與伺服器連線中斷或發生錯誤。'); eventSource.close(); resetRunButton(); }; 
    }

    function handleDoneEvent(data, startTime) { 
        clearInterval(logTimerInterval); 
        logTimer.innerHTML = `✅ ${formatTime(Date.now() - startTime)}`; 
        logTimer.classList.remove('bg-secondary'); 
        logTimer.classList.add('bg-success'); 
        if (data.status === 'success') { 
            fullScheduleData = data.schedule_data_for_render; 
            displayResults(data); 
            logCardBody.classList.add('minimized'); 
            toggleLogBtn.classList.remove('d-none'); 
            setTimeout(() => resultsSection.scrollIntoView({ behavior: 'smooth' }), 100); 
        } else { 
            handleLogMessage(`\n排班失敗: ${data.message}`); 
            alert(`排班失敗: ${data.message}`); 
        } 
        resetRunButton(); 
        eventSource.close(); 
    }

    function resetRunButton() { 
        runButton.disabled = false; 
        runButton.innerHTML = '<i class="bi bi-calculator-fill"></i> 一鍵排班'; 
    }

    function displayResults(data) { 
        resultsSection.classList.remove('d-none'); 
        const scoresList = document.getElementById('final-scores-list'); 
        scoresList.innerHTML = ''; 
        for (const [key, value] of Object.entries(data.final_scores)) { 
            const li = document.createElement('li'); 
            li.classList.add('list-group-item'); 
            const valueClass = key.includes('懲罰') ? (value > 0 ? 'score-penalty' : 'score-bonus') : (key.includes('獎勵') ? (value > 0 ? 'score-bonus' : 'score-penalty') : 'score-neutral'); 
            li.innerHTML = `<span>${key}</span><span class="score-value ${valueClass}">${value}</span>`; 
            scoresList.appendChild(li); 
        } 
        applyTableFilters(); 
        document.getElementById('area-schedule-render-area').innerHTML = data.area_schedule_html; 
        document.getElementById('points-summary-html').innerHTML = data.points_summary_html; 
        const downloadBtn = document.getElementById('download-excel-btn'); 
        downloadBtn.href = data.excel_url; 
        downloadBtn.style.display = 'inline-block'; 
        fullscreenBtn.style.display = 'inline-block'; 
        scheduleFilters.style.display = 'flex'; 
    }

    function applyTableFilters() { 
        if (!fullScheduleData) return; 
        const mainTable = renderScheduleTable(fullScheduleData); 
        document.getElementById('doctor-schedule-render-area').innerHTML = ''; 
        document.getElementById('doctor-schedule-render-area').appendChild(mainTable); 
        const fullscreenContainer = document.getElementById('fullscreen-schedule-render-area'); 
        fullscreenContainer.innerHTML = ''; 
        fullscreenContainer.appendChild(mainTable.cloneNode(true)); 
    }

    function renderScheduleTable(data) { 
        const area = areaFilter.value, dateRange = dateFilter.value; 
        const filteredDoctors = data.doctors.filter(doc => area === 'all' || data.doctor_info[doc].區域 === area); 
        let startDay = 1, endDay = data.num_days; 
        if (dateRange === '1-10') endDay = 10; 
        else if (dateRange === '11-20') { startDay = 11; endDay = 20; } 
        else if (dateRange === '21-end') startDay = 21; 
        const table = document.createElement('table'); 
        table.className = 'schedule-table'; 
        const thead = table.createTHead(), headerRow = thead.insertRow(); 
        headerRow.insertCell().textContent = '醫師'; 
        for (let day = startDay; day <= endDay; day++) { 
            const th = document.createElement('th'); 
            th.textContent = day; 
            headerRow.appendChild(th); 
        } 
        const tbody = table.createTBody(); 
        filteredDoctors.forEach(doc => { 
            const row = tbody.insertRow(); 
            row.insertCell().textContent = doc; 
            for (let day = startDay; day <= endDay; day++) { 
                const cell = row.insertCell(); 
                const dayOfWeek = new Date(currentYear, currentMonth - 1, day).getDay(); 
                if (data.holidays.includes(day)) cell.classList.add('cell-holiday'); 
                else if ([0, 6].includes(dayOfWeek)) cell.classList.add('cell-weekend'); 
                if (data.days_off[doc] && data.days_off[doc].includes(day)) { 
                    cell.textContent = '預休'; 
                    cell.classList.add('cell-dayoff'); 
                } else if (data.schedule[doc] && data.schedule[doc][day]) { 
                    const area = data.schedule[doc][day]; 
                    cell.textContent = area; 
                    cell.classList.add(`cell-area-${area}`); 
                } 
                const docInfo = data.doctor_info[doc]; 
                const lastDutyDay = docInfo.上月班別日; 
                if (lastDutyDay > 0) { 
                    const prevMonth = new Date(currentYear, currentMonth - 2, 1); 
                    const lastDayOfPrevMonth = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).getDate(); 
                    if ((lastDutyDay === lastDayOfPrevMonth && (day === 1 || day === 2)) || (lastDutyDay === lastDayOfPrevMonth - 1 && day === 1)) { 
                        cell.classList.add('cell-cross-month-off'); 
                        if (!cell.textContent) { cell.textContent = '跨月休'; } 
                    } 
                } 
            } 
        }); 
        return table; 
    }

    function formatTime(ms) { 
        const seconds = Math.floor(ms / 1000); 
        const m = Math.floor(seconds / 60); 
        const s = seconds % 60; 
        return m > 0 ? `${m}m ${s}s` : `${s}s`; 
    }
    
    loadDoctorSettings();
}
