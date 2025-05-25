import { Tool, Publication, PublicationStatus, PublicationManager } from '../models';
import { PlatformAdapter } from '../adapters';
import { ConfigManager } from '../config';
import { Logger } from '../utils/Logger';

export interface SyndicationOptions {
  platforms?: string[];
  dryRun?: boolean;
  concurrent?: boolean;
  retryFailed?: boolean;
}

export interface SyndicationResult {
  tool: Tool;
  publications: Publication[];
  success: boolean;
  errors: string[];
  summary: {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
  };
}

export class SyndicationEngine {
  private adapters: Map<string, PlatformAdapter> = new Map();
  private publicationManager: PublicationManager = new PublicationManager();
  private logger: Logger;

  constructor(
    private configManager: ConfigManager,
    adapters: PlatformAdapter[] = []
  ) {
    this.logger = new Logger('SyndicationEngine');
    adapters.forEach(adapter => {
      this.adapters.set(adapter.platform, adapter);
    });
  }

  registerAdapter(adapter: PlatformAdapter): void {
    this.adapters.set(adapter.platform, adapter);
    this.logger.debug(`Registered adapter for platform: ${adapter.platform}`);
  }

  async syndicate(tool: Tool, options: SyndicationOptions = {}): Promise<SyndicationResult> {
    this.logger.info(`Starting syndication for tool: ${tool.name}`);

    const config = this.configManager.getConfig();
    const targetPlatforms = this.getTargetPlatforms(options.platforms);
    const publications: Publication[] = [];
    const errors: string[] = [];

    // Validate tool
    const toolValidation = this.validateTool(tool);
    if (!toolValidation.isValid) {
      return {
        tool,
        publications: [],
        success: false,
        errors: toolValidation.errors,
        summary: { total: 0, successful: 0, failed: 0, skipped: 0 }
      };
    }

    // Check for existing publications if not retrying
    if (!options.retryFailed) {
      const existingPublications = this.publicationManager.getPublicationsByTool(tool.id);
      const successfulPlatforms = existingPublications
        .filter(pub => pub.status === PublicationStatus.SUCCESS)
        .map(pub => pub.platform);
      
      if (successfulPlatforms.length > 0) {
        this.logger.info(`Tool ${tool.name} already published to: ${successfulPlatforms.join(', ')}`);
      }
    }

    if (options.concurrent && config.concurrency > 1) {
      await this.syndicateConcurrently(tool, targetPlatforms, options, publications, errors);
    } else {
      await this.syndicateSequentially(tool, targetPlatforms, options, publications, errors);
    }

    const summary = this.calculateSummary(publications);
    const success = summary.failed === 0 && summary.successful > 0;

    this.logger.info(`Syndication completed for ${tool.name}. Success: ${success}, Summary:`, summary);

    return {
      tool,
      publications,
      success,
      errors,
      summary
    };
  }

  async retryFailed(toolId?: string): Promise<SyndicationResult[]> {
    this.logger.info('Retrying failed publications');

    const failedPublications = toolId 
      ? this.publicationManager.getPublicationsByTool(toolId).filter(pub => pub.status === PublicationStatus.FAILED)
      : this.publicationManager.getFailedPublications();

    const results: SyndicationResult[] = [];
    const toolGroups = this.groupPublicationsByTool(failedPublications);

    for (const [toolId, publications] of toolGroups) {
      const tool = await this.getToolById(toolId);
      if (!tool) {
        this.logger.warn(`Tool not found for ID: ${toolId}`);
        continue;
      }

      const platforms = publications.map(pub => pub.platform);
      const result = await this.syndicate(tool, { 
        platforms, 
        retryFailed: true 
      });
      results.push(result);
    }

    return results;
  }

  private async syndicateConcurrently(
    tool: Tool,
    platforms: string[],
    options: SyndicationOptions,
    publications: Publication[],
    errors: string[]
  ): Promise<void> {
    const config = this.configManager.getConfig();
    const semaphore = new Semaphore(config.concurrency);
    
    const promises = platforms.map(async (platform) => {
      await semaphore.acquire();
      try {
        const publication = await this.syndicateToPlatform(tool, platform, options);
        publications.push(publication);
      } catch (error) {
        const errorMessage = `Failed to syndicate to ${platform}: ${error}`;
        errors.push(errorMessage);
        this.logger.error(errorMessage);
      } finally {
        semaphore.release();
      }
    });

    await Promise.allSettled(promises);
  }

  private async syndicateSequentially(
    tool: Tool,
    platforms: string[],
    options: SyndicationOptions,
    publications: Publication[],
    errors: string[]
  ): Promise<void> {
    for (const platform of platforms) {
      try {
        const publication = await this.syndicateToPlatform(tool, platform, options);
        publications.push(publication);
      } catch (error) {
        const errorMessage = `Failed to syndicate to ${platform}: ${error}`;
        errors.push(errorMessage);
        this.logger.error(errorMessage);
      }
    }
  }

  private async syndicateToPlatform(
    tool: Tool,
    platform: string,
    options: SyndicationOptions
  ): Promise<Publication> {
    this.logger.debug(`Syndicating ${tool.name} to ${platform}`);

    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new Error(`No adapter found for platform: ${platform}`);
    }

    const config = this.configManager.getPlatformConfig(platform);
    if (!config || !config.enabled) {
      throw new Error(`Platform ${platform} is not enabled`);
    }

    // Create publication record
    const publication = this.publicationManager.createPublication(
      tool.id,
      platform,
      config.retryConfig.maxRetries
    );

    try {
      // Update status to in progress
      this.publicationManager.updatePublication(publication.id, {
        status: PublicationStatus.IN_PROGRESS
      });

      // Validate adapter configuration
      const configValidation = await adapter.validateConfig();
      if (!configValidation.isValid) {
        throw new Error(`Invalid configuration: ${configValidation.errors.join(', ')}`);
      }

      // Authenticate if needed
      const isAuthenticated = await adapter.isAuthenticated();
      if (!isAuthenticated) {
        const authResult = await adapter.authenticate();
        if (!authResult) {
          throw new Error('Authentication failed');
        }
      }

      // Format content for the platform
      const formattedContent = await adapter.formatContent(tool);

      if (options.dryRun) {
        this.logger.info(`[DRY RUN] Would publish to ${platform}:`, formattedContent);
        
        this.publicationManager.updatePublication(publication.id, {
          status: PublicationStatus.SUCCESS,
          platformPostId: 'dry-run-' + Date.now(),
          metadata: { dryRun: true, content: formattedContent }
        });
      } else {
        // Publish to platform
        const result = await adapter.publish(tool, formattedContent);
        
        if (result.success) {
          this.publicationManager.updatePublication(publication.id, {
            status: PublicationStatus.SUCCESS,
            platformPostId: result.postId,
            url: result.url,
            metadata: { content: formattedContent }
          });
          
          this.logger.info(`Successfully published ${tool.name} to ${platform}`);
        } else {
          throw new Error(result.error || 'Publication failed');
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.publicationManager.updatePublication(publication.id, {
        status: PublicationStatus.FAILED,
        error: errorMessage
      });

      this.logger.error(`Failed to publish ${tool.name} to ${platform}: ${errorMessage}`);
      throw error;
    }

    return this.publicationManager.getPublication(publication.id)!;
  }

  private getTargetPlatforms(platformFilter?: string[]): string[] {
    const enabledPlatforms = this.configManager.getEnabledPlatforms();
    
    if (platformFilter && platformFilter.length > 0) {
      return enabledPlatforms
        .filter(config => platformFilter.includes(config.platform))
        .map(config => config.platform);
    }

    return enabledPlatforms.map(config => config.platform);
  }

  private validateTool(tool: Tool): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!tool.id) errors.push('Tool ID is required');
    if (!tool.name) errors.push('Tool name is required');
    if (!tool.shortDescription) errors.push('Short description is required');
    if (!tool.url) errors.push('Tool URL is required');

    try {
      new URL(tool.url);
    } catch {
      errors.push('Tool URL must be valid');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private calculateSummary(publications: Publication[]) {
    return {
      total: publications.length,
      successful: publications.filter(pub => pub.status === PublicationStatus.SUCCESS).length,
      failed: publications.filter(pub => pub.status === PublicationStatus.FAILED).length,
      skipped: publications.filter(pub => pub.status === PublicationStatus.PENDING).length
    };
  }

  private groupPublicationsByTool(publications: Publication[]): Map<string, Publication[]> {
    const groups = new Map<string, Publication[]>();
    
    publications.forEach(pub => {
      const existing = groups.get(pub.toolId) || [];
      existing.push(pub);
      groups.set(pub.toolId, existing);
    });

    return groups;
  }

  private async getToolById(_toolId: string): Promise<Tool | null> {
    // This would typically load from a database or file
    // For now, return null as this is just a placeholder
    return null;
  }
}

class Semaphore {
  private permits: number;
  private waiting: (() => void)[] = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise(resolve => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    if (this.waiting.length > 0) {
      const resolve = this.waiting.shift()!;
      resolve();
    } else {
      this.permits++;
    }
  }
}