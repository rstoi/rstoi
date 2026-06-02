import { z } from "zod";
import { readFile } from "fs/promises";
import { writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WhatsAppAdapter } from "../adapters/base.js";

export function registerMediaTools(server: McpServer, adapter: WhatsAppAdapter): void {
  server.tool(
    "send_media",
    "Send an image, video, audio, or document from a local file path or URL",
    {
      to: z.string().describe("Chat or group JID"),
      media_type: z.enum(["image", "video", "audio", "document"]),
      source: z.string().describe("Local file path or HTTP/HTTPS URL"),
      caption: z.string().optional(),
      file_name: z.string().optional(),
    },
    async ({ to, media_type, source, caption, file_name }) => {
      if (source.startsWith("http://") || source.startsWith("https://")) {
        const result = await adapter.sendMessage(to, {
          mediaType: media_type,
          mediaUrl: source,
          caption,
          fileName: file_name,
        });
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
      }

      const mimeMap: Record<string, string> = {
        image: "image/jpeg",
        video: "video/mp4",
        audio: "audio/mpeg",
        document: "application/octet-stream",
      };
      const buffer = await readFile(source);
      const upload = await adapter.uploadMedia(buffer, mimeMap[media_type]!, file_name);
      const result = await adapter.sendMessage(to, {
        mediaType: media_type,
        mediaId: upload.mediaId,
        caption,
        fileName: file_name,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    "download_media",
    "Download media from a message and save it to a local path",
    {
      media_id: z.string().describe("Media ID from a message"),
      output_path: z.string().describe("Local file path to save the media"),
    },
    async ({ media_id, output_path }) => {
      const buffer = await adapter.downloadMedia(media_id);
      await mkdir(dirname(output_path), { recursive: true });
      await writeFile(output_path, buffer);
      return {
        content: [{ type: "text" as const, text: `Media saved to ${output_path} (${buffer.length} bytes)` }],
      };
    },
  );

  server.tool(
    "get_profile",
    "Get the WhatsApp Business profile of this account",
    {},
    async () => {
      const profile = await adapter.getBusinessProfile();
      return { content: [{ type: "text" as const, text: JSON.stringify(profile) }] };
    },
  );

  server.tool(
    "update_profile",
    "Update the WhatsApp Business profile",
    {
      name: z.string().optional(),
      about: z.string().optional(),
      email: z.string().optional(),
      address: z.string().optional(),
    },
    async (updates) => {
      await adapter.updateBusinessProfile(updates);
      return { content: [{ type: "text" as const, text: "Profile updated" }] };
    },
  );
}
