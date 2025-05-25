import { ConfigManager, GlobalConfig } from '../config/ConfigManager';
import * as fs from 'fs';

jest.mock('fs');

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  const mockFs = fs as jest.Mocked<typeof fs>;

  beforeEach(() => {
    configManager = new ConfigManager('/test');
    jest.clearAllMocks();
  });

  describe('loadConfig', () => {
    it('should load default configuration when no config file exists', async () => {
      mockFs.existsSync.mockReturnValue(false);
      
      const config = await configManager.loadConfig([{ type: 'env' }]);
      
      expect(config.version).toBe('1.0.0');
      expect(config.environment).toBe('development');
      expect(config.concurrency).toBe(3);
      expect(config.platforms).toEqual([]);
    });

    it('should load configuration from JSON file', async () => {
      const testConfig = {
        version: '2.0.0',
        environment: 'production',
        concurrency: 5
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(testConfig));

      const config = await configManager.loadConfig([{
        type: 'file',
        path: '/test/config.json'
      }]);

      expect(config.version).toBe('2.0.0');
      expect(config.environment).toBe('production');
      expect(config.concurrency).toBe(5);
    });

    it('should merge configurations from multiple sources', async () => {
      const fileConfig = { version: '2.0.0', concurrency: 5 };

      mockFs.readFileSync.mockReturnValue(JSON.stringify(fileConfig));

      // Mock environment variables
      process.env.SYNDICATION_ENVIRONMENT = 'production';

      const config = await configManager.loadConfig([
        { type: 'file', path: '/test/config.json' },
        { type: 'env' }
      ]);

      expect(config.version).toBe('2.0.0');
      expect(config.concurrency).toBe(5);
      expect(config.environment).toBe('production');

      delete process.env.SYNDICATION_ENVIRONMENT;
    });
  });

  describe('getPlatformConfig', () => {
    it('should return platform configuration when it exists', async () => {
      const config: Partial<GlobalConfig> = {
        platforms: [{
          platform: 'reddit',
          enabled: true,
          baseUrl: 'https://oauth.reddit.com',
          auth: { type: 'oauth2', clientId: 'test', clientSecret: 'test' },
          rateLimit: { requestsPerMinute: 60, requestsPerHour: 600, requestsPerDay: 1000, burstLimit: 10 },
          retryConfig: { maxRetries: 3, baseDelay: 1000, maxDelay: 30000, backoffMultiplier: 2 },
          settings: { subreddits: ['test'], postType: 'link' as const }
        }]
      };

      await configManager.loadConfig([{ type: 'inline', data: config }]);

      const platformConfig = configManager.getPlatformConfig('reddit');
      expect(platformConfig).toBeDefined();
      expect(platformConfig?.platform).toBe('reddit');
      expect(platformConfig?.enabled).toBe(true);
    });

    it('should return undefined for non-existent platform', async () => {
      await configManager.loadConfig([{ type: 'inline', data: {} }]);

      const platformConfig = configManager.getPlatformConfig('non-existent');
      expect(platformConfig).toBeUndefined();
    });
  });

  describe('getEnabledPlatforms', () => {
    it('should return only enabled platforms', async () => {
      const config: Partial<GlobalConfig> = {
        platforms: [
          {
            platform: 'reddit',
            enabled: true,
            baseUrl: 'test',
            auth: { type: 'oauth2' },
            rateLimit: { requestsPerMinute: 60, requestsPerHour: 600, requestsPerDay: 1000, burstLimit: 10 },
            retryConfig: { maxRetries: 3, baseDelay: 1000, maxDelay: 30000, backoffMultiplier: 2 },
            settings: {}
          },
          {
            platform: 'dev.to',
            enabled: false,
            baseUrl: 'test',
            auth: { type: 'api_key' },
            rateLimit: { requestsPerMinute: 30, requestsPerHour: 300, requestsPerDay: 1000, burstLimit: 5 },
            retryConfig: { maxRetries: 3, baseDelay: 1000, maxDelay: 30000, backoffMultiplier: 2 },
            settings: {}
          }
        ]
      };

      await configManager.loadConfig([{ type: 'inline', data: config }]);

      const enabledPlatforms = configManager.getEnabledPlatforms();
      expect(enabledPlatforms).toHaveLength(1);
      expect(enabledPlatforms[0].platform).toBe('reddit');
    });
  });
});