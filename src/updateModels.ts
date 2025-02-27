import { chromium } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'

interface ModelVersion {
  size: string
  diskSize: string
}

interface CompleteModel {
  name: string
  fullName: string
  description: string
  modelSize: string
  tags: string[]
  downloads: string
  lastUpdated: string
  runCommand: string
  parameterVersions: ModelVersion[]
  defaultSize: string
  defaultDiskSize: string
}

interface ModelsData {
  lastUpdated: string
  models: CompleteModel[]
}

async function fetchModelList(): Promise<CompleteModel[]> {
  console.log('开始获取模型列表...')
  const browser = await chromium.launch()
  const models: CompleteModel[] = []
  
  try {
    const page = await browser.newPage()
    
    // 设置更长的超时时间
    page.setDefaultTimeout(30000)
    
    // 访问模型列表页面
    await page.goto('https://ollama.com/library', {
      waitUntil: 'networkidle'
    })
    
    // 等待模型列表加载
    await page.waitForSelector('a[href^="/library/"]')
    
    // 获取所有模型链接
    const modelLinks = await page.$$('a[href^="/library/"]')
    
    for (const link of modelLinks) {
      try {
        const href = await link.getAttribute('href')
        const name = href?.split('/library/')[1]
        if (!name) continue
        
        // 创建新页面访问详情
        const detailPage = await browser.newPage()
        try {
          console.log(`正在获取模型 ${name} 的详细信息...`)
          
          // 访问模型详情页
          await detailPage.goto(`https://ollama.com/library/${name}`, {
            waitUntil: 'networkidle'
          })
          
          // 等待页面加载完成
          await detailPage.waitForLoadState('domcontentloaded')
          
          // 提取模型信息
          const model = await detailPage.evaluate((modelName) => {
            const text = document.body.innerText
            const lines = text.split('\n').map(line => line.trim()).filter(Boolean)
            
            // 获取描述（在模型名称后的第一段长文本）
            let description = ''
            for (let i = 0; i < lines.length; i++) {
              if (lines[i] === modelName && i + 1 < lines.length) {
                description = lines[i + 1]
                break
              }
            }
            
            // 获取下载量
            let downloads = '0'
            const downloadsMatch = text.match(/(\d+(?:\.\d+)?[KMB]?)\s*Pulls/)
            if (downloadsMatch) {
              downloads = downloadsMatch[1]
            }
            
            // 获取更新时间
            let lastUpdated = 'unknown'
            const timeMatch = text.match(/(\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago)/)
            if (timeMatch) {
              lastUpdated = timeMatch[1]
            }
            
            // 获取参数版本
            const parameterVersions: ModelVersion[] = []
            const versionMatches = text.matchAll(/(\d+(?:\.\d+)?[bB]|\d+x\d+[bB])\s+(\d+(?:\.\d+)?[KMGT]B)/g)
            
            for (const match of Array.from(versionMatches)) {
              const size = match[1].toLowerCase()
              const diskSize = match[2]
              parameterVersions.push({ size, diskSize })
            }
            
            // 如果没有找到参数版本，尝试从其他地方获取
            if (parameterVersions.length === 0) {
              const sizeMatch = text.match(/(\d+(?:\.\d+)?[bB]|\d+x\d+[bB])/)
              if (sizeMatch) {
                parameterVersions.push({
                  size: sizeMatch[1].toLowerCase(),
                  diskSize: '未知'
                })
              }
            }
            
            return {
              name: modelName,
              fullName: modelName,
              description,
              modelSize: parameterVersions[0]?.size || '',
              tags: parameterVersions.map(v => v.size),
              downloads,
              lastUpdated,
              runCommand: `ollama run ${modelName}`,
              parameterVersions,
              defaultSize: parameterVersions[0]?.size || '',
              defaultDiskSize: parameterVersions[0]?.diskSize || ''
            }
          }, name)
          
          models.push(model)
          console.log(`已获取模型信息: ${name}`)
          
        } catch (detailError) {
          console.error(`获取模型 ${name} 详情失败:`, detailError)
        } finally {
          await detailPage.close()
        }
        
        // 添加延时避免请求过快
        await new Promise(resolve => setTimeout(resolve, 3000))
        
      } catch (modelError) {
        console.error('处理模型链接失败:', modelError)
        continue
      }
    }
    
  } finally {
    await browser.close()
  }
  
  if (models.length === 0) {
    throw new Error('未能获取任何模型信息')
  }
  
  return models
}

async function updateModelsFile(models: CompleteModel[]) {
  const currentDate = new Date()
  const dateString = currentDate.toISOString().split('T')[0] // 格式: yyyy-mm-dd
  const dataDir = path.join(process.cwd(), 'public', 'data')
  
  // 确保数据目录存在
  await fs.mkdir(dataDir, { recursive: true })
  
  const currentFilePath = path.join(dataDir, 'ollama-models.json')
  const backupFilePath = path.join(dataDir, `ollama-models-${dateString}.json`)
  
  const data: ModelsData = {
    lastUpdated: currentDate.toISOString(),
    models
  }
  
  try {
    // 保存当天的备份文件
    await fs.writeFile(
      backupFilePath,
      JSON.stringify(data, null, 2),
      'utf-8'
    )
    console.log(`已创建备份文件: ${backupFilePath}`)
    
    // 保存最新版本
    await fs.writeFile(
      currentFilePath,
      JSON.stringify(data, null, 2),
      'utf-8'
    )
    console.log(`已更新最新文件: ${currentFilePath}`)
    
  } catch (error) {
    console.error('保存文件失败:', error)
    throw error
  }
}

async function main() {
  try {
    const models = await fetchModelList()
    await updateModelsFile(models)
    console.log('更新完成!')
  } catch (error) {
    console.error('更新失败:', error)
    process.exit(1)
  }
}

// 使用 ESM 方式检查是否为直接运行
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export { fetchModelList, updateModelsFile } 