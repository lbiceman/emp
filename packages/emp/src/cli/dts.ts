import https from 'https'
import fs from 'fs-extra'
import path from 'path'
import axios from 'axios'
import store from 'src/helper/store'
import logger from 'src/helper/logger'
import {createSpinner} from 'nanospinner'
class Dts {
  /**
   * 创建目录
   * @param {*} filePath
   */
  dirCache: any = {}
  mkdir(filePath: string) {
    const arr = filePath.split(path.sep)
    let dir = arr[0]
    for (let i = 1; i < arr.length; i++) {
      if (!this.dirCache[dir] && !fs.existsSync(dir) && dir !== '') {
        this.dirCache[dir] = true
        fs.mkdirSync(dir)
      }
      dir = dir + '/' + arr[i]
    }
    fs.writeFileSync(filePath, '')
  }

  async downloadFileAsync(
    uri: string,
    backupUri: string,
    filePath: string,
    fileName: string,
    alias: string,
    baseName: string,
  ) {
    const spinner = createSpinner().start()
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false,
    })
    axios.defaults.httpsAgent = httpsAgent
    try {
      let useBackup = false
      let originData = ''
      spinner.start({text: `[download ${fileName}]:${uri}\n`})
      const res = await axios.get(uri)
      originData = res?.data

      if (originData.indexOf('declare') === -1) {
        const backupRes = await axios.get(backupUri)
        if (backupRes?.data.indexOf('declare') != -1) {
          originData = backupRes?.data
          useBackup = true
        }
      }

      if (originData.indexOf('declare') === -1) {
        spinner.error({text: `${fileName} not found .d.ts`})
        return
      }

      let newData = ''
      // 替换 remote 别名
      const regSingleQuote = new RegExp(`'${baseName}`, 'g')
      const regDoubleQuote = new RegExp(`"${baseName}`, 'g')
      newData = originData.replace(regSingleQuote, `'${alias}`)
      newData = newData.replace(regDoubleQuote, `"${alias}`)
      await fs.ensureDir(filePath)
      const fullPath = path.resolve(filePath, fileName)
      this.mkdir(fullPath)
      fs.writeFileSync(fullPath, newData, 'utf8')
      spinner.success({text: `[${fileName}]:\n     ${fullPath}\n`})
      if (useBackup) {
        logger.warn(`[You are using emp 1.x declaration file ${fileName}]:${backupUri}\n`)
      }
    } catch (error) {
      logger.error(error)
      spinner.error({text: `${fileName} not found .d.ts`})
      // logger.error(`${uri} --> network error`)
    }
  }
  /**
   * 下载 remote 的 d.ts
   */
  async downloadDts() {
    const remotes = store.empShare.moduleFederation.remotes
    const dtsPath = store.config.dtsPath
    if (remotes) {
      for (const [key, value] of Object.entries(remotes)) {
        if (key && value) {
          const splitIndex = value.indexOf('@')
          if (splitIndex === -1) throw Error(`[emp dts] invaild remotes url: ${value}`)
          const baseName = value.substr(0, splitIndex)
          const baseUrl = value.substr(splitIndex + 1)
          const {outDir, typesOutDir} = store.config.build
          //可以独立设置 dtsPath，默认路径是 typesOutDir
          const dtsFilePath = dtsPath[key] ? dtsPath[key] : `${typesOutDir.replace(outDir, '')}/index.d.ts`
          const dtsUrl = baseUrl.replace('/emp.js', dtsFilePath)
          // 用于兼容 EMP 1.x 类型下载
          const backupDtsUrl = baseUrl.replace('/emp.js', '/index.d.ts')
          await this.downloadFileAsync(dtsUrl, backupDtsUrl, store.config.typingsPath, `${key}.d.ts`, key, baseName)
        }
      }
    } else {
      logger.warn('No found remotes')
    }
  }

  async setup() {
    await this.downloadDts()
  }
}
export default new Dts()
