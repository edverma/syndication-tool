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
| LinkedIn | 🚧 | Coming soon |
| Twitter/X | 🚧 | Coming soon |
| Hacker News | 🚧 | Coming soon |

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

## 🎨 Content Templates

Customize how your content appears on each platform using templates:

```json
{
  "templates": {
    "reddit": "{name} - {shortDescription}",
    "dev.to": "🚀 {name}: {shortDescription}",
    "github": "## {name}\\n\\n{shortDescription}\\n\\n**Link:** {url}",
    "twitter": "🚀 {name}: {shortDescription} {url} #{tags}"
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
# Only to Reddit and Dev.to
syndicate syndicate \
  --file tool.json \
  --platforms "reddit,dev.to"
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
npm run test:coverage

# Run linting
npm run lint

# Type checking
npm run typecheck
```

## 📚 API Documentation

### Programmatic Usage

```typescript
import { SyndicationEngine, ConfigManager, RedditAdapter, DevToAdapter } from 'syndication-tool';

const configManager = new ConfigManager();
await configManager.loadConfig();

const adapters = [
  new RedditAdapter(configManager.getPlatformConfig('reddit')),
  new DevToAdapter(configManager.getPlatformConfig('dev.to'))
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
  platforms: ['reddit', 'dev.to'],
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

- [GitHub Repository](https://github.com/example/syndication-tool)
- [Issue Tracker](https://github.com/example/syndication-tool/issues)
- [Documentation](https://docs.example.com/syndication-tool)
- [NPM Package](https://www.npmjs.com/package/syndication-tool)