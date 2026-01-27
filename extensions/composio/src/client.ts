import { Composio } from "@composio/core";
import type {
  ComposioConfig,
  ToolSearchResult,
  ToolExecutionResult,
  MultiExecutionItem,
  MultiExecutionResult,
  ConnectionStatus,
} from "./types.js";

/**
 * Composio client wrapper for Clawdbot integration
 */
export class ComposioClient {
  private client: Composio;
  private config: ComposioConfig;

  constructor(config: ComposioConfig) {
    if (!config.apiKey) {
      throw new Error(
        "Composio API key required. Set COMPOSIO_API_KEY env var or plugins.composio.apiKey in config."
      );
    }
    this.config = config;
    this.client = new Composio({ apiKey: config.apiKey });
  }

  /**
   * Get the user ID to use for API calls
   */
  private getUserId(overrideUserId?: string): string {
    return overrideUserId || this.config.defaultUserId || "default";
  }

  /**
   * Check if a toolkit is allowed based on config
   */
  private isToolkitAllowed(toolkit: string): boolean {
    const { allowedToolkits, blockedToolkits } = this.config;

    if (blockedToolkits?.includes(toolkit.toLowerCase())) {
      return false;
    }

    if (allowedToolkits && allowedToolkits.length > 0) {
      return allowedToolkits.includes(toolkit.toLowerCase());
    }

    return true;
  }

  /**
   * Search for tools matching a query using Composio Tool Router semantic search
   */
  async searchTools(
    query: string,
    options?: {
      toolkits?: string[];
      limit?: number;
      userId?: string;
    }
  ): Promise<ToolSearchResult[]> {
    const userId = this.getUserId(options?.userId);

    try {
      // Execute COMPOSIO_SEARCH_TOOLS meta-tool for semantic search
      const response = await this.client.client.tools.execute("COMPOSIO_SEARCH_TOOLS", {
        arguments: {
          queries: [{ use_case: query }],
          session: { generate_id: true },
        },
      } as Record<string, unknown>);

      const data = (response as { data?: Record<string, unknown> })?.data;
      if (!data) {
        return [];
      }

      // Extract results from the semantic search response
      const searchResults = (data.results as Array<{
        primary_tool_slugs?: string[];
        related_tool_slugs?: string[];
        toolkits?: string[];
      }>) || [];

      const toolSchemas = (data.tool_schemas as Record<string, {
        toolkit?: string;
        tool_slug?: string;
        description?: string;
        input_schema?: Record<string, unknown>;
      }>) || {};

      // Build results from primary and related tools
      const results: ToolSearchResult[] = [];
      const seenSlugs = new Set<string>();

      for (const result of searchResults) {
        // Add primary tools first
        const allSlugs = [
          ...(result.primary_tool_slugs || []),
          ...(result.related_tool_slugs || []),
        ];

        for (const slug of allSlugs) {
          if (seenSlugs.has(slug)) continue;
          seenSlugs.add(slug);

          const schema = toolSchemas[slug];
          const toolkit = schema?.toolkit || slug.split("_")[0] || "";

          // Filter by allowed toolkits
          if (!this.isToolkitAllowed(toolkit)) continue;

          // Filter by requested toolkits if specified
          if (options?.toolkits && options.toolkits.length > 0) {
            if (!options.toolkits.some(t => t.toLowerCase() === toolkit.toLowerCase())) {
              continue;
            }
          }

          results.push({
            name: slug,
            slug: slug,
            description: schema?.description || "",
            toolkit: toolkit,
            parameters: schema?.input_schema || {},
          });

          if (options?.limit && results.length >= options.limit) break;
        }

        if (options?.limit && results.length >= options.limit) break;
      }

      return results;
    } catch (err) {
      throw new Error(
        `Failed to search tools: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Execute a single tool
   */
  async executeTool(
    toolSlug: string,
    args: Record<string, unknown>,
    userId?: string
  ): Promise<ToolExecutionResult> {
    const uid = this.getUserId(userId);

    try {
      // Extract toolkit from tool slug (format: TOOLKIT_ACTION)
      const toolkit = toolSlug.split("_")[0]?.toLowerCase() || "";
      if (!this.isToolkitAllowed(toolkit)) {
        return {
          success: false,
          error: `Toolkit '${toolkit}' is not allowed by plugin configuration`,
        };
      }

      const result = await this.client.tools.execute(uid, toolSlug, args);

      return {
        success: true,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Execute multiple tools in parallel
   */
  async multiExecute(
    executions: MultiExecutionItem[],
    userId?: string
  ): Promise<MultiExecutionResult> {
    const uid = this.getUserId(userId);

    // Limit to 50 executions
    const limitedExecutions = executions.slice(0, 50);

    const results = await Promise.all(
      limitedExecutions.map(async (exec) => {
        const result = await this.executeTool(exec.tool_slug, exec.arguments, uid);
        return {
          tool_slug: exec.tool_slug,
          ...result,
        };
      })
    );

    return { results };
  }

  /**
   * Get connection status for toolkits
   */
  async getConnectionStatus(
    toolkits?: string[],
    userId?: string
  ): Promise<ConnectionStatus[]> {
    const uid = this.getUserId(userId);

    // Connection item type from API response
    type ConnectionItem = {
      toolkit?: { slug?: string };
      status?: string;
      id?: string;
    };

    try {
      const response = await this.client.connectedAccounts.list({
        userId: uid,
      });

      // Handle both array and {items: [...]} response formats
      const connections = (
        Array.isArray(response)
          ? response
          : (response as { items?: unknown[] })?.items || []
      ) as ConnectionItem[];

      // Only consider ACTIVE connections as "connected"
      const activeConnections = connections.filter((c) => c.status === "ACTIVE");

      const statuses: ConnectionStatus[] = [];
      const connectedToolkits = new Set(
        activeConnections.map((c) => c.toolkit?.slug?.toLowerCase())
      );

      // If specific toolkits requested, check those
      if (toolkits && toolkits.length > 0) {
        for (const toolkit of toolkits) {
          if (!this.isToolkitAllowed(toolkit)) continue;
          statuses.push({
            toolkit,
            connected: connectedToolkits.has(toolkit.toLowerCase()),
            userId: uid,
          });
        }
      } else {
        // Return all connected toolkits (only active ones)
        for (const conn of activeConnections) {
          const toolkit = conn.toolkit?.slug || "";
          if (!toolkit || !this.isToolkitAllowed(toolkit)) continue;
          statuses.push({
            toolkit,
            connected: true,
            userId: uid,
          });
        }
      }

      return statuses;
    } catch (err) {
      throw new Error(
        `Failed to get connection status: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Create an auth connection for a toolkit
   */
  async createConnection(
    toolkit: string,
    userId?: string
  ): Promise<{ authUrl: string } | { error: string }> {
    const uid = this.getUserId(userId);

    if (!this.isToolkitAllowed(toolkit)) {
      return { error: `Toolkit '${toolkit}' is not allowed by plugin configuration` };
    }

    try {
      const authConfig = await this.client.authConfigs.create({
        appName: toolkit.toUpperCase(),
        useComposioManagedAuth: true,
      });

      const connection = await this.client.connectedAccounts.initiate({
        authConfigId: authConfig.id,
        userId: uid,
      });

      return { authUrl: connection.connectionUrl || "" };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * List available toolkits
   */
  async listToolkits(): Promise<string[]> {
    try {
      // Use low-level client for better error messages
      const response = await this.client.client.toolkits.list();
      const toolkits = response?.items || [];
      return toolkits
        .map((tk: { slug?: string; name?: string }) => tk.slug || tk.name || "")
        .filter((name: string) => name && this.isToolkitAllowed(name));
    } catch (err: unknown) {
      // Try to extract detailed error from Composio API response
      const errObj = err as { status?: number; error?: { error?: { message?: string } } };
      if (errObj?.status === 401) {
        throw new Error("Invalid Composio API key. Get a valid key from platform.composio.dev/settings");
      }
      const apiMsg = errObj?.error?.error?.message;
      throw new Error(
        `Failed to list toolkits: ${apiMsg || (err instanceof Error ? err.message : String(err))}`
      );
    }
  }

  /**
   * Disconnect a toolkit
   */
  async disconnectToolkit(
    toolkit: string,
    userId?: string
  ): Promise<{ success: boolean; error?: string }> {
    const uid = this.getUserId(userId);

    // Connection item type from API response
    type ConnectionItem = {
      toolkit?: { slug?: string };
      status?: string;
      id: string;
    };

    try {
      const response = await this.client.connectedAccounts.list({
        userId: uid,
      });

      // Handle both array and {items: [...]} response formats
      const connections = (
        Array.isArray(response)
          ? response
          : (response as { items?: unknown[] })?.items || []
      ) as ConnectionItem[];

      const conn = connections.find(
        (c) => c.toolkit?.slug?.toLowerCase() === toolkit.toLowerCase()
      );

      if (!conn) {
        return { success: false, error: `No connection found for toolkit '${toolkit}'` };
      }

      await this.client.connectedAccounts.delete({ connectedAccountId: conn.id });
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

/**
 * Create a Composio client instance
 */
export function createComposioClient(config: ComposioConfig): ComposioClient {
  return new ComposioClient(config);
}
