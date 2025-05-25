import axios, { AxiosInstance } from 'axios';
import { BasePlatformAdapter, FormattedContent, PlatformAdapter, PublicationResult } from './PlatformAdapter';
import { Tool, LinkedInConfig } from '../models';
import { Logger } from '../utils';

interface LinkedInPost {
  id: string;
  activity: string;
  author: string;
  lifecycleState: string;
  content: {
    title: string;
    description: string;
    media?: {
      id: string;
      status: string;
    };
  };
}

interface LinkedInCreatePostRequest {
  author: string;
  lifecycleState: 'PUBLISHED' | 'DRAFT';
  specificContent: {
    'com.linkedin.ugc.ShareContent': {
      shareCommentary: {
        text: string;
      };
      shareMediaCategory: 'NONE' | 'ARTICLE' | 'IMAGE';
      media?: Array<{
        status: 'READY';
        description: {
          text: string;
        };
        media: string;
        title: {
          text: string;
        };
      }>;
    };
  };
  visibility: {
    'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC';
  };
}

export class LinkedInAdapter extends BasePlatformAdapter implements PlatformAdapter {
  readonly platform = 'linkedin';
  private client: AxiosInstance;
  private logger: Logger;

  constructor(config: LinkedInConfig) {
    super(config);
    this.logger = new Logger('LinkedInAdapter');
    
    this.client = axios.create({
      baseURL: config.baseUrl,
      headers: {
        'Authorization': `Bearer ${config.auth.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
        'User-Agent': 'SyndicationTool/1.0.0'
      },
      timeout: 30000
    });
  }

  async authenticate(): Promise<boolean> {
    try {
      this.logger.debug('Validating LinkedIn access token');
      
      // Test the access token by fetching user profile
      const response = await this.client.get('/v2/people/~');
      
      if (response.status === 200 && response.data) {
        this.logger.info('Successfully authenticated with LinkedIn API');
        return true;
      }
      
      return false;
    } catch (error) {
      this.logger.error('Failed to authenticate with LinkedIn API', error);
      return false;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      const response = await this.client.get('/v2/people/~');
      return response.status === 200;
    } catch (error) {
      this.logger.debug('LinkedIn authentication check failed');
      return false;
    }
  }

  async formatContent(tool: Tool): Promise<FormattedContent> {
    const linkedInConfig = this.config as LinkedInConfig;
    const settings = linkedInConfig.settings;

    // Use custom title template or default format
    const title = settings.titleTemplate 
      ? this.replaceTemplateVariables(settings.titleTemplate, tool)
      : `${tool.name}: ${tool.shortDescription}`;

    // Create LinkedIn post content
    const body = this.createLinkedInPost(tool);

    return {
      title: this.sanitizeTitle(title),
      body,
      url: tool.url,
      metadata: {
        profileType: settings.profileType,
        companyId: settings.companyId,
        includeImage: settings.includeImage,
        description: tool.shortDescription
      }
    };
  }

  async publish(tool: Tool, content: FormattedContent): Promise<PublicationResult> {
    try {
      this.logger.debug(`Publishing ${tool.name} to LinkedIn`);

      const linkedInConfig = this.config as LinkedInConfig;
      const settings = linkedInConfig.settings;

      // Determine the author URN (person or organization)
      const authorUrn = settings.profileType === 'company' && settings.companyId
        ? `urn:li:organization:${settings.companyId}`
        : await this.getCurrentUserUrn();

      const postData: LinkedInCreatePostRequest = {
        author: authorUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: content.body
            },
            shareMediaCategory: content.url ? 'ARTICLE' : 'NONE',
            ...(content.url && {
              media: [{
                status: 'READY',
                description: {
                  text: content.metadata?.description || tool.shortDescription
                },
                media: content.url,
                title: {
                  text: content.title
                }
              }]
            })
          }
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
        }
      };

      const response = await this.retryWithExponentialBackoff(async () => {
        return await this.client.post('/v2/ugcPosts', postData);
      });

      const post: LinkedInPost = response.data;
      const postUrl = this.constructPostUrl(post.id);

      this.logger.info(`Successfully published to LinkedIn: ${postUrl}`);

      return {
        success: true,
        postId: post.id,
        url: postUrl
      };
    } catch (error) {
      const errorMessage = this.extractErrorMessage(error);
      this.logger.error('Failed to publish to LinkedIn:', error);
      
      return {
        success: false,
        error: errorMessage,
        retryable: this.isRetryableError(error)
      };
    }
  }

  private async getCurrentUserUrn(): Promise<string> {
    try {
      const response = await this.client.get('/v2/people/~');
      return `urn:li:person:${response.data.id}`;
    } catch (error) {
      this.logger.error('Failed to get current user URN:', error);
      throw new Error('Unable to determine user identity for LinkedIn posting');
    }
  }

  private createLinkedInPost(tool: Tool): string {
    let post = `🚀 ${tool.name}: ${tool.shortDescription}\n\n`;
    
    // Add description
    if (tool.longDescription) {
      post += `${tool.longDescription}\n\n`;
    }

    // Add key features or categories
    if (tool.category && tool.category.length > 0) {
      post += `📂 Categories: ${tool.category.join(', ')}\n`;
    }

    // Add target audience
    if (tool.targetAudience && tool.targetAudience.length > 0) {
      post += `👥 Perfect for: ${tool.targetAudience.join(', ')}\n`;
    }

    post += `\n🔗 Learn more: ${tool.url}\n`;

    // Add hashtags
    if (tool.tags && tool.tags.length > 0) {
      const hashtags = tool.tags
        .map(tag => `#${this.sanitizeHashtag(tag)}`)
        .join(' ');
      post += `\n${hashtags}`;
    }

    // Add call to action
    post += `\n\n💭 Have you used ${tool.name}? Share your thoughts in the comments!`;

    return this.truncatePost(post);
  }

  private sanitizeHashtag(tag: string): string {
    // LinkedIn hashtag requirements:
    // - No spaces (remove or replace with camelCase)
    // - Only alphanumeric characters
    // - Max reasonable length
    
    return tag
      .replace(/\s+/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .replace(/^(\w)/, (match) => match.toUpperCase()); // Capitalize first letter
  }

  private sanitizeTitle(title: string): string {
    // LinkedIn post title length should be reasonable
    let sanitized = title.trim();
    
    if (sanitized.length > 150) {
      sanitized = sanitized.substring(0, 147) + '...';
    }

    return sanitized;
  }

  private truncatePost(post: string): string {
    // LinkedIn posts have a 3000 character limit
    if (post.length <= 3000) {
      return post;
    }

    return post.substring(0, 2997) + '...';
  }

  private constructPostUrl(postId: string): string {
    // LinkedIn post URLs are complex, this is a best effort
    return `https://www.linkedin.com/feed/update/${postId}`;
  }

  private extractErrorMessage(error: any): string {
    if (error.response?.data) {
      const data = error.response.data;
      
      if (data.message) {
        return data.message;
      }
      
      if (data.serviceErrorCode) {
        return `LinkedIn API Error: ${data.serviceErrorCode}`;
      }
      
      if (typeof data === 'string') {
        return data;
      }
    }

    if (error.message) {
      return error.message;
    }

    return 'Unknown error occurred';
  }

  getPostUrl(postId: string): string {
    return this.constructPostUrl(postId);
  }

  async deletePost(postId: string): Promise<boolean> {
    try {
      await this.retryWithExponentialBackoff(async () => {
        return await this.client.delete(`/v2/ugcPosts/${postId}`);
      });
      
      this.logger.info(`Successfully deleted LinkedIn post: ${postId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete LinkedIn post ${postId}:`, error);
      return false;
    }
  }

  async validateConfig(): Promise<{ isValid: boolean; errors: string[] }> {
    const baseValidation = await super.validateConfig();
    if (!baseValidation.isValid) {
      return baseValidation;
    }

    const errors: string[] = [];
    const linkedInConfig = this.config as LinkedInConfig;

    if (!linkedInConfig.auth.accessToken) {
      errors.push('LinkedIn access token is required');
    }

    if (linkedInConfig.settings.profileType === 'company' && !linkedInConfig.settings.companyId) {
      errors.push('Company ID is required when using company profile type');
    }

    if (linkedInConfig.settings.companyId && 
        (!Number.isInteger(Number(linkedInConfig.settings.companyId)) || Number(linkedInConfig.settings.companyId) <= 0)) {
      errors.push('Company ID must be a positive integer');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}