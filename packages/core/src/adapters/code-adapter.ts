/**
 * 代码适配器基类
 * 提供核心能力，平台只需关注差异化部分
 */
import type { Article, AuthResult, SyncResult, PlatformMeta } from '../types'
import type { RuntimeInterface } from '../runtime/interface'
import type { PlatformAdapter, PublishOptions } from './types'
import { createLogger } from '../lib/logger'

const logger = createLogger('CodeAdapter')

/**
 * 图片上传结果
 */
export interface ImageUploadResult {
  /** 新的图片 URL */
  url: string
  /** 额外的 img 属性 */
  attrs?: Record<string, string | number>
}

/**
 * 图片处理选项
 */
export interface ImageProcessOptions {
  /** 跳过匹配这些模式的图片 */
  skipPatterns?: string[]
  /** 进度回调 */
  onProgress?: (current: number, total: number) => void
  /** Blob 上传函数（用于处理 data URI 图片） */
  uploadBlobFn?: (blob: Blob, filename: string) => Promise<ImageUploadResult>
}

/**
 * 内容清理选项
 */
export interface CleanHtmlOptions {
  /** 移除链接标签，保留文字 */
  removeLinks?: boolean
  /** 移除 iframe */
  removeIframes?: boolean
  /** 移除 SVG 图片 */
  removeSvgImages?: boolean
  /** 移除指定标签 */
  removeTags?: string[]
  /** 移除指定属性 */
  removeAttrs?: string[]
}

/**
 * 代码适配器基类
 */
export abstract class CodeAdapter implements PlatformAdapter {
  abstract readonly meta: PlatformMeta
  protected runtime!: RuntimeInterface

  async init(runtime: RuntimeInterface): Promise<void> {
    this.runtime = runtime
  }

  // ============ 抽象方法，子类必须实现 ============

  abstract checkAuth(): Promise<AuthResult>
  abstract publish(article: Article, options?: PublishOptions): Promise<SyncResult>

  // ============ HTTP 请求能力 ============

  /**
   * GET 请求
   */
  protected async get<T = unknown>(url: string, headers?: Record<string, string>): Promise<T> {
    const response = await this.runtime.fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers,
    })
    return this.parseResponse<T>(response)
  }

  /**
   * POST 请求 (JSON)
   */
  protected async postJson<T = unknown>(
    url: string,
    data: Record<string, unknown>,
    headers?: Record<string, string>
  ): Promise<T> {
    const response = await this.runtime.fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(data),
    })
    return this.parseResponse<T>(response)
  }

  /**
   * POST 请求 (Form)
   */
  protected async postForm<T = unknown>(
    url: string,
    data: Record<string, string>,
    headers?: Record<string, string>
  ): Promise<T> {
    const response = await this.runtime.fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...headers,
      },
      body: new URLSearchParams(data),
    })
    return this.parseResponse<T>(response)
  }

  /**
   * POST 请求 (Multipart)
   */
  protected async postMultipart<T = unknown>(
    url: string,
    formData: FormData,
    headers?: Record<string, string>
  ): Promise<T> {
    const response = await this.runtime.fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: formData,
    })
    return this.parseResponse<T>(response)
  }

  /**
   * 解析响应
   */
  private async parseResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const text = await response.text()

    // 尝试解析 JSON
    try {
      return JSON.parse(text) as T
    } catch {
      return text as T
    }
  }

  // ============ 图片处理能力 ============

  /**
   * 处理文章图片 (使用正则，兼容 Service Worker)
   * 同时支持 HTML 和 Markdown 格式
   * - HTML: <img src="url" alt="text">
   * - Markdown: ![text](url)
   */
  protected async processImages(
    content: string,
    uploadFn: (src: string) => Promise<ImageUploadResult>,
    options?: ImageProcessOptions
  ): Promise<string> {
    const { skipPatterns = [], onProgress } = options || {}

    // 提取所有图片（HTML + Markdown）
    const matches: { full: string; src: string; alt?: string; type: 'html' | 'markdown' }[] = []

    // 1. HTML 格式: <img ... src="url" ...>
    const htmlImgRegex = /<img[^>]+src="([^"]+)"[^>]*>/gi
    let match
    while ((match = htmlImgRegex.exec(content)) !== null) {
      matches.push({ full: match[0], src: match[1], type: 'html' })
    }

    // 2. Markdown 格式: ![alt](url)
    const mdImgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g
    while ((match = mdImgRegex.exec(content)) !== null) {
      matches.push({ full: match[0], src: match[2], alt: match[1], type: 'markdown' })
    }

    if (matches.length === 0) {
      return content
    }

    logger.debug(`Found ${matches.length} images to process (HTML + Markdown)`)

    let result = content
    const uploadedMap = new Map<string, ImageUploadResult>()
    let processed = 0

    for (const { full, src, alt, type } of matches) {
      // 跳过空 src
      if (!src) continue

      // 跳过匹配的模式（但不跳过 data URI）
      if (!src.startsWith('data:')) {
        const shouldSkip = skipPatterns.some(pattern => src.includes(pattern))
        if (shouldSkip) {
          logger.debug(`Skipping matched pattern: ${src}`)
          continue
        }
      }

      processed++
      onProgress?.(processed, matches.length)

      try {
        // 检查是否已上传过
        let uploadResult = uploadedMap.get(src)

        if (!uploadResult) {
          logger.debug(`Uploading image ${processed}/${matches.length}: ${src.startsWith('data:') ? 'data URI' : src}`)
          // uploadFn 应该能处理 URL 和 data URI（通过 fetch）
          uploadResult = await uploadFn(src)
          uploadedMap.set(src, uploadResult)
        }

        // 根据格式构建替换内容
        let replacement: string
        if (type === 'html') {
          // HTML 格式
          replacement = `<img src="${uploadResult.url}"`
          if (uploadResult.attrs) {
            for (const [key, value] of Object.entries(uploadResult.attrs)) {
              replacement += ` ${key}="${value}"`
            }
          }
          replacement += ' />'
        } else {
          // Markdown 格式
          replacement = `![${alt || ''}](${uploadResult.url})`
        }

        // 替换原内容
        result = result.replace(full, replacement)

        logger.debug(`Image uploaded: ${uploadResult.url}`)
      } catch (error) {
        logger.error(`Failed to upload image: ${src}`, error)
        // 继续处理其他图片
      }

      // 避免请求过快
      await this.delay(300)
    }

    return result
  }

  /**
   * 上传图片（子类实现）
   * 默认实现抛出错误
   */
  protected async uploadImageByUrl(_src: string): Promise<ImageUploadResult> {
    throw new Error('uploadImageByUrl not implemented')
  }

  /**
   * 通过 Blob 上传图片（公开方法，实现 PlatformAdapter 接口）
   * 默认实现：转为 data URI，调用 uploadImageByUrl
   * 子类可以覆盖以提供更优的实现
   */
  async uploadImage(file: Blob, _filename?: string): Promise<string> {
    const dataUri = await this.blobToDataUri(file)
    const result = await this.uploadImageByUrl(dataUri)
    return result.url
  }

  /**
   * Blob 转 data URI
   */
  protected async blobToDataUri(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result
        if (typeof result === 'string') {
          resolve(result)
        } else {
          reject(new Error('Failed to read blob as data URI'))
        }
      }
      reader.onerror = () => reject(new Error('FileReader error'))
      reader.readAsDataURL(blob)
    })
  }

  /**
   * data URI 转 Blob
   */
  protected async dataUriToBlob(dataUri: string): Promise<Blob> {
    const response = await fetch(dataUri)
    return response.blob()
  }

  // ============ HTML 处理能力 ============

  /**
   * 清理 HTML 内容 (使用正则，兼容 Service Worker)
   */
  protected cleanHtml(content: string, options: CleanHtmlOptions = {}): string {
    let result = content

    // 移除链接标签，保留文字
    if (options.removeLinks) {
      result = result.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1')
    }

    // 移除 iframe
    if (options.removeIframes) {
      result = result.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
      result = result.replace(/<iframe[^>]*\/>/gi, '')
    }

    // 移除 SVG 图片
    if (options.removeSvgImages) {
      result = result.replace(/<img[^>]+src="[^"]*\.svg"[^>]*>/gi, '')
    }

    // 移除指定标签
    if (options.removeTags) {
      options.removeTags.forEach(tag => {
        const regex = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi')
        result = result.replace(regex, '')
        // 自闭合标签
        const selfClosing = new RegExp(`<${tag}[^>]*\\/?>`, 'gi')
        result = result.replace(selfClosing, '')
      })
    }

    // 移除指定属性
    if (options.removeAttrs) {
      options.removeAttrs.forEach(attr => {
        if (attr === 'data-*') {
          result = result.replace(/\s*data-[\w-]+="[^"]*"/gi, '')
        } else {
          const regex = new RegExp(`\\s*${attr}="[^"]*"`, 'gi')
          result = result.replace(regex, '')
        }
      })
    }

    return result
  }

  // ============ 预处理方法 ============

  /**
   * 处理代码块（类似旧版 processDocCode / CodeBlockToPlainText）
   * 将复杂的代码块 HTML 转换为简单的 <pre><code>...</code></pre> 格式
   */
  protected processCodeBlocks(content: string): string {
    // 匹配 <pre> 标签及其内容
    const preRegex = /<pre[^>]*>([\s\S]*?)<\/pre>/gi

    return content.replace(preRegex, (match, innerHtml) => {
      try {
        // 提取纯文本内容：移除所有 HTML 标签，保留文本
        const text = innerHtml
          // 先处理 <br> 和 </div> 等换行标签
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/div>/gi, '\n')
          .replace(/<\/p>/gi, '\n')
          .replace(/<\/li>/gi, '\n')
          // 移除所有其他 HTML 标签
          .replace(/<[^>]+>/g, '')
          // 解码 HTML 实体
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#039;/g, "'")
          .replace(/&nbsp;/g, ' ')
          // 移除首尾空白行
          .trim()

        // 重新转义 HTML（用于安全显示）
        const escapedText = text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;')

        return `<pre><code>${escapedText}</code></pre>`
      } catch (e) {
        console.error('[CodeAdapter] processCodeBlocks error:', e)
        return match // 出错时返回原内容
      }
    })
  }

  /**
   * 处理懒加载图片（类似旧版 makeImgVisible）
   * 将 data-src 属性复制到 src 属性
   */
  protected makeImgVisible(content: string): string {
    return content.replace(
      /<img([^>]*)data-src="([^"]+)"([^>]*)>/gi,
      (match, before, dataSrc, after) => {
        // 如果已有 src 且不为空，保持不变
        if (/src="[^"]+"/i.test(before + after)) {
          return match
        }
        return `<img${before}src="${dataSrc}" data-src="${dataSrc}"${after}>`
      }
    )
  }

  // ============ 工具方法 ============

  /**
   * 延迟
   */
  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 创建同步结果
   */
  protected createResult(success: boolean, data?: Partial<SyncResult>): SyncResult {
    return {
      platform: this.meta.id,
      success,
      timestamp: Date.now(),
      ...data,
    }
  }
}
