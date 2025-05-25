export interface Tool {
  id: string;
  name: string;
  shortDescription: string;
  longDescription: string;
  url: string;
  category: string[];
  targetAudience: string[];
  version?: string;
  documentationUrl?: string;
  githubUrl?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface ToolValidationResult {
  isValid: boolean;
  errors: string[];
}

export class ToolValidator {
  static validate(tool: Tool): ToolValidationResult {
    const errors: string[] = [];

    if (!tool.id || tool.id.trim().length === 0) {
      errors.push('Tool ID is required');
    }

    if (!tool.name || tool.name.trim().length === 0) {
      errors.push('Tool name is required');
    }

    if (!tool.shortDescription || tool.shortDescription.trim().length === 0) {
      errors.push('Short description is required');
    }

    if (tool.shortDescription && tool.shortDescription.length > 280) {
      errors.push('Short description must be 280 characters or less');
    }

    if (!tool.longDescription || tool.longDescription.trim().length === 0) {
      errors.push('Long description is required');
    }

    if (!tool.url || !this.isValidUrl(tool.url)) {
      errors.push('Valid URL is required');
    }

    if (!tool.category || tool.category.length === 0) {
      errors.push('At least one category is required');
    }

    if (!tool.targetAudience || tool.targetAudience.length === 0) {
      errors.push('At least one target audience is required');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
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