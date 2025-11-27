import React, { useEffect, useRef } from "react";

interface VisualizerProps {
  stream: MediaStream;
  isSharing: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({ stream, isSharing }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    if (!stream || !canvasRef.current) return;

    const initAudio = () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
      }

      if (audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume();
      }

      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 1024; // Reduced for better performance
      analyserRef.current.smoothingTimeConstant = 0.8; // Balanced for responsiveness

      try {
        sourceNodeRef.current =
          audioContextRef.current.createMediaStreamSource(stream);
        sourceNodeRef.current.connect(analyserRef.current);
      } catch (err) {
        console.error("Error creating media stream source:", err);
        return;
      }

      draw();
    };

    // Store previous values for smoothing
    let previousValues: number[] = [];

    const draw = () => {
      if (!canvasRef.current || !analyserRef.current) return;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      // Initialize previous values if needed
      if (previousValues.length === 0) {
        previousValues = new Array(bufferLength).fill(0);
      }

      const render = () => {
        if (!analyserRef.current || !canvasRef.current) return;

        analyserRef.current.getByteFrequencyData(dataArray);

        const width = canvas.width;
        const height = canvas.height;

        // Clear canvas completely for cleaner animation
        ctx.fillStyle = "rgba(10, 3, 34, 1)";
        ctx.fillRect(0, 0, width, height);

        const barCount = 64; // Reduced for better performance

        // Center the visualization
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) / 3.5;

        for (let i = 0; i < barCount; i++) {
          const index = Math.floor((i / barCount) * bufferLength);
          const value = dataArray[index];

          // Smooth decay for fluid motion
          const decay = 0.85; // Faster decay for more responsive feeling
          previousValues[index] = Math.max(value, previousValues[index] * decay);

          const smoothedValue = previousValues[index];
          const percent = smoothedValue / 255;
          const barHeight = radius + (percent * radius * 2);

          const angle = (i / barCount) * Math.PI * 2;

          const x = centerX + Math.cos(angle) * radius;
          const y = centerY + Math.sin(angle) * radius;

          const xEnd = centerX + Math.cos(angle) * barHeight;
          const yEnd = centerY + Math.sin(angle) * barHeight;

          // More vibrant color scheme
          const hue = (i / barCount) * 360;
          const saturation = 70 + percent * 30;
          const lightness = 50 + percent * 20;

          // Draw with gradient for depth
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

        // Reset shadow
        ctx.shadowBlur = 0;

        animationFrameRef.current = requestAnimationFrame(render);
      };

      render();
    };

    initAudio();

    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = canvasRef.current.clientWidth;
        canvasRef.current.height = canvasRef.current.clientHeight;
      }
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (sourceNodeRef.current) {
        sourceNodeRef.current.disconnect();
      }
      if (analyserRef.current) {
        analyserRef.current.disconnect();
      }
      // Don't close audio context here as it might be shared or reused
    };
  }, [stream]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full rounded-lg bg-transparent"
      style={{ minHeight: "300px" }}
    />
  );
};

export default Visualizer;
