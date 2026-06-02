import type {
  Message,
  Chat,
  Group,
  Contact,
  SendMessageOptions,
  SentMessage,
  PaginationOpts,
  GroupUpdate,
  BusinessProfile,
  MessageTemplate,
  MediaUploadResult,
} from "../types/index.js";

export abstract class WhatsAppAdapter {
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract isConnected(): boolean;

  // Messaging
  abstract sendMessage(to: string, opts: SendMessageOptions): Promise<SentMessage>;
  abstract editMessage(messageId: string, chatId: string, newText: string): Promise<void>;
  abstract deleteMessage(messageId: string, chatId: string, forEveryone?: boolean): Promise<void>;
  abstract reactToMessage(messageId: string, chatId: string, emoji: string): Promise<void>;
  abstract markAsRead(chatId: string, messageId?: string): Promise<void>;

  // Reading
  abstract getMessages(chatId: string, opts?: PaginationOpts): Promise<Message[]>;
  abstract getMessage(messageId: string): Promise<Message | null>;

  // Chats
  abstract listChats(): Promise<Chat[]>;

  // Groups
  abstract listGroups(): Promise<Group[]>;
  abstract getGroup(groupId: string): Promise<Group | null>;
  abstract createGroup(name: string, participants: string[]): Promise<Group>;
  abstract updateGroup(groupId: string, updates: GroupUpdate): Promise<void>;
  abstract addGroupMember(groupId: string, phone: string): Promise<void>;
  abstract removeGroupMember(groupId: string, phone: string): Promise<void>;
  abstract promoteGroupMember(groupId: string, phone: string): Promise<void>;
  abstract demoteGroupMember(groupId: string, phone: string): Promise<void>;
  abstract leaveGroup(groupId: string): Promise<void>;
  abstract getGroupInviteLink(groupId: string): Promise<string>;

  // Contacts
  abstract listContacts(): Promise<Contact[]>;
  abstract getContact(contactId: string): Promise<Contact | null>;
  abstract blockContact(contactId: string): Promise<void>;
  abstract unblockContact(contactId: string): Promise<void>;

  // Media
  abstract uploadMedia(buffer: Buffer, mimeType: string, fileName?: string): Promise<MediaUploadResult>;
  abstract downloadMedia(mediaId: string): Promise<Buffer>;

  // Profile
  abstract getBusinessProfile(): Promise<BusinessProfile>;
  abstract updateBusinessProfile(updates: Partial<BusinessProfile>): Promise<void>;

  // Templates (Cloud API only — optional)
  listTemplates?(): Promise<MessageTemplate[]>;

  // Webhook (Cloud API)
  verifyWebhook?(token: string, challenge: string): string;
  processWebhookPayload?(payload: unknown): Promise<void>;

  // Event handlers (set by consumer)
  onMessage?: (message: Message) => void;
  onMessageUpdate?: (messageId: string, status: string) => void;
  onGroupUpdate?: (group: Partial<Group> & { id: string }) => void;
  onContactUpdate?: (contact: Partial<Contact> & { id: string }) => void;
}
