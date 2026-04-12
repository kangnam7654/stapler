import { Container, Graphics, Text } from "pixi.js";
import type { SimulationLayer } from "./types";
import {
  OFFICE_WIDTH,
  OFFICE_HEIGHT,
  WALL_HEIGHT,
  WALL_COLOR,
  WALL_TOP_COLOR,
  WALL_BORDER_COLOR,
  FLOOR_COLOR_A,
  FLOOR_COLOR_B,
  FLOOR_TILE_SIZE,
  TABLE_COUNT,
  TABLE_WIDTH,
  TABLE_COLOR,
  TABLE_HIGHLIGHT,
  TABLE_X,
  TABLE_TOP,
  TABLE_BOTTOM,
  ROWS_PER_TABLE,
  MONITOR_WIDTH,
  MONITOR_HEIGHT,
  MONITOR_COLOR,
  MONITOR_BORDER_COLOR,
  MONITOR_OFF_COLOR,
  CHAIR_WIDTH,
  CHAIR_HEIGHT,
  CHAIR_COLOR,
  COFFEE_MACHINE_POS,
  PLANT_POSITIONS,
  WINDOW_POSITIONS,
  POSTER_POS,
  CLOCK_POS,
  KANBAN_POS,
  getSeatPosition,
} from "./layout";

export class TilemapLayer implements SimulationLayer {
  public container: Container;

  constructor() {
    this.container = new Container();
    this.drawWall();
    this.drawFloor();
    this.drawTables();
    this.drawSeats();
    this.drawDecorations();
  }

  private drawWall(): void {
    const wall = new Graphics();

    // Dark top portion (gradient effect via 2 rects)
    wall.rect(0, 0, OFFICE_WIDTH, WALL_HEIGHT * 0.4);
    wall.fill(WALL_TOP_COLOR);

    // Main wall color
    wall.rect(0, WALL_HEIGHT * 0.4, OFFICE_WIDTH, WALL_HEIGHT * 0.6);
    wall.fill(WALL_COLOR);

    // Wall border at bottom
    wall.rect(0, WALL_HEIGHT - 4, OFFICE_WIDTH, 4);
    wall.fill(WALL_BORDER_COLOR);

    // Windows
    for (const win of WINDOW_POSITIONS) {
      // Window frame
      wall.rect(win.x, win.y, win.w, win.h);
      wall.fill(0x87ceeb);

      // Cross pattern - vertical
      wall.rect(win.x + win.w / 2 - 1, win.y, 2, win.h);
      wall.fill(WALL_BORDER_COLOR);

      // Cross pattern - horizontal
      wall.rect(win.x, win.y + win.h / 2 - 1, win.w, 2);
      wall.fill(WALL_BORDER_COLOR);

      // Window border
      wall.rect(win.x, win.y, win.w, win.h);
      wall.stroke({ color: WALL_BORDER_COLOR, width: 2 });
    }

    // Poster
    wall.rect(POSTER_POS.x, POSTER_POS.y, POSTER_POS.w, POSTER_POS.h);
    wall.fill(0x334155);
    wall.rect(POSTER_POS.x, POSTER_POS.y, POSTER_POS.w, POSTER_POS.h);
    wall.stroke({ color: 0x475569, width: 1 });

    const posterEmoji = new Text({
      text: "\u{1F680}",
      style: { fontSize: 16 },
    });
    posterEmoji.x = POSTER_POS.x + POSTER_POS.w / 2 - 8;
    posterEmoji.y = POSTER_POS.y + POSTER_POS.h / 2 - 8;
    this.container.addChild(posterEmoji);

    // Clock
    wall.circle(CLOCK_POS.x, CLOCK_POS.y, CLOCK_POS.r);
    wall.fill(0xffffff);
    wall.circle(CLOCK_POS.x, CLOCK_POS.y, CLOCK_POS.r);
    wall.stroke({ color: 0x333333, width: 2 });

    // Clock hands
    wall.moveTo(CLOCK_POS.x, CLOCK_POS.y);
    wall.lineTo(CLOCK_POS.x, CLOCK_POS.y - CLOCK_POS.r * 0.6);
    wall.stroke({ color: 0x333333, width: 2 });

    wall.moveTo(CLOCK_POS.x, CLOCK_POS.y);
    wall.lineTo(CLOCK_POS.x + CLOCK_POS.r * 0.4, CLOCK_POS.y);
    wall.stroke({ color: 0x333333, width: 1 });

    // Kanban board
    wall.rect(KANBAN_POS.x, KANBAN_POS.y, KANBAN_POS.w, KANBAN_POS.h);
    wall.fill(0xf1f5f9);
    wall.rect(KANBAN_POS.x, KANBAN_POS.y, KANBAN_POS.w, KANBAN_POS.h);
    wall.stroke({ color: 0x94a3b8, width: 1 });

    // Kanban columns (3 columns)
    const colWidth = KANBAN_POS.w / 3;
    for (let i = 1; i < 3; i++) {
      wall.moveTo(KANBAN_POS.x + colWidth * i, KANBAN_POS.y);
      wall.lineTo(KANBAN_POS.x + colWidth * i, KANBAN_POS.y + KANBAN_POS.h);
      wall.stroke({ color: 0xcbd5e1, width: 1 });
    }

    // Kanban header bar
    wall.rect(KANBAN_POS.x, KANBAN_POS.y, KANBAN_POS.w, 16);
    wall.fill(0x64748b);

    // Sticky notes in kanban columns
    const noteColors = [0xfef08a, 0xbae6fd, 0xfecaca];
    for (let col = 0; col < 3; col++) {
      const noteCount = col === 0 ? 3 : col === 1 ? 2 : 1;
      for (let n = 0; n < noteCount; n++) {
        wall.rect(
          KANBAN_POS.x + col * colWidth + 4,
          KANBAN_POS.y + 20 + n * 22,
          colWidth - 8,
          18,
        );
        wall.fill(noteColors[col]);
      }
    }

    this.container.addChild(wall);
  }

  private drawFloor(): void {
    const floor = new Graphics();
    const startY = WALL_HEIGHT;
    const cols = Math.ceil(OFFICE_WIDTH / FLOOR_TILE_SIZE);
    const rows = Math.ceil((OFFICE_HEIGHT - WALL_HEIGHT) / FLOOR_TILE_SIZE);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const color = (row + col) % 2 === 0 ? FLOOR_COLOR_A : FLOOR_COLOR_B;
        floor.rect(
          col * FLOOR_TILE_SIZE,
          startY + row * FLOOR_TILE_SIZE,
          FLOOR_TILE_SIZE,
          FLOOR_TILE_SIZE,
        );
        floor.fill(color);
      }
    }

    this.container.addChild(floor);
  }

  private drawTables(): void {
    const tables = new Graphics();

    for (let i = 0; i < TABLE_COUNT; i++) {
      const x = TABLE_X[i] - TABLE_WIDTH / 2;

      // Table body
      tables.rect(x, TABLE_TOP, TABLE_WIDTH, TABLE_BOTTOM - TABLE_TOP);
      tables.fill(TABLE_COLOR);

      // Highlight stripe down the center
      tables.rect(x + TABLE_WIDTH / 2 - 2, TABLE_TOP, 4, TABLE_BOTTOM - TABLE_TOP);
      tables.fill(TABLE_HIGHLIGHT);
    }

    this.container.addChild(tables);
  }

  private drawSeats(): void {
    const seats = new Graphics();

    for (let col = 0; col < TABLE_COUNT; col++) {
      for (let row = 0; row < ROWS_PER_TABLE; row++) {
        for (const side of ["left", "right"] as const) {
          const pos = getSeatPosition(col, row, side);

          // Monitor — faces toward the table
          const monitorX =
            side === "left"
              ? pos.x + MONITOR_WIDTH / 2 - MONITOR_WIDTH
              : pos.x - MONITOR_WIDTH / 2;

          // Monitor body
          seats.rect(
            monitorX,
            pos.y - MONITOR_HEIGHT / 2,
            MONITOR_WIDTH,
            MONITOR_HEIGHT,
          );
          seats.fill(MONITOR_COLOR);
          seats.rect(
            monitorX,
            pos.y - MONITOR_HEIGHT / 2,
            MONITOR_WIDTH,
            MONITOR_HEIGHT,
          );
          seats.stroke({ color: MONITOR_BORDER_COLOR, width: 1 });

          // Screen (off by default)
          seats.rect(
            monitorX + 2,
            pos.y - MONITOR_HEIGHT / 2 + 2,
            MONITOR_WIDTH - 4,
            MONITOR_HEIGHT - 4,
          );
          seats.fill(MONITOR_OFF_COLOR);

          // Chair — on the outer side away from table
          const chairX =
            side === "left"
              ? pos.x - CHAIR_WIDTH - MONITOR_WIDTH / 2
              : pos.x + MONITOR_WIDTH / 2;
          seats.roundRect(
            chairX,
            pos.y - CHAIR_HEIGHT / 2,
            CHAIR_WIDTH,
            CHAIR_HEIGHT,
            3,
          );
          seats.fill(CHAIR_COLOR);
        }
      }
    }

    this.container.addChild(seats);
  }

  private drawDecorations(): void {
    const deco = new Graphics();

    // Coffee machine
    deco.roundRect(
      COFFEE_MACHINE_POS.x - 12,
      COFFEE_MACHINE_POS.y - 16,
      24,
      32,
      4,
    );
    deco.fill(0x78716c);
    // Coffee top
    deco.rect(COFFEE_MACHINE_POS.x - 8, COFFEE_MACHINE_POS.y - 20, 16, 6);
    deco.fill(0x57534e);
    // Red indicator light
    deco.circle(COFFEE_MACHINE_POS.x, COFFEE_MACHINE_POS.y - 8, 3);
    deco.fill(0xef4444);

    this.container.addChild(deco);

    // Plants
    for (const plant of PLANT_POSITIONS) {
      const plantEmoji = new Text({
        text: "\u{1F33F}",
        style: { fontSize: 20 },
      });
      plantEmoji.x = plant.x - 10;
      plantEmoji.y = plant.y - 10;
      this.container.addChild(plantEmoji);
    }
  }

  public update(_deltaTime: number): void {
    // Static layer — no-op
  }

  public destroy(): void {
    this.container.destroy({ children: true });
  }
}
