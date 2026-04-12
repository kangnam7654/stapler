import { Container, Graphics, Text } from "pixi.js";
import type { SimulationLayer } from "./types";
import type { AgentSimState } from "../types";

const BEHAVIOR_ICONS: Record<string, string> = {
  paused: "\u{1F4A4}", // 💤
  error: "\u2757", // ❗
  "pending-approval": "\u{1F64B}", // 🙋
  "idle-walking": "\u2615", // ☕
};

export class EffectLayer implements SimulationLayer {
  public container: Container;
  private bubbles: Map<string, Container> = new Map();
  private icons: Map<string, Container> = new Map();

  constructor() {
    this.container = new Container();
  }

  public updateEffects(agents: Map<string, AgentSimState>): void {
    const activeAgentIds = new Set<string>();

    for (const [agentId, simState] of agents) {
      activeAgentIds.add(agentId);

      // Speech bubble for working agents with a current task
      if (simState.behavior === "working" && simState.currentTask) {
        this.showBubble(agentId, simState);
      } else {
        this.removeBubble(agentId);
      }

      // Status icon for specific behaviors
      const icon = BEHAVIOR_ICONS[simState.behavior];
      if (icon) {
        this.showIcon(agentId, simState, icon);
      } else {
        this.removeIcon(agentId);
      }
    }

    // Remove stale bubbles and icons for agents no longer present
    for (const agentId of this.bubbles.keys()) {
      if (!activeAgentIds.has(agentId)) {
        this.removeBubble(agentId);
      }
    }
    for (const agentId of this.icons.keys()) {
      if (!activeAgentIds.has(agentId)) {
        this.removeIcon(agentId);
      }
    }
  }

  private showBubble(agentId: string, simState: AgentSimState): void {
    // Remove existing bubble to re-create with updated text
    this.removeBubble(agentId);

    const bubbleContainer = new Container();
    const x = simState.seat.pixelX;
    const y = simState.seat.pixelY - 42;

    // Truncate task text
    const taskText = (simState.currentTask ?? "").slice(0, 18);

    // Measure approximate text width
    const textWidth = Math.max(taskText.length * 4.5, 30);
    const bubbleWidth = textWidth + 8;
    const bubbleHeight = 14;

    const bg = new Graphics();

    // White rounded rect background
    bg.roundRect(
      -bubbleWidth / 2,
      -bubbleHeight,
      bubbleWidth,
      bubbleHeight,
      3,
    );
    bg.fill({ color: 0xffffff, alpha: 0.9 });
    bg.stroke({ color: 0xcccccc, width: 1 });

    // Triangle pointer
    bg.moveTo(-3, 0);
    bg.lineTo(0, 5);
    bg.lineTo(3, 0);
    bg.fill({ color: 0xffffff, alpha: 0.9 });

    bubbleContainer.addChild(bg);

    // Text
    const text = new Text({
      text: taskText,
      style: {
        fontSize: 7,
        fill: 0x333333,
        fontFamily: "monospace",
      },
    });
    text.anchor.set(0.5, 1);
    text.y = -2;
    bubbleContainer.addChild(text);

    bubbleContainer.x = x;
    bubbleContainer.y = y;

    this.container.addChild(bubbleContainer);
    this.bubbles.set(agentId, bubbleContainer);
  }

  private removeBubble(agentId: string): void {
    const bubble = this.bubbles.get(agentId);
    if (bubble) {
      this.container.removeChild(bubble);
      bubble.destroy({ children: true });
      this.bubbles.delete(agentId);
    }
  }

  private showIcon(
    agentId: string,
    simState: AgentSimState,
    icon: string,
  ): void {
    // Remove existing icon to re-create
    this.removeIcon(agentId);

    const iconContainer = new Container();
    const x = simState.seat.pixelX;
    const y = simState.seat.pixelY - 38;

    const iconText = new Text({
      text: icon,
      style: {
        fontSize: 12,
      },
    });
    iconText.anchor.set(0.5, 1);

    iconContainer.addChild(iconText);
    iconContainer.x = x;
    iconContainer.y = y;

    this.container.addChild(iconContainer);
    this.icons.set(agentId, iconContainer);
  }

  private removeIcon(agentId: string): void {
    const iconEl = this.icons.get(agentId);
    if (iconEl) {
      this.container.removeChild(iconEl);
      iconEl.destroy({ children: true });
      this.icons.delete(agentId);
    }
  }

  public update(_deltaTime: number): void {
    // Effects update via updateEffects() on state change
  }

  public destroy(): void {
    this.bubbles.clear();
    this.icons.clear();
    this.container.destroy({ children: true });
  }
}
