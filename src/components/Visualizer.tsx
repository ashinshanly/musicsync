import React, { useEffect, useRef } from "react";

export type VisualizerStyle = "circular" | "bars" | "waves" | "particles";

interface VisualizerProps {
  analyser: AnalyserNode | null;
  isSharing: boolean;
  style?: VisualizerStyle;
}

const Visualizer: React.FC<VisualizerProps> = ({ analyser, isSharing, style = "circular" }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    if (!analyser || !canvasRef.current) return;

    let previousValues: number[] = [];

    const draw = () => {
      if (!canvasRef.current || !analyser) return;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      if (previousValues.length === 0) {
        previousValues = new Array(bufferLength).fill(0);
      }

      const render = () => {
        if (!analyser || !canvasRef.current) return;

        analyser.getByteFrequencyData(dataArray);

        const width = canvas.width;
        const height = canvas.height;

        // Clear canvas
        ctx.fillStyle = "rgba(10, 3, 34, 1)";
        ctx.fillRect(0, 0, width, height);

        // Render based on selected style
        switch (style) {
          case "circular":
            renderCircular(ctx, dataArray, previousValues, width, height, bufferLength);
            break;
          case "bars":
            renderBars(ctx, dataArray, previousValues, width, height, bufferLength);
            break;
          case "waves":
            renderWaves(ctx, dataArray, previousValues, width, height, bufferLength);
            break;
          case "particles":
            renderParticles(ctx, dataArray, previousValues, width, height, bufferLength);
            break;
        }

        animationFrameRef.current = requestAnimationFrame(render);
      };

      render();
    };

    draw();

    const handleResize = () => {
      if (canvasRef.current) {
        const { clientWidth, clientHeight } = canvasRef.current;
        // Only update if dimensions actually changed to avoid infinite loops
        if (canvasRef.current.width !== clientWidth || canvasRef.current.height !== clientHeight) {
          canvasRef.current.width = clientWidth;
          canvasRef.current.height = clientHeight;
        }
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (canvasRef.current) {
      resizeObserver.observe(canvasRef.current);
    }

    // Initial size
    handleResize();

    return () => {
      resizeObserver.disconnect();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [analyser, style]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full rounded-lg bg-transparent"
      style={{ minHeight: "300px" }}
    />
  );
};

// Circular visualization (original style)
function renderCircular(
  ctx: CanvasRenderingContext2D,
  dataArray: Uint8Array,
  previousValues: number[],
  width: number,
  height: number,
  bufferLength: number
) {
  const barCount = 64;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 3.5;

  for (let i = 0; i < barCount; i++) {
    const index = Math.floor((i / barCount) * bufferLength);
    const value = dataArray[index];

    const decay = 0.85;
    previousValues[index] = Math.max(value, previousValues[index] * decay);

    const smoothedValue = previousValues[index];
    const percent = smoothedValue / 255;
    const barHeight = radius + (percent * radius * 2);

    const angle = (i / barCount) * Math.PI * 2;

    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;

    const xEnd = centerX + Math.cos(angle) * barHeight;
    const yEnd = centerY + Math.sin(angle) * barHeight;

    const hue = (i / barCount) * 360;
    const saturation = 70 + percent * 30;
    const lightness = 50 + percent * 20;

    const gradient = ctx.createLinearGradient(x, y, xEnd, yEnd);
    gradient.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness}%, 0.6)`);
    gradient.addColorStop(1, `hsla(${hue}, ${saturation}%, ${lightness + 20}%, 0.9)`);

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";

    ctx.shadowBlur = 10;
    ctx.shadowColor = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.5)`;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(xEnd, yEnd);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
}

// Bars visualization
function renderBars(
  ctx: CanvasRenderingContext2D,
  dataArray: Uint8Array,
  previousValues: number[],
  width: number,
  height: number,
  bufferLength: number
) {
  const barCount = 80;
  const barWidth = width / barCount;

  for (let i = 0; i < barCount; i++) {
    const index = Math.floor((i / barCount) * bufferLength);
    const value = dataArray[index];

    const decay = 0.85;
    previousValues[index] = Math.max(value, previousValues[index] * decay);

    const smoothedValue = previousValues[index];
    const percent = smoothedValue / 255;
    const barHeight = percent * height * 0.8;

    const x = i * barWidth;
    const y = height - barHeight;

    const hue = (i / barCount) * 360;
    const saturation = 70 + percent * 30;
    const lightness = 50 + percent * 20;

    const gradient = ctx.createLinearGradient(x, height, x, y);
    gradient.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness}%, 0.7)`);
    gradient.addColorStop(1, `hsla(${hue}, ${saturation}%, ${lightness + 20}%, 0.95)`);

    ctx.fillStyle = gradient;
    ctx.shadowBlur = 12;
    ctx.shadowColor = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.6)`;

    ctx.fillRect(x, y, barWidth - 2, barHeight);
  }

  ctx.shadowBlur = 0;
}

// Waves visualization
function renderWaves(
  ctx: CanvasRenderingContext2D,
  dataArray: Uint8Array,
  previousValues: number[],
  width: number,
  height: number,
  bufferLength: number
) {
  const points = 120;
  const centerY = height / 2;

  // Draw multiple wave layers
  for (let layer = 0; layer < 3; layer++) {
    ctx.beginPath();

    for (let i = 0; i < points; i++) {
      const index = Math.floor((i / points) * bufferLength);
      const value = dataArray[index];

      const decay = 0.85;
      previousValues[index] = Math.max(value, previousValues[index] * decay);

      const smoothedValue = previousValues[index];
      const percent = smoothedValue / 255;

      const x = (i / points) * width;
      const amplitude = percent * height * 0.3 * (1 - layer * 0.2);
      const y = centerY + Math.sin((i / points) * Math.PI * 4 + layer) * amplitude;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    const hue = 280 + layer * 30;
    const alpha = 0.8 - layer * 0.2;

    ctx.strokeStyle = `hsla(${hue}, 70%, 60%, ${alpha})`;
    ctx.lineWidth = 3 - layer * 0.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.shadowBlur = 15;
    ctx.shadowColor = `hsla(${hue}, 70%, 60%, 0.5)`;

    ctx.stroke();
  }

  ctx.shadowBlur = 0;
}

// Particles visualization
function renderParticles(
  ctx: CanvasRenderingContext2D,
  dataArray: Uint8Array,
  previousValues: number[],
  width: number,
  height: number,
  bufferLength: number
) {
  const particleCount = 100;

  for (let i = 0; i < particleCount; i++) {
    const index = Math.floor((i / particleCount) * bufferLength);
    const value = dataArray[index];

    const decay = 0.85;
    previousValues[index] = Math.max(value, previousValues[index] * decay);

    const smoothedValue = previousValues[index];
    const percent = smoothedValue / 255;

    // Position particles in a grid-like pattern that moves with frequencies
    const cols = 10;
    const rows = 10;
    const col = i % cols;
    const row = Math.floor(i / cols);

    const baseX = (col / cols) * width * 1.2 - width * 0.1;
    const baseY = (row / rows) * height * 1.2 - height * 0.1;

    // Add movement based on frequency
    const offsetX = Math.sin((i + Date.now() / 1000) * 0.5) * percent * 50;
    const offsetY = Math.cos((i + Date.now() / 1000) * 0.5) * percent * 50;

    const x = baseX + offsetX;
    const y = baseY + offsetY;

    const size = 3 + percent * 8;

    const hue = (i / particleCount) * 360;
    const saturation = 70 + percent * 30;
    const lightness = 50 + percent * 30;

    const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
    gradient.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness}%, 0.9)`);
    gradient.addColorStop(1, `hsla(${hue}, ${saturation}%, ${lightness}%, 0)`);

    ctx.fillStyle = gradient;
    ctx.shadowBlur = 15;
    ctx.shadowColor = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.7)`;

    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.shadowBlur = 0;
}

export default React.memo(Visualizer);
