"use client";

import { useReactFlow } from "@xyflow/react";
import { Maximize2, RefreshCw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGraphStore } from "@/store/graphStore";

interface Props {
  onRelayout: () => void;
}

export function GraphControls({ onRelayout }: Props) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const resetUserInteraction = useGraphStore((s) => s.resetUserInteraction);

  const btn =
    "h-9 w-9 rounded-sm bg-transparent text-[var(--silver)] hover:bg-[var(--bordo)]/15 hover:text-[var(--bordo)]";

  return (
    <div className="absolute right-4 top-4 z-10 flex w-[170px] flex-row items-center justify-around gap-1 rounded-md border border-[var(--border-silver)] bg-[var(--bg-card)] p-1 shadow-[var(--shadow-md)]">
      <Button
        size="icon"
        variant="ghost"
        onClick={() => zoomIn({ duration: 200 })}
        title="Zoom in"
        className={btn}
      >
        <ZoomIn className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => zoomOut({ duration: 200 })}
        title="Zoom out"
        className={btn}
      >
        <ZoomOut className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => fitView({ duration: 400, padding: 0.2 })}
        title="Centrar"
        className={btn}
      >
        <Maximize2 className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => {
          resetUserInteraction();
          onRelayout();
        }}
        title="Reset layout"
        className={btn}
      >
        <RefreshCw className="h-4 w-4" />
      </Button>
    </div>
  );
}
