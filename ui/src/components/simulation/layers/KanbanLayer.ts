import { Container, Graphics, Text, type FederatedPointerEvent } from "pixi.js";
import type { SimulationLayer } from "./types";
import type { KanbanState } from "../types";
import type { IssueStatus } from "@paperclipai/shared";
import { KANBAN_POS } from "./layout";

const COLUMN_ORDER: IssueStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
];

const COLUMN_COLORS: Record<string, number> = {
  backlog: 0x6b7280,
  todo: 0xef4444,
  in_progress: 0xeab308,
  in_review: 0x6366f1,
  done: 0x22c55e,
};

const COLUMN_LABELS: Record<string, string> = {
  backlog: "BACKLOG",
  todo: "TODO",
  in_progress: "PROGRESS",
  in_review: "REVIEW",
  done: "DONE",
};

const MAX_VISIBLE_CARDS = 6;
const DRAG_THRESHOLD_PX = 5;

export class KanbanLayer implements SimulationLayer {
  public container: Container;
  private cardContainer: Container;
  private onIssueClick: ((issueId: string) => void) | null = null;
  private onIssueDrop:
    | ((issueId: string, newStatus: IssueStatus) => void)
    | null = null;

  constructor() {
    this.container = new Container();
    this.cardContainer = new Container();
    this.drawBoard();
    this.container.addChild(this.cardContainer);
  }

  public setOnIssueClick(callback: (issueId: string) => void): void {
    this.onIssueClick = callback;
  }

  public setOnIssueDrop(
    callback: (issueId: string, newStatus: IssueStatus) => void,
  ): void {
    this.onIssueDrop = callback;
  }

  private drawBoard(): void {
    const bg = new Graphics();

    // Board background with rounded corners
    bg.roundRect(KANBAN_POS.x, KANBAN_POS.y, KANBAN_POS.w, KANBAN_POS.h, 4);
    bg.fill(0xf5f0e8);
    bg.roundRect(KANBAN_POS.x, KANBAN_POS.y, KANBAN_POS.w, KANBAN_POS.h, 4);
    bg.stroke({ color: 0xd6cfc0, width: 1 });

    this.container.addChild(bg);

    // Title
    const title = new Text({
      text: "KANBAN BOARD",
      style: {
        fontSize: 7,
        fill: 0x333333,
        fontFamily: "monospace",
        fontWeight: "bold",
      },
    });
    title.x = KANBAN_POS.x + KANBAN_POS.w / 2;
    title.y = KANBAN_POS.y + 2;
    title.anchor.set(0.5, 0);
    this.container.addChild(title);

    // Column headers
    const colWidth = KANBAN_POS.w / COLUMN_ORDER.length;
    for (let i = 0; i < COLUMN_ORDER.length; i++) {
      const status = COLUMN_ORDER[i];
      const colX = KANBAN_POS.x + i * colWidth;

      // Column separator line (skip first column)
      if (i > 0) {
        const sep = new Graphics();
        sep.moveTo(colX, KANBAN_POS.y + 12);
        sep.lineTo(colX, KANBAN_POS.y + KANBAN_POS.h - 2);
        sep.stroke({ color: 0xd6cfc0, width: 1 });
        this.container.addChild(sep);
      }

      // Column header label
      const label = new Text({
        text: COLUMN_LABELS[status] ?? status,
        style: {
          fontSize: 5,
          fill: COLUMN_COLORS[status] ?? 0x333333,
          fontFamily: "monospace",
          fontWeight: "bold",
        },
      });
      label.x = colX + colWidth / 2;
      label.y = KANBAN_POS.y + 12;
      label.anchor.set(0.5, 0);
      this.container.addChild(label);
    }
  }

  /**
   * Given a card's center x-coordinate, return which kanban status column
   * it belongs to. Clamps to the first/last column outside the board.
   */
  private statusFromX(centerX: number): IssueStatus {
    const colWidth = KANBAN_POS.w / COLUMN_ORDER.length;
    const relative = centerX - KANBAN_POS.x;
    const index = Math.floor(relative / colWidth);
    const clamped = Math.max(0, Math.min(COLUMN_ORDER.length - 1, index));
    return COLUMN_ORDER[clamped];
  }

  public updateKanban(kanban: KanbanState): void {
    // Clear existing cards
    this.cardContainer.removeChildren();
    for (const child of [...this.cardContainer.children]) {
      child.destroy({ children: true });
    }

    const colWidth = KANBAN_POS.w / COLUMN_ORDER.length;
    const cardStartY = KANBAN_POS.y + 22;
    const cardHeight = 10;
    const cardGap = 2;
    const cardMarginX = 3;

    for (let i = 0; i < COLUMN_ORDER.length; i++) {
      const status = COLUMN_ORDER[i];
      const issues = kanban.columns.get(status) ?? [];
      const colX = KANBAN_POS.x + i * colWidth;
      const color = COLUMN_COLORS[status] ?? 0x6b7280;

      const visibleCount = Math.min(issues.length, MAX_VISIBLE_CARDS);
      for (let j = 0; j < visibleCount; j++) {
        const issue = issues[j];
        const opacity = Math.max(0.3, 0.5 - j * 0.05);

        const card = new Graphics();
        const cardX = colX + cardMarginX;
        const cardY = cardStartY + j * (cardHeight + cardGap);
        const cardW = colWidth - cardMarginX * 2;

        // Draw relative to (0, 0) so we can move the card via card.x/y.
        card.roundRect(0, 0, cardW, cardHeight, 2);
        card.fill({ color, alpha: opacity });
        card.x = cardX;
        card.y = cardY;

        card.eventMode = "static";
        card.cursor = "grab";

        // Per-card drag state
        let dragging = false;
        let moved = false;
        let pointerStartGlobalX = 0;
        let pointerStartGlobalY = 0;
        let dragOffsetX = 0;
        let dragOffsetY = 0;
        const originalX = cardX;
        const originalY = cardY;

        const snapBack = () => {
          card.x = originalX;
          card.y = originalY;
          card.alpha = 1;
          card.cursor = "grab";
        };

        card.on("pointerdown", (event: FederatedPointerEvent) => {
          dragging = true;
          moved = false;
          pointerStartGlobalX = event.global.x;
          pointerStartGlobalY = event.global.y;
          dragOffsetX = event.global.x - card.x;
          dragOffsetY = event.global.y - card.y;
          card.alpha = 0.7;
          card.cursor = "grabbing";
        });

        card.on("globalpointermove", (event: FederatedPointerEvent) => {
          if (!dragging) return;
          const dx = event.global.x - pointerStartGlobalX;
          const dy = event.global.y - pointerStartGlobalY;
          if (
            !moved &&
            Math.hypot(dx, dy) > DRAG_THRESHOLD_PX
          ) {
            moved = true;
          }
          if (moved) {
            card.x = event.global.x - dragOffsetX;
            card.y = event.global.y - dragOffsetY;
          }
        });

        const onRelease = () => {
          if (!dragging) return;
          dragging = false;

          if (!moved) {
            // Treated as click — restore visuals and fire click.
            card.alpha = 1;
            card.cursor = "grab";
            this.onIssueClick?.(issue.id);
            return;
          }

          // Determine new status from card's center x.
          const centerX = card.x + cardW / 2;
          const newStatus = this.statusFromX(centerX);

          if (newStatus !== status && this.onIssueDrop) {
            // Fire callback; the updated state will re-render cards.
            this.onIssueDrop(issue.id, newStatus);
            // Optimistic visual reset (card will be destroyed on re-render).
            card.alpha = 1;
            card.cursor = "grab";
          } else {
            snapBack();
          }
        };

        card.on("pointerup", onRelease);
        card.on("pointerupoutside", () => {
          if (!dragging) return;
          dragging = false;
          snapBack();
        });

        this.cardContainer.addChild(card);
      }

      // Overflow text
      if (issues.length > MAX_VISIBLE_CARDS) {
        const overflow = issues.length - MAX_VISIBLE_CARDS;
        const overflowText = new Text({
          text: `+${overflow}`,
          style: {
            fontSize: 6,
            fill: 0x666666,
            fontFamily: "monospace",
          },
        });
        overflowText.x = colX + colWidth / 2;
        overflowText.y =
          cardStartY + MAX_VISIBLE_CARDS * (cardHeight + cardGap);
        overflowText.anchor.set(0.5, 0);
        this.cardContainer.addChild(overflowText);
      }
    }
  }

  public update(_deltaTime: number): void {
    // Static layer — cards update via updateKanban()
  }

  public destroy(): void {
    this.cardContainer.destroy({ children: true });
    this.container.destroy({ children: true });
  }
}
