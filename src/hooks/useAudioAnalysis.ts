import { useEffect, useRef, useState } from "react";

export const useAudioAnalysis = (stream: MediaStream | null) => {
    const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

    useEffect(() => {
        if (!stream) {
            setAnalyser(null);
            return;
        }

        const initAudio = () => {
            try {
                if (!audioContextRef.current) {
                    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
                }

                if (audioContextRef.current.state === "suspended") {
                    audioContextRef.current.resume();
                }

                // Create analyser if not exists
                // We use a larger FFT size (1024) to support high-res visualization
                // DanceFloor can downsample or just use the lower bins
                const newAnalyser = audioContextRef.current.createAnalyser();
                newAnalyser.fftSize = 1024;
                newAnalyser.smoothingTimeConstant = 0.8;

                // Connect stream
                if (sourceRef.current) {
                    sourceRef.current.disconnect();
                }
                sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
                sourceRef.current.connect(newAnalyser);

                setAnalyser(newAnalyser);
            } catch (err) {
                console.error("Error initializing shared audio engine:", err);
            }
        };

        initAudio();

        return () => {
            if (sourceRef.current) {
                sourceRef.current.disconnect();
            }
            // We generally don't close the AudioContext as it might be expensive to recreate
            // and we want to reuse it if the stream changes.
            // However, if the component unmounts completely, we might want to close it.
            // For this app, keeping it open is fine.
        };
    }, [stream]);

    return analyser;
};
