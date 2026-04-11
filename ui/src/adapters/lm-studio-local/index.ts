import type { UIAdapterModule } from "../types";
import { parseLmStudioStdoutLine, buildLmStudioLocalConfig } from "@paperclipai/adapter-lm-studio-local/ui";
import { LmStudioLocalConfigFields } from "./config-fields";

export const lmStudioLocalUIAdapter: UIAdapterModule = {
  type: "lm_studio_local",
  label: "LM Studio (local)",
  parseStdoutLine: parseLmStudioStdoutLine,
  ConfigFields: LmStudioLocalConfigFields,
  buildAdapterConfig: buildLmStudioLocalConfig,
};
