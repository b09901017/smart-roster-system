document.addEventListener('DOMContentLoaded', function () {
    const path = window.location.pathname;
    if (path.startsWith('/doctor')) {
        initDoctorPage();
    } else if (path.startsWith('/admin')) {
        initAdminPage();
    }
});

// --- Doctor Page Logic (v2.3.1) ---
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
    yearSelect.value = currentYear; monthSelect.value = currentMonth;
    
    const startSession = () => {
        const name = nameInput.value.trim();
        if (name) {
            currentDoctor = name;
            welcomeMessage.classList.add('d-none'); mainContent.classList.remove('d-none');
            doctorInfoCard.classList.remove('d-none');
            document.getElementById('info-card-name').textContent = currentDoctor;
            nameInput.disabled = true; loginBtn.disabled = true;
            loadAndRenderCalendar();
        } else { alert('請輸入您的姓名'); }
    };
    loginBtn.addEventListener('click', startSession);
    nameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') startSession(); });
    
    [yearSelect, monthSelect].forEach(el => el.addEventListener('change', () => {
        currentYear = parseInt(yearSelect.value); currentMonth = parseInt(monthSelect.value);
        loadAndRenderCalendar();
    }));

    modifyBtn.addEventListener('click', () => setCalendarMode(false));
    submitBtn.addEventListener('click', submitDaysOff);

    calendarDiv.addEventListener('mousedown', e => {
        if (isCalendarReadOnly || !e.target.classList.contains('available')) return;
        e.preventDefault();
        isDragging = true;
        dragStartDay = parseInt(e.target.dataset.day);
        dragToggleState = !e.target.classList.contains('selected');
        e.target.classList.toggle('selected', dragToggleState);
        updatePointsCount();
    });

    calendarDiv.addEventListener('mouseover', e => {
        if (!isDragging || isCalendarReadOnly || !e.target.classList.contains('available')) return;
        const currentDay = parseInt(e.target.dataset.day);
        const start = Math.min(dragStartDay, currentDay);
        const end = Math.max(dragStartDay, currentDay);
        calendarDiv.querySelectorAll('.available').forEach(cell => {
            const day = parseInt(cell.dataset.day);
            if (day >= start && day <= end) {
                cell.classList.toggle('selected', dragToggleState);
            }
        });
        updatePointsCount();
    });

    document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        dragStartDay = null;
    });

    async function loadAndRenderCalendar() {
        if (!currentDoctor) return;
        const response = await fetch(`/api/schedule_data/${currentYear}/${currentMonth}`);
        const data = await response.json();
        const doctorSchedule = data.submissions[currentDoctor] || { days_off: [], submitted: false };
        holidays = data.holidays || [];
        renderCalendar(doctorSchedule.days_off);
        setCalendarMode(doctorSchedule.submitted);
    }

    function renderCalendar(selectedDays) {
        calendarDiv.innerHTML = '';
        calendarTitle.textContent = `${currentYear} 年 ${currentMonth} 月`;
        const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
        const firstDayOfMonth = new Date(currentYear, currentMonth - 1, 1).getDay();
        const dayHeaders = ['日', '一', '二', '三', '四', '五', '六'];
        dayHeaders.forEach(h => { const el = document.createElement('div'); el.className = 'calendar-day header'; el.textContent = h; calendarDiv.appendChild(el); });
        for (let i = 0; i < firstDayOfMonth; i++) { const el = document.createElement('div'); el.className = 'calendar-day other-month'; calendarDiv.appendChild(el); }
        for (let day = 1; day <= daysInMonth; day++) {
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-day available';
            dayEl.textContent = day; dayEl.dataset.day = day;
            if (holidays.includes(day)) dayEl.classList.add('holiday');
            const dayOfWeek = new Date(currentYear, currentMonth - 1, day).getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) dayEl.classList.add('weekend');
            if (selectedDays.includes(day)) dayEl.classList.add('selected');
            calendarDiv.appendChild(dayEl);
        }
        updatePointsCount();
    }

    function setCalendarMode(isReadOnly) {
        isCalendarReadOnly = isReadOnly;
        calendarDiv.classList.toggle('is-readonly', isReadOnly);
        submittedInfo.classList.toggle('d-none', !isReadOnly);
        submitBtn.classList.toggle('d-none', isReadOnly);
        modifyBtn.classList.toggle('d-none', !isReadOnly);
    }
    
    function updatePointsCount() {
        let totalPoints = 0;
        calendarDiv.querySelectorAll('.calendar-day.selected').forEach(dayEl => {
            if (dayEl.classList.contains('weekend') || dayEl.classList.contains('holiday')) { totalPoints += 2; }
            else { totalPoints += 1; }
        });
        pointsDisplay.textContent = totalPoints;
        pointsWarning.classList.toggle('d-none', totalPoints <= 4);
    }

    async function submitDaysOff() {
        const daysOff = Array.from(calendarDiv.querySelectorAll('.selected')).map(el => parseInt(el.dataset.day));
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> 儲存中...`;
        try {
            const response = await fetch('/api/submit_days_off', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ doctor: currentDoctor, year: currentYear, month: currentMonth, daysOff })
            });
            const result = await response.json();
            alert(result.status === 'success' ? '預休日期已成功儲存！' : `儲存失敗：${result.message}`);
            if(result.status === 'success') {
                setCalendarMode(true);
            }
        } catch (error) { alert('提交時發生錯誤。');
        } finally { submitBtn.disabled = false; submitBtn.innerHTML = `<i class="bi bi-check-circle-fill"></i> 提交本月預休`; }
    }
}

// --- Admin Page Logic (v2.3.1) ---
function initAdminPage() {
    const yearSelect = document.getElementById('admin-year-select');
    const monthSelect = document.getElementById('admin-month-select');
    const settingsTbody = document.getElementById('doctor-settings-tbody');
    const loadTemplateBtn = document.getElementById('load-template-btn');
    const clearMonthBtn = document.getElementById('clear-month-btn');
    const addDoctorBtn = document.getElementById('add-doctor-btn');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
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
    const settingsCollapse = new bootstrap.Collapse(document.getElementById('doctor-settings-collapse'), { toggle: false });

    let currentYear = new Date().getFullYear();
    let currentMonth = new Date().getMonth() + 1;
    let eventSource = null, logTimerInterval = null, fullScheduleData = null;
    let doctorTemplate = {};

    for (let y = currentYear; y <= currentYear + 2; y++) yearSelect.add(new Option(y, y));
    for (let m = 1; m <= 12; m++) monthSelect.add(new Option(`${m} 月`, m));
    yearSelect.value = currentYear; monthSelect.value = currentMonth;

    [yearSelect, monthSelect].forEach(el => el.addEventListener('change', () => { currentYear = parseInt(yearSelect.value); currentMonth = parseInt(monthSelect.value); loadDoctorSettings(); runButton.disabled = true; helpText.textContent = '月份已變更，請重新儲存設定。'; }));
    loadTemplateBtn.addEventListener('click', () => { if (confirm("這將會用預設的醫師資料覆蓋目前的醫師設定，確定要載入嗎？")) { loadTemplateData(); } });
    clearMonthBtn.addEventListener('click', async () => { if (confirm(`這將會永久刪除 ${currentYear} 年 ${currentMonth} 月的所有資料，確定要清空嗎？`)) { try { const response = await fetch('/api/clear_month_data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year: currentYear, month: currentMonth }) }); const result = await response.json(); alert(result.message); if (result.status === 'success') { loadDoctorSettings(); } } catch (error) { alert('清除資料時發生錯誤。'); } } });
    addDoctorBtn.addEventListener('click', () => { const newName = prompt("請輸入要新增的醫師姓名："); if (newName && newName.trim() !== "") { const name = newName.trim(); const template = doctorTemplate[name] || {}; const newRowData = { name: name, data: { days_off: [], area: template.area || 'A', points_limit: template.points_limit || 8, submitted: false } }; renderSettingsRow(newRowData); sortSettingsTable(); } });
    saveSettingsBtn.addEventListener('click', saveDoctorSettings);
    runButton.addEventListener('click', runScheduler);
    toggleLogBtn.addEventListener('click', () => logCardBody.classList.toggle('minimized'));
    fullscreenBtn.addEventListener('click', () => fullscreenModal.show());
    [areaFilter, dateFilter].forEach(el => el.addEventListener('change', applyTableFilters));
    resetFiltersBtn.addEventListener('click', () => { areaFilter.value = 'all'; dateFilter.value = 'all'; applyTableFilters(); });
    new Sortable(settingsTbody, { animation: 150, handle: '.drag-handle', onEnd: function (evt) { const movedRow = evt.item, previousRow = movedRow.previousElementSibling, nextRow = movedRow.nextElementSibling; let newArea = null; if (previousRow) { newArea = previousRow.querySelector('.area-select').value; } else if (nextRow) { newArea = nextRow.querySelector('.area-select').value; } if (newArea) { movedRow.querySelector('.area-select').value = newArea; sortSettingsTable(); } } });

    async function loadDoctorSettings() {
        settingsMonthTitle.textContent = `${currentYear} 年 ${currentMonth} 月`;
        try {
            const response = await fetch(`/api/schedule_data/${currentYear}/${currentMonth}`);
            const data = await response.json();
            doctorTemplate = data.doctor_template || {};
            settingsTbody.innerHTML = '';
            const submissions = data.submissions || {};
            if (Object.keys(submissions).length > 0 && Object.keys(submissions).some(k => k !== 'final_schedule')) {
                Object.entries(submissions).filter(([name, _]) => name !== 'final_schedule').forEach(([name, docData]) => renderSettingsRow({ name, data: docData }));
                sortSettingsTable();
            } else {
                 settingsTbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">本月份尚無資料，可手動新增或從除錯面板載入範本。</td></tr>`;
            }
        } catch (error) { console.error("Failed to load doctor settings:", error); alert("讀取醫師設定失敗。"); }
    }

    function loadTemplateData() {
        settingsTbody.innerHTML = '';
        Object.entries(doctorTemplate).forEach(([name, template]) => {
            const rowData = { name: name, data: { ...template, submitted: true } };
            renderSettingsRow(rowData);
        });
        sortSettingsTable();
        alert("預設醫師範本已成功載入！請記得儲存設定。");
    }

    function renderSettingsRow({ name, data }) {
        const row = settingsTbody.insertRow();
        row.dataset.doctorName = name;
        const area = data.area || 'A';
        row.className = `area-${area}`;
        row.insertCell().innerHTML = `<i class="bi bi-grip-vertical drag-handle" title="拖曳排序"></i>`;
        row.insertCell().innerHTML = `<input type="text" class="form-control form-control-sm" value="${name}" disabled>`;
        const daysOffCell = row.insertCell();
        daysOffCell.textContent = data.days_off && data.days_off.length > 0 ? data.days_off.join(', ') : '無';
        if (data.submitted) { daysOffCell.innerHTML += ` <i class="bi bi-check-circle-fill text-success" title="已提交"></i>`; }
        const areaCell = row.insertCell();
        const areaId = `area-select-${name.replace(/\s+/g, '-')}`;
        areaCell.innerHTML = `<select id="${areaId}" class="form-select form-select-sm area-select"><option value="A" ${area === 'A' ? 'selected' : ''}>A 區</option><option value="B" ${area === 'B' ? 'selected' : ''}>B 區</option><option value="C" ${area === 'C' ? 'selected' : ''}>C 區</option><option value="I" ${area === 'I' ? 'selected' : ''}>I 區</option></select>`;
        document.getElementById(areaId).addEventListener('change', (e) => {
            row.className = `area-${e.target.value}`;
            sortSettingsTable();
        });
        row.insertCell().innerHTML = `<input type="number" class="form-control form-control-sm points-input" value="${data.points_limit || 8}" min="0" max="20">`;
        const actionCell = row.insertCell();
        actionCell.innerHTML = `<button class="btn btn-sm btn-outline-danger remove-btn" title="移除此醫師"><i class="bi bi-trash-fill"></i></button>`;
        row.querySelector('.remove-btn').addEventListener('click', () => { if (confirm(`確定要從本月排班中移除 ${name} 嗎？`)) { row.remove(); } });
    }
    
    function sortSettingsTable() {
        const rows = Array.from(settingsTbody.querySelectorAll('tr'));
        rows.sort((a, b) => {
            const areaA = a.querySelector('.area-select').value;
            const areaB = b.querySelector('.area-select').value;
            const pointsA = parseInt(a.querySelector('.points-input').value, 10);
            const pointsB = parseInt(b.querySelector('.points-input').value, 10);
            if (areaA < areaB) return -1;
            if (areaA > areaB) return 1;
            return pointsB - pointsA;
        });
        rows.forEach(row => settingsTbody.appendChild(row));
    }
    
    async function saveDoctorSettings() { const settingsPayload = {}; const rows = settingsTbody.querySelectorAll('tr'); let hasError = false; rows.forEach(row => { const nameInput = row.querySelector('input[type="text"]'); if (!nameInput) return; const name = nameInput.value.trim(); if (!name) { alert('醫師姓名不可為空！'); nameInput.focus(); hasError = true; return; } settingsPayload[name] = { days_off: row.cells[2].textContent.split(',').map(d => parseInt(d.trim())).filter(Number.isInteger), area: row.querySelector('.area-select').value, points_limit: parseInt(row.querySelector('.points-input').value) || 0, submitted: row.querySelector('.bi-check-circle-fill') !== null }; }); if (hasError) return; saveSettingsBtn.disabled = true; saveSettingsBtn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> 儲存中...`; try { const response = await fetch('/api/update_doctor_settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year: currentYear, month: currentMonth, settings: settingsPayload }) }); const result = await response.json(); if (result.status === 'success') { alert('醫師設定已成功儲存！'); runButton.disabled = false; helpText.textContent = '設定已儲存，可以開始排班。'; settingsCollapse.hide(); } else { alert(`儲存失敗：${result.message}`); runButton.disabled = true; helpText.textContent = '儲存失敗，無法排班。'; } } catch (error) { alert('儲存時發生網路錯誤。'); } finally { saveSettingsBtn.disabled = false; saveSettingsBtn.innerHTML = `<i class="bi bi-save-fill"></i> 儲存醫師設定`; } }
    function formatTime(ms) { const seconds = Math.floor(ms / 1000); const m = Math.floor(seconds / 60); const s = seconds % 60; return m > 0 ? `${m}m ${s}s` : `${s}s`; }
    function runScheduler() { if (eventSource) eventSource.close(); if (logTimerInterval) clearInterval(logTimerInterval); runButton.disabled = true; saveSettingsBtn.disabled = true; runButton.innerHTML = `<span class="spinner-border spinner-border-sm"></span> 運算中...`; logCardBody.classList.remove('minimized'); document.getElementById('log-output').textContent = '正在連接後端排班引擎...'; toggleLogBtn.classList.add('d-none'); resultsSection.classList.add('d-none'); isFirstLog = true; logTimer.textContent = '0s'; logTimer.classList.remove('bg-success'); logTimer.classList.add('bg-secondary'); const startTime = Date.now(); logTimerInterval = setInterval(() => { logTimer.textContent = formatTime(Date.now() - startTime); }, 1000); const url = `/api/run_scheduler?year=${currentYear}&month=${currentMonth}`; eventSource = new EventSource(url); eventSource.onmessage = e => handleLogMessage(e.data); eventSource.addEventListener('DONE', e => handleDoneEvent(JSON.parse(e.data), startTime)); eventSource.onerror = () => { document.getElementById('log-output').textContent += '\n與伺服器連線中斷或發生錯誤。'; eventSource.close(); resetRunButton(); }; }
    let isFirstLog = true;
    function handleLogMessage(data) { const logOutput = document.getElementById('log-output'); if (isFirstLog) { logOutput.textContent = ''; isFirstLog = false; } logOutput.textContent += data + '\n'; logOutput.scrollTop = logOutput.scrollHeight; }
    function handleDoneEvent(data, startTime) { clearInterval(logTimerInterval); logTimer.innerHTML = `✅ ${formatTime(Date.now() - startTime)}`; logTimer.classList.remove('bg-secondary'); logTimer.classList.add('bg-success'); if (data.status === 'success') { fullScheduleData = data.schedule_data_for_render; displayResults(data); logCardBody.classList.add('minimized'); toggleLogBtn.classList.remove('d-none'); setTimeout(() => resultsSection.scrollIntoView({ behavior: 'smooth' }), 100); } else { document.getElementById('log-output').textContent += `\n排班失敗: ${data.message}`; alert(`排班失敗: ${data.message}`); } resetRunButton(); eventSource.close(); }
    function resetRunButton() { runButton.disabled = false; saveSettingsBtn.disabled = false; runButton.innerHTML = '<i class="bi bi-calculator-fill"></i> 一鍵排班'; }
    function displayResults(data) { resultsSection.classList.remove('d-none'); const scoresList = document.getElementById('final-scores-list'); scoresList.innerHTML = ''; for (const [key, value] of Object.entries(data.final_scores)) { const li = document.createElement('li'); li.classList.add('list-group-item'); const valueClass = key.includes('懲罰') ? (value > 0 ? 'score-penalty' : 'score-bonus') : (key.includes('獎勵') ? (value > 0 ? 'score-bonus' : 'score-penalty') : 'score-neutral'); li.innerHTML = `<span>${key}</span><span class="score-value ${valueClass}">${value}</span>`; scoresList.appendChild(li); } applyTableFilters(); document.getElementById('area-schedule-render-area').innerHTML = data.area_schedule_html; document.getElementById('points-summary-html').innerHTML = data.points_summary_html; const downloadBtn = document.getElementById('download-excel-btn'); downloadBtn.href = data.excel_url; downloadBtn.style.display = 'inline-block'; fullscreenBtn.style.display = 'inline-block'; scheduleFilters.style.display = 'flex'; }
    function applyTableFilters() { if (!fullScheduleData) return; const mainTable = renderScheduleTable(fullScheduleData); document.getElementById('doctor-schedule-render-area').innerHTML = ''; document.getElementById('doctor-schedule-render-area').appendChild(mainTable); const fullscreenContainer = document.getElementById('fullscreen-schedule-render-area'); fullscreenContainer.innerHTML = ''; fullscreenContainer.appendChild(mainTable.cloneNode(true)); }
    function renderScheduleTable(data) { const area = areaFilter.value, dateRange = dateFilter.value; const filteredDoctors = data.doctors.filter(doc => area === 'all' || data.doctor_info[doc].區域 === area); let startDay = 1, endDay = data.num_days; if (dateRange === '1-10') endDay = 10; else if (dateRange === '11-20') { startDay = 11; endDay = 20; } else if (dateRange === '21-end') startDay = 21; const table = document.createElement('table'); table.className = 'schedule-table'; const thead = table.createTHead(), headerRow = thead.insertRow(); headerRow.insertCell().textContent = '醫師'; for (let day = startDay; day <= endDay; day++) { const th = document.createElement('th'); th.textContent = day; headerRow.appendChild(th); } const tbody = table.createTBody(); filteredDoctors.forEach(doc => { const row = tbody.insertRow(); row.insertCell().textContent = doc; for (let day = startDay; day <= endDay; day++) { const cell = row.insertCell(); const dayOfWeek = new Date(currentYear, currentMonth - 1, day).getDay(); if (data.holidays.includes(day)) cell.classList.add('cell-holiday'); else if ([0, 6].includes(dayOfWeek)) cell.classList.add('cell-weekend'); if (data.days_off[doc] && data.days_off[doc].includes(day)) { cell.textContent = '預休'; cell.classList.add('cell-dayoff'); } else if (data.schedule[doc] && data.schedule[doc][day]) { const area = data.schedule[doc][day]; cell.textContent = area; cell.classList.add(`cell-area-${area}`); } const docInfo = data.doctor_info[doc]; const lastDutyDay = docInfo.上月班別日; if (lastDutyDay > 0) { const prevMonth = new Date(currentYear, currentMonth - 2, 1); const lastDayOfPrevMonth = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).getDate(); if ((lastDutyDay === lastDayOfPrevMonth && (day === 1 || day === 2)) || (lastDutyDay === lastDayOfPrevMonth - 1 && day === 1)) { cell.classList.add('cell-cross-month-off'); if (!cell.textContent) { cell.textContent = '跨月休'; } } } } }); return table; }

    loadDoctorSettings();
}