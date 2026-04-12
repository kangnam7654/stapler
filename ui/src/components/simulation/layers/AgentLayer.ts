import { Container, Graphics, Text } from "pixi.js";
import type { SimulationLayer } from "./types";
import type { AgentSimState } from "../types";
import { getRoleVisual } from "../sprites";

interface AgentSprite {
  container: Container;
  agentId: string;
}

export class AgentLayer implements SimulationLayer {
  public container: Container;
  private sprites: Map<string, AgentSprite> = new Map();
  private onAgentClick: ((agentId: string) => void) | null = null;

  constructor() {
    this.container = new Container();
  }

  public setOnAgentClick(callback: (agentId: string) => void): void {
    this.onAgentClick = callback;
  }

  public updateAgents(agents: Map<string, AgentSimState>): void {
    // Remove sprites for agents no longer present
    for (const [agentId, sprite] of this.sprites) {
      if (!agents.has(agentId)) {
        this.container.removeChild(sprite.container);
        sprite.container.destroy({ children: true });
        this.sprites.delete(agentId);
      }
    }

    // Add or update sprites
    for (const [agentId, simState] of agents) {
      let sprite = this.sprites.get(agentId);
      if (!sprite) {
        sprite = this.createAgentSprite(simState);
        this.sprites.set(agentId, sprite);
        this.container.addChild(sprite.container);
      }

      // Update position
      sprite.container.x = simState.seat.pixelX;
      sprite.container.y = simState.seat.pixelY;
    }
  }

  private createAgentSprite(simState: AgentSimState): AgentSprite {
    const agentContainer = new Container();
    const gfx = new Graphics();
    const roleVisual = getRoleVisual(simState.agent.role);

    // Head: 12x12 rounded rect, skin color
    gfx.roundRect(-6, -28, 12, 12, 3);
    gfx.fill(0xfbbf6e);

    // Eyes: two small circles
    gfx.circle(-2, -23, 1.5);
    gfx.fill(0x1a1a1a);
    gfx.circle(2, -23, 1.5);
    gfx.fill(0x1a1a1a);

    // Body: 14x12 rounded rect
    gfx.roundRect(-7, -16, 14, 12, 2);
    gfx.fill(roleVisual.body);

    // Legs: two small rects
    gfx.rect(-5, -4, 4, 6);
    gfx.fill(0x2d2d2d);
    gfx.rect(1, -4, 4, 6);
    gfx.fill(0x2d2d2d);

    agentContainer.addChild(gfx);

    // Name label: first 8 chars
    const nameText = new Text({
      text: simState.agent.name.slice(0, 8),
      style: {
        fontSize: 8,
        fill: 0xffffff,
        fontFamily: "monospace",
      },
    });
    nameText.anchor.set(0.5, 0);
    nameText.y = 4;
    agentContainer.addChild(nameText);

    // Interactivity
    agentContainer.eventMode = "static";
    agentContainer.cursor = "pointer";
    agentContainer.on("pointertap", () => {
      this.onAgentClick?.(simState.agent.id);
    });

    return {
      container: agentContainer,
      agentId: simState.agent.id,
    };
  }

  public update(_deltaTime: number): void {
    // Placeholder — animations in next task
  }

  public destroy(): void {
    this.sprites.clear();
    this.container.destroy({ children: true });
  }
}
