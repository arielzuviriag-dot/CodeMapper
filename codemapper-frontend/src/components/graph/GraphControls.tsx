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

  return (
    <div className="absolute right-4 top-4 z-10 flex flex-col gap-1 rounded-lg border border-border bg-card p-1 shadow-lg">
      <Button size="icon" variant="ghost" onClick={() => zoomIn({ duration: 200 })} title="Zoom in">
        <ZoomIn className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="ghost" onClick={() => zoomOut({ duration: 200 })} title="Zoom out">
        <ZoomOut className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => fitView({ duration: 400, padding: 0.2 })}
        title="Centrar"
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
      >
        <RefreshCw className="h-4 w-4" />
      </Button>
    </div>
  );
}
