#!/usr/bin/env node

import { Command } from 'commander';
import * as dotenv from 'dotenv';
import { ConfigManager } from './config';
import { SyndicationEngine } from './core';
import { RedditAdapter, DevToAdapter, GitHubAdapter } from './adapters';
import { Tool, ToolValidator } from './models';
import { Logger } from './utils';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

const program = new Command();
const logger = new Logger('CLI');

interface CliTool extends Omit<Tool, 'id'> {
  id?: string;
}

program
  .name('syndicate')
  .description('Automated Developer Tool Syndication System')
  .version('1.0.0');

program
  .command('syndicate')
  .description('Syndicate a tool to configured platforms')
  .option('-f, --file <path>', 'Tool configuration file (JSON/YAML)')
  .option('-p, --platforms <platforms>', 'Comma-separated list of platforms to target')
  .option('-d, --dry-run', 'Preview what would be posted without actually posting')
  .option('-c, --concurrent', 'Post to platforms concurrently')
  .option('--config <path>', 'Path to configuration file')
  .option('--tool-name <name>', 'Tool name')
  .option('--tool-url <url>', 'Tool URL')
  .option('--short-description <desc>', 'Short description')
  .option('--long-description <desc>', 'Long description')
  .option('--categories <categories>', 'Comma-separated categories')
  .option('--audience <audience>', 'Comma-separated target audience')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('--github-url <url>', 'GitHub repository URL')
  .option('--docs-url <url>', 'Documentation URL')
  .option('--version <version>', 'Tool version')
  .action(async (options) => {
    try {
      const configManager = new ConfigManager();
      await configManager.loadConfig();

      let tool: Tool;

      if (options.file) {
        tool = await loadToolFromFile(options.file);
      } else {
        tool = createToolFromOptions(options);
      }

      // Validate tool
      const validation = ToolValidator.validate(tool);
      if (!validation.isValid) {
        logger.error('Tool validation failed:', validation.errors);
        process.exit(1);
      }

      // Create syndication engine
      const engine = new SyndicationEngine(configManager, createAdapters(configManager));

      // Parse platforms if specified
      const platforms = options.platforms ? options.platforms.split(',').map((p: string) => p.trim()) : undefined;

      // Syndicate
      const result = await engine.syndicate(tool, {
        platforms,
        dryRun: options.dryRun,
        concurrent: options.concurrent
      });

      // Display results
      displayResults(result);

      if (!result.success) {
        process.exit(1);
      }
    } catch (error) {
      logger.error('Syndication failed:', error);
      process.exit(1);
    }
  });

program
  .command('retry')
  .description('Retry failed publications')
  .option('--tool-id <id>', 'Retry failed publications for specific tool')
  .option('--config <path>', 'Path to configuration file')
  .action(async (options) => {
    try {
      const configManager = new ConfigManager();
      await configManager.loadConfig();

      const engine = new SyndicationEngine(configManager, createAdapters(configManager));
      const results = await engine.retryFailed(options.toolId);

      results.forEach(result => {
        displayResults(result);
      });

      const hasFailures = results.some(r => !r.success);
      if (hasFailures) {
        process.exit(1);
      }
    } catch (error) {
      logger.error('Retry failed:', error);
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Configuration management')
  .option('--init', 'Initialize configuration file')
  .option('--validate', 'Validate current configuration')
  .option('--show', 'Show current configuration')
  .option('--set <key=value>', 'Set configuration value')
  .action(async (options) => {
    try {
      const configManager = new ConfigManager();

      if (options.init) {
        await initializeConfig(configManager);
      } else if (options.validate) {
        await validateConfig(configManager);
      } else if (options.show) {
        await showConfig(configManager);
      } else if (options.set) {
        await setConfigValue(configManager, options.set);
      } else {
        console.log('Please specify an action: --init, --validate, --show, or --set');
        process.exit(1);
      }
    } catch (error) {
      logger.error('Configuration command failed:', error);
      process.exit(1);
    }
  });

program
  .command('platforms')
  .description('List available platforms and their status')
  .option('--config <path>', 'Path to configuration file')
  .action(async (options) => {
    try {
      const configManager = new ConfigManager();
      await configManager.loadConfig();

      const config = configManager.getConfig();
      
      console.log('\n📋 Platform Status\n');
      console.log('Platform'.padEnd(15) + 'Status'.padEnd(10) + 'Configuration');
      console.log('-'.repeat(50));

      for (const platform of config.platforms) {
        const status = platform.enabled ? '✅ Enabled' : '❌ Disabled';
        const authType = platform.auth.type.toUpperCase();
        console.log(
          platform.platform.padEnd(15) + 
          status.padEnd(10) + 
          `Auth: ${authType}`
        );
      }

      if (config.platforms.length === 0) {
        console.log('No platforms configured. Run "syndicate config --init" to get started.');
      }
    } catch (error) {
      logger.error('Failed to list platforms:', error);
      process.exit(1);
    }
  });

async function loadToolFromFile(filePath: string): Promise<Tool> {
  const fullPath = path.resolve(filePath);
  
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Tool file not found: ${fullPath}`);
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  const ext = path.extname(fullPath).toLowerCase();

  let toolData: CliTool;

  if (ext === '.json') {
    toolData = JSON.parse(content);
  } else if (ext === '.yaml' || ext === '.yml') {
    const yaml = require('js-yaml');
    toolData = yaml.load(content);
  } else {
    throw new Error(`Unsupported file format: ${ext}. Use .json, .yaml, or .yml`);
  }

  // Generate ID if not provided
  if (!toolData.id) {
    toolData.id = generateToolId(toolData.name);
  }

  return toolData as Tool;
}

function createToolFromOptions(options: any): Tool {
  if (!options.toolName || !options.toolUrl || !options.shortDescription || !options.longDescription) {
    throw new Error('Required options: --tool-name, --tool-url, --short-description, --long-description');
  }

  const tool: Tool = {
    id: generateToolId(options.toolName),
    name: options.toolName,
    shortDescription: options.shortDescription,
    longDescription: options.longDescription,
    url: options.toolUrl,
    category: options.categories ? options.categories.split(',').map((c: string) => c.trim()) : ['development'],
    targetAudience: options.audience ? options.audience.split(',').map((a: string) => a.trim()) : ['developers'],
    tags: options.tags ? options.tags.split(',').map((t: string) => t.trim()) : [],
    version: options.version,
    githubUrl: options.githubUrl,
    documentationUrl: options.docsUrl
  };

  return tool;
}

function generateToolId(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function createAdapters(configManager: ConfigManager) {
  const adapters = [];
  const config = configManager.getConfig();

  for (const platformConfig of config.platforms) {
    if (!platformConfig.enabled) continue;

    switch (platformConfig.platform) {
      case 'reddit':
        adapters.push(new RedditAdapter(platformConfig as any));
        break;
      case 'dev.to':
        adapters.push(new DevToAdapter(platformConfig as any));
        break;
      case 'github':
        adapters.push(new GitHubAdapter(platformConfig as any));
        break;
      default:
        logger.warn(`Unknown platform: ${platformConfig.platform}`);
    }
  }

  return adapters;
}

function displayResults(result: any) {
  console.log(`\n🚀 Syndication Results for: ${result.tool.name}\n`);
  
  console.log('📊 Summary:');
  console.log(`  Total: ${result.summary.total}`);
  console.log(`  ✅ Successful: ${result.summary.successful}`);
  console.log(`  ❌ Failed: ${result.summary.failed}`);
  console.log(`  ⏭️  Skipped: ${result.summary.skipped}`);
  
  console.log('\n📝 Publications:');
  result.publications.forEach((pub: any) => {
    const status = pub.status === 'success' ? '✅' : 
                   pub.status === 'failed' ? '❌' : 
                   pub.status === 'in_progress' ? '🔄' : '⏳';
    
    console.log(`  ${status} ${pub.platform}: ${pub.url || pub.error || 'Pending'}`);
  });

  if (result.errors.length > 0) {
    console.log('\n❌ Errors:');
    result.errors.forEach((error: string) => {
      console.log(`  • ${error}`);
    });
  }

  console.log(`\n${result.success ? '✅ Syndication completed successfully!' : '❌ Syndication completed with errors'}\n`);
}

async function initializeConfig(configManager: ConfigManager) {
  const defaultConfig = {
    version: "1.0.0",
    environment: "development",
    concurrency: 3,
    defaultRetries: 3,
    logLevel: "info",
    platforms: [],
    templates: {
      default: "{name}: {shortDescription}\n\n{url}",
      reddit: "{name} - {shortDescription}",
      twitter: "🚀 {name}: {shortDescription} {url}",
      github: "## {name}\n\n{shortDescription}\n\n**Link:** {url}"
    }
  };

  await configManager.loadConfig([{ type: 'inline', data: defaultConfig }]);
  await configManager.saveConfig();
  console.log('✅ Configuration file initialized: syndication.config.json');
  console.log('💡 Configure platforms by setting environment variables or editing the config file.');
}

async function validateConfig(configManager: ConfigManager) {
  try {
    await configManager.loadConfig();
    const config = configManager.getConfig();
    
    console.log('✅ Configuration is valid');
    console.log(`📋 Found ${config.platforms.length} platform(s) configured`);
    
    const enabledPlatforms = config.platforms.filter(p => p.enabled);
    console.log(`🚀 ${enabledPlatforms.length} platform(s) enabled: ${enabledPlatforms.map(p => p.platform).join(', ')}`);
  } catch (error) {
    console.log('❌ Configuration validation failed:', error);
    process.exit(1);
  }
}

async function showConfig(configManager: ConfigManager) {
  try {
    await configManager.loadConfig();
    const config = configManager.getConfig();
    
    // Redact sensitive information
    const sanitizedConfig = JSON.parse(JSON.stringify(config));
    sanitizedConfig.platforms.forEach((platform: any) => {
      if (platform.auth.apiKey) platform.auth.apiKey = '***REDACTED***';
      if (platform.auth.token) platform.auth.token = '***REDACTED***';
      if (platform.auth.clientSecret) platform.auth.clientSecret = '***REDACTED***';
      if (platform.auth.refreshToken) platform.auth.refreshToken = '***REDACTED***';
    });
    
    console.log(JSON.stringify(sanitizedConfig, null, 2));
  } catch (error) {
    console.log('❌ Failed to show configuration:', error);
    process.exit(1);
  }
}

async function setConfigValue(configManager: ConfigManager, keyValue: string) {
  const [key, value] = keyValue.split('=', 2);
  if (!key || !value) {
    throw new Error('Invalid format. Use key=value');
  }

  // This is a simplified implementation
  // In a real scenario, you'd want more sophisticated key path handling
  console.log(`Setting ${key} = ${value}`);
  console.log('💡 This feature is not yet implemented. Please edit the config file directly.');
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at promise', { promise, reason });
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

program.parse();