import { useRef, useEffect } from "react";
import { Application } from "pixi.js";
import { OFFICE_WIDTH, OFFICE_HEIGHT } from "./layers/layout";
import { TilemapLayer } from "./layers/TilemapLayer";

export function OfficeCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const app = new Application();
    let tilemapLayer: TilemapLayer | null = null;
    let destroyed = false;

    (async () => {
      await app.init({
        width: OFFICE_WIDTH,
        height: OFFICE_HEIGHT,
        background: 0x2d1b69,
        antialias: false,
        resolution: 1,
      });

      if (destroyed) {
        app.destroy(true);
        return;
      }

      app.canvas.style.imageRendering = "pixelated";
      container.appendChild(app.canvas);

      tilemapLayer = new TilemapLayer();
      app.stage.addChild(tilemapLayer.container);
    })();

    return () => {
      destroyed = true;
      tilemapLayer?.destroy();
      app.destroy(true);
    };
  }, []);

  return <div ref={containerRef} />;
}
