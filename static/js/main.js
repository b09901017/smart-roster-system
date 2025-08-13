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
    const doctorSelect = document.getElementById('doctor-select');
    const yearSelect = document.getElementById('year-select');
    const monthSelect = document.getElementById('month-select');
    const calendarDiv = document.getElementById('calendar');
    const calendarTitle = document.getElementById('calendar-title');
    const submitButton = document.getElementById('submit-schedule');
    const doctorInfoCard = document.getElementById('doctor-info-card');
    const mainContent = document.getElementById('main-content');
    const welcomeMessage = document.getElementById('welcome-message');

    let currentDoctor = null, currentYear = 2025, currentMonth = 1;
    let isDragging = false, dragStartDay = null, dragToggleState = false;

    for (let y = 2025; y <= 2026; y++) yearSelect.add(new Option(y, y));
    for (let m = 1; m <= 12; m++) monthSelect.add(new Option(m, m));
    yearSelect.value = currentYear; monthSelect.value = currentMonth;

    doctorSelect.addEventListener('change', async () => {
        currentDoctor = doctorSelect.value;
        if (currentDoctor) {
            welcomeMessage.classList.add('d-none');
            mainContent.classList.remove('d-none');
            doctorInfoCard.classList.remove('d-none');
            await updateDoctorInfo();
            await loadAndRenderCalendar();
        }
    });

    [yearSelect, monthSelect].forEach(el => el.addEventListener('change', () => {
        currentYear = parseInt(yearSelect.value);
        currentMonth = parseInt(monthSelect.value);
        loadAndRenderCalendar();
    }));

    submitButton.addEventListener('click', submitDaysOff);

    async function updateDoctorInfo() {
        const response = await fetch(`/api/doctor_info/${currentDoctor}`);
        const data = await response.json();
        document.getElementById('info-card-name').textContent = currentDoctor;
        document.getElementById('info-card-area').textContent = data.區域;
        document.getElementById('info-card-points').textContent = data.點數上限;
    }

    async function loadAndRenderCalendar() {
        if (!currentDoctor) return;
        const response = await fetch(`/api/schedule_data/${currentYear}/${currentMonth}`);
        const data = await response.json();
        const doctorSchedule = data.submissions[currentDoctor] || { days_off: [] };
        renderCalendar(doctorSchedule.days_off, data.holidays);
    }

    function renderCalendar(selectedDays, holidays) {
        calendarDiv.innerHTML = '';
        calendarTitle.textContent = `${currentYear} 年 ${currentMonth} 月`;
        
        const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
        const firstDayOfMonth = new Date(currentYear, currentMonth - 1, 1).getDay();
        const dayHeaders = ['日', '一', '二', '三', '四', '五', '六'];

        dayHeaders.forEach(h => {
            const el = document.createElement('div');
            el.classList.add('calendar-day', 'header');
            el.textContent = h;
            calendarDiv.appendChild(el);
        });

        for (let i = 0; i < firstDayOfMonth; i++) {
            const el = document.createElement('div');
            el.classList.add('calendar-day', 'other-month');
            calendarDiv.appendChild(el);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dayEl = document.createElement('div');
            dayEl.classList.add('calendar-day', 'available');
            dayEl.textContent = day;
            dayEl.dataset.day = day;

            if (holidays.includes(day)) dayEl.classList.add('holiday');
            if (selectedDays.includes(day)) dayEl.classList.add('selected');

            calendarDiv.appendChild(dayEl);
        }
        addDragListeners();
    }

    function addDragListeners() {
        calendarDiv.addEventListener('mousedown', e => {
            if (e.target.classList.contains('available')) {
                isDragging = true;
                dragStartDay = parseInt(e.target.dataset.day);
                dragToggleState = !e.target.classList.contains('selected');
                e.target.classList.toggle('selected', dragToggleState);
                e.preventDefault();
            }
        });

        calendarDiv.addEventListener('mouseover', e => {
            if (isDragging && e.target.classList.contains('available')) {
                const currentDay = parseInt(e.target.dataset.day);
                const start = Math.min(dragStartDay, currentDay);
                const end = Math.max(dragStartDay, currentDay);
                
                calendarDiv.querySelectorAll('.available').forEach(cell => {
                    const day = parseInt(cell.dataset.day);
                    if (day >= start && day <= end) {
                        cell.classList.add('selecting');
                    } else {
                        cell.classList.remove('selecting');
                    }
                });
            }
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                calendarDiv.querySelectorAll('.selecting').forEach(cell => {
                    cell.classList.toggle('selected', dragToggleState);
                    cell.classList.remove('selecting');
                });
                dragStartDay = null;
            }
        });
    }

    async function submitDaysOff() {
        const daysOff = Array.from(calendarDiv.querySelectorAll('.selected')).map(el => parseInt(el.dataset.day));
        submitButton.disabled = true;
        submitButton.innerHTML = `<span class="spinner-border spinner-border-sm"></span> 提交中...`;
        try {
            const response = await fetch('/api/submit_days_off', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ doctor: currentDoctor, year: currentYear, month: currentMonth, daysOff })
            });
            const result = await response.json();
            alert(result.status === 'success' ? '預休日期已成功提交！' : `提交失敗：${result.message}`);
        } catch (error) {
            alert('提交時發生錯誤。');
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = `<i class="bi bi-check-circle-fill"></i> 提交本月預休`;
        }
    }
}

// --- Admin Page Logic ---
function initAdminPage() {
    const yearSelect = document.getElementById('admin-year-select');
    const monthSelect = document.getElementById('admin-month-select');
    const statusList = document.getElementById('submission-status-list');
    const runButton = document.getElementById('run-scheduler-btn');
    const helpText = document.getElementById('run-scheduler-help');
    const logCardBody = document.getElementById('log-card-body');
    const toggleLogBtn = document.getElementById('toggle-log-btn');
    const resultsSection = document.getElementById('results-section');
    const statusMonthTitle = document.getElementById('status-month-title');
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    const fullscreenModal = new bootstrap.Modal(document.getElementById('fullscreen-modal'));
    const logTimer = document.getElementById('log-timer');
    const scheduleFilters = document.getElementById('schedule-filters');
    const areaFilter = document.getElementById('area-filter');
    const dateFilter = document.getElementById('date-filter');
    const resetFiltersBtn = document.getElementById('reset-filters-btn');
    
    let currentYear = 2025, currentMonth = 1, eventSource = null, logTimerInterval = null, fullScheduleData = null;

    for (let y = 2025; y <= 2026; y++) yearSelect.add(new Option(y, y));
    for (let m = 1; m <= 12; m++) monthSelect.add(new Option(`${m} 月`, m));
    yearSelect.value = currentYear; monthSelect.value = currentMonth;

    [yearSelect, monthSelect].forEach(el => el.addEventListener('change', () => {
        currentYear = parseInt(yearSelect.value);
        currentMonth = parseInt(monthSelect.value);
        updateSubmissionStatus();
    }));

    runButton.addEventListener('click', runScheduler);
    toggleLogBtn.addEventListener('click', () => logCardBody.classList.toggle('minimized'));
    fullscreenBtn.addEventListener('click', () => fullscreenModal.show());
    
    [areaFilter, dateFilter].forEach(el => el.addEventListener('change', applyTableFilters));
    resetFiltersBtn.addEventListener('click', () => {
        areaFilter.value = 'all';
        dateFilter.value = 'all';
        applyTableFilters();
    });

    async function updateSubmissionStatus() {
        statusMonthTitle.textContent = `${currentYear} 年 ${currentMonth} 月`;
        const response = await fetch(`/api/schedule_data/${currentYear}/${currentMonth}`);
        const data = await response.json();
        
        statusList.innerHTML = '';
        const notSubmitted = Object.entries(data.submissions).filter(([_, info]) => !info.submitted);

        if (Object.keys(data.submissions).length === 0) {
            statusList.innerHTML = `<li class="list-group-item">該月份無醫師資料</li>`;
            runButton.disabled = true;
            helpText.textContent = '資料錯誤，無法排班。';
        } else if (notSubmitted.length === 0) {
            statusList.innerHTML = `<li class="list-group-item list-group-item-success"><i class="bi bi-check-all"></i> 所有醫師皆已提交</li>`;
            runButton.disabled = false;
            helpText.textContent = '可以開始排班。';
        } else {
            notSubmitted.forEach(([doctor, _]) => {
                const li = document.createElement('li');
                li.classList.add('list-group-item', 'd-flex', 'justify-content-between', 'align-items-center');
                li.textContent = doctor;
                li.innerHTML += `<span class="badge bg-warning text-dark">尚未提交</span>`;
                statusList.appendChild(li);
            });
            runButton.disabled = true;
            helpText.textContent = `尚有 ${notSubmitted.length} 位醫師未提交。`;
        }
    }
    
    function formatTime(ms) {
        const seconds = Math.floor(ms / 1000);
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return m > 0 ? `${m}m ${s}s` : `${s}s`;
    }

    function runScheduler() {
        if (eventSource) eventSource.close();
        if (logTimerInterval) clearInterval(logTimerInterval);
        
        runButton.disabled = true;
        runButton.innerHTML = `<span class="spinner-border spinner-border-sm"></span> 運算中...`;
        logCardBody.classList.remove('minimized');
        document.getElementById('log-output').textContent = '正在連接後端排班引擎...';
        toggleLogBtn.classList.add('d-none');
        resultsSection.classList.add('d-none');
        isFirstLog = true;
        logTimer.textContent = '0s';
        logTimer.classList.remove('bg-success');
        logTimer.classList.add('bg-secondary');

        const startTime = Date.now();
        logTimerInterval = setInterval(() => {
            logTimer.textContent = formatTime(Date.now() - startTime);
        }, 1000);

        const url = `/api/run_scheduler?year=${currentYear}&month=${currentMonth}`;
        eventSource = new EventSource(url);

        eventSource.onmessage = e => handleLogMessage(e.data);
        eventSource.addEventListener('DONE', e => handleDoneEvent(JSON.parse(e.data), startTime));
        eventSource.onerror = () => {
            document.getElementById('log-output').textContent += '\n與伺服器連線中斷或發生錯誤。';
            eventSource.close();
            resetRunButton();
        };
    }
    
    let isFirstLog = true;
    function handleLogMessage(data) {
        const logOutput = document.getElementById('log-output');
        if (isFirstLog) { logOutput.textContent = ''; isFirstLog = false; }
        logOutput.textContent += data + '\n';
        logOutput.scrollTop = logOutput.scrollHeight;
    }

    function handleDoneEvent(data, startTime) {
        clearInterval(logTimerInterval);
        logTimer.innerHTML = `✅ ${formatTime(Date.now() - startTime)}`;
        logTimer.classList.remove('bg-secondary');
        logTimer.classList.add('bg-success');

        if (data.status === 'success') {
            fullScheduleData = data.schedule_data; // Store full data
            displayResults(data);
            logCardBody.classList.add('minimized');
            toggleLogBtn.classList.remove('d-none');
            setTimeout(() => resultsSection.scrollIntoView({ behavior: 'smooth' }), 100);
        } else {
            document.getElementById('log-output').textContent += `\n排班失敗: ${data.message}`;
        }
        resetRunButton();
        eventSource.close();
    }
    
    function resetRunButton() {
        runButton.disabled = false;
        runButton.innerHTML = '<i class="bi bi-calculator-fill"></i> 一鍵排班';
        updateSubmissionStatus();
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
        
        applyTableFilters(); // Initial render with default filters

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
        const area = areaFilter.value;
        const dateRange = dateFilter.value;

        const filteredDoctors = data.doctors.filter(doc => area === 'all' || data.doctor_info[doc].區域 === area);
        
        let startDay = 1, endDay = data.num_days;
        if (dateRange === '1-10') endDay = 10;
        else if (dateRange === '11-20') { startDay = 11; endDay = 20; }
        else if (dateRange === '21-end') startDay = 21;

        const table = document.createElement('table');
        table.className = 'schedule-table';
        
        const thead = table.createTHead();
        const headerRow = thead.insertRow();
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
            }
        });
        return table;
    }

    updateSubmissionStatus();
}
