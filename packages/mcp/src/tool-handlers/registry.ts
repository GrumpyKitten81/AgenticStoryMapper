import { DomainError, humanOnlyRestoreToolNames, type McpToolName, type McpToolResult } from "@storymapper/contracts";

export type McpToolHandler = (input: unknown, recordProjectIds?: (projectIds: string[], parsedInput?: unknown) => void) => McpToolResult | Promise<McpToolResult>;

export class McpToolRegistry {
  private readonly handlers = new Map<McpToolName, { handler: McpToolHandler; atomic: boolean }>();

  constructor(private readonly audit?: (name: unknown, input: unknown, invoke: (recordProjectIds?: (projectIds: string[], parsedInput?: unknown) => void) => McpToolResult | Promise<McpToolResult>, atomic?: boolean) => Promise<McpToolResult>) {}

  register(name: McpToolName, handler: McpToolHandler, options: { atomic?: boolean } = {}): void {
    this.handlers.set(name, { handler, atomic: options.atomic ?? false });
  }

  async call(name: unknown, input: unknown, validate?: () => void): Promise<McpToolResult> {
    const registered = typeof name === "string" ? this.handlers.get(name as McpToolName) : undefined;
    const invoke = (recordProjectIds?: (projectIds: string[], parsedInput?: unknown) => void) => {
      validate?.();
      if (typeof name !== "string" || !name) throw new DomainError("validation", "Request validation failed.");
      if (humanOnlyRestoreToolNames.includes(name)) throw new DomainError("disabled", "Project restore is human-only and is not available through MCP.");
      if (!registered) throw new DomainError("not_found", "Tool is not available through MCP.");
      return registered.handler(input, recordProjectIds);
    };
    return this.audit ? this.audit(name, input, invoke, registered?.atomic) : invoke();
  }
}
