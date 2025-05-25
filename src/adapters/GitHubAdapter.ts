import axios, { AxiosInstance } from 'axios';
import { BasePlatformAdapter, FormattedContent, PlatformAdapter, PublicationResult } from './PlatformAdapter';
import { Tool, GitHubConfig } from '../models';
import { Logger } from '../utils';

// Removed unused interfaces to fix linting errors

interface GitHubDiscussionCategory {
  id: string;
  name: string;
  emoji: string;
  description: string;
}

export class GitHubAdapter extends BasePlatformAdapter implements PlatformAdapter {
  readonly platform = 'github';
  private client: AxiosInstance;
  private graphqlClient: AxiosInstance;
  private logger: Logger;

  constructor(config: GitHubConfig) {
    super(config);
    this.logger = new Logger('GitHubAdapter');
    
    const headers = {
      'Authorization': `token ${config.auth.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'SyndicationTool/1.0.0'
    };

    this.client = axios.create({
      baseURL: config.baseUrl,
      headers,
      timeout: 30000
    });

    this.graphqlClient = axios.create({
      baseURL: 'https://api.github.com/graphql',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
  }

  async authenticate(): Promise<boolean> {
    try {
      this.logger.debug('Validating GitHub token');
      
      // Test the token by fetching user information
      const response = await this.client.get('/user');
      
      if (response.status === 200 && response.data) {
        this.logger.info(`Successfully authenticated with GitHub as: ${response.data.login}`);
        return true;
      }
      
      return false;
    } catch (error) {
      this.logger.error('Failed to authenticate with GitHub API', error);
      return false;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      const response = await this.client.get('/user');
      return response.status === 200;
    } catch (error) {
      this.logger.debug('GitHub authentication check failed');
      return false;
    }
  }

  async formatContent(tool: Tool): Promise<FormattedContent> {
    const githubConfig = this.config as GitHubConfig;
    const settings = githubConfig.settings;

    // Use custom title template or default format
    const title = settings.titleTemplate 
      ? this.replaceTemplateVariables(settings.titleTemplate, tool)
      : `${tool.name}: ${tool.shortDescription}`;

    // Create markdown content for GitHub Discussion
    const body = this.createMarkdownBody(tool);

    return {
      title,
      body,
      tags: tool.tags,
      metadata: {
        discussionCategory: settings.discussionCategory,
        labels: settings.labels
      }
    };
  }

  async publish(tool: Tool, content: FormattedContent): Promise<PublicationResult> {
    try {
      const githubConfig = this.config as GitHubConfig;
      const results: PublicationResult[] = [];

      for (const repository of githubConfig.settings.repositories) {
        try {
          const result = await this.createDiscussion(repository, content);
          results.push(result);
          
          if (result.success) {
            this.logger.info(`Successfully created discussion in ${repository}: ${result.url}`);
          } else {
            this.logger.warn(`Failed to create discussion in ${repository}: ${result.error}`);
          }

          // Add delay between repository posts to respect rate limits
          if (githubConfig.settings.repositories.length > 1) {
            await this.sleep(1000); // 1 second delay
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(`Error creating discussion in ${repository}:`, error);
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
        error: lastResult?.error || 'Failed to create discussion in any repository',
        retryable: results.some(r => r.retryable)
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to publish to GitHub:', error);
      
      return {
        success: false,
        error: errorMessage,
        retryable: this.isRetryableError(error)
      };
    }
  }

  private async createDiscussion(
    repository: string, 
    content: FormattedContent
  ): Promise<PublicationResult> {
    // First, get repository information and discussion categories
    const [owner, repo] = repository.split('/');
    if (!owner || !repo) {
      throw new Error(`Invalid repository format: ${repository}. Expected format: owner/repo`);
    }

    // Get repository ID and discussion category
    const repoInfo = await this.getRepositoryInfo(owner, repo);
    const categoryId = await this.getDiscussionCategoryId(repoInfo.id, content.metadata?.discussionCategory || 'General');

    // Create discussion using GraphQL API
    const mutation = `
      mutation CreateDiscussion($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
        createDiscussion(input: {
          repositoryId: $repositoryId,
          categoryId: $categoryId,
          title: $title,
          body: $body
        }) {
          discussion {
            id
            number
            title
            url
          }
        }
      }
    `;

    const variables = {
      repositoryId: repoInfo.id,
      categoryId,
      title: content.title,
      body: content.body
    };

    const response = await this.retryWithExponentialBackoff(async () => {
      return await this.graphqlClient.post('', {
        query: mutation,
        variables
      });
    });

    if (response.data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
    }

    const discussion = response.data.data.createDiscussion.discussion;

    return {
      success: true,
      postId: discussion.id,
      url: discussion.url
    };
  }

  private async getRepositoryInfo(owner: string, repo: string): Promise<{ id: string; name: string }> {
    const query = `
      query GetRepository($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          id
          name
          hasDiscussionsEnabled
        }
      }
    `;

    const response = await this.graphqlClient.post('', {
      query,
      variables: { owner, name: repo }
    });

    if (response.data.errors) {
      throw new Error(`Failed to get repository info: ${JSON.stringify(response.data.errors)}`);
    }

    const repository = response.data.data.repository;
    if (!repository) {
      throw new Error(`Repository ${owner}/${repo} not found`);
    }

    if (!repository.hasDiscussionsEnabled) {
      throw new Error(`Discussions are not enabled for repository ${owner}/${repo}`);
    }

    return {
      id: repository.id,
      name: repository.name
    };
  }

  private async getDiscussionCategoryId(repositoryId: string, categoryName: string): Promise<string> {
    const query = `
      query GetDiscussionCategories($repositoryId: ID!) {
        node(id: $repositoryId) {
          ... on Repository {
            discussionCategories(first: 10) {
              nodes {
                id
                name
                emoji
                description
              }
            }
          }
        }
      }
    `;

    const response = await this.graphqlClient.post('', {
      query,
      variables: { repositoryId }
    });

    if (response.data.errors) {
      throw new Error(`Failed to get discussion categories: ${JSON.stringify(response.data.errors)}`);
    }

    const categories = response.data.data.node.discussionCategories.nodes;
    const category = categories.find((cat: GitHubDiscussionCategory) => 
      cat.name.toLowerCase() === categoryName.toLowerCase()
    );

    if (!category) {
      // Fall back to the first available category
      if (categories.length > 0) {
        this.logger.warn(`Category '${categoryName}' not found, using '${categories[0].name}' instead`);
        return categories[0].id;
      }
      throw new Error(`No discussion categories found and '${categoryName}' does not exist`);
    }

    return category.id;
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
      tool.category.forEach(cat => {
        body += `- ${cat}\n`;
      });
      body += `\n`;
    }

    // Add target audience section
    if (tool.targetAudience && tool.targetAudience.length > 0) {
      body += `## 👥 Target Audience\n\n`;
      tool.targetAudience.forEach(audience => {
        body += `- ${audience}\n`;
      });
      body += `\n`;
    }

    // Add tags section
    if (tool.tags && tool.tags.length > 0) {
      body += `## 🏷️ Tags\n\n`;
      body += tool.tags.map(tag => `\`${tag}\``).join(' ');
      body += `\n\n`;
    }

    // Add call to action
    body += `---\n\n`;
    body += `💬 **What do you think about ${tool.name}?** Share your thoughts and experiences!\n\n`;
    body += `🔗 **Try it out:** [${tool.url}](${tool.url})\n\n`;
    
    if (tool.githubUrl) {
      body += `⭐ **Show your support:** Give it a star on [GitHub](${tool.githubUrl})`;
    }

    return body;
  }

  getPostUrl(postId: string): string {
    // GitHub discussions don't have a direct URL format based on ID alone
    // The URL is returned in the create response
    return `https://github.com/discussions/${postId}`;
  }

  async deletePost(postId: string): Promise<boolean> {
    try {
      const mutation = `
        mutation DeleteDiscussion($id: ID!) {
          deleteDiscussion(input: { id: $id }) {
            discussion {
              id
            }
          }
        }
      `;

      await this.retryWithExponentialBackoff(async () => {
        return await this.graphqlClient.post('', {
          query: mutation,
          variables: { id: postId }
        });
      });
      
      this.logger.info(`Successfully deleted GitHub discussion: ${postId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete GitHub discussion ${postId}:`, error);
      return false;
    }
  }

  async validateConfig(): Promise<{ isValid: boolean; errors: string[] }> {
    const baseValidation = await super.validateConfig();
    if (!baseValidation.isValid) {
      return baseValidation;
    }

    const errors: string[] = [];
    const githubConfig = this.config as GitHubConfig;

    if (!githubConfig.auth.token) {
      errors.push('GitHub token is required');
    }

    if (!githubConfig.settings.repositories || githubConfig.settings.repositories.length === 0) {
      errors.push('At least one repository must be specified');
    }

    // Validate repository format
    githubConfig.settings.repositories.forEach(repo => {
      if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo)) {
        errors.push(`Invalid repository format: ${repo}. Expected format: owner/repo`);
      }
    });

    if (!githubConfig.settings.discussionCategory) {
      errors.push('Discussion category is required');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}