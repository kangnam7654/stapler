import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Agent, AgentDelegation, AgentDelegationStatus } from "@paperclipai/shared";
import { AGENT_DELEGATION_STATUSES } from "@paperclipai/shared";
import { agentDelegationsApi } from "../api/agentDelegations";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "@/lib/utils";
import { EmptyState } from "./EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GitBranch, RefreshCw, Send, Waypoints } from "lucide-react";

const ACTIVE_STATUSES: AgentDelegationStatus[] = ["queued", "claimed", "in_progress", "blocked", "reported"];

const STATUS_LABELS: Record<AgentDelegationStatus, string> = {
  queued: "Queued",
  claimed: "Claimed",
  in_progress: "In progress",
  blocked: "Blocked",
  reported: "Reported",
  done: "Done",
  cancelled: "Cancelled",
  failed: "Failed",
};

const STATUS_STYLES: Record<AgentDelegationStatus, string> = {
  queued: "border-slate-200 bg-slate-50 text-slate-700",
  claimed: "border-sky-200 bg-sky-50 text-sky-700",
  in_progress: "border-cyan-200 bg-cyan-50 text-cyan-700",
  blocked: "border-amber-200 bg-amber-50 text-amber-800",
  reported: "border-teal-200 bg-teal-50 text-teal-700",
  done: "border-emerald-200 bg-emerald-50 text-emerald-700",
  cancelled: "border-zinc-200 bg-zinc-50 text-zinc-600",
  failed: "border-red-200 bg-red-50 text-red-700",
};

function formatRelativeTime(value: string | Date | null) {
  if (!value) return "never";
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return date.toLocaleDateString();
}

function agentLabel(agentMap: Map<string, Agent>, id: string | null) {
  if (!id) return "Board";
  const agent = agentMap.get(id);
  if (!agent) return id.slice(0, 8);
  return agent.title ? `${agent.name} · ${agent.title}` : agent.name;
}

function statusBadge(status: AgentDelegationStatus) {
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium", STATUS_STYLES[status])}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function countByStatus(delegations: AgentDelegation[]) {
  const counts = new Map<AgentDelegationStatus, number>();
  for (const status of AGENT_DELEGATION_STATUSES) counts.set(status, 0);
  for (const delegation of delegations) {
    counts.set(delegation.status, (counts.get(delegation.status) ?? 0) + 1);
  }
  return counts;
}

export function AgentDelegationsPanel({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"active" | AgentDelegationStatus | "all">("active");
  const [delegatorAgentId, setDelegatorAgentId] = useState("");
  const [delegateAgentId, setDelegateAgentId] = useState("");
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");

  const filters = useMemo(() => {
    if (statusFilter === "active") return { statuses: ACTIVE_STATUSES, limit: 100 };
    if (statusFilter === "all") return { limit: 100 };
    return { status: statusFilter, limit: 100 };
  }, [statusFilter]);

  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
  });
  const delegationsQuery = useQuery({
    queryKey: queryKeys.workflows.delegations(companyId, filters),
    queryFn: () => agentDelegationsApi.list(companyId, filters),
    refetchInterval: 10_000,
  });

  const agents = agentsQuery.data ?? [];
  const delegations = delegationsQuery.data ?? [];
  const agentMap = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
  const selected = delegations.find((delegation) => delegation.id === selectedId) ?? delegations[0] ?? null;
  const counts = countByStatus(delegations);
  const activeCount = ACTIVE_STATUSES.reduce((sum, status) => sum + (counts.get(status) ?? 0), 0);

  const createMutation = useMutation({
    mutationFn: () => agentDelegationsApi.create(companyId, {
      delegatorAgentId,
      delegateAgentId,
      title: title.trim(),
      brief: brief.trim() || null,
      createMessage: true,
    }),
    onSuccess: (delegation) => {
      setTitle("");
      setBrief("");
      setSelectedId(delegation.id);
      queryClient.invalidateQueries({ queryKey: ["agent-delegations"] });
      queryClient.invalidateQueries({ queryKey: ["agent-messages"] });
    },
  });

  const canCreate = delegatorAgentId && delegateAgentId && delegatorAgentId !== delegateAgentId && title.trim();

  return (
    <Card className="overflow-hidden rounded-3xl border-border/80 py-0">
      <CardHeader className="border-b bg-linear-to-r from-teal-50 via-cyan-50 to-slate-50 px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="rounded-full bg-white/70">
                Agent Delegations
              </Badge>
              <Badge variant="outline" className="rounded-full bg-white/60">
                Internal workflow
              </Badge>
            </div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Waypoints className="h-5 w-5 text-teal-700" />
              Who delegated what to whom
            </CardTitle>
            <CardDescription className="max-w-2xl">
              CEO와만 대화하더라도 내부에서 어떤 에이전트가 누구에게 일을 넘겼는지 추적합니다.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => delegationsQuery.refetch()}
            disabled={delegationsQuery.isFetching}
            className="bg-white/70"
          >
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", delegationsQuery.isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 px-5 py-5">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">Active</div>
            <div className="text-2xl font-semibold">{activeCount}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">Reported</div>
            <div className="text-2xl font-semibold">{counts.get("reported") ?? 0}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">Done</div>
            <div className="text-2xl font-semibold">{counts.get("done") ?? 0}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">Blocked</div>
            <div className="text-2xl font-semibold">{counts.get("blocked") ?? 0}</div>
          </div>
        </div>

        <details className="rounded-2xl border border-dashed border-border bg-muted/20 p-4">
          <summary className="cursor-pointer list-none text-sm font-medium">
            Create a manual delegation
          </summary>
          <div className="mt-4 grid gap-3 lg:grid-cols-[180px_180px_1fr_auto]">
            <Select value={delegatorAgentId} onValueChange={setDelegatorAgentId}>
              <SelectTrigger>
                <SelectValue placeholder="Delegator" />
              </SelectTrigger>
              <SelectContent>
                {agents.filter((agent) => agent.status !== "terminated").map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={delegateAgentId} onValueChange={setDelegateAgentId}>
              <SelectTrigger>
                <SelectValue placeholder="Delegate" />
              </SelectTrigger>
              <SelectContent>
                {agents.filter((agent) => agent.status !== "terminated").map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Delegation title" />
            <Button disabled={!canCreate || createMutation.isPending} onClick={() => createMutation.mutate()}>
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Create
            </Button>
            <Textarea
              className="lg:col-span-4"
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              placeholder="Optional brief for the delegate..."
              rows={3}
            />
          </div>
        </details>

        <div className="flex flex-wrap gap-2">
          {(["active", "all", ...AGENT_DELEGATION_STATUSES] as const).map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(status)}
            >
              {status === "active" ? "Active" : status === "all" ? "All" : STATUS_LABELS[status]}
            </Button>
          ))}
        </div>

        {delegations.length === 0 ? (
          <EmptyState icon={GitBranch} message="아직 추적 중인 agent delegation이 없습니다." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-2">
              {delegations.map((delegation) => (
                <button
                  key={delegation.id}
                  type="button"
                  onClick={() => setSelectedId(delegation.id)}
                  className={cn(
                    "w-full rounded-2xl border p-4 text-left transition hover:border-teal-300 hover:bg-teal-50/50",
                    selected?.id === delegation.id ? "border-teal-400 bg-teal-50/70" : "border-border bg-card",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {statusBadge(delegation.status)}
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(delegation.updatedAt)}
                        </span>
                      </div>
                      <div className="font-medium">{delegation.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {agentLabel(agentMap, delegation.delegatorAgentId)} {"->"} {agentLabel(agentMap, delegation.delegateAgentId)}
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      {delegation.parentDelegationId ? "Child delegation" : "Root delegation"}
                    </div>
                  </div>
                  {delegation.brief ? (
                    <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{delegation.brief}</p>
                  ) : null}
                </button>
              ))}
            </div>

            <aside className="rounded-2xl border border-border bg-card p-4">
              {selected ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    {statusBadge(selected.status)}
                    <h3 className="text-lg font-semibold">{selected.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {agentLabel(agentMap, selected.delegatorAgentId)} delegated to {agentLabel(agentMap, selected.delegateAgentId)}.
                    </p>
                  </div>

                  <div className="grid gap-2 text-sm">
                    <div className="rounded-xl bg-muted/40 p-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Brief</div>
                      <p className="mt-1 whitespace-pre-wrap">{selected.brief ?? "No brief provided."}</p>
                    </div>
                    <div className="rounded-xl bg-muted/40 p-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Result</div>
                      <p className="mt-1 whitespace-pre-wrap">{selected.result ?? "No report yet."}</p>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div>ID: {selected.id}</div>
                    {selected.parentDelegationId ? <div>Parent: {selected.parentDelegationId}</div> : null}
                    {selected.rootIssueId ? <div>Root issue: {selected.rootIssueId}</div> : null}
                    {selected.linkedIssueId ? <div>Linked issue: {selected.linkedIssueId}</div> : null}
                    {selected.sourceMessageId ? <div>Source message: {selected.sourceMessageId}</div> : null}
                    <div>Created: {formatRelativeTime(selected.createdAt)}</div>
                    <div>Updated: {formatRelativeTime(selected.updatedAt)}</div>
                  </div>
                </div>
              ) : (
                <EmptyState icon={GitBranch} message="Select a delegation to inspect it." />
              )}
            </aside>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
