import { DomainError, humanOnlyRestoreToolNames } from '@storymapper/contracts';
import { describe, expect, it, vi } from 'vitest';
import { canUseTool, proposalOnlyPermissions } from '@storymapper/mcp/permissions/permissions';
import { McpToolRegistry } from '@storymapper/mcp/tool-handlers/registry';
import { storyMapperMcpTools } from '@storymapper/mcp/tool-definitions/tools';
import { createStoryMapperMcpServer, invokeMcpTool } from '@storymapper/mcp/transports/server';

describe('MCP permission and execution boundaries', () => {
  it('permits read/proposal tools and refuses approval/write/provider/admin tools by default', () => {
    expect(storyMapperMcpTools.length).toBeGreaterThan(0);
    for (const tool of storyMapperMcpTools) expect(canUseTool(tool, proposalOnlyPermissions)).toBe(['read', 'proposal'].includes(tool.permission));
    const approval = storyMapperMcpTools.find((tool) => tool.permission === 'approval')!;
    const { approval: _approval, ...withoutApproval } = proposalOnlyPermissions;
    expect(canUseTool(approval, withoutApproval)).toBe(false);
  });

  it('audits validation failures, unavailable names and forbidden restore without invoking a handler', async () => {
    const audit = vi.fn(async (_name, _input, invoke) => invoke());
    const registry = new McpToolRegistry(audit);
    const handler = vi.fn(() => ({ data: [] }));
    registry.register('ListProjects', handler);
    await expect(registry.call(null, {})).rejects.toMatchObject({ code: 'validation' });
    await expect(registry.call('MissingTool', {})).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.call(humanOnlyRestoreToolNames[0], {})).rejects.toMatchObject({ code: 'disabled' });
    await expect(registry.call('ListProjects', {}, () => { throw new DomainError('disabled', 'Disabled.'); })).rejects.toMatchObject({ code: 'disabled' });
    expect(audit).toHaveBeenCalledTimes(4);
    expect(handler).not.toHaveBeenCalled();
  });

  it('preserves atomic audit metadata, parsed scope recording and handler results', async () => {
    const record = vi.fn();
    const audit = vi.fn(async (_name, _input, invoke, atomic) => { expect(atomic).toBe(true); return invoke(record); });
    const registry = new McpToolRegistry(audit);
    registry.register('ListProjects', (input, recordScope) => { recordScope?.(['project'], input); return { data: [] }; }, { atomic: true });
    expect(await registry.call('ListProjects', { projectId: 'project' })).toEqual({ data: [] });
    expect(record).toHaveBeenCalledWith(['project'], { projectId: 'project' });
    expect(audit).toHaveBeenCalledOnce();
    const direct = new McpToolRegistry();
    direct.register('ListProjects', () => ({ data: ['available'] }));
    expect(await direct.call('ListProjects', {})).toEqual({ data: ['available'] });
  });

  it('serializes tool results and converts domain errors into structured MCP error content', async () => {
    expect(await invokeMcpTool(async () => ({ data: ['retained'] }))).toEqual({ content: [{ type: 'text', text: JSON.stringify({ data: ['retained'] }, null, 2) }] });
    const failed = await invokeMcpTool(async () => { throw new DomainError('disabled', 'Disabled.'); });
    expect(failed.isError).toBe(true);
    expect(JSON.parse((failed.content[0] as { text: string }).text)).toMatchObject({ code: 'disabled', message: 'Disabled.' });
  });

  registerTransportCases();
});

function registerTransportCases(): void {
  it('constructs the actual public server with all tool registrations and optional prompt handlers', async () => {
    const callTool = vi.fn(async () => ({ data: [] }));
    const server = createStoryMapperMcpServer({ name: 'boundary-test', version: '1.0.0', callTool, prompts: { listPrompts: () => ({ prompts: [] }), getPrompt: () => ({ messages: [] }) } });
    expect(server).toBeDefined();
    expect(callTool).not.toHaveBeenCalled();
    await server.close();
    await createStoryMapperMcpServer({ name: 'without-prompts', version: '1.0.0', callTool }).close();
  });
}
