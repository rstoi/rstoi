export interface CloudApiMessage {
  messaging_product: "whatsapp";
  to: string;
  type:
    | "text"
    | "image"
    | "video"
    | "audio"
    | "document"
    | "sticker"
    | "location"
    | "reaction"
    | "template";
  text?: { body: string; preview_url?: boolean };
  image?: { id?: string; link?: string; caption?: string };
  video?: { id?: string; link?: string; caption?: string };
  audio?: { id?: string; link?: string };
  document?: { id?: string; link?: string; caption?: string; filename?: string };
  sticker?: { id?: string; link?: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  reaction?: { message_id: string; emoji: string };
  template?: { name: string; language: { code: string }; components?: unknown[] };
  context?: { message_id: string };
}

export interface CloudApiWebhookPayload {
  object: string;
  entry: CloudApiEntry[];
}

export interface CloudApiEntry {
  id: string;
  changes: CloudApiChange[];
}

export interface CloudApiChange {
  value: CloudApiValue;
  field: string;
}

export interface CloudApiValue {
  messaging_product: string;
  metadata: { display_phone_number: string; phone_number_id: string };
  contacts?: CloudApiContact[];
  messages?: CloudApiInboundMessage[];
  statuses?: CloudApiStatus[];
}

export interface CloudApiContact {
  profile: { name: string };
  wa_id: string;
}

export interface CloudApiInboundMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; caption?: string; mime_type: string; sha256: string };
  video?: { id: string; caption?: string; mime_type: string; sha256: string };
  audio?: { id: string; mime_type: string; sha256: string };
  document?: { id: string; caption?: string; filename: string; mime_type: string };
  reaction?: { message_id: string; emoji: string };
  context?: { from: string; id: string };
}

export interface CloudApiStatus {
  id: string;
  status: string;
  timestamp: string;
  recipient_id: string;
}
