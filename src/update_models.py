import json
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
import re
import time
import traceback
import os

def parse_model_details(driver, model_name):
    """获取单个模型的详细信息"""
    print(f"\n正在获取模型 {model_name} 的详细信息...")
    try:
        url = f'https://ollama.com/library/{model_name}'
        print(f"访问URL: {url}")
        driver.get(url)
        time.sleep(5)
        
        # 获取页面文本
        page_text = driver.find_element(By.TAG_NAME, 'body').text
        lines = [line.strip() for line in page_text.split('\n') if line.strip()]
        
        # 获取描述（模型名称后的第一行）
        description = ""
        for i, line in enumerate(lines):
            if line == model_name and i + 1 < len(lines):
                description = lines[i + 1]
                break
        
        # 获取下载量
        downloads = "0"
        for i, line in enumerate(lines):
            if "Pulls" in line and i > 0:
                downloads = lines[i-1]
                break
        
        # 获取更新时间
        updated = "Unknown"
        for line in lines:
            if "ago" in line:
                updated = line
                break
        
        # 点击参数选择按钮并获取所有参数版本
        param_versions = []
        try:
            # 查找并点击按钮
            button = driver.find_element(By.CSS_SELECTOR, 'button[name="tag"]')
            button.click()
            time.sleep(1)  # 等待下拉框展开
            
            # 获取下拉框中的所有选项
            options = driver.find_elements(By.CSS_SELECTOR, '#tags-nav a[href^="/library/"]')
            
            for option in options:
                if "View all" not in option.text:  # 排除"View all"链接
                    # 获取参数大小和磁盘大小
                    text = option.text.strip()
                    parts = text.split()
                    if len(parts) >= 2:
                        size = parts[0].lower()
                        # 处理特殊格式，如 8x7b
                        if re.match(r'^\d+x\d+[bB]$', size):
                            size = size.lower()
                        elif re.match(r'^\d+\.?\d*[bB]$', size):
                            size = size.lower()
                        
                        disk_size = parts[-1]
                        param_versions.append({
                            'size': size,
                            'diskSize': disk_size
                        })
            
        except Exception as e:
            print(f"获取参数版本时出错: {e}")
            # 如果点击获取失败，尝试从页面文本中获取默认版本
            for line in lines:
                if re.match(r'^\d+\.?\d*[bB]$', line) or re.match(r'^\d+x\d+[bB]$', line):
                    param_versions.append({
                        'size': line.lower(),
                        'diskSize': '未知'
                    })
        
        # 获取默认版本（第一个参数版本）
        default_size = param_versions[0]['size'] if param_versions else ""
        default_disk_size = param_versions[0]['diskSize'] if param_versions else "未知"
        
        result = {
            'description': description,
            'downloads': downloads,
            'lastUpdated': updated,
            'parameterVersions': param_versions,
            'defaultSize': default_size,
            'defaultDiskSize': default_disk_size
        }
        
        print("\n解析结果：")
        print(json.dumps(result, indent=2, ensure_ascii=False))
        
        return result
        
    except Exception as e:
        print(f"获取模型 {model_name} 详细信息时出错: {e}")
        return None

def get_today_filename():
    """获取今天的文件名"""
    today = datetime.now().strftime('%Y%m%d')
    return f'public/data/ollama-models-{today}.json'

def load_existing_results():
    """加载今天已经处理过的结果"""
    filename = get_today_filename()
    try:
        if os.path.exists(filename):
            with open(filename, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # 创建已处理模型的集合
                processed_models = {model['name'] for model in data['models']}
                return data['models'], processed_models
    except Exception as e:
        print(f"读取已存在的结果文件时出错: {e}")
    return [], set()

def update_combined_file():
    """更新综合版本的文件"""
    print("\n开始更新综合版本文件...")
    
    # 读取今天的结果
    today_file = get_today_filename()
    try:
        with open(today_file, 'r', encoding='utf-8') as f:
            today_data = json.load(f)
    except Exception as e:
        print(f"读取今天的结果文件时出错: {e}")
        return
    
    # 读取综合版本文件（如果存在）
    combined_file = 'public/data/ollama-models.json'
    combined_models = {}
    try:
        if os.path.exists(combined_file):
            with open(combined_file, 'r', encoding='utf-8') as f:
                combined_data = json.load(f)
                # 创建模型名称到模型信息的映射
                combined_models = {model['name']: model for model in combined_data['models']}
    except Exception as e:
        print(f"读取综合版本文件时出错: {e}")
    
    # 更新综合版本
    updated_count = 0
    skipped_count = 0
    
    # 遍历今天的结果
    for model in today_data['models']:
        if model['name'] not in combined_models:
            combined_models[model['name']] = model
            updated_count += 1
        else:
            skipped_count += 1
    
    # 保存更新后的综合版本
    combined_data = {
        'lastUpdated': datetime.utcnow().isoformat(),
        'models': list(combined_models.values())
    }
    
    try:
        with open(combined_file, 'w', encoding='utf-8') as f:
            json.dump(combined_data, f, ensure_ascii=False, indent=2)
        print(f"综合版本更新完成：")
        print(f"- 新增模型：{updated_count}")
        print(f"- 跳过重复：{skipped_count}")
        print(f"- 总模型数：{len(combined_models)}")
    except Exception as e:
        print(f"保存综合版本文件时出错: {e}")

def update_models_file():
    print("开始更新模型详细信息...")
    
    try:
        with open('public/data/ollama-models0.json', 'r', encoding='utf-8') as f:
            base_data = json.load(f)
    except Exception as e:
        print(f"读取模型列表文件时出错: {e}")
        return
    
    # 加载今天已处理的结果
    existing_models, processed_models = load_existing_results()
    print(f"发现已处理的模型数量: {len(processed_models)}")
    
    chrome_options = Options()
    chrome_options.add_argument('--headless')  # 添加无头模式
    chrome_options.add_argument('--disable-gpu')
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--disable-dev-shm-usage')
    chrome_options.add_argument('--user-data-dir=/tmp/chrome-data-detail')  # 使用不同的用户数据目录
    
    try:
        driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)
        
        updated_models = list(existing_models)  # 使用已存在的结果初始化
        total_models = len(base_data['models'])
        
        for i, model in enumerate(base_data['models'], 1):
            if model['name'] in processed_models:
                print(f"\n跳过已处理的模型 {i}/{total_models}: {model['name']}")
                continue
                
            print(f"\n处理模型 {i}/{total_models}: {model['name']}")
            
            details = parse_model_details(driver, model['name'])
            if details:
                model_info = {
                    'name': model['name'],
                    'fullName': model['fullName'],
                    'description': details['description'],
                    'modelSize': details['defaultSize'],
                    'tags': [size['size'] for size in details['parameterVersions']],
                    'downloads': details['downloads'],
                    'lastUpdated': details['lastUpdated'],
                    'runCommand': f"ollama run {model['name']}",
                    'parameterVersions': details['parameterVersions'],
                    'defaultSize': details['defaultSize'],
                    'defaultDiskSize': details['defaultDiskSize']
                }
                updated_models.append(model_info)
                print(f"成功获取 {model['name']} 的详细信息")
                
                # 每处理完一个模型就保存一次结果
                data = {
                    'lastUpdated': datetime.utcnow().isoformat(),
                    'models': updated_models
                }
                with open(get_today_filename(), 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                print(f"已保存当前进度，共 {len(updated_models)} 个模型")
            else:
                print(f"跳过模型 {model['name']}")
            
            time.sleep(3)
        
        driver.quit()
        
        print(f"\n更新完成，共处理 {len(updated_models)} 个模型")
        
        # 在完成当天的更新后，更新综合版本
        update_combined_file()
        
    except Exception as e:
        print(f"处理过程中出错: {e}")
        if 'driver' in locals():
            driver.quit()

if __name__ == '__main__':
    update_models_file() 