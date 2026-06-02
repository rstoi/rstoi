export type MessageType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "sticker"
  | "location"
  | "template";

export type MessageStatus = "sent" | "delivered" | "read" | "failed" | "pending";

export interface Message {
  id: string;
  chatId: string;
  fromId: string;
  fromName?: string;
  type: MessageType;
  text?: string;
  mediaId?: string;
  mediaUrl?: string;
  mimeType?: string;
  fileName?: string;
  latitude?: number;
  longitude?: number;
  quotedMessageId?: string;
  timestamp: number;
  status?: MessageStatus;
  isGroup: boolean;
  isFromMe: boolean;
}

export interface Chat {
  id: string;
  name: string;
  isGroup: boolean;
  lastMessageAt?: number;
  unreadCount?: number;
  participantCount?: number;
}

export interface GroupMember {
  id: string;
  name?: string;
  isAdmin: boolean;
  isSuperAdmin?: boolean;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  pictureUrl?: string;
  members: GroupMember[];
  createdAt?: number;
  inviteLink?: string;
}

export interface Contact {
  id: string;
  name?: string;
  pushName?: string;
  businessName?: string;
  phone: string;
  pictureUrl?: string;
  statusMessage?: string;
  isBlocked?: boolean;
}

export interface SendMessageOptions {
  text?: string;
  mediaId?: string;
  mediaType?: "image" | "video" | "audio" | "document" | "sticker";
  mediaUrl?: string;
  mimeType?: string;
  fileName?: string;
  caption?: string;
  quotedMessageId?: string;
  emoji?: string;
  latitude?: number;
  longitude?: number;
  templateName?: string;
  templateLanguage?: string;
  templateComponents?: unknown[];
}

export interface SentMessage {
  id: string;
  timestamp: number;
}

export interface PaginationOpts {
  limit?: number;
  before?: number;
  after?: number;
}

export interface GroupUpdate {
  name?: string;
  description?: string;
  picture?: Buffer;
}

export interface BusinessProfile {
  id: string;
  name: string;
  phone: string;
  about?: string;
  email?: string;
  address?: string;
  website?: string;
  category?: string;
}

export interface MessageTemplate {
  id: string;
  name: string;
  language: string;
  status: "approved" | "pending" | "rejected";
  category: string;
  components: unknown[];
}

export interface MediaUploadResult {
  mediaId: string;
  url?: string;
  mimeType: string;
  sha256?: string;
  fileSize?: number;
}
