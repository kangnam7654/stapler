export const OFFICE_WIDTH = 960;
export const OFFICE_HEIGHT = 640;

// Wall
export const WALL_HEIGHT = 140;
export const WALL_COLOR = 0x2d1b69;
export const WALL_TOP_COLOR = 0x1a0f3d;
export const WALL_BORDER_COLOR = 0x4a3580;

// Floor
export const FLOOR_COLOR_A = 0x3d2b6b;
export const FLOOR_COLOR_B = 0x352563;
export const FLOOR_TILE_SIZE = 32;

// Table columns: 4 long vertical tables
export const TABLE_COUNT = 4;
export const TABLE_WIDTH = 28;
export const TABLE_COLOR = 0x8b6914;
export const TABLE_HIGHLIGHT = 0xa07828;

// Table positions (x-center of each table)
export const TABLE_X = [120, 280, 440, 600];
export const TABLE_TOP = 160;
export const TABLE_BOTTOM = 600;

// Seats: 5 rows per table, 2 sides (left/right)
export const ROWS_PER_TABLE = 5;
export const ROW_SPACING = 88;
export const SEAT_OFFSET_X = 50;

// Monitor
export const MONITOR_WIDTH = 24;
export const MONITOR_HEIGHT = 18;
export const MONITOR_COLOR = 0x222222;
export const MONITOR_BORDER_COLOR = 0x444444;
export const MONITOR_ON_COLOR = 0x22c55e;
export const MONITOR_OFF_COLOR = 0x1a1a1a;

// Chair
export const CHAIR_WIDTH = 20;
export const CHAIR_HEIGHT = 12;
export const CHAIR_COLOR = 0x4a4a4a;

// Decorations
export const COFFEE_MACHINE_POS = { x: 820, y: 180 };
export const PLANT_POSITIONS = [
  { x: 820, y: 300 },
  { x: 840, y: 450 },
  { x: 750, y: 560 },
];
export const WINDOW_POSITIONS = [
  { x: 40, y: 30, w: 50, h: 60 },
  { x: 860, y: 30, w: 50, h: 60 },
];
export const POSTER_POS = { x: 30, y: 25, w: 36, h: 48 };
export const CLOCK_POS = { x: 900, y: 30, r: 14 };
export const KANBAN_POS = { x: 330, y: 15, w: 300, h: 110 };

export function getSeatPosition(
  column: number,
  row: number,
  side: "left" | "right",
) {
  const tableX = TABLE_X[column];
  const x = side === "left" ? tableX - SEAT_OFFSET_X : tableX + SEAT_OFFSET_X;
  const y = TABLE_TOP + 20 + row * ROW_SPACING;
  return { x, y };
}
