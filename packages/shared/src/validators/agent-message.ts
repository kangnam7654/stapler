import { z } from "zod";
import { AGENT_MESSAGE_TYPES } from "../constants.js";

export const sendAgentMessageSchema = z.object({
  recipientAgentId: z.string().uuid(),
  messageType: z.enum(AGENT_MESSAGE_TYPES).optional().default("direct"),
  body: z.string().min(1).max(10000),
  payload: z.record(z.unknown()).optional().default({}),
  threadId: z.string().uuid().optional().nullable(),
});

export type SendAgentMessage = z.infer<typeof sendAgentMessageSchema>;
