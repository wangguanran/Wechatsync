/**
 * 51CTO 适配器
 * https://blog.51cto.com
 */
import { CodeAdapter, ImageUploadResult } from '../code-adapter'
import type { Article, AuthResult, SyncResult, PlatformMeta } from '../../types'
export class Cto51Adapter extends CodeAdapter {
  meta: PlatformMeta = {
    id: '51cto',
    name: '51CTO',
    icon: 'https://blog.51cto.com/favicon.ico',
    homepage: 'https://blog.51cto.com/blogger/publish',
    capabilities: ['article', 'draft', 'image_upload'],
  }

  private csrf: string | null = null
  private uploadSign: string | null = null

  /**
   * 检查登录状态
   */
  async checkAuth(): Promise<AuthResult> {
    try {
      const response = await this.runtime.fetch('https://blog.51cto.com/blogger/publish', {
        credentials: 'include',
      })
      const html = await response.text()

      // 解析页面获取用户信息
      const imgMatch = html.match(/<li class="more user">\s*<a[^>]*href="([^"]+)"[^>]*>\s*<img[^>]*src="([^"]+)"/)
      if (!imgMatch) {
        return { isAuthenticated: false, error: '未登录' }
      }

      const userLink = imgMatch[1]
      const avatar = imgMatch[2]
      const uid = userLink.split('/').filter(Boolean).pop() || ''

      // 获取 csrf token
      const csrfMatch = html.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/)
      if (csrfMatch) {
        this.csrf = csrfMatch[1]
      }

      // 获取 upload sign
      const signMatch = html.match(/var\s+sign\s*=\s*'([^']+)'/)
      if (signMatch) {
        this.uploadSign = signMatch[1]
      }

      return {
        isAuthenticated: true,
        userId: uid,
        username: uid,
        avatar: avatar,
      }
    } catch (error) {
      return { isAuthenticated: false, error: (error as Error).message }
    }
  }

  /**
   * 上传图片
   */
  async uploadImageByUrl(url: string): Promise<ImageUploadResult> {
    // 确保有 uploadSign
    if (!this.uploadSign) {
      await this.checkAuth()
    }

    // 下载图片
    const imageResponse = await this.runtime.fetch(url)
    const blob = await imageResponse.blob()

    // 构建 FormData
    const formData = new FormData()
    const filename = `${Date.now()}.jpg`
    const file = new File([blob], filename, { type: blob.type || 'image/jpeg' })

    formData.append('sign', this.uploadSign || '')
    formData.append('file', file, filename)
    formData.append('type', file.type)
    formData.append('id', 'WU_FILE_1')
    formData.append('fileid', `uploadm-${Math.floor(Math.random() * 1000000)}`)
    formData.append('lastModifiedDate', new Date().toString())
    formData.append('size', String(file.size))

    const response = await this.runtime.fetch(
      'https://upload.51cto.com/index.php?c=upload&m=upimg&orig=b',
      {
        method: 'POST',
        credentials: 'include',
        body: formData,
      }
    )

    const res = await response.json()

    if (res.status === false) {
      throw new Error('图片上传失败')
    }

    return { url: `https://s4.51cto.com/${res.data}` }
  }

  /**
   * 发布文章
   */
  async publish(article: Article): Promise<SyncResult> {
    const now = Date.now()
    try {
      // 确保已获取 csrf
      if (!this.csrf) {
        const auth = await this.checkAuth()
        if (!auth.isAuthenticated) {
          throw new Error('未登录')
        }
      }

      // 处理图片
      let content = article.html || article.markdown || ''
      content = await this.processImages(content, (src) => this.uploadImageByUrl(src))

      // 构建请求数据 - 支持 markdown
      const postData: Record<string, string> = {
        title: article.title,
        copy_code: '1',
        _csrf: this.csrf || '',
      }

      if (article.markdown) {
        postData.content = article.markdown
        postData.is_old = '0'
      } else {
        postData.content = content
        postData.is_old = '1'
        postData.blog_type = ''
        postData.pid = ''
        postData.cate_id = ''
        postData.custom_id = ''
        postData.tag = ''
        postData.abstract = ''
        postData.is_hide = '0'
        postData.did = ''
        postData.blog_id = ''
      }

      const response = await this.runtime.fetch('https://blog.51cto.com/blogger/draft', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(postData),
      })

      const res = await response.json()

      if (!res.data) {
        throw new Error(res.message || '发布失败')
      }

      return {
        platform: this.meta.id,
        success: true,
        postId: res.data.did,
        postUrl: `https://blog.51cto.com/blogger/draft/${res.data.did}`,
        draftOnly: true,
        timestamp: now,
      }
    } catch (error) {
      return {
        platform: this.meta.id,
        success: false,
        error: (error as Error).message,
        timestamp: now,
      }
    }
  }
}
