import type { Container } from "pixi.js";

export interface SimulationLayer {
  container: Container;
  update(deltaTime: number): void;
  destroy(): void;
}
