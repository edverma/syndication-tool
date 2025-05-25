# Syndication Tool

Automated Developer Tool Syndication System - Distribute your open source developer tools across multiple platforms with a single command.

[![npm version](https://badge.fury.io/js/syndication-tool.svg)](https://badge.fury.io/js/syndication-tool)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🚀 Features

- **Multi-Platform Support**: Syndicate to Reddit, Dev.to, GitHub Discussions, and more
- **Single Command Deployment**: Publish to all platforms with one command
- **Smart Content Formatting**: Automatically adapts content to each platform's requirements
- **Rate Limit Management**: Built-in rate limiting and retry logic
- **Flexible Configuration**: JSON, YAML, or environment variable configuration
- **Dry Run Mode**: Preview what will be posted before publishing
- **Concurrent Publishing**: Parallel posting for faster distribution
- **Error Handling**: Graceful failure handling with retry capabilities

## 📦 Installation

```bash
# Install globally
npm install -g syndication-tool

# Or install locally
npm install syndication-tool
```

## 🏃 Quick Start

### 1. Initialize Configuration

```bash
syndicate config --init
```

### 2. Set Up Platform Credentials

Create environment variables for your platforms:

```bash
# Reddit
export REDDIT_CLIENT_ID="your_reddit_client_id"
export REDDIT_CLIENT_SECRET="your_reddit_client_secret"
export REDDIT_SUBREDDITS="programming,webdev"

# Dev.to
export DEVTO_API_KEY="your_devto_api_key"
export DEVTO_TAGS="opensource,tools"

# GitHub
export GITHUB_TOKEN="your_github_token"
export GITHUB_REPOSITORIES="owner/repo1,owner/repo2"

# LinkedIn
export LINKEDIN_CLIENT_ID="your_linkedin_client_id"
export LINKEDIN_CLIENT_SECRET="your_linkedin_client_secret"

# Twitter/X
export TWITTER_API_KEY="your_twitter_api_key"
export TWITTER_API_SECRET="your_twitter_api_secret"

# Hacker News
export HACKERNEWS_USERNAME="your_hackernews_username"
export HACKERNEWS_PASSWORD="your_hackernews_password"
```

### 3. Syndicate Your Tool

```bash
syndicate syndicate \
  --tool-name "My Awesome Tool" \
  --tool-url "https://github.com/user/awesome-tool" \
  --short-description "A fantastic tool for developers" \
  --long-description "This tool helps developers be more productive by automating common tasks..." \
  --categories "productivity,automation" \
  --audience "developers,devops"
```

## 📋 Supported Platforms

| Platform | Status | Features |
|----------|--------|----------|
| Reddit | ✅ | Multiple subreddits, automatic flair, link/text posts |
| Dev.to | ✅ | Article publishing, tags, canonical URLs |
| GitHub Discussions | ✅ | Multiple repositories, discussion categories |
| LinkedIn | ✅ | Professional network posts, company pages |
| Twitter/X | ✅ | Tweet publishing, thread support |
| Hacker News | ✅ | Story submissions, community integration |

## 🔧 Configuration

### Configuration File

Create `syndication.config.json` in your project root:

```json
{
  "version": "1.0.0",
  "environment": "production",
  "concurrency": 3,
  "defaultRetries": 3,
  "logLevel": "info",
  "platforms": [
    {
      "platform": "reddit",
      "enabled": true,
      "baseUrl": "https://oauth.reddit.com",
      "auth": {
        "type": "oauth2",
        "clientId": "${REDDIT_CLIENT_ID}",
        "clientSecret": "${REDDIT_CLIENT_SECRET}"
      },
      "settings": {
        "subreddits": ["programming", "webdev"],
        "postType": "link",
        "titleTemplate": "{name} - {shortDescription}"
      }
    }
  ],
  "templates": {
    "reddit": "{name} - {shortDescription}",
    "github": "## {name}\\n\\n{shortDescription}\\n\\n**Link:** {url}"
  }
}
```

### Tool Configuration File

Create a `tool.json` file to store your tool information:

```json
{
  "name": "Syndication Tool",
  "shortDescription": "Automated syndication system for developer tools",
  "longDescription": "A comprehensive system that enables single-command distribution of open source developer tools across multiple online platforms...",
  "url": "https://github.com/example/syndication-tool",
  "category": ["automation", "productivity", "developer-tools"],
  "targetAudience": ["developers", "devops-engineers", "open-source-maintainers"],
  "tags": ["automation", "syndication", "social-media", "marketing"],
  "version": "1.0.0",
  "githubUrl": "https://github.com/example/syndication-tool",
  "documentationUrl": "https://docs.example.com/syndication-tool"
}
```

Then syndicate using the file:

```bash
syndicate syndicate --file tool.json
```

## 🎯 CLI Commands

### Syndicate a Tool

```bash
# From command line arguments
syndicate syndicate \
  --tool-name "Tool Name" \
  --tool-url "https://example.com" \
  --short-description "Brief description" \
  --long-description "Detailed description" \
  --categories "cat1,cat2" \
  --audience "developers,testers"

# From configuration file
syndicate syndicate --file tool.json

# With options
syndicate syndicate --file tool.json \
  --platforms "reddit,dev.to" \
  --dry-run \
  --concurrent
```

### Configuration Management

```bash
# Initialize configuration
syndicate config --init

# Validate configuration
syndicate config --validate

# Show current configuration (sensitive data redacted)
syndicate config --show

# Set a configuration value
syndicate config --set platforms.reddit.enabled=false
```

### Platform Management

```bash
# List platforms and their status
syndicate platforms
```

### Retry Failed Publications

```bash
# Retry all failed publications
syndicate retry

# Retry failed publications for specific tool
syndicate retry --tool-id "my-tool"
```

## 🔑 Platform Setup

### Reddit

1. Create a Reddit application at https://www.reddit.com/prefs/apps
2. Set environment variables:
   ```bash
   export REDDIT_CLIENT_ID="your_client_id"
   export REDDIT_CLIENT_SECRET="your_client_secret"
   export REDDIT_SUBREDDITS="programming,webdev"
   ```

### Dev.to

1. Get your API key from https://dev.to/settings/extensions
2. Set environment variable:
   ```bash
   export DEVTO_API_KEY="your_api_key"
   export DEVTO_TAGS="opensource,tools"
   ```

### GitHub

1. Create a personal access token at https://github.com/settings/tokens
2. Grant `public_repo` and `write:discussion` permissions
3. Set environment variables:
   ```bash
   export GITHUB_TOKEN="your_token"
   export GITHUB_REPOSITORIES="owner/repo1,owner/repo2"
   export GITHUB_DISCUSSION_CATEGORY="General"
   ```

### LinkedIn

1. Create a LinkedIn application at https://www.linkedin.com/developers/apps
2. Configure OAuth 2.0 redirect URLs
3. Set environment variables:
   ```bash
   export LINKEDIN_CLIENT_ID="your_client_id"
   export LINKEDIN_CLIENT_SECRET="your_client_secret"
   export LINKEDIN_REDIRECT_URI="your_redirect_uri"
   ```

### Twitter/X

1. Create a Twitter application at https://developer.twitter.com/apps
2. Generate OAuth 1.0a credentials
3. Set environment variables:
   ```bash
   export TWITTER_API_KEY="your_api_key"
   export TWITTER_API_SECRET="your_api_secret"
   export TWITTER_ACCESS_TOKEN="your_access_token"
   export TWITTER_ACCESS_TOKEN_SECRET="your_access_token_secret"
   ```

### Hacker News

1. Create a Hacker News account at https://news.ycombinator.com
2. Obtain your account credentials
3. Set environment variables:
   ```bash
   export HACKERNEWS_USERNAME="your_username"
   export HACKERNEWS_PASSWORD="your_password"
   ```

## 🎨 Content Templates

Customize how your content appears on each platform using templates:

```json
{
  "templates": {
    "reddit": "{name} - {shortDescription}",
    "dev.to": "🚀 {name}: {shortDescription}",
    "github": "## {name}\\n\\n{shortDescription}\\n\\n**Link:** {url}",
    "linkedin": "🚀 {name}: {shortDescription}\\n\\n{url}\\n\\n#developers #opensource",
    "twitter": "🚀 {name}: {shortDescription} {url} #{tags}",
    "hackernews": "{name}: {shortDescription}"
  }
}
```

Available template variables:
- `{name}` - Tool name
- `{shortDescription}` - Short description
- `{longDescription}` - Long description
- `{url}` - Tool URL
- `{version}` - Tool version
- `{tags}` - Comma-separated tags
- `{timestamp}` - Current timestamp
- `{date}` - Current date

## 🔄 Error Handling & Retries

The tool includes comprehensive error handling:

- **Automatic Retries**: Failed publications are automatically retried with exponential backoff
- **Rate Limit Handling**: Built-in rate limiting prevents API quota exhaustion
- **Graceful Degradation**: Failures on one platform don't affect others
- **Detailed Logging**: Comprehensive logs help troubleshoot issues

## 📊 Examples

The `examples/` directory contains sample configuration files:

- `syndication.config.example.json` - Complete platform configuration
- `tool-example.json` - Sample tool definition

Copy these files and customize them for your needs:

```bash
cp examples/syndication.config.example.json syndication.config.json
cp examples/tool-example.json tool.json
# Edit the files with your platform credentials and tool information
```

### Basic Tool Syndication

```bash
syndicate syndicate \
  --tool-name "DevTools CLI" \
  --tool-url "https://github.com/example/devtools-cli" \
  --short-description "Command-line tools for modern web development" \
  --long-description "A comprehensive CLI toolkit that streamlines web development workflows..." \
  --categories "cli,web-development,tools" \
  --audience "frontend-developers,fullstack-developers"
```

### Platform-Specific Syndication

```bash
# Only to specific platforms
syndicate syndicate \
  --file tool.json \
  --platforms "reddit,dev.to,github,linkedin"
```

### Dry Run Mode

```bash
# Preview what would be posted
syndicate syndicate \
  --file tool.json \
  --dry-run
```

### Concurrent Publishing

```bash
# Publish to platforms in parallel
syndicate syndicate \
  --file tool.json \
  --concurrent
```

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run linting
npm run lint

# Type checking
npm run typecheck
```

## 📚 API Documentation

### Programmatic Usage

```typescript
import { SyndicationEngine, ConfigManager } from 'syndication-tool';
import { RedditAdapter, DevToAdapter, GitHubAdapter } from 'syndication-tool/adapters';

const configManager = new ConfigManager();
await configManager.loadConfig();

const adapters = [
  new RedditAdapter(configManager.getPlatformConfig('reddit')),
  new DevToAdapter(configManager.getPlatformConfig('dev.to')),
  new GitHubAdapter(configManager.getPlatformConfig('github'))
];

const engine = new SyndicationEngine(configManager, adapters);

const tool = {
  id: 'my-tool',
  name: 'My Tool',
  shortDescription: 'A great tool',
  longDescription: 'This is a comprehensive tool...',
  url: 'https://example.com',
  category: ['development'],
  targetAudience: ['developers']
};

const result = await engine.syndicate(tool, {
  platforms: ['reddit', 'dev.to', 'github'],
  dryRun: false,
  concurrent: true
});

console.log('Syndication result:', result);
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 🐛 Troubleshooting

### Common Issues

**Authentication Failures**
- Verify your API keys and tokens are correct
- Check that tokens have the required permissions
- Ensure environment variables are properly set

**Rate Limiting**
- The tool automatically handles rate limits
- Consider reducing concurrency if you hit limits frequently

**Platform-Specific Errors**
- Check platform documentation for content requirements
- Verify your account has permission to post
- Some platforms may have karma or age requirements

**Configuration Issues**
- Validate your configuration with `syndicate config --validate`
- Check the logs for detailed error messages

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by the need to automate open source tool promotion
- Built with TypeScript for type safety and developer experience
- Uses industry-standard libraries for reliability

## 🔗 Links

- [GitHub Repository](https://github.com/syndication-tool/syndication-tool)
- [Issue Tracker](https://github.com/syndication-tool/syndication-tool/issues)
- [NPM Package](https://www.npmjs.com/package/syndication-tool)