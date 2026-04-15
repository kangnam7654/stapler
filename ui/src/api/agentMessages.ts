import { api } from "./client";

export interface AgentMessage {
  id: string;
  companyId: string;
  threadId: string | null;
  senderAgentId: string;
  recipientAgentId: string;
  messageType: string;
  body: string;
  payload: Record<string, unknown>;
  status: string;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SendMessageInput {
  recipientAgentId: string;
  messageType?: string;
  body: string;
  payload?: Record<string, unknown>;
  threadId?: string | null;
}

export const agentMessagesApi = {
  send: (companyId: string, agentId: string, data: SendMessageInput) =>
    api.post<AgentMessage>(`/companies/${companyId}/agents/${agentId}/messages`, data),

  inbox: (companyId: string, agentId: string, opts?: { status?: string; limit?: number; cursor?: string }) => {
    const params = new URLSearchParams();
    if (opts?.status) params.set("status", opts.status);
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.cursor) params.set("cursor", opts.cursor);
    const qs = params.toString();
    return api.get<AgentMessage[]>(`/companies/${companyId}/agents/${agentId}/messages/inbox${qs ? `?${qs}` : ""}`);
  },

  sent: (companyId: string, agentId: string, opts?: { limit?: number; cursor?: string }) => {
    const params = new URLSearchParams();
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.cursor) params.set("cursor", opts.cursor);
    const qs = params.toString();
    return api.get<AgentMessage[]>(`/companies/${companyId}/agents/${agentId}/messages/sent${qs ? `?${qs}` : ""}`);
  },

  thread: (companyId: string, threadId: string) =>
    api.get<AgentMessage[]>(`/companies/${companyId}/messages/threads/${threadId}`),

  timeline: (companyId: string, opts?: { limit?: number; cursor?: string; messageType?: string }) => {
    const params = new URLSearchParams();
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.cursor) params.set("cursor", opts.cursor);
    if (opts?.messageType) params.set("messageType", opts.messageType);
    const qs = params.toString();
    return api.get<AgentMessage[]>(`/companies/${companyId}/messages/timeline${qs ? `?${qs}` : ""}`);
  },

  markRead: (companyId: string, messageId: string, agentId?: string) => {
    const qs = agentId ? `?agentId=${agentId}` : "";
    return api.patch<AgentMessage>(`/companies/${companyId}/messages/${messageId}/read${qs}`, {});
  },

  markThreadRead: (companyId: string, threadId: string, agentId?: string) => {
    const qs = agentId ? `?agentId=${agentId}` : "";
    return api.patch<{ updated: number }>(`/companies/${companyId}/messages/threads/${threadId}/read${qs}`, {});
  },

  unreadCount: (companyId: string, agentId: string) =>
    api.get<{ count: number }>(`/companies/${companyId}/agents/${agentId}/messages/unread-count`),
};
