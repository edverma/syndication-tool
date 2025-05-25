export interface AuthConfig {
  type: 'oauth2' | 'api_key' | 'token' | 'oauth1';
  clientId?: string;
  clientSecret?: string;
  apiKey?: string;
  token?: string;
  refreshToken?: string;
  accessToken?: string;
  tokenSecret?: string;
  scopes?: string[];
  redirectUri?: string;
}

export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  burstLimit: number;
}

export interface PlatformConfig {
  platform: string;
  enabled: boolean;
  auth: AuthConfig;
  rateLimit: RateLimitConfig;
  baseUrl: string;
  settings: Record<string, any>;
  retryConfig: {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
  };
}

export interface RedditConfig extends PlatformConfig {
  platform: 'reddit';
  settings: {
    subreddits: string[];
    defaultFlair?: string;
    postType: 'link' | 'text' | 'auto';
    titleTemplate?: string;
  };
}

export interface DevToConfig extends PlatformConfig {
  platform: 'dev.to';
  settings: {
    organizationId?: number;
    published: boolean;
    series?: string;
    canonicalUrl?: string;
    titleTemplate?: string;
    tags: string[];
  };
}

export interface GitHubConfig extends PlatformConfig {
  platform: 'github';
  settings: {
    repositories: string[];
    discussionCategory: string;
    titleTemplate?: string;
    labels?: string[];
  };
}

export interface LinkedInConfig extends PlatformConfig {
  platform: 'linkedin';
  settings: {
    profileType: 'personal' | 'company';
    companyId?: string;
    includeImage: boolean;
    titleTemplate?: string;
  };
}

export interface TwitterConfig extends PlatformConfig {
  platform: 'twitter';
  settings: {
    enableThreads: boolean;
    includeHashtags: boolean;
    defaultHashtags?: string[];
    titleTemplate?: string;
  };
}

export interface HackerNewsConfig extends PlatformConfig {
  platform: 'hackernews';
  settings: {
    username: string;
    postType: 'story' | 'ask' | 'show';
    titleTemplate?: string;
    includeDescription: boolean;
  };
}

export type PlatformSpecificConfig = 
  | RedditConfig 
  | DevToConfig 
  | GitHubConfig 
  | LinkedInConfig 
  | TwitterConfig
  | HackerNewsConfig;

export class PlatformConfigValidator {
  static validate(config: PlatformConfig): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.platform || config.platform.trim().length === 0) {
      errors.push('Platform name is required');
    }

    if (!config.baseUrl || !this.isValidUrl(config.baseUrl)) {
      errors.push('Valid base URL is required');
    }

    if (!config.auth || !config.auth.type) {
      errors.push('Authentication configuration is required');
    }

    if (config.auth) {
      const authErrors = this.validateAuthConfig(config.auth);
      errors.push(...authErrors);
    }

    if (!config.rateLimit) {
      errors.push('Rate limit configuration is required');
    } else {
      const rateLimitErrors = this.validateRateLimitConfig(config.rateLimit);
      errors.push(...rateLimitErrors);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private static validateAuthConfig(auth: AuthConfig): string[] {
    const errors: string[] = [];

    switch (auth.type) {
      case 'oauth2':
        if (!auth.clientId) errors.push('OAuth2 client ID is required');
        if (!auth.clientSecret) errors.push('OAuth2 client secret is required');
        break;
      case 'api_key':
        if (!auth.apiKey) errors.push('API key is required');
        break;
      case 'token':
        if (!auth.token) errors.push('Token is required');
        break;
      case 'oauth1':
        if (!auth.clientId) errors.push('OAuth1 client ID is required');
        if (!auth.clientSecret) errors.push('OAuth1 client secret is required');
        break;
    }

    return errors;
  }

  private static validateRateLimitConfig(rateLimit: RateLimitConfig): string[] {
    const errors: string[] = [];

    if (rateLimit.requestsPerMinute <= 0) {
      errors.push('Requests per minute must be positive');
    }

    if (rateLimit.requestsPerHour <= 0) {
      errors.push('Requests per hour must be positive');
    }

    if (rateLimit.requestsPerDay <= 0) {
      errors.push('Requests per day must be positive');
    }

    if (rateLimit.burstLimit <= 0) {
      errors.push('Burst limit must be positive');
    }

    return errors;
  }

  private static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}