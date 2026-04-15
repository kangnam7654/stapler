import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { agentMessagesApi, type AgentMessage, type SendMessageInput } from "../api/agentMessages";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, Send, ArrowLeft, Mail, MailOpen, Inbox } from "lucide-react";
import type { Agent } from "@paperclipai/shared";
import { cn } from "@/lib/utils";
import { useSearchParams } from "@/lib/router";

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString();
}

const MESSAGE_TYPE_LABELS: Record<string, string> = {
  direct: "Direct",
  delegation: "Delegation",
  request: "Request",
  report: "Report",
};

const MESSAGE_TYPE_COLORS: Record<string, string> = {
  direct: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  delegation: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  request: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  report: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

function MessageTypeBadge({ type }: { type: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", MESSAGE_TYPE_COLORS[type] ?? "bg-muted text-muted-foreground")}>
      {MESSAGE_TYPE_LABELS[type] ?? type}
    </span>
  );
}

function agentNameFor(agentMap: Map<string, Agent>, agentId: string, currentAgentId: string) {
  if (agentId === currentAgentId) return "You";
  return agentMap.get(agentId)?.name ?? "Unknown";
}

interface ThreadSummary {
  threadId: string;
  latestMessage: AgentMessage;
  messageCount: number;
  unreadCount: number;
}

function buildThreadSummaries(messages: AgentMessage[], currentAgentId: string) {
  const summaries = new Map<string, ThreadSummary>();
  for (const message of messages) {
    const threadId = message.threadId ?? message.id;
    const summary = summaries.get(threadId);
    if (!summary) {
      summaries.set(threadId, {
        threadId,
        latestMessage: message,
        messageCount: 1,
        unreadCount: message.recipientAgentId === currentAgentId && message.status === "sent" ? 1 : 0,
      });
      continue;
    }

    summary.messageCount += 1;
    if (message.recipientAgentId === currentAgentId && message.status === "sent") {
      summary.unreadCount += 1;
    }
    if (new Date(message.createdAt).getTime() > new Date(summary.latestMessage.createdAt).getTime()) {
      summary.latestMessage = message;
    }
  }
  return Array.from(summaries.values()).sort(
    (a, b) => new Date(b.latestMessage.createdAt).getTime() - new Date(a.latestMessage.createdAt).getTime(),
  );
}

function ComposeMessage({
  companyId,
  senderAgentId,
  agents,
  threadId,
  defaultRecipient,
  onSent,
}: {
  companyId: string;
  senderAgentId: string;
  agents: Agent[];
  threadId?: string | null;
  defaultRecipient?: string;
  onSent: () => void;
}) {
  const [recipientId, setRecipientId] = useState(defaultRecipient ?? "");
  const [body, setBody] = useState("");
  const [messageType, setMessageType] = useState("direct");
  const queryClient = useQueryClient();

  const sendMutation = useMutation({
    mutationFn: (input: SendMessageInput) => agentMessagesApi.send(companyId, senderAgentId, input),
    onSuccess: () => {
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["agent-messages"] });
      onSent();
    },
  });

  const otherAgents = agents.filter((a) => a.id !== senderAgentId && a.status !== "terminated");

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      {!threadId && (
        <div className="flex gap-2">
          <Select value={recipientId} onValueChange={setRecipientId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Recipient..." />
            </SelectTrigger>
            <SelectContent>
              {otherAgents.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={messageType} onValueChange={setMessageType}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="direct">Direct</SelectItem>
              <SelectItem value="delegation">Delegation</SelectItem>
              <SelectItem value="request">Request</SelectItem>
              <SelectItem value="report">Report</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={threadId ? "Reply..." : "Write a message..."}
        rows={3}
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={!body.trim() || (!threadId && !recipientId) || sendMutation.isPending}
          onClick={() => sendMutation.mutate({
            recipientAgentId: recipientId || defaultRecipient!,
            messageType: threadId ? "direct" : messageType,
            body: body.trim(),
            threadId,
          })}
        >
          <Send className="mr-1.5 h-3.5 w-3.5" />
          {sendMutation.isPending ? "Sending..." : "Send"}
        </Button>
      </div>
    </div>
  );
}

function ThreadView({
  companyId,
  threadId,
  agents,
  currentAgentId,
  onBack,
}: {
  companyId: string;
  threadId: string;
  agents: Agent[];
  currentAgentId: string;
  onBack: () => void;
}) {
  const agentMap = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const queryClient = useQueryClient();
  const markedThreadKeyRef = useRef<string | null>(null);
  const { data: messages, isLoading } = useQuery({
    queryKey: queryKeys.agentMessages.thread(companyId, threadId),
    queryFn: () => agentMessagesApi.thread(companyId, threadId),
    refetchInterval: 5000,
  });
  const markThreadRead = useMutation({
    mutationFn: () => agentMessagesApi.markThreadRead(companyId, threadId, currentAgentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-messages"] });
    },
  });

  const rootMessage = messages?.[0];
  const otherAgentId = rootMessage
    ? (rootMessage.senderAgentId === currentAgentId ? rootMessage.recipientAgentId : rootMessage.senderAgentId)
    : "";

  useEffect(() => {
    if (!currentAgentId) return;
    const threadKey = `${threadId}:${currentAgentId}`;
    if (markedThreadKeyRef.current === threadKey) return;
    markedThreadKeyRef.current = threadKey;
    markThreadRead.mutate();
    // We intentionally mark as read whenever the thread becomes active for the current agent view.
    // This keeps unread badges and inbox state aligned with what the user is actually reading.
  }, [currentAgentId, markThreadRead, threadId]);

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back
      </Button>

      <div className="space-y-3">
        {messages?.map((msg) => {
          const sender = agentMap.get(msg.senderAgentId);
          const isSelf = msg.senderAgentId === currentAgentId;
          return (
            <div key={msg.id} className={cn("flex", isSelf ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[70%] rounded-lg px-4 py-2.5",
                isSelf ? "bg-primary text-primary-foreground" : "bg-muted",
              )}>
                <div className="mb-1 flex items-center gap-2 text-xs opacity-70">
                  <span className="font-medium">{sender?.name ?? "Unknown"}</span>
                  <MessageTypeBadge type={msg.messageType} />
                  <span>{formatTime(msg.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{msg.body}</p>
              </div>
            </div>
          );
        })}
      </div>

      <ComposeMessage
        companyId={companyId}
        senderAgentId={currentAgentId}
        agents={agents}
        threadId={threadId}
        defaultRecipient={otherAgentId}
        onSent={() => {}}
      />
    </div>
  );
}

function ConversationTimeline({
  messages,
  agents,
  currentAgentId,
  onSelectThread,
}: {
  messages: AgentMessage[];
  agents: Agent[];
  currentAgentId: string;
  onSelectThread: (threadId: string) => void;
}) {
  const agentMap = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const summaries = useMemo(() => buildThreadSummaries(messages, currentAgentId), [currentAgentId, messages]);

  if (summaries.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        message="No conversations yet"
      />
    );
  }

  return (
    <div className="space-y-2">
      {summaries.map((summary) => {
        const latest = summary.latestMessage;
        const senderName = agentNameFor(agentMap, latest.senderAgentId, currentAgentId);
        const recipientName = agentNameFor(agentMap, latest.recipientAgentId, currentAgentId);
        const isUnread = summary.unreadCount > 0;
        return (
          <button
            key={summary.threadId}
            className={cn(
              "flex w-full items-start gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/50",
              isUnread && "ring-1 ring-blue-500/30",
            )}
            onClick={() => onSelectThread(summary.threadId)}
          >
            <div className="mt-0.5">
              {isUnread ? (
                <Mail className="h-4 w-4 text-blue-500" />
              ) : (
                <MailOpen className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {senderName} → {recipientName}
                </span>
                <MessageTypeBadge type={latest.messageType} />
                <span className="ml-auto text-xs text-muted-foreground">{formatTime(latest.createdAt)}</span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground whitespace-pre-wrap">
                {latest.body}
              </p>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{summary.messageCount} message{summary.messageCount === 1 ? "" : "s"}</span>
                {isUnread && <span className="text-blue-500">{summary.unreadCount} unread</span>}
                <span className="font-mono">thread {summary.threadId.slice(0, 8)}</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function MessageList({
  messages,
  agents,
  currentAgentId,
  mode,
  onSelectThread,
}: {
  messages: AgentMessage[];
  agents: Agent[];
  currentAgentId: string;
  mode: "inbox" | "sent";
  onSelectThread: (threadId: string) => void;
}) {
  const agentMap = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  if (messages.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        message={mode === "inbox" ? "No messages received" : "No messages sent"}
      />
    );
  }

  return (
    <div className="divide-y divide-border rounded-lg border border-border">
      {messages.map((msg) => {
        const other = agentMap.get(mode === "inbox" ? msg.senderAgentId : msg.recipientAgentId);
        const threadRoot = msg.threadId ?? msg.id;
        const isUnread = mode === "inbox" && msg.status === "sent";

        return (
          <button
            key={msg.id}
            className={cn(
              "flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-muted/50",
              isUnread && "bg-blue-50/50 dark:bg-blue-950/20",
            )}
            onClick={() => onSelectThread(threadRoot)}
          >
            <div className="mt-0.5">
              {isUnread ? (
                <Mail className="h-4 w-4 text-blue-500" />
              ) : (
                <MailOpen className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={cn("text-sm font-medium", isUnread && "font-semibold")}>
                  {other?.name ?? "Unknown"}
                </span>
                <MessageTypeBadge type={msg.messageType} />
                <span className="ml-auto text-xs text-muted-foreground">{formatTime(msg.createdAt)}</span>
              </div>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{msg.body}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function AgentMessages() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const initialAgentId = searchParams.get("agentId") ?? "";
  const initialThreadId = searchParams.get("threadId");
  const initialTab = searchParams.get("tab") ?? "inbox";
  const initialActiveTab = initialTab === "inbox" || initialTab === "sent" || initialTab === "timeline" ? initialTab : "inbox";
  const [selectedAgentId, setSelectedAgentId] = useState<string>(initialAgentId);
  const [activeTab, setActiveTab] = useState<string>(initialActiveTab);
  const [selectedThread, setSelectedThread] = useState<string | null>(initialThreadId);
  const [showCompose, setShowCompose] = useState(false);

  useEffect(() => {
    setBreadcrumbs([{ label: "Messages" }]);
  }, [setBreadcrumbs]);

  const { data: agents = [], isLoading: agentsLoading } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  // Auto-select first agent
  useEffect(() => {
    if (agents.length === 0) return;
    if (agents.some((agent) => agent.id === selectedAgentId)) return;

    const active = agents.filter((a: Agent) => a.status !== "terminated");
    if (initialAgentId && agents.some((agent) => agent.id === initialAgentId)) {
      setSelectedAgentId(initialAgentId);
    } else if (active.length > 0) {
      setSelectedAgentId(active[0].id);
    }
  }, [agents, initialAgentId, selectedAgentId]);

  const { data: inboxMessages = [] } = useQuery({
    queryKey: queryKeys.agentMessages.inbox(selectedCompanyId!, selectedAgentId),
    queryFn: () => agentMessagesApi.inbox(selectedCompanyId!, selectedAgentId),
    enabled: !!selectedCompanyId && !!selectedAgentId && activeTab === "inbox",
    refetchInterval: 5000,
  });

  const { data: sentMessages = [] } = useQuery({
    queryKey: queryKeys.agentMessages.sent(selectedCompanyId!, selectedAgentId),
    queryFn: () => agentMessagesApi.sent(selectedCompanyId!, selectedAgentId),
    enabled: !!selectedCompanyId && !!selectedAgentId && activeTab === "sent",
    refetchInterval: 5000,
  });

  const { data: timelineMessages = [], error: timelineError } = useQuery({
    queryKey: queryKeys.agentMessages.timeline(selectedCompanyId!),
    queryFn: () => agentMessagesApi.timeline(selectedCompanyId!, { limit: 200 }),
    enabled: !!selectedCompanyId && activeTab === "timeline",
    refetchInterval: 5000,
    retry: false,
  });

  const { data: unread } = useQuery({
    queryKey: queryKeys.agentMessages.unreadCount(selectedCompanyId!, selectedAgentId),
    queryFn: () => agentMessagesApi.unreadCount(selectedCompanyId!, selectedAgentId),
    enabled: !!selectedCompanyId && !!selectedAgentId,
    refetchInterval: 10000,
  });

  if (agentsLoading) return <PageSkeleton />;

  const activeAgents = agents.filter((a: Agent) => a.status !== "terminated");

  if (selectedThread) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <ThreadView
          companyId={selectedCompanyId!}
          threadId={selectedThread}
          agents={agents}
          currentAgentId={selectedAgentId}
          onBack={() => setSelectedThread(null)}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Messages</h1>
          {unread && unread.count > 0 && (
            <Badge variant="secondary">{unread.count} unread</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedAgentId} onValueChange={(v) => { setSelectedAgentId(v); setSelectedThread(null); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select agent..." />
            </SelectTrigger>
            <SelectContent>
              {activeAgents.map((a: Agent) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setShowCompose(!showCompose)}>
            <Send className="mr-1.5 h-3.5 w-3.5" />
            New Message
          </Button>
        </div>
      </div>

      {showCompose && selectedAgentId && (
        <ComposeMessage
          companyId={selectedCompanyId!}
          senderAgentId={selectedAgentId}
          agents={agents}
          onSent={() => setShowCompose(false)}
        />
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="inbox">
            Inbox
            {unread && unread.count > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">{unread.count}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="sent">Sent</TabsTrigger>
          <TabsTrigger value="timeline">Conversations</TabsTrigger>
        </TabsList>
        <TabsContent value="inbox" className="mt-3">
          <MessageList
            messages={inboxMessages}
            agents={agents}
            currentAgentId={selectedAgentId}
            mode="inbox"
            onSelectThread={setSelectedThread}
          />
        </TabsContent>
        <TabsContent value="sent" className="mt-3">
          <MessageList
            messages={sentMessages}
            agents={agents}
            currentAgentId={selectedAgentId}
            mode="sent"
            onSelectThread={setSelectedThread}
          />
        </TabsContent>
        <TabsContent value="timeline" className="mt-3">
          {timelineError ? (
            <div className="rounded-lg border border-border bg-card p-4 text-sm text-destructive">
              {timelineError instanceof Error ? timelineError.message : "Failed to load conversations"}
            </div>
          ) : (
            <ConversationTimeline
              messages={timelineMessages}
              agents={agents}
              currentAgentId={selectedAgentId}
              onSelectThread={setSelectedThread}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
