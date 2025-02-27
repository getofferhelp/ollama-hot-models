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
    await page.goto('https://ollama.com/library')
    
    // 等待模型列表加载
    await page.waitForSelector('a[href^="/library/"]')
    
    // 获取所有模型链接
    const modelLinks = await page.$$('a[href^="/library/"]')
    
    for (const link of modelLinks) {
      const href = await link.getAttribute('href')
      const name = href?.split('/library/')[1]
      if (!name) continue
      
      // 访问每个模型的详情页
      await page.goto(`https://ollama.com/library/${name}`)
      await page.waitForLoadState('networkidle')
      
      // 提取模型信息
      const model = await page.evaluate(() => {
        const text = document.body.innerText
        const lines = text.split('\n').map(line => line.trim())
        
        // 提取各种信息...
        const description = lines.find(line => line.length > 50) || ''
        const downloadsMatch = text.match(/(\d+(?:\.\d+)?[KMB]?) Pulls/)
        const lastUpdatedMatch = text.match(/(\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago)/)
        
        // 提取参数版本
        const versions: ModelVersion[] = []
        const sizeMatches = text.matchAll(/(\d+(?:\.\d+)?[bB])\s+(\d+(?:\.\d+)?[KMGT]B)/g)
        for (const match of Array.from(sizeMatches)) {
          versions.push({
            size: match[1].toLowerCase(),
            diskSize: match[2]
          })
        }
        
        return {
          name,
          fullName: name,
          description,
          modelSize: versions[0]?.size || '',
          tags: versions.map(v => v.size),
          downloads: downloadsMatch?.[1] || '0',
          lastUpdated: lastUpdatedMatch?.[1] || 'unknown',
          runCommand: `ollama run ${name}`,
          parameterVersions: versions,
          defaultSize: versions[0]?.size || '',
          defaultDiskSize: versions[0]?.diskSize || ''
        }
      })
      
      models.push(model)
      console.log(`已获取模型信息: ${name}`)
      
      // 添加延时避免请求过快
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
  } finally {
    await browser.close()
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

if (require.main === module) {
  main()
} 