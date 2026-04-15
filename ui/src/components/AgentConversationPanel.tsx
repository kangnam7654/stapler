import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Agent } from "@paperclipai/shared";
import { agentsApi } from "../api/agents";
import { agentMessagesApi, type AgentMessage } from "../api/agentMessages";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { EmptyState } from "./EmptyState";
import { PageSkeleton } from "./PageSkeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Mail, MailOpen, Send } from "lucide-react";

type ThreadSummary = {
  threadId: string;
  latestMessage: AgentMessage;
  messageCount: number;
  participants: string[];
  unreadCount: number;
};

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString();
}

function buildThreadSummaries(messages: AgentMessage[], currentAgentId: string) {
  const summaries = new Map<string, ThreadSummary>();

  for (const message of messages) {
    if (message.senderAgentId !== currentAgentId && message.recipientAgentId !== currentAgentId) {
      continue;
    }

    const threadId = message.threadId ?? message.id;
    const participants = [message.senderAgentId, message.recipientAgentId]
      .filter((id, index, arr) => arr.indexOf(id) === index);
    const summary = summaries.get(threadId);

    if (!summary) {
      summaries.set(threadId, {
        threadId,
        latestMessage: message,
        messageCount: 1,
        participants,
        unreadCount: message.recipientAgentId === currentAgentId && message.status === "sent" ? 1 : 0,
      });
      continue;
    }

    summary.messageCount += 1;
    for (const participant of participants) {
      if (!summary.participants.includes(participant)) {
        summary.participants.push(participant);
      }
    }
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

function otherParticipantName(agentMap: Map<string, Agent>, thread: ThreadSummary, currentAgentId: string) {
  const otherId = thread.participants.find((id) => id !== currentAgentId);
  return otherId ? (agentMap.get(otherId)?.name ?? "Unknown") : "Unknown";
}

function MessageBubble({
  message,
  isSelf,
  senderName,
}: {
  message: AgentMessage;
  isSelf: boolean;
  senderName: string;
}) {
  return (
    <div className={cn("flex", isSelf ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-4 py-3 shadow-sm",
          isSelf ? "bg-primary text-primary-foreground" : "bg-muted",
        )}
      >
        <div className="mb-1 flex items-center gap-2 text-[11px] opacity-70">
          <span className="font-medium">{senderName}</span>
          <span className="font-mono">{formatTime(message.createdAt)}</span>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
      </div>
    </div>
  );
}

export function AgentConversationPanel({
  companyId,
  agentId,
  agentName,
}: {
  companyId: string;
  agentId: string;
  agentName?: string;
}) {
  const queryClient = useQueryClient();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [composeRecipientId, setComposeRecipientId] = useState("");
  const [composeType, setComposeType] = useState("direct");
  const [composeBody, setComposeBody] = useState("");

  const { data: agents = [], isLoading: agentsLoading } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
  });

  const agentMap = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
  const activeAgents = useMemo(
    () => agents.filter((agent) => agent.status !== "terminated" && agent.id !== agentId),
    [agentId, agents],
  );

  const { data: timelineMessages = [], isLoading: timelineLoading } = useQuery({
    queryKey: queryKeys.agentMessages.timeline(companyId),
    queryFn: () => agentMessagesApi.timeline(companyId, { limit: 200 }),
    refetchInterval: 5000,
  });

  const threadSummaries = useMemo(
    () => buildThreadSummaries(timelineMessages, agentId),
    [agentId, timelineMessages],
  );

  useEffect(() => {
    if (selectedThreadId && threadSummaries.some((thread) => thread.threadId === selectedThreadId)) {
      return;
    }
    setSelectedThreadId(threadSummaries[0]?.threadId ?? null);
  }, [selectedThreadId, threadSummaries]);

  useEffect(() => {
    if (composeRecipientId || activeAgents.length === 0) return;
    setComposeRecipientId(activeAgents[0]!.id);
  }, [activeAgents, composeRecipientId]);

  const selectedThreadSummary = selectedThreadId
    ? threadSummaries.find((thread) => thread.threadId === selectedThreadId) ?? null
    : null;
  const selectedThreadOtherAgentId = selectedThreadSummary?.participants.find((id) => id !== agentId) ?? "";

  const { data: selectedThreadMessages = [], isLoading: threadLoading } = useQuery({
    queryKey: selectedThreadId ? queryKeys.agentMessages.thread(companyId, selectedThreadId) : ["agent-messages", "thread", companyId, "__none__"],
    queryFn: () => agentMessagesApi.thread(companyId, selectedThreadId!),
    enabled: Boolean(selectedThreadId),
    refetchInterval: 5000,
  });

  const sendMessage = useMutation({
    mutationFn: (input: {
      recipientAgentId: string;
      body: string;
      messageType: string;
      threadId?: string | null;
    }) => agentMessagesApi.send(companyId, agentId, input),
    onSuccess: (message) => {
      queryClient.invalidateQueries({ queryKey: ["agent-messages"] });
      setComposeBody("");
      setShowCompose(false);
      setSelectedThreadId(message.threadId ?? message.id);
    },
  });

  const replyMessage = useMutation({
    mutationFn: (body: string) => {
      if (!selectedThreadOtherAgentId) {
        throw new Error("Select a conversation first.");
      }
      return agentMessagesApi.send(companyId, agentId, {
        recipientAgentId: selectedThreadOtherAgentId,
        body,
        messageType: "direct",
        threadId: selectedThreadId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-messages"] });
    },
  });

  if (agentsLoading || timelineLoading) {
    return <PageSkeleton variant="detail" />;
  }

  if (threadSummaries.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        message={`${agentName ?? "이 에이전트"}와 연결된 대화가 아직 없습니다.`}
        action="새 대화"
        onAction={() => setShowCompose(true)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">대화창</h3>
          <p className="text-xs text-muted-foreground">
            {agentName ?? "이 에이전트"}와 오간 메시지와 위임 흐름을 따로 봅니다.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowCompose((v) => !v)}
          disabled={activeAgents.length === 0}
        >
          <Send className="mr-1.5 h-3.5 w-3.5" />
          {showCompose ? "닫기" : "새 대화"}
        </Button>
      </div>

      {showCompose && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            <Select value={composeRecipientId} onValueChange={setComposeRecipientId}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Recipient..." />
              </SelectTrigger>
              <SelectContent>
                {activeAgents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={composeType} onValueChange={setComposeType}>
              <SelectTrigger className="w-[160px]">
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
          <Textarea
            value={composeBody}
            onChange={(e) => setComposeBody(e.target.value)}
            placeholder="새 대화를 시작하세요..."
            rows={4}
          />
          <div className="mt-3 flex justify-end">
            <Button
              size="sm"
              disabled={!composeBody.trim() || !composeRecipientId || sendMessage.isPending}
              onClick={() =>
                sendMessage.mutate({
                  recipientAgentId: composeRecipientId,
                  body: composeBody.trim(),
                  messageType: composeType,
                })
              }
            >
              {sendMessage.isPending ? "Sending..." : "Send"}
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-2">
          {threadSummaries.map((thread) => {
            const latest = thread.latestMessage;
            const isSelected = thread.threadId === selectedThreadId;
            const isUnread = thread.unreadCount > 0;
            return (
              <button
                key={thread.threadId}
                type="button"
                className={cn(
                  "flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition-colors",
                  isSelected
                    ? "border-primary/40 bg-primary/5"
                    : "border-border bg-card hover:bg-muted/40",
                )}
                onClick={() => setSelectedThreadId(thread.threadId)}
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
                    <span className="truncate text-sm font-medium">
                      {otherParticipantName(agentMap, thread, agentId)}
                    </span>
                    {isUnread && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">unread</Badge>}
                    <span className="ml-auto text-[11px] text-muted-foreground">{formatTime(latest.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground whitespace-pre-wrap">
                    {latest.body}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{thread.messageCount} messages</span>
                    <span className="font-mono">thread {thread.threadId.slice(0, 8)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="space-y-4">
          {!selectedThreadId ? (
            <EmptyState
              icon={MessageSquare}
              message="대화를 선택하면 오른쪽에 채팅이 열립니다."
            />
          ) : (
            <>
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold">
                      {otherParticipantName(agentMap, selectedThreadSummary!, agentId)}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      thread {selectedThreadId.slice(0, 8)}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {threadLoading ? (
                    <PageSkeleton />
                  ) : (
                    selectedThreadMessages.map((message) => (
                      <MessageBubble
                        key={message.id}
                        message={message}
                        isSelf={message.senderAgentId === agentId}
                        senderName={agentMap.get(message.senderAgentId)?.name ?? "Unknown"}
                      />
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>답장</span>
                  <span>{agentName ?? "현재 에이전트"} → {otherParticipantName(agentMap, selectedThreadSummary!, agentId)}</span>
                </div>
                <Textarea
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  placeholder="메시지를 입력하세요..."
                  rows={4}
                />
                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setComposeBody("")}
                    disabled={!composeBody.trim()}
                  >
                    지우기
                  </Button>
                  <Button
                    size="sm"
                    disabled={!composeBody.trim() || replyMessage.isPending}
                    onClick={() => replyMessage.mutate(composeBody.trim())}
                  >
                    {replyMessage.isPending ? "Sending..." : "Send reply"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
