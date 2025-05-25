import axios, { AxiosInstance } from 'axios';
import { BasePlatformAdapter, FormattedContent, PlatformAdapter, PublicationResult } from './PlatformAdapter';
import { Tool, TwitterConfig } from '../models';
import { Logger } from '../utils';

interface TwitterTweet {
  id: string;
  text: string;
  created_at: string;
  public_metrics?: {
    retweet_count: number;
    like_count: number;
    reply_count: number;
    quote_count: number;
  };
}

interface TwitterCreateTweetRequest {
  text: string;
  reply?: {
    in_reply_to_tweet_id: string;
  };
  media?: {
    media_ids: string[];
  };
}

// Removed unused interface to fix linting errors

export class TwitterAdapter extends BasePlatformAdapter implements PlatformAdapter {
  readonly platform = 'twitter';
  private client: AxiosInstance;
  private logger: Logger;
  private readonly MAX_TWEET_LENGTH = 280;

  constructor(config: TwitterConfig) {
    super(config);
    this.logger = new Logger('TwitterAdapter');
    
    this.client = axios.create({
      baseURL: config.baseUrl,
      headers: {
        'Authorization': `Bearer ${config.auth.accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'SyndicationTool/1.0.0'
      },
      timeout: 30000
    });
  }

  async authenticate(): Promise<boolean> {
    try {
      this.logger.debug('Validating Twitter access token');
      
      // Test the access token by fetching user information
      const response = await this.client.get('/2/users/me');
      
      if (response.status === 200 && response.data?.data) {
        this.logger.info('Successfully authenticated with Twitter API');
        return true;
      }
      
      return false;
    } catch (error) {
      this.logger.error('Failed to authenticate with Twitter API', error);
      return false;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      const response = await this.client.get('/2/users/me');
      return response.status === 200 && !!response.data?.data;
    } catch (error) {
      this.logger.debug('Twitter authentication check failed');
      return false;
    }
  }

  async formatContent(tool: Tool): Promise<FormattedContent> {
    const twitterConfig = this.config as TwitterConfig;
    const settings = twitterConfig.settings;

    // Use custom title template or default format
    const title = settings.titleTemplate 
      ? this.replaceTemplateVariables(settings.titleTemplate, tool)
      : `${tool.name}: ${tool.shortDescription}`;

    // Create Twitter thread content
    const tweets = this.createTwitterThread(tool);

    return {
      title: this.sanitizeTitle(title),
      body: tweets.join('\n\n---TWEET_BREAK---\n\n'),
      url: tool.url,
      tags: this.prepareTags(tool, settings),
      metadata: {
        enableThreads: settings.enableThreads,
        includeHashtags: settings.includeHashtags,
        tweets: tweets,
        description: tool.shortDescription
      }
    };
  }

  async publish(tool: Tool, content: FormattedContent): Promise<PublicationResult> {
    try {
      this.logger.debug(`Publishing ${tool.name} to Twitter`);

      const tweets = content.metadata?.tweets || [content.body];
      const tweetIds: string[] = [];
      let previousTweetId: string | undefined;

      // Post tweets in sequence for threads
      for (let i = 0; i < tweets.length; i++) {
        const tweetText = tweets[i];
        
        const tweetData: TwitterCreateTweetRequest = {
          text: tweetText,
          ...(previousTweetId && {
            reply: {
              in_reply_to_tweet_id: previousTweetId
            }
          })
        };

        const response = await this.retryWithExponentialBackoff(async () => {
          return await this.client.post('/2/tweets', tweetData);
        });

        const tweet: TwitterTweet = response.data.data;
        tweetIds.push(tweet.id);
        previousTweetId = tweet.id;

        this.logger.debug(`Posted tweet ${i + 1}/${tweets.length}: ${tweet.id}`);

        // Add delay between tweets to avoid rate limiting
        if (i < tweets.length - 1) {
          await this.sleep(1000); // 1 second delay
        }
      }

      const primaryTweetUrl = this.getPostUrl(tweetIds[0]);
      
      this.logger.info(`Successfully published to Twitter: ${primaryTweetUrl}`);

      return {
        success: true,
        postId: tweetIds[0], // Return the first tweet ID as primary
        url: primaryTweetUrl
      };
    } catch (error) {
      const errorMessage = this.extractErrorMessage(error);
      this.logger.error('Failed to publish to Twitter:', error);
      
      return {
        success: false,
        error: errorMessage,
        retryable: this.isRetryableError(error)
      };
    }
  }

  private createTwitterThread(tool: Tool): string[] {
    const twitterConfig = this.config as TwitterConfig;
    const settings = twitterConfig.settings;
    
    const tweets: string[] = [];
    
    // First tweet - main announcement
    let firstTweet = `🚀 ${tool.name}: ${tool.shortDescription}`;
    
    if (settings.includeHashtags && tool.tags) {
      const hashtags = this.formatHashtags(tool.tags, settings.defaultHashtags);
      const tweetWithHashtags = `${firstTweet}\n\n${hashtags}`;
      
      if (tweetWithHashtags.length <= this.MAX_TWEET_LENGTH) {
        firstTweet = tweetWithHashtags;
      }
    }
    
    tweets.push(this.truncateTweet(firstTweet));

    if (!settings.enableThreads) {
      return tweets;
    }

    // Second tweet - description and URL
    if (tool.longDescription) {
      let descriptionTweet = tool.longDescription;
      
      // Add URL if it fits
      const urlText = `\n\n🔗 ${tool.url}`;
      if (descriptionTweet.length + urlText.length <= this.MAX_TWEET_LENGTH) {
        descriptionTweet += urlText;
      }
      
      tweets.push(this.truncateTweet(descriptionTweet));
    }

    // Third tweet - categories and target audience
    const infoItems: string[] = [];
    
    if (tool.category && tool.category.length > 0) {
      infoItems.push(`📂 Categories: ${tool.category.join(', ')}`);
    }
    
    if (tool.targetAudience && tool.targetAudience.length > 0) {
      infoItems.push(`👥 Perfect for: ${tool.targetAudience.join(', ')}`);
    }

    if (infoItems.length > 0) {
      const infoTweet = infoItems.join('\n\n');
      tweets.push(this.truncateTweet(infoTweet));
    }

    // Final tweet - URL if not already included
    const lastTweet = tweets[tweets.length - 1];
    if (!lastTweet.includes(tool.url)) {
      const urlTweet = `🔗 Learn more: ${tool.url}\n\n💭 Have you used ${tool.name}? Let me know your thoughts!`;
      tweets.push(this.truncateTweet(urlTweet));
    }

    return tweets;
  }

  private prepareTags(tool: Tool, settings: TwitterConfig['settings']): string[] {
    const allTags = [...(settings.defaultHashtags || []), ...(tool.tags || [])];
    return [...new Set(allTags)]; // Remove duplicates
  }

  private formatHashtags(toolTags: string[], defaultTags?: string[]): string {
    const allTags = [...(defaultTags || []), ...toolTags];
    const uniqueTags = [...new Set(allTags)];
    
    return uniqueTags
      .map(tag => `#${this.sanitizeHashtag(tag)}`)
      .join(' ');
  }

  private sanitizeHashtag(tag: string): string {
    // Twitter hashtag requirements:
    // - No spaces or special characters
    // - Letters, numbers, underscore allowed
    // - Cannot be only numbers
    
    const sanitized = tag
      .replace(/[^a-zA-Z0-9_]/g, '')
      .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores

    // Ensure it's not only numbers
    if (/^\d+$/.test(sanitized)) {
      return `tag${sanitized}`;
    }

    return sanitized || 'tool';
  }

  private sanitizeTitle(title: string): string {
    let sanitized = title.trim();
    
    if (sanitized.length > 100) {
      sanitized = sanitized.substring(0, 97) + '...';
    }

    return sanitized;
  }

  private truncateTweet(text: string): string {
    if (text.length <= this.MAX_TWEET_LENGTH) {
      return text;
    }

    // Try to truncate at word boundary
    const truncated = text.substring(0, this.MAX_TWEET_LENGTH - 3);
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastSpace > this.MAX_TWEET_LENGTH * 0.8) {
      return truncated.substring(0, lastSpace) + '...';
    }
    
    return truncated + '...';
  }

  private extractErrorMessage(error: any): string {
    if (error.response?.data) {
      const data = error.response.data;
      
      if (data.detail) {
        return data.detail;
      }
      
      if (data.errors && Array.isArray(data.errors)) {
        return data.errors.map((err: any) => err.message || err.detail || err).join(', ');
      }
      
      if (data.title) {
        return data.title;
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
    // Note: We would need the username to construct the full URL
    // This is a simplified version
    return `https://twitter.com/i/status/${postId}`;
  }

  async deletePost(postId: string): Promise<boolean> {
    try {
      await this.retryWithExponentialBackoff(async () => {
        return await this.client.delete(`/2/tweets/${postId}`);
      });
      
      this.logger.info(`Successfully deleted Twitter tweet: ${postId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete Twitter tweet ${postId}:`, error);
      return false;
    }
  }

  async validateConfig(): Promise<{ isValid: boolean; errors: string[] }> {
    const baseValidation = await super.validateConfig();
    if (!baseValidation.isValid) {
      return baseValidation;
    }

    const errors: string[] = [];
    const twitterConfig = this.config as TwitterConfig;

    if (!twitterConfig.auth.accessToken) {
      errors.push('Twitter access token is required');
    }

    // Validate default hashtags
    if (twitterConfig.settings.defaultHashtags) {
      twitterConfig.settings.defaultHashtags.forEach(tag => {
        const sanitized = this.sanitizeHashtag(tag);
        if (!sanitized || sanitized.length === 0) {
          errors.push(`Invalid hashtag: ${tag}`);
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}