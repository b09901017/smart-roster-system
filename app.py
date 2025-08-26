# --------------------------------------------------------------------------
# 智慧排班系統 - Flask 網頁應用程式 (v2.7.0 - Real-time Add Doctor)
# --------------------------------------------------------------------------

import gevent.monkey
gevent.monkey.patch_all()

import os
import io
import json
import threading
import time
from datetime import datetime, timedelta
from collections import defaultdict
from queue import Queue, Empty
import pandas as pd
import holidays
from flask import Flask, render_template, request, jsonify, Response, send_from_directory

from scheduler import solve_schedule_web

app = Flask(__name__)
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
DATA_DIR = os.environ.get('RENDER_DISK_PATH', '.')
DATA_FILE = os.path.join(DATA_DIR, 'data.json')
DOCTOR_TEMPLATE_FILE = os.path.join(DATA_DIR, 'doctor_template.json')
OUTPUT_DIR = os.path.join(DATA_DIR, 'output')
if not os.path.exists(OUTPUT_DIR): os.makedirs(OUTPUT_DIR)
DOCTOR_SCHEDULE_SUBMISSIONS = defaultdict(lambda: defaultdict(dict))
DOCTOR_TEMPLATE = {}

def get_month_key(year, month): return f"{year}-{str(month).zfill(2)}"
def save_data(data, file_path):
    with open(file_path, 'w', encoding='utf-8') as f: json.dump(data, f, ensure_ascii=False, indent=4)
def load_data(file_path, default_factory=None):
    if os.path.exists(file_path):
        with open(file_path, 'r', encoding='utf-8') as f:
            try:
                loaded_data = json.load(f)
                if default_factory:
                    data = defaultdict(default_factory)
                    for k, v in loaded_data.items(): data[k] = defaultdict(dict, v)
                    return data
                return loaded_data
            except (json.JSONDecodeError, AttributeError): return default_factory() if default_factory else {}
    return default_factory() if default_factory else {}
def initialize_doctor_template():
    global DOCTOR_TEMPLATE
    if not os.path.exists(DOCTOR_TEMPLATE_FILE):
        csv_data = """醫師姓名,區域,點數上限,不可排班日
如,A,8,"26,27"
秀,A,8,"1,2,5,6"
橋,A,6,"1,2,3,4"
君,A,6,"4"
翔,A,6,"1,3,4"
航,A,8,"1,14,15,16"
淇,B,8,"1,2,25,28"
慈,B,8,"3,4"
恩,B,8,""
屹,B,8,"4,5"
軒,B,6,"2,3,5"
佑,C,8,""
翰,C,6,"1,2,3,4"
潔,C,5,"16,17,18,19"
諺,C,5,"1,2,3,4"
宣,C,8,"26,27"
韶,C,8,"2,3,4,5"
然,I,8,"1,2,3,4"
偉,I,8,"1,2,4,5"
煒,I,7,"21,22,23,24"
"""
        df = pd.read_csv(io.StringIO(csv_data)).apply(lambda x: x.str.strip() if x.dtype == "object" else x)
        for _, row in df.iterrows():
            days_off_str = str(row['不可排班日'])
            days_off_list = [int(d) for d in days_off_str.split(',') if d.strip().isdigit()]
            DOCTOR_TEMPLATE[row['醫師姓名']] = { 'area': row['區域'], 'points_limit': int(row['點數上限']), 'days_off': days_off_list }
        save_data(DOCTOR_TEMPLATE, DOCTOR_TEMPLATE_FILE)
    else: DOCTOR_TEMPLATE = load_data(DOCTOR_TEMPLATE_FILE)
def pre_populate_schedules_if_empty():
    if not DOCTOR_SCHEDULE_SUBMISSIONS:
        today = datetime.today()
        for i in range(0, 3):
            target_date = today + timedelta(days=30 * i)
            year, month = target_date.year, target_date.month
            month_key = get_month_key(year, month)
            for name, template in DOCTOR_TEMPLATE.items():
                DOCTOR_SCHEDULE_SUBMISSIONS[month_key][name] = { "days_off": template.get('days_off', []), "area": template.get("area", "A"), "points_limit": template.get("points_limit", 8), "submitted": True, "is_template": True }
        save_data(DOCTOR_SCHEDULE_SUBMISSIONS, DATA_FILE)
DOCTOR_SCHEDULE_SUBMISSIONS = load_data(DATA_FILE, lambda: defaultdict(dict))
initialize_doctor_template()
pre_populate_schedules_if_empty()
@app.route('/')
def index(): return render_template('index.html')
@app.route('/doctor')
def doctor_portal(): return render_template('doctor.html')
@app.route('/admin')
def admin_portal(): return render_template('admin.html')
@app.route('/output/<filename>')
def serve_output_file(filename): return send_from_directory(OUTPUT_DIR, filename, as_attachment=True)
@app.route('/api/schedule_data/<year>/<month>')
def get_schedule_data(year, month):
    month_key = get_month_key(year, month)
    tw_holidays = holidays.TW(years=int(year))
    holiday_list = [d.day for d in tw_holidays if d.month == int(month)]
    response_data = {"submissions": DOCTOR_SCHEDULE_SUBMISSIONS.get(month_key, {}), "holidays": holiday_list, "doctor_template": DOCTOR_TEMPLATE}
    return jsonify(response_data)
@app.route('/api/clear_month_data', methods=['POST'])
def clear_month_data():
    data = request.json; year, month = data.get('year'), data.get('month'); month_key = get_month_key(year, month)
    if month_key in DOCTOR_SCHEDULE_SUBMISSIONS: del DOCTOR_SCHEDULE_SUBMISSIONS[month_key]; save_data(DOCTOR_SCHEDULE_SUBMISSIONS, DATA_FILE); return jsonify({'status': 'success', 'message': f'{month_key} 的資料已成功清除。'})
    else: return jsonify({'status': 'success', 'message': f'{month_key} 本來就沒有資料。'})

@app.route('/api/submit_days_off', methods=['POST'])
def submit_days_off():
    data = request.json
    year, month, doc_name = data.get('year'), data.get('month'), data.get('doctor')
    days_off = data.get('daysOff', [])
    month_key = get_month_key(year, month)
    if not doc_name: return jsonify({'status': 'error', 'message': '醫師姓名不可為空'}), 400
    if doc_name not in DOCTOR_SCHEDULE_SUBMISSIONS[month_key]:
        template = DOCTOR_TEMPLATE.get(doc_name, {})
        DOCTOR_SCHEDULE_SUBMISSIONS[month_key][doc_name] = { "area": "UNCLASSIFIED", "points_limit": template.get("points_limit", 8), "days_off": [], "submitted": False, "is_template": False }
    DOCTOR_SCHEDULE_SUBMISSIONS[month_key][doc_name].update({ 'days_off': days_off, 'submitted': True, 'is_template': False })
    save_data(DOCTOR_SCHEDULE_SUBMISSIONS, DATA_FILE)
    return jsonify({'status': 'success', 'message': f'{doc_name} 於 {month_key} 的預休已提交。'})

# 【主要修改】新增一個專門用來即時新增醫師的 API
@app.route('/api/add_doctor', methods=['POST'])
def add_doctor():
    data = request.json
    year, month, doc_name, area = data.get('year'), data.get('month'), data.get('name'), data.get('area')
    month_key = get_month_key(year, month)
    if not all([year, month, doc_name, area]):
        return jsonify({'status': 'error', 'message': '缺少必要資訊'}), 400
    if doc_name in DOCTOR_SCHEDULE_SUBMISSIONS.get(month_key, {}):
        return jsonify({'status': 'error', 'message': f'醫師 {doc_name} 已存在於本月名單中'}), 400
    
    template = DOCTOR_TEMPLATE.get(doc_name, {})
    new_doctor_data = {
        "area": area,
        "points_limit": template.get("points_limit", 8),
        "days_off": [],
        "submitted": False, # 手動新增的醫師預設為未提交
        "is_template": False
    }
    DOCTOR_SCHEDULE_SUBMISSIONS[month_key][doc_name] = new_doctor_data
    save_data(DOCTOR_SCHEDULE_SUBMISSIONS, DATA_FILE)
    
    return jsonify({'status': 'success', 'message': f'醫師 {doc_name} 已成功新增至 {month_key}。', 'new_doctor_data': new_doctor_data})

@app.route('/api/update_doctor_settings', methods=['POST'])
def update_doctor_settings():
    data = request.json; year, month, settings = data.get('year'), data.get('month'), data.get('settings', {}); month_key = get_month_key(year, month)
    
    # 判斷 settings 是否為空物件，來決定是覆蓋還是清空
    if not settings:
        if month_key in DOCTOR_SCHEDULE_SUBMISSIONS:
            del DOCTOR_SCHEDULE_SUBMISSIONS[month_key]
    else:
        DOCTOR_SCHEDULE_SUBMISSIONS[month_key] = defaultdict(dict, settings)
    
    save_data(DOCTOR_SCHEDULE_SUBMISSIONS, DATA_FILE)
    return jsonify({'status': 'success', 'message': '醫師設定已成功儲存！'})

@app.route('/api/run_scheduler')
def run_scheduler_endpoint():
    try:
        year, month = int(request.args.get('year')), int(request.args.get('month'))
        month_key = get_month_key(year, month)
        current_month_settings = DOCTOR_SCHEDULE_SUBMISSIONS.get(month_key, {})
        if not current_month_settings or all(k == 'final_schedule' for k in current_month_settings.keys()):
             return Response(f"event: DONE\ndata: {json.dumps({'status': 'error', 'message': '當月無任何醫師設定，無法排班。'})}\n\n", mimetype='text/event-stream')
        prev_month_date = datetime(year, month, 1) - timedelta(days=1)
        prev_month_key = get_month_key(prev_month_date.year, prev_month_date.month)
        prev_month_schedule = DOCTOR_SCHEDULE_SUBMISSIONS.get(prev_month_key, {}).get("final_schedule", {})
        doctor_data_for_scheduler = []
        for name, info in current_month_settings.items():
            if name == "final_schedule" or info.get('area') == 'UNCLASSIFIED': continue
            last_month_duty_day = 0
            if prev_month_schedule and name in prev_month_schedule:
                last_day_of_prev_month = prev_month_date.day
                doc_prev_schedule = prev_month_schedule[name]
                if str(last_day_of_prev_month) in doc_prev_schedule: last_month_duty_day = last_day_of_prev_month
                elif str(last_day_of_prev_month - 1) in doc_prev_schedule: last_month_duty_day = last_day_of_prev_month - 1
            doctor_data_for_scheduler.append({'醫師姓名': name, '區域': info.get('area', 'A'), '點數上限': info.get('points_limit', 8), '不可排班日': info.get('days_off', []), '上月班別日': last_month_duty_day})
        if not doctor_data_for_scheduler:
             return Response(f"event: DONE\ndata: {json.dumps({'status': 'error', 'message': '沒有已完成分區設定的醫師，無法排班。'})}\n\n", mimetype='text/event-stream')
        q = Queue()
        def event_stream():
            yield "data: 連線已建立...\n\n"
            last_heartbeat = time.time()
            while True:
                try:
                    log_entry = q.get(timeout=1.0) 
                    if log_entry == "DONE_SUCCESS":
                        final_result = q.get()
                        if 'schedule' in final_result:
                            final_schedule_dict = {doc: {str(day): area for day, area in schedule.items()} for doc, schedule in final_result['schedule'].items()}
                            DOCTOR_SCHEDULE_SUBMISSIONS[month_key]['final_schedule'] = final_schedule_dict
                            save_data(DOCTOR_SCHEDULE_SUBMISSIONS, DATA_FILE)
                        yield f"event: DONE\ndata: {json.dumps(final_result)}\n\n"
                        break
                    elif log_entry == "DONE_ERROR":
                        error_result = q.get()
                        yield f"event: DONE\ndata: {json.dumps(error_result)}\n\n"
                        break
                    elif isinstance(log_entry, str):
                        yield f"data: {log_entry}\n\n"
                except Empty:
                    if time.time() - last_heartbeat > 15:
                        yield ": heartbeat\n\n"
                        last_heartbeat = time.time()
        threading.Thread(target=solve_schedule_web, args=(doctor_data_for_scheduler, year, month, q, OUTPUT_DIR)).start()
        response = Response(event_stream(), mimetype='text/event-stream')
        response.headers['X-Accel-Buffering'] = 'no'
        response.headers['Cache-Control'] = 'no-cache'
        return response
    except Exception as e:
        error_payload = json.dumps({'status': 'error', 'message': f'API 內部嚴重錯誤: {e}'})
        return Response(f"event: DONE\ndata: {error_payload}\n\n", mimetype='text/event-stream')
