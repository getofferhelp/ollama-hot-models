import subprocess
import time
import os
import sys
import venv

# 在 allinone.py 开头添加
def ensure_directories():
    """确保必要的目录存在"""
    os.makedirs('public/data', exist_ok=True)

def create_and_activate_venv():
    """
    创建并激活虚拟环境
    """
    current_dir = os.path.dirname(os.path.abspath(__file__))
    venv_path = os.path.join(current_dir, 'venv')
    
    if not os.path.exists(venv_path):
        print("创建虚拟环境...")
        venv.create(venv_path, with_pip=True)
    
    # 获取虚拟环境中的 Python 解释器路径
    if sys.platform == 'win32':
        python_path = os.path.join(venv_path, 'Scripts', 'python.exe')
    else:
        python_path = os.path.join(venv_path, 'bin', 'python')
    
    return python_path

def install_dependencies(python_path):
    """
    在虚拟环境中检查并安装必要的依赖包
    """
    dependencies = ['selenium', 'webdriver-manager']
    
    try:
        for package in dependencies:
            print(f"正在安装 {package}...")
            subprocess.run([python_path, '-m', 'pip', 'install', package], check=True)
            print(f"{package} 安装成功")
        return True
    except subprocess.CalledProcessError as e:
        print(f"安装依赖失败: {e}")
        return False

def run_update_scripts():
    """
    按顺序执行update_models0.py和update_models.py
    """
    print("开始执行更新流程...")
    
        # 确保目录存在
    ensure_directories()

    # 创建并获取虚拟环境的 Python 解释器路径
    python_path = create_and_activate_venv()
    
    # 安装依赖
    if not install_dependencies(python_path):
        print("依赖安装失败，程序退出")
        return
    
    # 获取当前脚本所在目录
    # ？？？ current_dir = os.path.dirname(os.path.abspath(__file__))
    
    try:
        # 使用虚拟环境的 Python 执行脚本
        print("\n=== 开始执行 update_models0.py ===")
        subprocess.run([python_path, 'src/update_models0.py'], check=True)
        print("update_models0.py 执行完成")
        
        # 等待几秒确保文件写入完成
        time.sleep(3)
        
        print("\n=== 开始执行 update_models.py ===")
        subprocess.run([python_path, 'src/update_models.py'], check=True)
        print("update_models.py 执行完成")
        
        print("\n全部更新完成!")
        
    except subprocess.CalledProcessError as e:
        print(f"\n错误: 执行脚本时发生错误: {e}")
    except Exception as e:
        print(f"\n错误: 发生未预期的错误: {e}")

if __name__ == '__main__':
    run_update_scripts() 