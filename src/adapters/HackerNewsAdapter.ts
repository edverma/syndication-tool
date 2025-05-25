import axios, { AxiosInstance } from 'axios';
import { BasePlatformAdapter, FormattedContent, PlatformAdapter, PublicationResult } from './PlatformAdapter';
import { Tool, HackerNewsConfig } from '../models';
import { Logger } from '../utils';

// Removed unused interfaces to fix linting errors

export class HackerNewsAdapter extends BasePlatformAdapter implements PlatformAdapter {
  readonly platform = 'hackernews';
  private client: AxiosInstance;
  private logger: Logger;
  private readonly MAX_TITLE_LENGTH = 80;

  constructor(config: HackerNewsConfig) {
    super(config);
    this.logger = new Logger('HackerNewsAdapter');
    
    // HackerNews uses form submission, not JSON API
    this.client = axios.create({
      baseURL: config.baseUrl,
      headers: {
        'User-Agent': 'SyndicationTool/1.0.0',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 30000,
      withCredentials: true
    });
  }

  async authenticate(): Promise<boolean> {
    try {
      this.logger.debug('Validating HackerNews credentials');
      
      // HackerNews doesn't have a direct API authentication
      // We need to simulate login process
      const loginData = new URLSearchParams({
        acct: this.config.auth.token || '', // Username
        pw: this.config.auth.tokenSecret || '', // Password
        goto: 'news'
      });

      const response = await this.client.post('/login', loginData);
      
      // Check if login was successful by looking for redirect or session
      if (response.status === 200 && !response.data.includes('Bad login')) {
        this.logger.info('Successfully authenticated with HackerNews');
        return true;
      }
      
      return false;
    } catch (error) {
      this.logger.error('Failed to authenticate with HackerNews', error);
      return false;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      // Check if we can access submit page (requires authentication)
      const response = await this.client.get('/submit');
      return response.status === 200 && response.data.includes('submit');
    } catch (error) {
      this.logger.debug('HackerNews authentication check failed');
      return false;
    }
  }

  async formatContent(tool: Tool): Promise<FormattedContent> {
    const hnConfig = this.config as HackerNewsConfig;
    const settings = hnConfig.settings;

    // Use custom title template or default format
    let title = settings.titleTemplate 
      ? this.replaceTemplateVariables(settings.titleTemplate, tool)
      : this.createDefaultTitle(tool, settings.postType);

    title = this.sanitizeTitle(title);

    // Create appropriate content based on post type
    const body = this.createHackerNewsContent(tool, settings);

    return {
      title,
      body,
      url: settings.postType === 'story' ? tool.url : undefined,
      metadata: {
        postType: settings.postType,
        username: settings.username,
        includeDescription: settings.includeDescription,
        originalUrl: tool.url
      }
    };
  }

  async publish(tool: Tool, content: FormattedContent): Promise<PublicationResult> {
    try {
      this.logger.debug(`Publishing ${tool.name} to HackerNews`);

      // First, get the submit page to extract CSRF tokens
      const submitPageResponse = await this.client.get('/submit');
      const submitPage = submitPageResponse.data;
      
      // Extract fnid and fnop from the form (CSRF protection)
      const fnidMatch = submitPage.match(/name="fnid" value="([^"]+)"/);
      const fnopMatch = submitPage.match(/name="fnop" value="([^"]+)"/);
      
      if (!fnidMatch || !fnopMatch) {
        throw new Error('Could not extract CSRF tokens from submit form');
      }

      const submitData = new URLSearchParams({
        fnid: fnidMatch[1],
        fnop: fnopMatch[1],
        title: content.title,
        ...(content.url && { url: content.url }),
        ...(content.body && content.metadata?.postType !== 'story' && { text: content.body })
      });

      const response = await this.retryWithExponentialBackoff(async () => {
        return await this.client.post('/submit', submitData);
      });

      // HackerNews redirects on successful submission
      // The response should contain the new item ID in the location header or content
      let postId: string | undefined;
      let postUrl: string | undefined;

      if (response.headers.location) {
        const locationMatch = response.headers.location.match(/item\?id=(\d+)/);
        if (locationMatch) {
          postId = locationMatch[1];
          postUrl = `https://news.ycombinator.com/item?id=${postId}`;
        }
      }

      // If no redirect, try to extract from response body
      if (!postId && response.data) {
        const idMatch = response.data.match(/item\?id=(\d+)/);
        if (idMatch) {
          postId = idMatch[1];
          postUrl = `https://news.ycombinator.com/item?id=${postId}`;
        }
      }

      if (!postId) {
        // Check if submission was rejected
        if (response.data.includes('duplicate') || response.data.includes('already submitted')) {
          throw new Error('This URL has already been submitted to HackerNews');
        }
        throw new Error('Could not determine submission status from HackerNews response');
      }

      this.logger.info(`Successfully published to HackerNews: ${postUrl}`);

      return {
        success: true,
        postId,
        url: postUrl
      };
    } catch (error) {
      const errorMessage = this.extractErrorMessage(error);
      this.logger.error('Failed to publish to HackerNews:', error);
      
      return {
        success: false,
        error: errorMessage,
        retryable: this.isRetryableError(error)
      };
    }
  }

  private createDefaultTitle(tool: Tool, postType: string): string {
    switch (postType) {
      case 'ask':
        return `Ask HN: Has anyone used ${tool.name}?`;
      case 'show':
        return `Show HN: ${tool.name} - ${tool.shortDescription}`;
      case 'story':
      default:
        return `${tool.name}: ${tool.shortDescription}`;
    }
  }

  private createHackerNewsContent(tool: Tool, settings: HackerNewsConfig['settings']): string {
    if (settings.postType === 'story') {
      // For story posts, content goes in URL field, no text body typically
      return '';
    }

    let content = '';

    if (settings.postType === 'ask') {
      content = `I came across ${tool.name} and wanted to get the community's thoughts.\n\n`;
    } else if (settings.postType === 'show') {
      content = `I'd like to share ${tool.name} with the HN community.\n\n`;
    }

    if (settings.includeDescription && tool.longDescription) {
      content += `${tool.longDescription}\n\n`;
    }

    // Add key information
    content += `Key details:\n`;
    content += `• Website: ${tool.url}\n`;
    
    if (tool.githubUrl) {
      content += `• GitHub: ${tool.githubUrl}\n`;
    }
    
    if (tool.category && tool.category.length > 0) {
      content += `• Categories: ${tool.category.join(', ')}\n`;
    }

    if (tool.targetAudience && tool.targetAudience.length > 0) {
      content += `• Target audience: ${tool.targetAudience.join(', ')}\n`;
    }

    if (settings.postType === 'ask') {
      content += `\nHas anyone here used ${tool.name}? What has been your experience?`;
    } else if (settings.postType === 'show') {
      content += `\nI'd love to hear feedback from the community!`;
    }

    return content.trim();
  }

  private sanitizeTitle(title: string): string {
    // HackerNews title requirements:
    // - Max 80 characters (recommended)
    // - No excessive formatting
    // - Clear and descriptive
    
    let sanitized = title.trim();
    
    // Remove excessive formatting
    sanitized = sanitized.replace(/[🚀🔥💥⭐️🎉]/g, '');
    
    if (sanitized.length > this.MAX_TITLE_LENGTH) {
      sanitized = sanitized.substring(0, this.MAX_TITLE_LENGTH - 3) + '...';
    }

    return sanitized.trim();
  }

  private extractErrorMessage(error: any): string {
    if (error.response?.data) {
      const data = error.response.data;
      
      // Check for common HackerNews error messages
      if (typeof data === 'string') {
        if (data.includes('duplicate')) {
          return 'This URL has already been submitted to HackerNews';
        }
        if (data.includes('Bad login')) {
          return 'Invalid HackerNews credentials';
        }
        if (data.includes('Too fast')) {
          return 'Posting too frequently - please wait before submitting again';
        }
        if (data.includes('banned')) {
          return 'Account may be banned or restricted';
        }
      }
    }

    if (error.message) {
      return error.message;
    }

    return 'Unknown error occurred';
  }

  getPostUrl(postId: string): string {
    return `https://news.ycombinator.com/item?id=${postId}`;
  }

  async deletePost(_postId: string): Promise<boolean> {
    this.logger.warn('HackerNews does not support post deletion via API');
    return false;
  }

  async validateConfig(): Promise<{ isValid: boolean; errors: string[] }> {
    const baseValidation = await super.validateConfig();
    if (!baseValidation.isValid) {
      return baseValidation;
    }

    const errors: string[] = [];
    const hnConfig = this.config as HackerNewsConfig;

    if (!hnConfig.auth.token) {
      errors.push('HackerNews username is required');
    }

    if (!hnConfig.auth.tokenSecret) {
      errors.push('HackerNews password is required');
    }

    if (!hnConfig.settings.username) {
      errors.push('Username setting is required');
    }

    if (!['story', 'ask', 'show'].includes(hnConfig.settings.postType)) {
      errors.push('Post type must be one of: story, ask, show');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  protected isRetryableError(error: any): boolean {
    // Override to handle HackerNews-specific non-retryable errors
    if (error.response?.data) {
      const data = error.response.data;
      if (typeof data === 'string') {
        // Don't retry on these errors
        if (data.includes('duplicate') || 
            data.includes('banned') || 
            data.includes('Bad login')) {
          return false;
        }
      }
    }

    return super.isRetryableError(error);
  }
}