import { Tool, ToolValidator } from '../models/Tool';

describe('ToolValidator', () => {
  const validTool: Tool = {
    id: 'test-tool',
    name: 'Test Tool',
    shortDescription: 'A test tool for developers',
    longDescription: 'This is a comprehensive test tool designed to help developers with testing their applications.',
    url: 'https://example.com/test-tool',
    category: ['testing', 'development'],
    targetAudience: ['developers', 'testers'],
    tags: ['testing', 'automation'],
    version: '1.0.0',
    githubUrl: 'https://github.com/example/test-tool',
    documentationUrl: 'https://docs.example.com/test-tool'
  };

  it('should validate a valid tool', () => {
    const result = ToolValidator.validate(validTool);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should require tool ID', () => {
    const tool = { ...validTool, id: '' };
    const result = ToolValidator.validate(tool);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Tool ID is required');
  });

  it('should require tool name', () => {
    const tool = { ...validTool, name: '' };
    const result = ToolValidator.validate(tool);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Tool name is required');
  });

  it('should require short description', () => {
    const tool = { ...validTool, shortDescription: '' };
    const result = ToolValidator.validate(tool);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Short description is required');
  });

  it('should limit short description to 280 characters', () => {
    const tool = { ...validTool, shortDescription: 'x'.repeat(281) };
    const result = ToolValidator.validate(tool);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Short description must be 280 characters or less');
  });

  it('should require long description', () => {
    const tool = { ...validTool, longDescription: '' };
    const result = ToolValidator.validate(tool);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Long description is required');
  });

  it('should require valid URL', () => {
    const tool = { ...validTool, url: 'not-a-url' };
    const result = ToolValidator.validate(tool);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Valid URL is required');
  });

  it('should require at least one category', () => {
    const tool = { ...validTool, category: [] };
    const result = ToolValidator.validate(tool);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('At least one category is required');
  });

  it('should require at least one target audience', () => {
    const tool = { ...validTool, targetAudience: [] };
    const result = ToolValidator.validate(tool);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('At least one target audience is required');
  });
});