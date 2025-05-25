import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { PlatformConfig } from '../models';

export interface GlobalConfig {
  version: string;
  environment: 'development' | 'staging' | 'production';
  concurrency: number;
  defaultRetries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  platforms: PlatformConfig[];
  templates: {
    [key: string]: string;
  };
}

export interface ConfigSource {
  type: 'file' | 'env' | 'inline';
  path?: string;
  data?: any;
}

export class ConfigManager {
  private config: GlobalConfig | null = null;
  private configSources: ConfigSource[] = [];

  constructor(private baseDir: string = process.cwd()) {}

  async loadConfig(sources?: ConfigSource[]): Promise<GlobalConfig> {
    this.configSources = sources || this.getDefaultSources();
    
    let mergedConfig: Partial<GlobalConfig> = {};

    for (const source of this.configSources) {
      const sourceConfig = await this.loadFromSource(source);
      mergedConfig = this.mergeConfigs(mergedConfig, sourceConfig);
    }

    this.config = this.validateAndSetDefaults(mergedConfig);
    return this.config;
  }

  getConfig(): GlobalConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.');
    }
    return this.config;
  }

  getPlatformConfig(platform: string): PlatformConfig | undefined {
    return this.getConfig().platforms.find(p => p.platform === platform);
  }

  getEnabledPlatforms(): PlatformConfig[] {
    return this.getConfig().platforms.filter(p => p.enabled);
  }

  updatePlatformConfig(platform: string, updates: Partial<PlatformConfig>): void {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    const platformIndex = this.config.platforms.findIndex(p => p.platform === platform);
    if (platformIndex >= 0) {
      this.config.platforms[platformIndex] = {
        ...this.config.platforms[platformIndex],
        ...updates
      };
    }
  }

  private getDefaultSources(): ConfigSource[] {
    const sources: ConfigSource[] = [];

    // Environment variables
    sources.push({ type: 'env' });

    // Configuration files in order of precedence
    const configFiles = [
      'syndication.config.json',
      'syndication.config.yaml',
      'syndication.config.yml',
      '.syndication.json',
      '.syndication.yaml',
      '.syndication.yml'
    ];

    for (const filename of configFiles) {
      const filePath = path.join(this.baseDir, filename);
      if (fs.existsSync(filePath)) {
        sources.push({ type: 'file', path: filePath });
        break; // Use the first config file found
      }
    }

    return sources;
  }

  private async loadFromSource(source: ConfigSource): Promise<Partial<GlobalConfig>> {
    switch (source.type) {
      case 'file':
        return this.loadFromFile(source.path!);
      case 'env':
        return this.loadFromEnvironment();
      case 'inline':
        return source.data || {};
      default:
        throw new Error(`Unknown config source type: ${source.type}`);
    }
  }

  private async loadFromFile(filePath: string): Promise<Partial<GlobalConfig>> {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const ext = path.extname(filePath).toLowerCase();

      if (ext === '.json') {
        return JSON.parse(content);
      } else if (ext === '.yaml' || ext === '.yml') {
        return yaml.load(content) as Partial<GlobalConfig>;
      } else {
        throw new Error(`Unsupported config file format: ${ext}`);
      }
    } catch (error) {
      throw new Error(`Failed to load config from ${filePath}: ${error}`);
    }
  }

  private loadFromEnvironment(): Partial<GlobalConfig> {
    const config: Partial<GlobalConfig> = {};

    if (process.env.SYNDICATION_ENVIRONMENT) {
      config.environment = process.env.SYNDICATION_ENVIRONMENT as 'development' | 'staging' | 'production';
    }

    if (process.env.SYNDICATION_CONCURRENCY) {
      config.concurrency = parseInt(process.env.SYNDICATION_CONCURRENCY, 10);
    }

    if (process.env.SYNDICATION_LOG_LEVEL) {
      config.logLevel = process.env.SYNDICATION_LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error';
    }

    if (process.env.SYNDICATION_DEFAULT_RETRIES) {
      config.defaultRetries = parseInt(process.env.SYNDICATION_DEFAULT_RETRIES, 10);
    }

    // Load platform-specific environment variables
    config.platforms = this.loadPlatformConfigsFromEnv();

    return config;
  }

  private loadPlatformConfigsFromEnv(): PlatformConfig[] {
    const platforms: PlatformConfig[] = [];

    // Reddit
    if (process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET) {
      platforms.push({
        platform: 'reddit',
        enabled: process.env.REDDIT_ENABLED !== 'false',
        baseUrl: 'https://oauth.reddit.com',
        auth: {
          type: 'oauth2',
          clientId: process.env.REDDIT_CLIENT_ID,
          clientSecret: process.env.REDDIT_CLIENT_SECRET,
          refreshToken: process.env.REDDIT_REFRESH_TOKEN,
          scopes: ['submit', 'read']
        },
        rateLimit: {
          requestsPerMinute: 60,
          requestsPerHour: 600,
          requestsPerDay: 1000,
          burstLimit: 10
        },
        retryConfig: {
          maxRetries: 3,
          baseDelay: 1000,
          maxDelay: 30000,
          backoffMultiplier: 2
        },
        settings: {
          subreddits: process.env.REDDIT_SUBREDDITS?.split(',') || ['programming'],
          postType: 'link' as const,
          titleTemplate: process.env.REDDIT_TITLE_TEMPLATE
        }
      });
    }

    // Dev.to
    if (process.env.DEVTO_API_KEY) {
      platforms.push({
        platform: 'dev.to',
        enabled: process.env.DEVTO_ENABLED !== 'false',
        baseUrl: 'https://dev.to/api',
        auth: {
          type: 'api_key',
          apiKey: process.env.DEVTO_API_KEY
        },
        rateLimit: {
          requestsPerMinute: 30,
          requestsPerHour: 300,
          requestsPerDay: 1000,
          burstLimit: 5
        },
        retryConfig: {
          maxRetries: 3,
          baseDelay: 1000,
          maxDelay: 30000,
          backoffMultiplier: 2
        },
        settings: {
          published: process.env.DEVTO_PUBLISHED !== 'false',
          tags: process.env.DEVTO_TAGS?.split(',') || ['opensource', 'tools'],
          titleTemplate: process.env.DEVTO_TITLE_TEMPLATE,
          canonicalUrl: process.env.DEVTO_CANONICAL_URL
        }
      });
    }

    // GitHub
    if (process.env.GITHUB_TOKEN) {
      platforms.push({
        platform: 'github',
        enabled: process.env.GITHUB_ENABLED !== 'false',
        baseUrl: 'https://api.github.com',
        auth: {
          type: 'token',
          token: process.env.GITHUB_TOKEN
        },
        rateLimit: {
          requestsPerMinute: 60,
          requestsPerHour: 5000,
          requestsPerDay: 5000,
          burstLimit: 10
        },
        retryConfig: {
          maxRetries: 3,
          baseDelay: 1000,
          maxDelay: 30000,
          backoffMultiplier: 2
        },
        settings: {
          repositories: process.env.GITHUB_REPOSITORIES?.split(',') || [],
          discussionCategory: process.env.GITHUB_DISCUSSION_CATEGORY || 'General',
          titleTemplate: process.env.GITHUB_TITLE_TEMPLATE,
          labels: process.env.GITHUB_LABELS?.split(',')
        }
      });
    }

    return platforms;
  }

  private mergeConfigs(target: Partial<GlobalConfig>, source: Partial<GlobalConfig>): Partial<GlobalConfig> {
    const result = { ...target };

    // Merge scalar values
    Object.keys(source).forEach(key => {
      if (key === 'platforms') {
        // Special handling for platforms array
        result.platforms = this.mergePlatforms(target.platforms || [], source.platforms || []);
      } else if (key === 'templates') {
        // Merge templates object
        result.templates = { ...target.templates, ...source.templates };
      } else {
        (result as Record<string, unknown>)[key] = (source as Record<string, unknown>)[key];
      }
    });

    return result;
  }

  private mergePlatforms(
    target: PlatformConfig[], 
    source: PlatformConfig[]
  ): PlatformConfig[] {
    const result = [...target];

    source.forEach(sourcePlatform => {
      const existingIndex = result.findIndex(p => p.platform === sourcePlatform.platform);
      if (existingIndex >= 0) {
        // Merge existing platform config
        result[existingIndex] = { ...result[existingIndex], ...sourcePlatform };
      } else {
        // Add new platform config
        result.push(sourcePlatform);
      }
    });

    return result;
  }

  private validateAndSetDefaults(config: Partial<GlobalConfig>): GlobalConfig {
    const defaults: GlobalConfig = {
      version: '1.0.0',
      environment: 'development',
      concurrency: 3,
      defaultRetries: 3,
      logLevel: 'info',
      platforms: [],
      templates: {
        default: '{name}: {shortDescription}\n\n{url}',
        reddit: '{name} - {shortDescription}',
        twitter: '🚀 {name}: {shortDescription} {url}',
        github: '## {name}\n\n{shortDescription}\n\n**Link:** {url}'
      }
    };

    const result = { ...defaults, ...config };

    // Validate required fields
    if (!result.version) {
      throw new Error('Configuration version is required');
    }

    if (result.concurrency <= 0) {
      throw new Error('Concurrency must be a positive number');
    }

    if (result.defaultRetries < 0) {
      throw new Error('Default retries must be non-negative');
    }

    return result;
  }

  async saveConfig(filePath?: string): Promise<void> {
    if (!this.config) {
      throw new Error('No configuration to save');
    }

    const outputPath = filePath || path.join(this.baseDir, 'syndication.config.json');
    const configData = JSON.stringify(this.config, null, 2);
    
    fs.writeFileSync(outputPath, configData, 'utf8');
  }
}