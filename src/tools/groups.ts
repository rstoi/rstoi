import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WhatsAppAdapter } from "../adapters/base.js";

export function registerGroupTools(server: McpServer, adapter: WhatsAppAdapter): void {
  server.tool(
    "list_groups",
    "List all WhatsApp groups the account participates in",
    {},
    async () => {
      const groups = await adapter.listGroups();
      return { content: [{ type: "text" as const, text: JSON.stringify(groups) }] };
    },
  );

  server.tool(
    "get_group",
    "Get detailed info about a group including its members",
    {
      group_id: z.string().describe("Group JID (e.g. 120363xxx@g.us)"),
    },
    async ({ group_id }) => {
      const group = await adapter.getGroup(group_id);
      if (!group) throw new Error(`Group ${group_id} not found`);
      return { content: [{ type: "text" as const, text: JSON.stringify(group) }] };
    },
  );

  server.tool(
    "create_group",
    "Create a new WhatsApp group",
    {
      name: z.string().describe("Group name"),
      participants: z.array(z.string()).min(1).describe("Phone numbers or JIDs to add"),
    },
    async ({ name, participants }) => {
      const group = await adapter.createGroup(name, participants);
      return { content: [{ type: "text" as const, text: JSON.stringify(group) }] };
    },
  );

  server.tool(
    "update_group",
    "Update a group's name or description",
    {
      group_id: z.string().describe("Group JID"),
      name: z.string().optional().describe("New group name"),
      description: z.string().optional().describe("New group description"),
    },
    async ({ group_id, name, description }) => {
      await adapter.updateGroup(group_id, { name, description });
      return { content: [{ type: "text" as const, text: "Group updated successfully" }] };
    },
  );

  server.tool(
    "add_group_member",
    "Add a participant to a group",
    {
      group_id: z.string().describe("Group JID"),
      phone: z.string().describe("Phone number or JID to add"),
    },
    async ({ group_id, phone }) => {
      await adapter.addGroupMember(group_id, phone);
      return { content: [{ type: "text" as const, text: `Added ${phone} to group ${group_id}` }] };
    },
  );

  server.tool(
    "remove_group_member",
    "Remove a participant from a group",
    {
      group_id: z.string().describe("Group JID"),
      phone: z.string().describe("Phone number or JID to remove"),
    },
    async ({ group_id, phone }) => {
      await adapter.removeGroupMember(group_id, phone);
      return { content: [{ type: "text" as const, text: `Removed ${phone} from group ${group_id}` }] };
    },
  );

  server.tool(
    "promote_group_member",
    "Promote a group member to admin",
    {
      group_id: z.string().describe("Group JID"),
      phone: z.string().describe("Phone number or JID to promote"),
    },
    async ({ group_id, phone }) => {
      await adapter.promoteGroupMember(group_id, phone);
      return { content: [{ type: "text" as const, text: `Promoted ${phone} to admin` }] };
    },
  );

  server.tool(
    "demote_group_member",
    "Demote a group admin to regular member",
    {
      group_id: z.string().describe("Group JID"),
      phone: z.string().describe("Phone number or JID to demote"),
    },
    async ({ group_id, phone }) => {
      await adapter.demoteGroupMember(group_id, phone);
      return { content: [{ type: "text" as const, text: `Demoted ${phone} from admin` }] };
    },
  );

  server.tool(
    "leave_group",
    "Leave a WhatsApp group",
    {
      group_id: z.string().describe("Group JID"),
    },
    async ({ group_id }) => {
      await adapter.leaveGroup(group_id);
      return { content: [{ type: "text" as const, text: `Left group ${group_id}` }] };
    },
  );

  server.tool(
    "get_group_invite_link",
    "Get the invite link for a group",
    {
      group_id: z.string().describe("Group JID"),
    },
    async ({ group_id }) => {
      const link = await adapter.getGroupInviteLink(group_id);
      return { content: [{ type: "text" as const, text: link }] };
    },
  );
}
