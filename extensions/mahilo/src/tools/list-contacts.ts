/**
 * list_mahilo_contacts Tool
 *
 * Lists friends on Mahilo that you can message.
 */

import { Type } from "@sinclair/typebox";

import { getMahiloClient } from "../client/mahilo-api.js";
import { resolveConfig } from "../config.js";
import { ErrorCodes, MahiloError } from "../types.js";

import type { MoltbotPluginApi } from "clawdbot/plugin-sdk";

export function createListContactsTool(api: MoltbotPluginApi) {
  return {
    name: "list_mahilo_contacts",
    description: `List your friends on Mahilo that you can message.

Use this when you need to:
- See who you can contact via Mahilo
- Check if a specific user is in your friends list
- Find the username of someone you want to message`,

    parameters: Type.Object({
      status: Type.Optional(
        Type.String({
          description: 'Filter by status: "accepted" (default), "pending", or "all"',
        }),
      ),
    }),

    async execute(_id: string, params: Record<string, unknown>) {
      const statusParam = params.status ? String(params.status).trim().toLowerCase() : "accepted";
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

        if (friends.length === 0) {
          if (statusParam === "accepted") {
            return formatResult(
              "You have no friends on Mahilo yet. Add friends via the Mahilo dashboard to start messaging.",
            );
          }
          return formatResult(`No ${statusParam} friend requests found.`);
        }

        let result = "Your Mahilo contacts:\n\n";

        // Group by status
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
