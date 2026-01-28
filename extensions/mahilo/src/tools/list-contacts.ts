/**
 * list_mahilo_contacts Tool
 *
 * Lists friends and groups on Mahilo that you can message.
 */

import { Type } from "@sinclair/typebox";

import { getMahiloClient } from "../client/mahilo-api.js";
import { resolveConfig } from "../config.js";
import { ErrorCodes, MahiloError } from "../types.js";

import type { MoltbotPluginApi } from "clawdbot/plugin-sdk";

export function createListContactsTool(api: MoltbotPluginApi) {
  return {
    name: "list_mahilo_contacts",
    description: `List your friends and groups on Mahilo that you can message.

Use this when you need to:
- See who you can contact via Mahilo
- Check if a specific user is in your friends list
- See the groups you're a member of
- Find the username or group id of someone/something you want to message`,

    parameters: Type.Object({
      status: Type.Optional(
        Type.String({
          description: 'Filter friends by status: "accepted" (default), "pending", or "all"',
        }),
      ),
      include_groups: Type.Optional(
        Type.Boolean({
          description: "Include groups you're a member of (default: true)",
        }),
      ),
    }),

    async execute(_id: string, params: Record<string, unknown>) {
      const statusParam = params.status ? String(params.status).trim().toLowerCase() : "accepted";
      const includeGroups = params.include_groups !== false; // Default to true
      const config = resolveConfig(api.pluginConfig);

      // Get Mahilo client
      let mahiloClient;
      try {
        mahiloClient = getMahiloClient(config);
      } catch (err) {
        if (err instanceof MahiloError) {
          return formatError(err.message);
        }
        return formatError("Failed to initialize Mahilo client");
      }

      try {
        // Fetch friends
        const status =
          statusParam === "all"
            ? undefined
            : (statusParam as "accepted" | "pending" | "blocked");
        const friends = await mahiloClient.getFriends(status);

        // Fetch groups if requested
        const groups = includeGroups ? await mahiloClient.getGroups().catch(() => []) : [];

        if (friends.length === 0 && groups.length === 0) {
          if (statusParam === "accepted") {
            return formatResult(
              "You have no friends or groups on Mahilo yet. Add friends or join groups via the Mahilo dashboard to start messaging.",
            );
          }
          return formatResult(`No ${statusParam} friend requests found.`);
        }

        let result = "Your Mahilo contacts:\n\n";

        // Friends section
        const accepted = friends.filter((f) => f.status === "accepted");
        const pending = friends.filter((f) => f.status === "pending");

        if (accepted.length > 0) {
          result += "**Friends:**\n";
          for (const friend of accepted) {
            const displayName = friend.display_name ? ` (${friend.display_name})` : "";
            result += `- ${friend.username}${displayName}\n`;
          }
        }

        if (pending.length > 0 && (statusParam === "pending" || statusParam === "all")) {
          if (accepted.length > 0) result += "\n";
          result += "**Pending Requests:**\n";
          for (const friend of pending) {
            const displayName = friend.display_name ? ` (${friend.display_name})` : "";
            result += `- ${friend.username}${displayName}\n`;
          }
        }

        // Groups section
        if (groups.length > 0) {
          if (friends.length > 0) result += "\n";
          result += "**Groups:**\n";
          for (const group of groups) {
            const description = group.description ? ` - ${group.description}` : "";
            const memberCount = group.member_count ? ` (${group.member_count} members)` : "";
            result += `- ${group.name}${memberCount}${description}\n`;
            result += `  ID: ${group.id}\n`;
          }
        }

        return formatResult(result.trim());
      } catch (err) {
        if (err instanceof MahiloError) {
          if (err.code === ErrorCodes.INVALID_API_KEY) {
            return formatError(
              "Mahilo API key is invalid or not configured. Check your plugin configuration.",
            );
          }
          return formatResult(`Failed to fetch contacts: ${err.message}`);
        }
        if (err instanceof Error) {
          return formatResult(`Failed to fetch contacts: ${err.message}`);
        }
        return formatResult("Failed to fetch contacts: Unknown error");
      }
    },
  };
}

function formatResult(text: string) {
  return {
    content: [{ type: "text", text }],
  };
}

function formatError(text: string) {
  return {
    content: [{ type: "text", text: `Error: ${text}` }],
    isError: true,
  };
}
