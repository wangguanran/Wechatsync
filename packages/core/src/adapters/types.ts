import type { Article, AuthResult, SyncResult, PlatformMeta } from '../types'
import type { RuntimeInterface } from '../runtime/interface'

/**
 * 输出格式类型
 */
export type OutputFormat = 'html' | 'markdown'

/**
 * 图片上传进度回调
 */
export type ImageProgressCallback = (current: number, total: number) => void

/**
 * 发布选项
 */
export interface PublishOptions {
  /** 只保存草稿，不发布 */
  draftOnly?: boolean
  /** 图片上传进度回调 */
  onImageProgress?: ImageProgressCallback
}

/**
 * 平台适配器接口
 */
export interface PlatformAdapter {
  /** 平台元信息 */
  readonly meta: PlatformMeta

  /** 初始化适配器 */
  init(runtime: RuntimeInterface): Promise<void>

  /** 检查认证状态 */
  checkAuth(): Promise<AuthResult>

  /** 发布文章 */
  publish(article: Article, options?: PublishOptions): Promise<SyncResult>

  /** 上传图片 (如果支持) */
  uploadImage?(file: Blob, filename?: string): Promise<string>

  /** 获取分类列表 (如果支持) */
  getCategories?(): Promise<Category[]>

  /** 获取草稿列表 (如果支持) */
  getDrafts?(): Promise<Draft[]>

  /** 更新文章 (如果支持) */
  update?(postId: string, article: Article): Promise<SyncResult>

  /** 删除文章 (如果支持) */
  delete?(postId: string): Promise<void>
}

/**
 * 分类
 */
export interface Category {
  id: string
  name: string
  parentId?: string
}

/**
 * 草稿
 */
export interface Draft {
  id: string
  title: string
  updatedAt: number
}

/**
 * 适配器注册项
 */
export interface AdapterRegistryEntry {
  meta: PlatformMeta
  factory: (runtime: RuntimeInterface) => PlatformAdapter
}
