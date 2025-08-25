# --------------------------------------------------------------------------
# 智慧排班系統 - Flask 網頁應用程式 (v2.1.0 - 優化版)
# --------------------------------------------------------------------------
import os
import io
import pandas as pd
from flask import Flask, render_template, request, jsonify, Response, send_from_directory
import json
import threading
from datetime import datetime, timedelta
from collections import defaultdict
from queue import Queue
import holidays

# 匯入我們重構後的排班引擎
# 檔名維持 scheduler.py，但內容會更新
from scheduler import solve_schedule_web

# --- 應用程式設定 ---
app = Flask(__name__)
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

# --- 資料持久化設定 ---
DATA_DIR = os.environ.get('RENDER_DISK_PATH', '.')
DATA_FILE = os.path.join(DATA_DIR, 'data.json')
DOCTOR_TEMPLATE_FILE = os.path.join(DATA_DIR, 'doctor_template.json')
OUTPUT_DIR = os.path.join(DATA_DIR, 'output')

if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

# --- 全域資料儲存 ---
DOCTOR_SCHEDULE_SUBMISSIONS = defaultdict(lambda: defaultdict(dict))
DOCTOR_TEMPLATE = {}

# --- 輔助函式 ---
def get_month_key(year, month):
    return f"{year}-{str(month).zfill(2)}"

def save_data(data, file_path):
    """通用儲存函式"""
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)

def load_data(file_path, default_factory=None):
    """通用讀取函式"""
    if os.path.exists(file_path):
        with open(file_path, 'r', encoding='utf-8') as f:
            try:
                loaded_data = json.load(f)
                if default_factory:
                    # 如果是排班資料，確保是 defaultdict
                    data = defaultdict(default_factory)
                    for k, v in loaded_data.items():
                        data[k] = defaultdict(dict, v)
                    return data
                return loaded_data
            except json.JSONDecodeError:
                return default_factory() if default_factory else {}
    return default_factory() if default_factory else {}

def initialize_doctor_template():
    """從 CSV 字串初始化醫師範本資料，如果範本檔案不存在的話"""
    global DOCTOR_TEMPLATE
    if not os.path.exists(DOCTOR_TEMPLATE_FILE):
        csv_data = """
醫師姓名,區域,點數上限
如,A,8
秀,A,8
橋,A,6
君,A,6
翔,A,6
航,A,8
淇,B,8
慈,B,8
恩,B,8
屹,B,8
軒,B,6
佑,C,8
翰,C,6
潔,C,5
諺,C,5
宣,C,8
韶,C,8
然,I,8
偉,I,8
煒,I,7
"""
        data_io = io.StringIO(csv_data)
        df = pd.read_csv(data_io, engine='python').apply(lambda x: x.str.strip() if x.dtype == "object" else x)
        
        for _, row in df.iterrows():
            DOCTOR_TEMPLATE[row['醫師姓名']] = {
                'area': row['區域'],
                'points_limit': int(row['點數上限']),
            }
        save_data(DOCTOR_TEMPLATE, DOCTOR_TEMPLATE_FILE)
    else:
        DOCTOR_TEMPLATE = load_data(DOCTOR_TEMPLATE_FILE)


# --- 應用程式啟動時載入資料 ---
DOCTOR_SCHEDULE_SUBMISSIONS = load_data(DATA_FILE, lambda: defaultdict(dict))
initialize_doctor_template()

# --- Flask 路由 ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/doctor')
def doctor_portal():
    return render_template('doctor.html')

@app.route('/admin')
def admin_portal():
    return render_template('admin.html')

@app.route('/output/<filename>')
def serve_output_file(filename):
    return send_from_directory(OUTPUT_DIR, filename, as_attachment=True)


# --- API 端點 ---
@app.route('/api/schedule_data/<year>/<month>')
def get_schedule_data(year, month):
    month_key = get_month_key(year, month)
    tw_holidays = holidays.TW(years=int(year))
    holiday_list = [d.day for d in tw_holidays if d.month == int(month)]

    # 確保所有範本中的醫師都存在於當月的提交清單中
    # 這樣總醫師才能看到完整的預設清單
    for name, template in DOCTOR_TEMPLATE.items():
        if name not in DOCTOR_SCHEDULE_SUBMISSIONS[month_key]:
            DOCTOR_SCHEDULE_SUBMISSIONS[month_key][name] = {
                "days_off": [],
                "area": template.get("area", "A"),
                "points_limit": template.get("points_limit", 8),
                "submitted": False,
                "is_template": True # 標記這是從範本來的預設資料
            }

    response_data = {
        "submissions": DOCTOR_SCHEDULE_SUBMISSIONS.get(month_key, {}),
        "holidays": holiday_list,
        "doctor_template": DOCTOR_TEMPLATE # 將範本資料也傳給前端
    }
    return jsonify(response_data)

@app.route('/api/submit_days_off', methods=['POST'])
def submit_days_off():
    data = request.json
    year, month, doc_name = data.get('year'), data.get('month'), data.get('doctor')
    days_off = data.get('daysOff', [])
    month_key = get_month_key(year, month)

    # 不論醫師之前是否存在，都更新或建立他的資料
    if doc_name:
        # 如果醫師是第一次提交，且存在於範本中，則帶入範本設定
        if doc_name not in DOCTOR_SCHEDULE_SUBMISSIONS[month_key] and doc_name in DOCTOR_TEMPLATE:
            template = DOCTOR_TEMPLATE[doc_name]
            DOCTOR_SCHEDULE_SUBMISSIONS[month_key][doc_name] = {
                "area": template.get("area", "A"),
                "points_limit": template.get("points_limit", 8),
            }
        
        # 更新或新增預休資料
        DOCTOR_SCHEDULE_SUBMISSIONS[month_key][doc_name].update({
            'days_off': days_off,
            'submitted': True,
            'is_template': False # 一旦提交，就不是範本狀態了
        })
        
        save_data(DOCTOR_SCHEDULE_SUBMISSIONS, DATA_FILE)
        return jsonify({'status': 'success', 'message': f'{doc_name} 於 {month_key} 的預休已提交。'})
    
    return jsonify({'status': 'error', 'message': '醫師姓名不可為空'}), 400

@app.route('/api/update_doctor_settings', methods=['POST'])
def update_doctor_settings():
    data = request.json
    year, month = data.get('year'), data.get('month')
    settings = data.get('settings', {})
    month_key = get_month_key(year, month)
    
    if not settings:
        return jsonify({'status': 'error', 'message': '沒有設定資料'}), 400
        
    # 直接用新的設定覆蓋當月的醫師資料
    # 這邊不再需要檢查醫師是否存在，因為前端會傳來完整的列表
    DOCTOR_SCHEDULE_SUBMISSIONS[month_key] = defaultdict(dict, settings)
    
    save_data(DOCTOR_SCHEDULE_SUBMISSIONS, DATA_FILE)
    return jsonify({'status': 'success', 'message': '醫師設定已成功儲存！'})


@app.route('/api/run_scheduler')
def run_scheduler_endpoint():
    try:
        year = int(request.args.get('year'))
        month = int(request.args.get('month'))
        month_key = get_month_key(year, month)
        
        # 1. 取得當前月份的醫師設定
        current_month_settings = DOCTOR_SCHEDULE_SUBMISSIONS.get(month_key, {})
        if not current_month_settings:
            return Response(json.dumps({"status": "error", "message": "當月無任何醫師設定，請先儲存設定。"}), 
                            mimetype='application/json', status=400)

        # 2. 自動化取得上個月的班表情況
        prev_month_date = datetime(year, month, 1) - timedelta(days=1)
        prev_month_key = get_month_key(prev_month_date.year, prev_month_date.month)
        prev_month_schedule = DOCTOR_SCHEDULE_SUBMISSIONS.get(prev_month_key, {}).get("final_schedule", {})

        # 3. 組合最終要傳給排班引擎的資料
        doctor_data_for_scheduler = []
        for name, info in current_month_settings.items():
            # final_schedule 是排班完後儲存的結果，如果沒有就不處理
            if name == "final_schedule": continue

            # 檢查上月最後兩天班表
            last_month_duty_day = 0
            if prev_month_schedule and name in prev_month_schedule:
                last_day_of_prev_month = prev_month_date.day
                doc_prev_schedule = prev_month_schedule[name]
                if str(last_day_of_prev_month) in doc_prev_schedule:
                    last_month_duty_day = last_day_of_prev_month
                elif str(last_day_of_prev_month - 1) in doc_prev_schedule:
                    last_month_duty_day = last_day_of_prev_month - 1
            
            doctor_data_for_scheduler.append({
                '醫師姓名': name,
                '區域': info.get('area', 'A'),
                '點數上限': info.get('points_limit', 8),
                '不可排班日': info.get('days_off', []),
                '上月班別日': last_month_duty_day # 0 表示上月最後兩天無班
            })

        q = Queue()

        def event_stream():
            while True:
                log_entry = q.get()
                if log_entry == "DONE_SUCCESS":
                    # 排班成功後，將最終班表存回 data.json
                    final_result = q.get()
                    if 'schedule' in final_result:
                        # 將 dictionary 的 key 從 int 轉為 str，以符合 JSON 格式
                        final_schedule_dict = {doc: {str(day): area for day, area in schedule.items()} 
                                               for doc, schedule in final_result['schedule'].items()}
                        DOCTOR_SCHEDULE_SUBMISSIONS[month_key]['final_schedule'] = final_schedule_dict
                        save_data(DOCTOR_SCHEDULE_SUBMISSIONS, DATA_FILE)
                    
                    json_data = json.dumps(final_result)
                    yield f"event: DONE\ndata: {json_data}\n\n"
                    break # 結束 stream

                elif log_entry == "DONE_ERROR":
                    error_result = q.get()
                    json_data = json.dumps(error_result)
                    yield f"event: DONE\ndata: {json_data}\n\n"
                    break # 結束 stream
                
                elif isinstance(log_entry, str):
                    yield f"data: {log_entry}\n\n"

        threading.Thread(target=solve_schedule_web, args=(doctor_data_for_scheduler, year, month, q, OUTPUT_DIR)).start()
        return Response(event_stream(), mimetype='text/event-stream')

    except Exception as e:
        # 處理 API 自身的錯誤
        error_payload = {"status": "error", "message": f"API 內部錯誤: {str(e)}"}
        json_data = json.dumps(error_payload)
        return Response(f"event: DONE\ndata: {json_data}\n\n", mimetype='text/event-stream')

# if __name__ == '__main__':
#     # 這段主要用於本地開發，Render/Gunicorn 會用別的方式啟動
#     app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)), debug=True)