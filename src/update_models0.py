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
import os

def get_today_filename():
    """获取今天的文件名"""
    today = datetime.now().strftime('%Y%m%d')
    return f'public/data/ollama-models0-{today}.json'

def fetch_models():
    """只获取模型名称列表"""
    print("正在获取模型列表...")
    models = []
    
    chrome_options = Options()
    chrome_options.add_argument('--headless')  # 在 GitHub Actions 中必须使用无头模式
    chrome_options.add_argument('--disable-gpu')
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--disable-dev-shm-usage')
    chrome_options.add_argument('--user-data-dir=/tmp/chrome-data')  # 添加唯一的用户数据目录
    
    try:
        driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)
        driver.get('https://ollama.com/library?sort=popular')
        
        time.sleep(5)  # 等待页面加载
        
        # 获取所有模型卡片
        model_cards = driver.find_elements(By.CSS_SELECTOR, 'a[href^="/library/"]')
        print(f"找到 {len(model_cards)} 个模型")
        
        for card in model_cards:
            try:
                # 获取模型名称（卡片第一行文本）
                model_name = card.text.split('\n')[0].strip()
                print(f"找到模型: {model_name}")
                
                models.append({
                    'name': model_name,
                    'fullName': model_name
                })
                
            except Exception as e:
                print(f"处理模型时出错: {e}")
                continue
        
        driver.quit()
        return models
        
    except Exception as e:
        print(f"获取模型列表时出错: {e}")
        if 'driver' in locals():
            driver.quit()
        return []

def update_models_file():
    print("开始获取模型列表...")
    models = fetch_models()
    print(f"获取到 {len(models)} 个模型")
    
    data = {
        'lastUpdated': datetime.utcnow().isoformat(),
        'models': models
    }
    
    # 保存带日期的版本
    dated_filename = get_today_filename()
    with open(dated_filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"已保存带日期的版本: {dated_filename}")
    
    # 保存不带日期的版本（替换原有文件）
    base_filename = 'public/data/ollama-models0.json'
    with open(base_filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"已保存基础版本: {base_filename}")
    
    print(f"更新完成，共保存 {len(models)} 个模型")

if __name__ == '__main__':
    update_models_file() 