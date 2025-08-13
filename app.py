# --------------------------------------------------------------------------
# 智慧排班系統 - Flask 網頁應用程式 (v2.8 - 部署優化版)
# --------------------------------------------------------------------------
import os
import io
import pandas as pd
from flask import Flask, render_template, request, jsonify, Response, send_from_directory
import json
import threading
from datetime import datetime
from collections import defaultdict
from queue import Queue
import holidays

# 匯入我們重構後的排班引擎
from scheduler import solve_schedule_web

# --- 應用程式設定 ---
app = Flask(__name__)
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0 # 開發時禁用快取

# --- 資料持久化設定 (部署優化) ---
# 判斷是否在 Render 環境，如果是，使用永久磁碟路徑，否則使用本地路徑
# 這讓你的程式碼在本地和 Render 上都能正常運作
DATA_DIR = os.environ.get('RENDER_DISK_PATH', '.')
DATA_FILE = os.path.join(DATA_DIR, 'data.json')
OUTPUT_DIR = os.path.join(DATA_DIR, 'output')

# 確保 output 資料夾存在
if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

# --- 全域資料儲存 ---
DOCTOR_DATA_TEMPLATE = {}
DOCTOR_SCHEDULE_SUBMISSIONS = defaultdict(lambda: defaultdict(dict))

def save_schedules():
    """將目前的排休資料儲存到 JSON 檔案"""
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(DOCTOR_SCHEDULE_SUBMISSIONS, f, ensure_ascii=False, indent=4)

def load_schedules():
    """從 JSON 檔案載入排休資料"""
    global DOCTOR_SCHEDULE_SUBMISSIONS
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            # 使用 defaultdict 處理載入的資料
            loaded_data = json.load(f)
            for month_key, submissions in loaded_data.items():
                DOCTOR_SCHEDULE_SUBMISSIONS[month_key] = defaultdict(dict, submissions)
    else:
        # 如果檔案不存在，則從範本初始化
        initialize_from_template()
        save_schedules() # 並儲存一份新的

def initialize_from_template():
    """從您的原始腳本中讀取並初始化醫師資料"""
    global DOCTOR_DATA_TEMPLATE, DOCTOR_SCHEDULE_SUBMISSIONS
    csv_data = """
醫師姓名,區域,點數上限,不可排班日
如,A,8,"26,27"
秀,A,8,"1,2,5,6"
橋,A,6,"1,2,3,4,5,6,7,8,9,19,20"
君,A,6,"4"
翔,A,6,"1,3,4"
航,A,8,"1,14,15,16,17,18,19,20"
淇,B,8,"1,2,25,28"
慈,B,8,"3,4"
恩,B,8,""
屹,B,8,"4,5"
軒,B,6,"2,3,5"
佑,C,8,""
翰,C,6,"1,2,3,4,5,6,7,8,9,13,27"
潔,C,5,"16,17,18,19,20,21,22,23,24,25,26,27,28,29,30"
諺,C,5,"1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,26"
宣,C,8,"26,27"
韶,C,8,"2,3,4,5,6,7,8"
然,I,8,"1,2,3,4,5,6"
偉,I,8,"1,2,4,5"
煒,I,7,"21,22,23,24,25,26,27,28,29,30"
"""
    data_io = io.StringIO(csv_data)
    df = pd.read_csv(data_io, engine='python')
    df.columns = df.columns.str.strip()
    
    template_days_off = {}

    for _, row in df.iterrows():
        doc_name = row['醫師姓名']
        DOCTOR_DATA_TEMPLATE[doc_name] = {
            '區域': row['區域'],
            '點數上限': int(row['點數上限']),
        }
        days_off_str = str(row['不可排班日'])
        template_days_off[doc_name] = [int(d) for d in days_off_str.split(',') if d.strip().isdigit()]
    
    if not DOCTOR_SCHEDULE_SUBMISSIONS:
        current_year = 2025
        for month in range(1, 13):
            month_key = f"{current_year}-{str(month).zfill(2)}"
            days_in_month = pd.Period(f'{current_year}-{month}-01').days_in_month
            for doc_name, original_days in template_days_off.items():
                valid_days = [d for d in original_days if d <= days_in_month]
                DOCTOR_SCHEDULE_SUBMISSIONS[month_key][doc_name] = {
                    'submitted': False,
                    'days_off': valid_days
                }

load_schedules()
if not DOCTOR_DATA_TEMPLATE:
    initialize_from_template()


@app.route('/')
def index():
    return render_template('index.html')

@app.route('/doctor')
def doctor_portal():
    doctors = list(DOCTOR_DATA_TEMPLATE.keys())
    return render_template('doctor.html', doctors=doctors)

@app.route('/admin')
def admin_portal():
    return render_template('admin.html')

@app.route('/output/<filename>')
def serve_output_file(filename):
    return send_from_directory(OUTPUT_DIR, filename, as_attachment=True)

@app.route('/api/doctor_info/<name>')
def get_doctor_info(name):
    if name in DOCTOR_DATA_TEMPLATE:
        return jsonify(DOCTOR_DATA_TEMPLATE[name])
    return jsonify({'error': 'Doctor not found'}), 404

@app.route('/api/schedule_data/<year>/<month>')
def get_schedule_data(year, month):
    month_key = f"{year}-{str(month).zfill(2)}"
    tw_holidays = holidays.TW(years=int(year))
    holiday_list = [d.day for d in tw_holidays if d.month == int(month)]

    response_data = {
        "submissions": DOCTOR_SCHEDULE_SUBMISSIONS.get(month_key, {}),
        "holidays": holiday_list
    }
    return jsonify(response_data)

@app.route('/api/submit_days_off', methods=['POST'])
def submit_days_off():
    data = request.json
    year, month, doc_name, days_off = data.get('year'), data.get('month'), data.get('doctor'), data.get('daysOff')
    month_key = f"{year}-{str(month).zfill(2)}"
    
    if month_key in DOCTOR_SCHEDULE_SUBMISSIONS and doc_name in DOCTOR_SCHEDULE_SUBMISSIONS[month_key]:
        DOCTOR_SCHEDULE_SUBMISSIONS[month_key][doc_name]['days_off'] = days_off
        DOCTOR_SCHEDULE_SUBMISSIONS[month_key][doc_name]['submitted'] = True
        save_schedules()
        return jsonify({'status': 'success', 'message': f'{doc_name} 於 {month_key} 的預休已更新。'})
    
    return jsonify({'status': 'error', 'message': '找不到對應的資料'}), 400

@app.route('/api/run_scheduler')
def run_scheduler_endpoint():
    year = int(request.args.get('year'))
    month = int(request.args.get('month'))
    month_key = f"{year}-{str(month).zfill(2)}"
    
    current_doctor_data = []
    month_submissions = DOCTOR_SCHEDULE_SUBMISSIONS.get(month_key, {})
    for name, template in DOCTOR_DATA_TEMPLATE.items():
        submission = month_submissions.get(name, {'days_off': []})
        current_doctor_data.append({
            '醫師姓名': name, '區域': template['區域'], '點數上限': template['點數上限'], '不可排班日': submission['days_off']
        })

    q = Queue()

    def event_stream():
        while True:
            log_entry = q.get()
            if log_entry == "DONE": break
            if isinstance(log_entry, str):
                yield f"data: {log_entry}\n\n"
            elif isinstance(log_entry, dict) and 'status' in log_entry:
                json_data = json.dumps(log_entry)
                yield f"event: DONE\ndata: {json_data}\n\n"

    # 將 OUTPUT_DIR 作為參數傳入，讓排班引擎知道要將檔案存在哪裡
    threading.Thread(target=solve_schedule_web, args=(current_doctor_data, year, month, q, OUTPUT_DIR)).start()
    return Response(event_stream(), mimetype='text/event-stream')

# 正式環境不需要以下啟動方式，將由 Gunicorn 啟動
# if __name__ == '__main__':
#     app.run(host='0.0.0.0', port=5000, debug=True)