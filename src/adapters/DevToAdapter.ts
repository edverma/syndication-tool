import axios, { AxiosInstance } from 'axios';
import { BasePlatformAdapter, FormattedContent, PlatformAdapter, PublicationResult } from './PlatformAdapter';
import { Tool, DevToConfig } from '../models';
import { Logger } from '../utils';

interface DevToArticle {
  id: number;
  title: string;
  description: string;
  published: boolean;
  slug: string;
  url: string;
  canonical_url?: string;
  tags: string[];
  body_markdown: string;
  organization_id?: number;
  series?: string;
}

interface DevToCreateArticleRequest {
  article: {
    title: string;
    body_markdown: string;
    published: boolean;
    tags?: string[];
    canonical_url?: string;
    description?: string;
    organization_id?: number;
    series?: string;
  };
}

export class DevToAdapter extends BasePlatformAdapter implements PlatformAdapter {
  readonly platform = 'dev.to';
  private client: AxiosInstance;
  private logger: Logger;

  constructor(config: DevToConfig) {
    super(config);
    this.logger = new Logger('DevToAdapter');
    
    this.client = axios.create({
      baseURL: config.baseUrl,
      headers: {
        'api-key': config.auth.apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'SyndicationTool/1.0.0'
      },
      timeout: 30000
    });
  }

  async authenticate(): Promise<boolean> {
    try {
      this.logger.debug('Validating Dev.to API key');
      
      // Test the API key by fetching user information
      const response = await this.client.get('/users/me');
      
      if (response.status === 200 && response.data) {
        this.logger.info('Successfully authenticated with Dev.to API');
        return true;
      }
      
      return false;
    } catch (error) {
      this.logger.error('Failed to authenticate with Dev.to API', error);
      return false;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      // Test the API key by making a simple authenticated request
      const response = await this.client.get('/users/me');
      return response.status === 200;
    } catch (error) {
      this.logger.debug('Dev.to authentication check failed');
      return false;
    }
  }

  async formatContent(tool: Tool): Promise<FormattedContent> {
    const devToConfig = this.config as DevToConfig;
    const settings = devToConfig.settings;

    // Use custom title template or default format
    const title = settings.titleTemplate 
      ? this.replaceTemplateVariables(settings.titleTemplate, tool)
      : `${tool.name}: ${tool.shortDescription}`;

    // Create markdown content for Dev.to
    const body = this.createMarkdownBody(tool);

    // Merge tool tags with configured tags
    const tags = this.mergeTags(tool.tags || [], settings.tags);

    return {
      title: this.sanitizeTitle(title),
      body,
      tags,
      metadata: {
        published: settings.published,
        canonicalUrl: settings.canonicalUrl || tool.url,
        organizationId: settings.organizationId,
        series: settings.series,
        description: tool.shortDescription
      }
    };
  }

  async publish(tool: Tool, content: FormattedContent): Promise<PublicationResult> {
    try {
      this.logger.debug(`Publishing ${tool.name} to Dev.to`);

      const devToConfig = this.config as DevToConfig;
      const articleData: DevToCreateArticleRequest = {
        article: {
          title: content.title,
          body_markdown: content.body,
          published: content.metadata?.published || devToConfig.settings.published,
          tags: content.tags?.slice(0, 4), // Dev.to allows max 4 tags
          description: content.metadata?.description,
          canonical_url: content.metadata?.canonicalUrl,
          organization_id: content.metadata?.organizationId,
          series: content.metadata?.series
        }
      };

      const response = await this.retryWithExponentialBackoff(async () => {
        return await this.client.post('/articles', articleData);
      });

      const article: DevToArticle = response.data;

      this.logger.info(`Successfully published to Dev.to: ${article.url}`);

      return {
        success: true,
        postId: article.id.toString(),
        url: article.url
      };
    } catch (error) {
      const errorMessage = this.extractErrorMessage(error);
      this.logger.error('Failed to publish to Dev.to:', error);
      
      return {
        success: false,
        error: errorMessage,
        retryable: this.isRetryableError(error)
      };
    }
  }

  private createMarkdownBody(tool: Tool): string {
    let body = `${tool.longDescription}\n\n`;

    // Add key information section
    body += `## 🔗 Key Information\n\n`;
    body += `- **Website:** [${tool.name}](${tool.url})\n`;
    
    if (tool.githubUrl) {
      body += `- **GitHub:** [Repository](${tool.githubUrl})\n`;
    }
    
    if (tool.documentationUrl) {
      body += `- **Documentation:** [Docs](${tool.documentationUrl})\n`;
    }
    
    if (tool.version) {
      body += `- **Version:** ${tool.version}\n`;
    }

    body += `\n`;

    // Add categories section
    if (tool.category && tool.category.length > 0) {
      body += `## 📂 Categories\n\n`;
      body += tool.category.map(cat => `- ${cat}`).join('\n');
      body += `\n\n`;
    }

    // Add target audience section
    if (tool.targetAudience && tool.targetAudience.length > 0) {
      body += `## 👥 Target Audience\n\n`;
      body += tool.targetAudience.map(audience => `- ${audience}`).join('\n');
      body += `\n\n`;
    }

    // Add call to action
    body += `---\n\n`;
    body += `*Have you used ${tool.name}? Share your experience in the comments!*\n\n`;
    body += `*Check out more developer tools and resources at [${tool.url}](${tool.url})*`;

    return body;
  }

  private mergeTags(toolTags: string[], configTags: string[]): string[] {
    // Combine tool tags with configured tags, remove duplicates, limit to 4
    const allTags = [...new Set([...configTags, ...toolTags])];
    
    // Dev.to has specific tag requirements
    const validTags = allTags
      .map(tag => this.sanitizeTag(tag))
      .filter(tag => tag.length > 0)
      .slice(0, 4);

    return validTags;
  }

  private sanitizeTag(tag: string): string {
    // Dev.to tag requirements:
    // - Lowercase
    // - No spaces (replace with hyphens)
    // - Only alphanumeric characters and hyphens
    // - Max 20 characters
    
    let sanitized = tag.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (sanitized.length > 20) {
      sanitized = sanitized.substring(0, 20);
    }

    return sanitized;
  }

  private sanitizeTitle(title: string): string {
    // Dev.to title requirements:
    // - Max 255 characters
    // - Reasonable formatting
    
    let sanitized = title.trim();
    
    if (sanitized.length > 255) {
      sanitized = sanitized.substring(0, 252) + '...';
    }

    return sanitized;
  }

  private extractErrorMessage(error: any): string {
    if (error.response?.data) {
      const data = error.response.data;
      
      if (data.error) {
        return data.error;
      }
      
      if (data.errors && Array.isArray(data.errors)) {
        return data.errors.join(', ');
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
    // Dev.to doesn't provide a direct URL format based on ID alone
    // The URL is returned in the publish response
    return `https://dev.to/post/${postId}`;
  }

  async deletePost(postId: string): Promise<boolean> {
    try {
      await this.retryWithExponentialBackoff(async () => {
        return await this.client.delete(`/articles/${postId}`);
      });
      
      this.logger.info(`Successfully deleted Dev.to article: ${postId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete Dev.to article ${postId}:`, error);
      return false;
    }
  }

  async updatePost(postId: string, content: FormattedContent): Promise<PublicationResult> {
    try {
      const devToConfig = this.config as DevToConfig;
      const articleData: DevToCreateArticleRequest = {
        article: {
          title: content.title,
          body_markdown: content.body,
          published: content.metadata?.published || devToConfig.settings.published,
          tags: content.tags?.slice(0, 4),
          description: content.metadata?.description,
          canonical_url: content.metadata?.canonicalUrl,
          organization_id: content.metadata?.organizationId,
          series: content.metadata?.series
        }
      };

      const response = await this.retryWithExponentialBackoff(async () => {
        return await this.client.put(`/articles/${postId}`, articleData);
      });

      const article: DevToArticle = response.data;

      this.logger.info(`Successfully updated Dev.to article: ${article.url}`);

      return {
        success: true,
        postId: article.id.toString(),
        url: article.url
      };
    } catch (error) {
      const errorMessage = this.extractErrorMessage(error);
      this.logger.error(`Failed to update Dev.to article ${postId}:`, error);
      
      return {
        success: false,
        error: errorMessage,
        retryable: this.isRetryableError(error)
      };
    }
  }

  async validateConfig(): Promise<{ isValid: boolean; errors: string[] }> {
    const baseValidation = await super.validateConfig();
    if (!baseValidation.isValid) {
      return baseValidation;
    }

    const errors: string[] = [];
    const devToConfig = this.config as DevToConfig;

    if (!devToConfig.auth.apiKey) {
      errors.push('Dev.to API key is required');
    }

    // Validate tags
    if (devToConfig.settings.tags) {
      devToConfig.settings.tags.forEach(tag => {
        const sanitized = this.sanitizeTag(tag);
        if (sanitized !== tag.toLowerCase().replace(/\s+/g, '-')) {
          errors.push(`Invalid tag format: ${tag}. Tags should be lowercase with hyphens instead of spaces.`);
        }
      });

      if (devToConfig.settings.tags.length > 4) {
        errors.push('Maximum 4 tags allowed for Dev.to');
      }
    }

    // Validate organization ID if provided
    if (devToConfig.settings.organizationId && 
        (!Number.isInteger(devToConfig.settings.organizationId) || devToConfig.settings.organizationId <= 0)) {
      errors.push('Organization ID must be a positive integer');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}