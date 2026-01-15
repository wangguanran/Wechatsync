/**
 * 思否 (Segmentfault) 适配器
 * https://segmentfault.com
 */
import { CodeAdapter, ImageUploadResult } from '../code-adapter'
import type { Article, AuthResult, SyncResult, PlatformMeta } from '../../types'
export class SegmentfaultAdapter extends CodeAdapter {
  meta: PlatformMeta = {
    id: 'segmentfault',
    name: '思否',
    icon: 'https://segmentfault.com/favicon.ico',
    homepage: 'https://segmentfault.com/user/draft',
    capabilities: ['article', 'draft', 'image_upload'],
  }

  private sessionToken: string | null = null
  private headerRuleId: string | null = null

  /**
   * 添加 Header 规则
   */
  private async addHeaderRules(): Promise<void> {
    if (!this.runtime.headerRules) return

    this.headerRuleId = await this.runtime.headerRules.add({
      urlFilter: '*://gateway.segmentfault.com/*',
      headers: {
        Origin: 'https://segmentfault.com',
        Referer: 'https://segmentfault.com/',
      },
    })
  }

  /**
   * 移除 Header 规则
   */
  private async removeHeaderRules(): Promise<void> {
    if (!this.runtime.headerRules) return

    if (this.headerRuleId) {
      await this.runtime.headerRules.remove(this.headerRuleId)
      this.headerRuleId = null
    }
  }

  /**
   * 检查登录状态
   */
  async checkAuth(): Promise<AuthResult> {
    try {
      const response = await this.runtime.fetch('https://segmentfault.com/user/settings', {
        credentials: 'include',
      })
      const html = await response.text()

      // 使用正则解析用户头像和 ID (Service Worker 无法使用 DOMParser)
      // 匹配 class="user-avatar" 的元素，提取 href 和 style
      const avatarLinkMatch = html.match(/class="[^"]*user-avatar[^"]*"[^>]*href="([^"]+)"[^>]*style="([^"]*)"/i)
        || html.match(/href="([^"]+)"[^>]*class="[^"]*user-avatar[^"]*"[^>]*style="([^"]*)"/i)

      if (!avatarLinkMatch) {
        return { isAuthenticated: false, error: '未登录' }
      }

      const href = avatarLinkMatch[1] || ''
      const uid = href.split('/').pop() || ''

      // 提取头像 URL (background-image: url("..."))
      const style = avatarLinkMatch[2] || ''
      const avatarMatch = style.match(/url\(&quot;([^&]+)&quot;\)/) || style.match(/url\("([^"]+)"\)/)
      const avatar = avatarMatch ? avatarMatch[1] : undefined

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
   * 获取 session token
   */
  private async getSessionToken(): Promise<string> {
    const response = await this.runtime.fetch('https://segmentfault.com/write', {
      credentials: 'include',
    })
    const html = await response.text()

    const markStr = 'window.g_initialProps = '
    const authIndex = html.indexOf(markStr)
    if (authIndex === -1) {
      throw new Error('获取 session token 失败')
    }

    // 提取 JSON 配置
    const endIndex = html.indexOf(';\n\t</script>', authIndex)
    if (endIndex === -1) {
      throw new Error('解析 session token 失败')
    }

    const configStr = html.substring(authIndex + markStr.length, endIndex)

    try {
      const config = JSON.parse(configStr)
      const token = config?.global?.sessionInfo?.key
      if (!token) {
        throw new Error('session token 为空')
      }
      return token
    } catch (e) {
      throw new Error('解析 session token 失败: ' + (e as Error).message)
    }
  }

  /**
   * 上传图片
   */
  async uploadImageByUrl(url: string): Promise<ImageUploadResult> {
    // 下载图片
    const imageResponse = await this.runtime.fetch(url)
    const blob = await imageResponse.blob()

    // 构建 FormData
    const formData = new FormData()
    formData.append('image', blob)

    const response = await this.runtime.fetch(
      'https://segmentfault.com/img/upload/image',
      {
        method: 'POST',
        credentials: 'include',
        body: formData,
      }
    )

    const res = await response.json()

    // 返回格式: [0, url, id] 或 [1, error_message]
    if (res[0] === 1) {
      throw new Error(res[1] || '图片上传失败')
    }

    // res[2] 是图片 ID
    const imageUrl = res[1] || `https://image-static.segmentfault.com/${res[2]}`
    return { url: imageUrl }
  }

  /**
   * 发布文章
   */
  async publish(article: Article): Promise<SyncResult> {
    const now = Date.now()
    try {
      await this.addHeaderRules()

      // 获取 session token
      this.sessionToken = await this.getSessionToken()

      // 处理图片
      let content = article.html || article.markdown || ''
      content = await this.processImages(content, (src) => this.uploadImageByUrl(src))

      // 思否支持 markdown，优先使用
      const markdown = article.markdown || content

      const postData = {
        title: article.title,
        tags: [],
        text: markdown,
        object_id: '',
        type: 'article',
      }

      const response = await this.runtime.fetch('https://gateway.segmentfault.com/draft', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          token: this.sessionToken,
          accept: '*/*',
        },
        body: JSON.stringify(postData),
      })

      const res = await response.json()
      await this.removeHeaderRules()

      if (!res.id) {
        throw new Error('发布失败')
      }

      return {
        platform: this.meta.id,
        success: true,
        postId: res.id,
        postUrl: `https://segmentfault.com/write?draftId=${res.id}`,
        draftOnly: true,
        timestamp: now,
      }
    } catch (error) {
      await this.removeHeaderRules()
      return {
        platform: this.meta.id,
        success: false,
        error: (error as Error).message,
        timestamp: now,
      }
    }
  }
}
