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
    page.setDefaultTimeout(30000)
    
    await page.goto('https://ollama.com/library', {
      waitUntil: 'networkidle'
    })
    
    await page.waitForSelector('a[href^="/library/"]')
    const modelLinks = await page.$$('a[href^="/library/"]')
    
    console.log(`\n找到 ${modelLinks.length} 个模型链接\n`)
    
    for (const [index, link] of modelLinks.entries()) {
      try {
        const href = await link.getAttribute('href')
        const name = href?.split('/library/')[1]
        if (!name) continue
        
        console.log(`\n===== 处理第 ${index + 1}/${modelLinks.length} 个模型: ${name} =====`)
        
        const detailPage = await browser.newPage()
        try {
          console.log(`访问页面: https://ollama.com/library/${name}`)
          
          await detailPage.goto(`https://ollama.com/library/${name}`, {
            waitUntil: 'networkidle'
          })
          
          await detailPage.waitForLoadState('domcontentloaded')
          
          // 获取模型信息
          const model = await detailPage.evaluate(async (modelName) => {
            // 获取基本信息
            const flexContainer = document.querySelector('.flex.flex-col')
            const text = flexContainer?.textContent || ''
            const lines = text.split('\n').map(line => line.trim()).filter(Boolean)
            
            // 获取描述
            let description = ''
            for (const line of lines) {
              if (line.length > 50 && !line.includes('Pulls') && !line.includes('ago')) {
                description = line
                break
              }
            }
            
            // 获取下载量和更新时间
            let downloads = '0'
            let lastUpdated = 'unknown'
            const downloadsMatch = text.match(/(\d+(?:\.\d+)?[KMB]?)\s*Pulls/)
            const timeMatch = text.match(/(\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago)/)
            if (downloadsMatch) downloads = downloadsMatch[1]
            if (timeMatch) lastUpdated = timeMatch[1]
            
            // 获取默认版本信息
            const defaultVersionElem = document.querySelector('button[name="tag"] .truncate')
            const defaultVersionText = defaultVersionElem?.textContent || ''
            const defaultMatch = defaultVersionText.match(/(\d+(?:\.\d+)?[bB]|\d+x\d+[bB])\s*\((\d+(?:\.\d+)?[KMGT]B)\)/)
            
            // 点击展开按钮获取所有版本
            const tagButton = document.querySelector('button[name="tag"]') as HTMLButtonElement
            if (tagButton) {
              tagButton.click()
            }
            
            // 等待下拉菜单出现
            await new Promise(resolve => setTimeout(resolve, 500))
            
            // 获取所有版本信息
            const parameterVersions: ModelVersion[] = []
            const tagElements = document.querySelectorAll('#tags-nav a')
            
            for (const elem of tagElements) {
              const text = elem.textContent || ''
              const match = text.match(/(\d+(?:\.\d+)?[bB]|\d+x\d+[bB])\s*\((\d+(?:\.\d+)?[KMGT]B)\)/)
              if (match) {
                parameterVersions.push({
                  size: match[1].toLowerCase(),
                  diskSize: match[2]
                })
              }
            })
            
            // 如果没有找到版本信息，使用默认版本
            if (parameterVersions.length === 0 && defaultMatch) {
              parameterVersions.push({
                size: defaultMatch[1].toLowerCase(),
                diskSize: defaultMatch[2]
              })
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
          
          // 打印详细的模型信息
          console.log('\n获取到的模型信息:')
          console.log(JSON.stringify(model, null, 2))
          console.log('\n参数版本数量:', model.parameterVersions.length)
          console.log('描述长度:', model.description.length)
          console.log('下载量:', model.downloads)
          console.log('最后更新:', model.lastUpdated)
          
          if (!model.description || model.parameterVersions.length === 0) {
            console.warn('警告: 可能存在数据不完整的情况!')
          }
          
          models.push(model)
          
        } catch (detailError) {
          console.error(`获取模型 ${name} 详情失败:`, detailError)
        } finally {
          await detailPage.close()
        }
        
        await new Promise(resolve => setTimeout(resolve, 3000))
        
      } catch (modelError) {
        console.error('处理模型链接失败:', modelError)
        continue
      }
    }
    
  } finally {
    await browser.close()
  }
  
  console.log(`\n===== 获取完成 =====`)
  console.log(`成功获取 ${models.length} 个模型信息`)
  
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