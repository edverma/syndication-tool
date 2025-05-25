import { Tool, PlatformConfig } from '../models';

export interface PlatformAdapter {
  readonly platform: string;
  readonly config: PlatformConfig;

  authenticate(): Promise<boolean>;
  isAuthenticated(): Promise<boolean>;
  validateConfig(): Promise<{ isValid: boolean; errors: string[] }>;
  
  formatContent(tool: Tool): Promise<FormattedContent>;
  publish(tool: Tool, content: FormattedContent): Promise<PublicationResult>;
  
  getPostUrl?(postId: string): string;
  deletePost?(postId: string): Promise<boolean>;
  updatePost?(postId: string, content: FormattedContent): Promise<PublicationResult>;
}

export interface FormattedContent {
  title: string;
  body: string;
  url?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface PublicationResult {
  success: boolean;
  postId?: string;
  url?: string;
  error?: string;
  retryable?: boolean;
}

export interface RateLimiter {
  canMakeRequest(): Promise<boolean>;
  recordRequest(): void;
  getWaitTime(): Promise<number>;
  waitIfNeeded(): Promise<void>;
}

export abstract class BasePlatformAdapter implements PlatformAdapter {
  abstract readonly platform: string;
  protected rateLimiter: RateLimiter;

  constructor(public readonly config: PlatformConfig) {
    this.rateLimiter = new TokenBucketRateLimiter(config.rateLimit);
  }

  abstract authenticate(): Promise<boolean>;
  abstract isAuthenticated(): Promise<boolean>;
  abstract formatContent(tool: Tool): Promise<FormattedContent>;
  abstract publish(tool: Tool, content: FormattedContent): Promise<PublicationResult>;

  async validateConfig(): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!this.config.enabled) {
      return { isValid: true, errors: [] };
    }

    if (!this.config.baseUrl) {
      errors.push('Base URL is required');
    }

    if (!this.config.auth) {
      errors.push('Authentication configuration is required');
    }

    return { isValid: errors.length === 0, errors };
  }

  protected async retryWithExponentialBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = this.config.retryConfig.maxRetries,
    baseDelay: number = this.config.retryConfig.baseDelay
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = Math.min(
            baseDelay * Math.pow(this.config.retryConfig.backoffMultiplier, attempt - 1),
            this.config.retryConfig.maxDelay
          );
          await this.sleep(delay);
        }

        await this.rateLimiter.waitIfNeeded();
        const result = await operation();
        this.rateLimiter.recordRequest();
        return result;
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxRetries || !this.isRetryableError(error)) {
          break;
        }
      }
    }

    throw lastError!;
  }

  protected isRetryableError(error: any): boolean {
    if (error.response?.status) {
      const status = error.response.status;
      return status >= 500 || status === 429 || status === 408;
    }
    
    return error.code === 'ECONNRESET' || 
           error.code === 'ETIMEDOUT' || 
           error.code === 'ENOTFOUND';
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected replaceTemplateVariables(template: string, tool: Tool): string {
    return template
      .replace(/\{name\}/g, tool.name)
      .replace(/\{shortDescription\}/g, tool.shortDescription)
      .replace(/\{url\}/g, tool.url)
      .replace(/\{version\}/g, tool.version || '')
      .replace(/\{timestamp\}/g, new Date().toISOString())
      .replace(/\{date\}/g, new Date().toLocaleDateString())
      .replace(/\{tags\}/g, tool.tags?.join(', ') || '');
  }
}

class TokenBucketRateLimiter implements RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;

  constructor(private config: { requestsPerMinute: number; burstLimit: number }) {
    this.maxTokens = config.burstLimit;
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
    this.refillRate = config.requestsPerMinute / 60000; // tokens per millisecond
  }

  async canMakeRequest(): Promise<boolean> {
    this.refillTokens();
    return this.tokens >= 1;
  }

  recordRequest(): void {
    if (this.tokens >= 1) {
      this.tokens -= 1;
    }
  }

  async getWaitTime(): Promise<number> {
    this.refillTokens();
    if (this.tokens >= 1) {
      return 0;
    }
    
    return Math.ceil((1 - this.tokens) / this.refillRate);
  }

  async waitIfNeeded(): Promise<void> {
    const waitTime = await this.getWaitTime();
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  private refillTokens(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const tokensToAdd = timePassed * this.refillRate;
    
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}