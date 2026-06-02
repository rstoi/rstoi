import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerAllPrompts(server: McpServer): void {
  server.prompt(
    "draft_message",
    "Help draft a professional WhatsApp message",
    {
      topic: z.string().describe("Topic or purpose of the message"),
      tone: z.enum(["formal", "casual", "professional"]).default("professional"),
      recipient_type: z.enum(["individual", "group"]).default("individual"),
    },
    ({ topic, tone, recipient_type }) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Draft a ${tone} WhatsApp message for a ${recipient_type} about: ${topic}. Keep it concise and appropriate for WhatsApp format.`,
        },
      }],
    }),
  );

  server.prompt(
    "summarize_conversation",
    "Summarize a WhatsApp conversation",
    {
      messages_json: z.string().describe("JSON array of messages from the get_messages tool"),
    },
    ({ messages_json }) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Summarize the following WhatsApp conversation, highlighting key topics, decisions, and action items:\n\n${messages_json}`,
        },
      }],
    }),
  );

  server.prompt(
    "analyze_group",
    "Analyze group activity and provide insights",
    {
      group_json: z.string().describe("JSON of group info from the get_group tool"),
      messages_json: z.string().describe("JSON array of recent messages"),
    },
    ({ group_json, messages_json }) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Analyze this WhatsApp group and provide insights about activity, most active members, main topics, and recommendations:\n\nGroup: ${group_json}\n\nRecent messages: ${messages_json}`,
        },
      }],
    }),
  );
}
