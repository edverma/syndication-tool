import axios, { AxiosInstance } from 'axios';
import { BasePlatformAdapter, FormattedContent, PlatformAdapter, PublicationResult } from './PlatformAdapter';
import { Tool, RedditConfig } from '../models';
import { Logger } from '../utils';

interface RedditAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  refresh_token?: string;
}

interface RedditSubmitResponse {
  json: {
    errors: any[];
    data?: {
      id: string;
      name: string;
      url: string;
    };
  };
}

export class RedditAdapter extends BasePlatformAdapter implements PlatformAdapter {
  readonly platform = 'reddit';
  private client: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private logger: Logger;

  constructor(config: RedditConfig) {
    super(config);
    this.logger = new Logger('RedditAdapter');
    
    this.client = axios.create({
      baseURL: config.baseUrl,
      headers: {
        'User-Agent': 'SyndicationTool/1.0.0 (https://github.com/syndication-tool)'
      },
      timeout: 30000
    });
  }

  async authenticate(): Promise<boolean> {
    try {
      this.logger.debug('Authenticating with Reddit API');

      const authConfig = this.config.auth;
      if (authConfig.type !== 'oauth2') {
        throw new Error('Reddit requires OAuth2 authentication');
      }

      const credentials = Buffer.from(
        `${authConfig.clientId}:${authConfig.clientSecret}`
      ).toString('base64');

      const response = await axios.post('https://www.reddit.com/api/v1/access_token', 
        new URLSearchParams({
          grant_type: authConfig.refreshToken ? 'refresh_token' : 'client_credentials',
          ...(authConfig.refreshToken && { refresh_token: authConfig.refreshToken })
        }),
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'SyndicationTool/1.0.0'
          }
        }
      );

      const authData: RedditAuthResponse = response.data;
      this.accessToken = authData.access_token;
      this.tokenExpiry = Date.now() + (authData.expires_in * 1000) - 60000; // 1 minute buffer

      this.client.defaults.headers.common['Authorization'] = `Bearer ${this.accessToken}`;
      
      this.logger.info('Successfully authenticated with Reddit API');
      return true;
    } catch (error) {
      this.logger.error('Failed to authenticate with Reddit API', error);
      return false;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    if (!this.accessToken || Date.now() >= this.tokenExpiry) {
      return false;
    }

    try {
      // Test the token by making a simple API call
      await this.client.get('/api/v1/me');
      return true;
    } catch (error) {
      this.logger.debug('Token validation failed, re-authentication required');
      return false;
    }
  }

  async formatContent(tool: Tool): Promise<FormattedContent> {
    const redditConfig = this.config as RedditConfig;
    const settings = redditConfig.settings;

    // Use custom title template or default format
    const title = settings.titleTemplate 
      ? this.replaceTemplateVariables(settings.titleTemplate, tool)
      : `${tool.name} - ${tool.shortDescription}`;

    // Ensure title meets Reddit's requirements
    const sanitizedTitle = this.sanitizeTitle(title);

    let body = '';
    let url: string | undefined = tool.url;

    if (settings.postType === 'text' || 
        (settings.postType === 'auto' && tool.longDescription.length > 100)) {
      // Create text post with URL in body
      body = `${tool.longDescription}\n\n**Link:** ${tool.url}`;
      url = undefined; // Text posts don't have URLs
    }

    return {
      title: sanitizedTitle,
      body,
      url,
      tags: tool.tags,
      metadata: {
        postType: url ? 'link' : 'text',
        flair: settings.defaultFlair
      }
    };
  }

  async publish(tool: Tool, content: FormattedContent): Promise<PublicationResult> {
    try {
      const redditConfig = this.config as RedditConfig;
      const results: PublicationResult[] = [];

      for (const subreddit of redditConfig.settings.subreddits) {
        try {
          const result = await this.publishToSubreddit(subreddit, content);
          results.push(result);
          
          if (result.success) {
            this.logger.info(`Successfully published to r/${subreddit}: ${result.url}`);
          } else {
            this.logger.warn(`Failed to publish to r/${subreddit}: ${result.error}`);
          }

          // Add delay between subreddit posts to respect rate limits
          if (redditConfig.settings.subreddits.length > 1) {
            await this.sleep(2000); // 2 second delay
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(`Error publishing to r/${subreddit}:`, error);
          results.push({
            success: false,
            error: errorMessage,
            retryable: this.isRetryableError(error)
          });
        }
      }

      // Return the first successful result or the last error
      const successfulResult = results.find(r => r.success);
      if (successfulResult) {
        return successfulResult;
      }

      const lastResult = results[results.length - 1];
      return {
        success: false,
        error: lastResult?.error || 'Failed to publish to any subreddit',
        retryable: results.some(r => r.retryable)
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to publish to Reddit:', error);
      
      return {
        success: false,
        error: errorMessage,
        retryable: this.isRetryableError(error)
      };
    }
  }

  private async publishToSubreddit(
    subreddit: string, 
    content: FormattedContent
  ): Promise<PublicationResult> {
    const isTextPost = !content.url;
    
    interface RedditSubmitData {
      sr: string;
      kind: 'self' | 'link';
      title: string;
      api_type: 'json';
      sendreplies: boolean;
      text?: string;
      url?: string;
      flair_text?: string;
    }

    const submitData: RedditSubmitData = {
      sr: subreddit,
      kind: isTextPost ? 'self' : 'link',
      title: content.title,
      api_type: 'json',
      sendreplies: false
    };

    if (isTextPost) {
      submitData.text = content.body;
    } else {
      submitData.url = content.url;
    }

    // Add flair if specified
    if (content.metadata?.flair) {
      submitData.flair_text = content.metadata.flair;
    }

    const response = await this.retryWithExponentialBackoff(async () => {
      return await this.client.post('/api/submit', submitData);
    });

    const result: RedditSubmitResponse = response.data;

    if (result.json.errors && result.json.errors.length > 0) {
      const errorMessages = result.json.errors.map(err => 
        Array.isArray(err) ? err.join(': ') : String(err)
      ).join(', ');
      
      throw new Error(`Reddit API error: ${errorMessages}`);
    }

    if (!result.json.data) {
      throw new Error('No data returned from Reddit API');
    }

    const postData = result.json.data;
    const postUrl = `https://reddit.com${postData.url}`;

    return {
      success: true,
      postId: postData.id,
      url: postUrl
    };
  }

  private sanitizeTitle(title: string): string {
    // Reddit title requirements:
    // - Max 300 characters
    // - No excessive capitalization
    // - Remove special characters that might cause issues
    
    let sanitized = title.trim();
    
    // Truncate if too long
    if (sanitized.length > 300) {
      sanitized = sanitized.substring(0, 297) + '...';
    }

    // Remove or replace problematic characters
    sanitized = sanitized.replace(/[^\w\s\-.,!?()[\]{}'":/]/g, '');
    
    return sanitized;
  }

  getPostUrl(postId: string): string {
    return `https://reddit.com/comments/${postId}`;
  }

  async deletePost(postId: string): Promise<boolean> {
    try {
      await this.retryWithExponentialBackoff(async () => {
        return await this.client.post('/api/del', {
          id: `t3_${postId}` // t3_ prefix for submissions
        });
      });
      
      this.logger.info(`Successfully deleted Reddit post: ${postId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete Reddit post ${postId}:`, error);
      return false;
    }
  }

  async validateConfig(): Promise<{ isValid: boolean; errors: string[] }> {
    const baseValidation = await super.validateConfig();
    if (!baseValidation.isValid) {
      return baseValidation;
    }

    const errors: string[] = [];
    const redditConfig = this.config as RedditConfig;

    if (!redditConfig.settings.subreddits || redditConfig.settings.subreddits.length === 0) {
      errors.push('At least one subreddit must be specified');
    }

    // Validate subreddit names
    redditConfig.settings.subreddits.forEach(subreddit => {
      if (!/^[A-Za-z0-9_]+$/.test(subreddit)) {
        errors.push(`Invalid subreddit name: ${subreddit}`);
      }
    });

    if (!['link', 'text', 'auto'].includes(redditConfig.settings.postType)) {
      errors.push('Post type must be "link", "text", or "auto"');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}