import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, Loader2 } from "lucide-react";
import type { DraftPromptTemplateRequest } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { usePromptTemplateStream } from "../hooks/usePromptTemplateStream";

const DIALOG_CLOSE_ANIMATION_MS = 150;

export interface PromptTemplateGenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  requestBase: Omit<DraftPromptTemplateRequest, "hint">;
  existingTemplate: string;
  onAccept: (generated: string) => void;
}

type Stage = "input" | "confirm-overwrite";

export function PromptTemplateGenerateDialog({
  open,
  onOpenChange,
  companyId,
  requestBase,
  existingTemplate,
  onAccept,
}: PromptTemplateGenerateDialogProps) {
  const { t } = useTranslation();
  const [hint, setHint] = useState("");
  const [stage, setStage] = useState<Stage>("input");
  const { status, preview, error, start, cancel, reset } =
    usePromptTemplateStream(companyId);
  const closeResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleGenerate = useCallback(() => {
    start({ ...requestBase, hint: hint.trim() || undefined });
  }, [hint, requestBase, start]);

  const handleAccept = useCallback(() => {
    if (existingTemplate.trim().length > 0) {
      setStage("confirm-overwrite");
      return;
    }
    onAccept(preview);
    onOpenChange(false);
  }, [existingTemplate, onAccept, onOpenChange, preview]);

  const handleConfirmOverwrite = useCallback(() => {
    onAccept(preview);
    setStage("input");
    onOpenChange(false);
  }, [onAccept, onOpenChange, preview]);

  const handleRegenerate = useCallback(() => {
    reset();
    setStage("input");
  }, [reset]);

  const handleCancel = useCallback(() => {
    cancel();
    onOpenChange(false);
    if (closeResetTimerRef.current !== null) {
      clearTimeout(closeResetTimerRef.current);
    }
    closeResetTimerRef.current = setTimeout(() => {
      reset();
      setStage("input");
      closeResetTimerRef.current = null;
    }, DIALOG_CLOSE_ANIMATION_MS);
  }, [cancel, onOpenChange, reset]);

  useEffect(() => {
    return () => {
      if (closeResetTimerRef.current !== null) {
        clearTimeout(closeResetTimerRef.current);
      }
    };
  }, []);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleCancel();
        else onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            <span className="inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              {t("agents.promptTemplate.aiDialogTitle")}
            </span>
          </DialogTitle>
        </DialogHeader>

        {stage === "input" &&
          status !== "streaming" &&
          status !== "done" &&
          status !== "error" && (
            <div className="space-y-3">
              <Textarea
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                placeholder={t("agents.promptTemplate.aiHintPlaceholder")}
                maxLength={2000}
                className="min-h-[100px]"
              />
              <DialogFooter>
                <Button variant="outline" onClick={handleCancel}>
                  {t("agents.promptTemplate.aiCancel")}
                </Button>
                <Button onClick={handleGenerate}>
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  {t("agents.promptTemplate.aiGenerate")}
                </Button>
              </DialogFooter>
            </div>
          )}

        {stage === "input" && status === "streaming" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("agents.promptTemplate.aiGenerating")}
            </div>
            <pre
              aria-live="polite"
              aria-busy="true"
              className="whitespace-pre-wrap text-sm font-mono border border-border rounded-md p-3 min-h-[140px] max-h-[360px] overflow-auto"
            >
              {preview}
            </pre>
            <DialogFooter>
              <Button variant="outline" onClick={handleCancel}>
                {t("agents.promptTemplate.aiCancel")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {(status === "done" || status === "error") && stage === "input" && (
          <div className="space-y-3">
            {status === "error" && (
              <p className="text-sm text-destructive">
                {t("agents.promptTemplate.aiStreamError", {
                  message: error ?? "",
                })}
              </p>
            )}
            <pre className="whitespace-pre-wrap text-sm font-mono border border-border rounded-md p-3 min-h-[140px] max-h-[360px] overflow-auto">
              {preview}
            </pre>
            <DialogFooter>
              <Button variant="outline" onClick={handleCancel}>
                {t("agents.promptTemplate.aiCancel")}
              </Button>
              <Button variant="outline" onClick={handleRegenerate}>
                {t("agents.promptTemplate.aiRegenerate")}
              </Button>
              <Button
                onClick={handleAccept}
                disabled={status === "error" || preview.length === 0}
              >
                {t("agents.promptTemplate.aiAccept")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {stage === "confirm-overwrite" && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">
              {t("agents.promptTemplate.aiConfirmOverwriteTitle")}
            </h4>
            <p className="text-sm text-muted-foreground">
              {t("agents.promptTemplate.aiConfirmOverwriteBody")}
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStage("input")}>
                {t("agents.promptTemplate.aiCancel")}
              </Button>
              <Button onClick={handleConfirmOverwrite}>
                {t("agents.promptTemplate.aiConfirmOverwriteOk")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
