/* eslint-disable @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps */

import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { io, Socket } from "socket.io-client";
import Logo from "./Logo";

import toast, { Toaster } from "react-hot-toast";

interface User {
  id: string;
  name: string;
  isSharing: boolean;
  upvotes?: number;
  downvotes?: number;
}

interface PeerConnection {
  connection: RTCPeerConnection;
  stream?: MediaStream;
}

const SOCKET_URL =
  process.env.NODE_ENV === "production"
    ? "https://musicsync-server.onrender.com"
    : "http://localhost:3001";

// Generate random username if none provided
function generateUsername(): string {
  const adjectives = ["Swift", "Mellow", "Brisk", "Cosmic", "Lunar", "Solar"];
  const nouns = ["Beat", "Wave", "Rhythm", "Echo", "Pulse", "Vibe"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 1000);
  return `${adj}${noun}${num}`;
}

const Room: React.FC = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [isSharing, setIsSharing] = useState(false);
  const [shareType, setShareType] = useState<"microphone" | "system">(
    "microphone",
  );
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [sharingUser, setSharingUser] = useState<User | null>(null);
  const [hasVoted, setHasVoted] = useState<"up" | "down" | null>(null);
  const [messages, setMessages] = useState<
    { id: string; username: string; text: string; timestamp: string }[]
  >([]);
  const [newMessage, setNewMessage] = useState("");
  const isSharingRef = useRef(isSharing);
  useEffect(() => {
    isSharingRef.current = isSharing;
  }, [isSharing]);

  const socketRef = useRef<Socket>();
  const localStreamRef = useRef<MediaStream>();
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>();
  const peersRef = useRef<Map<string, PeerConnection>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const visualizedStreamIdRef = useRef<string | null>(null);
  const resizeCanvasListenerRef = useRef<(() => void) | null>(null);

  const handleSendMessage = (message: string) => {
    if (socketRef.current && message.trim()) {
      const username = localStorage.getItem("username") || "Anonymous";
      socketRef.current.emit("chat-message", {
        roomId,
        message: {
          id: `${socketRef.current.id}-${Date.now()}`,
          username,
          text: message,
          timestamp: new Date().toLocaleTimeString(),
        },
      });
    }
  };

  // Function to handle voting
  const handleVote = (voteType: "up" | "down") => {
    if (!sharingUser || !socketRef.current) return;

    // Don't allow re-votes of the same type
    if (hasVoted === voteType) return;

    // Don't allow voting on your own stream
    if (isSharing) return;

    console.log("Sending vote:", { targetUserId: sharingUser.id, voteType });

    // Emit vote event to server
    socketRef.current.emit("vote", {
      roomId,
      targetUserId: sharingUser.id,
      voteType,
    });

    // Optimistically update the UI
    // This ensures the user sees immediate feedback even if there's network latency
    setUsers((prevUsers) => {
      return prevUsers.map((user) => {
        if (user.id === sharingUser.id) {
          const currentUpvotes = user.upvotes || 0;
          const currentDownvotes = user.downvotes || 0;

          if (voteType === "up") {
            // If switching from downvote, decrement downvotes
            const newDownvotes =
              hasVoted === "down"
                ? Math.max(0, currentDownvotes - 1)
                : currentDownvotes;
            return {
              ...user,
              upvotes: currentUpvotes + 1,
              downvotes: newDownvotes,
            };
          } else {
            // If switching from upvote, decrement upvotes
            const newUpvotes =
              hasVoted === "up"
                ? Math.max(0, currentUpvotes - 1)
                : currentUpvotes;
            return {
              ...user,
              downvotes: currentDownvotes + 1,
              upvotes: newUpvotes,
            };
          }
        }
        return user;
      });
    });

    // Also update sharingUser if it's the same one
    setSharingUser((prev) => {
      if (prev && prev.id === sharingUser.id) {
        const currentUpvotes = prev.upvotes || 0;
        const currentDownvotes = prev.downvotes || 0;

        if (voteType === "up") {
          const newDownvotes =
            hasVoted === "down"
              ? Math.max(0, currentDownvotes - 1)
              : currentDownvotes;
          const newValue = {
            ...prev,
            upvotes: currentUpvotes + 1,
            downvotes: newDownvotes,
          };
          console.log("Optimistically updating sharing user:", newValue);
          return newValue;
        } else {
          const newUpvotes =
            hasVoted === "up"
              ? Math.max(0, currentUpvotes - 1)
              : currentUpvotes;
          const newValue = {
            ...prev,
            downvotes: currentDownvotes + 1,
            upvotes: newUpvotes,
          };
          console.log("Optimistically updating sharing user:", newValue);
          return newValue;
        }
      }
      return prev;
    });

    // Update local state
    setHasVoted(voteType);

    // Show toast notification
    if (voteType === "up") {
      toast.success("You upvoted this audio stream!");
    } else {
      toast.success("You downvoted this audio stream");
    }
  };

  useEffect(() => {
    // Initialize WebSocket connection
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    let username = localStorage.getItem("username");
    if (!username) {
      username = generateUsername();
      localStorage.setItem("username", username);
    }

    socket.emit("join-room", { roomId, username });

    socket.on("user-joined", async ({ users: roomUsers }) => {
      const currentlySharing = roomUsers.find((user: User) => user.isSharing);
      setSharingUser(currentlySharing || null);

      // Only establish a connection if there is a sharer AND we are not already connected.
      if (currentlySharing && currentlySharing.id !== socket.id) {
        const existingPeer = peersRef.current.get(currentlySharing.id);
        if (
          !existingPeer ||
          existingPeer.connection.connectionState !== "connected"
        ) {
          try {
            const pc = createPeerConnection(currentlySharing.id);
            const offer = await pc.connection.createOffer();
            await pc.connection.setLocalDescription(offer);
            socket.emit("offer", { offer, to: currentlySharing.id });
          } catch (negErr) {
            console.error("Late-join negotiation failed:", negErr);
          }
        }
      }
      // Always update the user list for everyone.
      setUsers(roomUsers);
    });

    socket.on("user-left", ({ userId, wasSharing, users: roomUsers }) => {
      setUsers(roomUsers);
      if (wasSharing) {
        setSharingUser(null);
        stopVisualization();
        const peer = peersRef.current.get(userId);
        if (peer) {
          peer.connection.close();
          peersRef.current.delete(userId);
        }
        const audioElement = audioElementsRef.current.get(userId);
        if (audioElement) {
          audioElement.srcObject = null;
          audioElement.remove();
          audioElementsRef.current.delete(userId);
        }
      }
    });

    socket.on("vote-update", ({ userId, upvotes, downvotes }) => {
      setUsers((prevUsers) =>
        prevUsers.map((user) =>
          user.id === userId ? { ...user, upvotes, downvotes } : user,
        ),
      );
      setSharingUser((prev) =>
        prev && prev.id === userId ? { ...prev, upvotes, downvotes } : prev,
      );
    });

    socket.on("user-stopped-sharing", ({ userId }) => {
      setUsers((prevUsers) =>
        prevUsers.map((user) => ({ ...user, isSharing: false })),
      );
      setSharingUser(null);
      setHasVoted(null);
      stopVisualization();
      const peer = peersRef.current.get(userId);
      if (peer) {
        peer.connection.close();
        peersRef.current.delete(userId);
      }
      const audioElement = audioElementsRef.current.get(userId);
      if (audioElement) {
        audioElement.srcObject = null;
        audioElement.remove();
        audioElementsRef.current.delete(userId);
      }
    });

    socket.on("offer", async ({ offer, from }) => {
      if (isSharingRef.current) {
        // Sharer receiving offer from a late-joiner
        let pc = peersRef.current.get(from);
        if (pc) pc.connection.close();
        pc = createPeerConnection(from);
        await pc.connection.setRemoteDescription(
          new RTCSessionDescription(offer),
        );
        const answer = await pc.connection.createAnswer();
        await pc.connection.setLocalDescription(answer);
        socketRef.current?.emit("answer", { answer, to: from });
      } else {
        // Listener receiving offer from the sharer
        let pc = peersRef.current.get(from);
        if (pc) pc.connection.close();
        pc = createPeerConnection(from);
        pc.connection.ontrack = (event) => handleTrack(event, from);
        await pc.connection.setRemoteDescription(
          new RTCSessionDescription(offer),
        );
        const answer = await pc.connection.createAnswer();
        await pc.connection.setLocalDescription(answer);
        socketRef.current?.emit("answer", { answer, to: from });
      }
    });

    socket.on("answer", async ({ answer, from }) => {
      const pc = peersRef.current.get(from);
      if (pc) {
        await pc.connection.setRemoteDescription(
          new RTCSessionDescription(answer),
        );
      }
    });

    socket.on("ice-candidate", async ({ candidate, from }) => {
      const pc = peersRef.current.get(from);
      if (pc && candidate) {
        await pc.connection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    socket.on("chat-message", (message) => {
      setMessages((prevMessages) => [...prevMessages, message]);
    });

    return () => {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      audioElementsRef.current.forEach((audio) => {
        audio.srcObject = null;
        audio.remove();
      });
      audioElementsRef.current.clear();
      peersRef.current.forEach((peer) => peer.connection.close());
      peersRef.current.clear();
      stopVisualization();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      socket.disconnect();
    };
  }, [roomId, navigate]);

  const createPeerConnection = (userId: string) => {
    console.log("Creating peer connection for user:", userId);

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
        { urls: "stun:stun4.l.google.com:19302" },
        {
          urls: [
            "turn:openrelay.metered.ca:80",
            "turn:openrelay.metered.ca:443",
            "turn:openrelay.metered.ca:443?transport=tcp",
          ],
          username: "openrelayproject",
          credential: "openrelayproject",
        },
      ],
      iceCandidatePoolSize: 10,
      iceTransportPolicy: "all",
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    });

    // Stable audio m-line: add transceiver before negotiating
    if (localStreamRef.current) {
      // For sharing user: add tracks directly so they're actually sent
      localStreamRef.current.getAudioTracks().forEach((track) => {
        try {
          console.log(`Adding track to connection for ${userId}:`, track.label);
          pc.addTrack(track, localStreamRef.current as MediaStream);
        } catch (e) {
          console.warn("Adding track failed:", e);
        }
      });
    } else {
      try {
        pc.addTransceiver("audio", { direction: "recvonly" });
      } catch (e) {
        console.warn("addTransceiver recvonly failed:", e);
      }
    }

    // Add comprehensive connection state monitoring
    pc.oniceconnectionstatechange = () => {
      console.log(
        `ICE connection state with ${userId}:`,
        pc.iceConnectionState,
      );

      // Handle different ICE connection states
      switch (pc.iceConnectionState) {
        case "checking":
          console.log("ICE checking in progress...");
          break;
        case "connected":
          console.log("ICE connected successfully");
          toast.success("Connection established", { id: "ice-connected" });
          break;
        case "completed":
          console.log("ICE negotiation completed");
          break;
        case "failed":
          console.log("ICE connection failed - attempting restart");
          toast.error("Connection issue detected - attempting to recover");
          pc.restartIce();

          // After a delay, try more aggressive recovery if still failed
          setTimeout(() => {
            if (pc.iceConnectionState === "failed") {
              console.log(
                "Still failed after restart attempt, trying to renegotiate",
              );
              // If we're the sharer, try to renegotiate
              if (isSharing && localStreamRef.current) {
                try {
                  // Create a new offer
                  pc.createOffer({
                    offerToReceiveAudio: true,
                    iceRestart: true,
                  }).then((offer) => {
                    pc.setLocalDescription(offer).then(() => {
                      socketRef.current?.emit("offer", { offer, to: userId });
                      console.log("Sent renegotiation offer");
                    });
                  });
                } catch (e) {
                  console.error("Error during renegotiation:", e);
                }
              }
            }
          }, 5000);
          break;
        case "disconnected":
          console.log("ICE disconnected - attempting recovery");
          toast.info("Connection interrupted - trying to recover");
          pc.restartIce();
          break;
      }
    };

    pc.onicegatheringstatechange = () => {
      console.log(`ICE gathering state with ${userId}:`, pc.iceGatheringState);
    };

    pc.onsignalingstatechange = () => {
      console.log(`Signaling state with ${userId}:`, pc.signalingState);
      if (pc.signalingState === "closed") {
        console.log("Signaling state closed, cleaning up peer connection");
        pc.close();
        peersRef.current.delete(userId);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${userId}:`, pc.connectionState);
    };

    // Set up the ontrack handler for receiving audio
    pc.ontrack = (event) => handleTrack(event, userId);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("Sending ICE candidate to:", userId);
        socketRef.current?.emit("ice-candidate", {
          candidate: event.candidate,
          to: userId,
        });
      } else {
        console.log("ICE gathering completed for:", userId);
      }
    };

    const peerConnection = { connection: pc };
    peersRef.current.set(userId, peerConnection);
    return peerConnection;
  };

  // Add connection status monitoring
  useEffect(() => {
    const checkConnectionStatus = () => {
      peersRef.current.forEach((peer, userId) => {
        if (
          peer.connection.connectionState === "failed" ||
          peer.connection.connectionState === "disconnected"
        ) {
          console.log("Restarting ICE for peer:", userId);
          peer.connection.restartIce();
        }
      });
    };

    const interval = setInterval(checkConnectionStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const startSharing = async () => {
    // Check if someone else is already sharing
    if (sharingUser) {
      toast.error(
        "Someone else is already sharing. Please wait for them to stop.",
      );
      return;
    }

    // Check if we're already sharing
    if (isSharing) {
      toast.error("You are already sharing audio.");
      return;
    }

    try {
      let stream: MediaStream;

      if (shareType === "microphone") {
        console.log("Requesting microphone access...");
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        console.log(
          "Microphone access granted:",
          stream.getAudioTracks()[0].label,
        );
      } else {
        // Check if getDisplayMedia is supported
        if (!navigator.mediaDevices.getDisplayMedia) {
          throw new Error(
            "System audio sharing is not supported on this device. Please use microphone sharing instead.",
          );
        }

        console.log("Requesting system audio access...");
        stream = await navigator.mediaDevices.getDisplayMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
          video: {
            width: 1,
            height: 1,
            frameRate: 1,
          },
        });

        // Check if audio track was actually obtained
        const audioTrack = stream.getAudioTracks()[0];
        if (!audioTrack) {
          throw new Error(
            'No audio track was captured. Please make sure to select a window/tab and enable "Share audio".',
          );
        }
        console.log("System audio access granted:", audioTrack.label);

        // Stop the dummy video track if it exists
        stream.getVideoTracks().forEach((track) => track.stop());
      }

      // Verify stream properties
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        console.log("Stream properties:", {
          enabled: audioTrack.enabled,
          readyState: audioTrack.readyState,
          label: audioTrack.label,
          kind: audioTrack.kind,
          id: audioTrack.id,
        });

        // Ensure track is enabled
        audioTrack.enabled = true;
      }

      // Store the stream reference
      localStreamRef.current = stream;

      // Set up visualization immediately after getting the stream
      setupAudioVisualization(stream);

      setIsSharing(true);
      // Update local states immediately using the previous state
      setUsers((prevUsers) => {
        const updatedUsers = prevUsers.map((user) => ({
          ...user,
          isSharing: user.id === socketRef.current?.id,
        }));
        const currentUser = updatedUsers.find(
          (user) => user.id === socketRef.current?.id,
        );
        if (currentUser) {
          setSharingUser(currentUser);
        }
        return updatedUsers;
      });

      socketRef.current?.emit("start-sharing");

      // Handle stream ending
      stream.getAudioTracks()[0].onended = () => {
        console.log("Audio track ended");
        stopSharing();
      };

      // Handle browser tab/window close
      window.addEventListener("beforeunload", stopSharing);
    } catch (error) {
      console.error("Error starting audio share:", error);
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error(
          shareType === "microphone"
            ? "Failed to access microphone. Please check your browser permissions and ensure you have a working microphone."
            : 'Failed to capture system audio. Please make sure to select a window/tab and enable the "Share audio" option in the dialog.',
        );
      }
      setIsSharing(false);
    }
  };

  const stopSharing = () => {
    console.log("Sharer: stopSharing function called.");
    // Remove beforeunload listener
    window.removeEventListener("beforeunload", stopSharing);

    // Stop all tracks in local stream
    localStreamRef.current?.getTracks().forEach((track) => {
      console.log("Stopping track:", track.kind, track.label);
      track.stop();
    });

    // Reset sharing state without clearing ALL peer connections
    // This allows listeners to keep their peer connections active even if sharing stops
    if (isSharing) {
      // Only close connections if we're stopping our own sharing
      // Otherwise, connections should be kept alive for future shares
      peersRef.current.forEach((peer) => {
        // We're preserving the peer connection objects to avoid recreating them
        // but we'll close the RTCPeerConnection itself if we're the sharer
        peer.connection.close();
      });
      peersRef.current.clear();
    }

    setIsSharing(false);
    socketRef.current?.emit("stop-sharing");
    stopVisualization(); // This is the call for the sharer's own visualizer
  };

  const handleTrack = (event: RTCTrackEvent, userId: string) => {
    console.log(
      "Handling incoming track from user:",
      userId,
      "Track kind:",
      event.track.kind,
    );

    // Determine stream: use provided streams or fallback to new MediaStream from the received track
    const stream =
      event.streams && event.streams.length > 0
        ? event.streams[0]
        : new MediaStream([event.track]);

    // Log stream info for debugging
    console.log("Stream details:", {
      id: stream.id,
      active: stream.active,
      trackCount: stream.getTracks().length,
    });
    console.log(
      "Received track from peer:",
      stream,
      "with audio tracks:",
      stream.getAudioTracks().length,
    );

    if (stream.getAudioTracks().length === 0) {
      console.error("No audio tracks in the received stream");
      toast.error(
        "No audio tracks received. The sharer may need to restart sharing.",
      );
      return;
    }

    // Log audio track details for debugging
    stream.getAudioTracks().forEach((track) => {
      console.log("Audio track details:", {
        id: track.id,
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
      });
    });

    // Create or get existing audio element for this user
    let audioElement = audioElementsRef.current.get(userId);
    if (!audioElement) {
      audioElement = new Audio();
      audioElement.autoplay = true;
      audioElement.controls = true; // Add controls for easier debugging
      (audioElement as any).playsInline = true;
      audioElement.setAttribute("playsinline", "");

      // Position the audio control in a non-disruptive way for debugging
      audioElement.style.position = "fixed";
      audioElement.style.bottom = "10px";
      audioElement.style.right = "10px";
      audioElement.style.width = "300px";
      audioElement.style.zIndex = "1000";
      audioElement.style.opacity = "0.7";

      document.body.appendChild(audioElement);
      audioElement.id = `audio-${userId}`;
      audioElementsRef.current.set(userId, audioElement);

      // Add error handling for audio playback
      audioElement.onerror = (e) => {
        console.error("Audio playback error:", e);
        toast.error(
          "Error playing received audio. Please check your audio output settings.",
        );
      };

      // Add success logging
      audioElement.onplaying = () => {
        console.log("Audio playback started successfully for", userId);
        toast.success("Audio connection established!");
      };

      // Add volume control
      audioElement.volume = 1.0;
    }

    // Set the stream as the source and play
    try {
      audioElement.srcObject = stream;
      console.log("Set srcObject for audio element:", userId);

      // Add a user gesture requirement if autoplay is restricted
      const playPromise = audioElement.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.error("Error playing audio:", error);
          if (error.name === "NotAllowedError") {
            console.log("Autoplay prevented by browser policy");
            // Create a UI element to enable audio
            if (audioElement) {
              // Ensure audioElement exists before passing to the function
              createAudioEnableButton(userId, audioElement);
            }
          } else {
            toast.error(
              `Failed to play received audio: ${error.message}. Try clicking anywhere on the page.`,
            );
            if (audioElement) {
              // Ensure audioElement exists before passing to the function
              createAudioEnableButton(userId, audioElement);
            }
          }
        });
      }
    } catch (err) {
      console.error("Exception when setting up audio playback:", err);
      toast.error(
        "Failed to set up audio playback. Technical details in console.",
      );
    }

    // Set up visualization for any received audio track - show for everyone
    if (stream.getAudioTracks().length > 0) {
      // Always visualize any audio we receive
      setupAudioVisualization(stream);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.6,
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.4,
        ease: "easeOut",
      },
    },
  };

  // Audio visualization using Web Audio API with improved aesthetics
  function setupAudioVisualization(stream: MediaStream) {
    // Avoid re-initializing for the same stream
    if (visualizedStreamIdRef.current === stream.id) return;

    // Stop any existing visualization loop and resume audio context
    stopVisualization();
    if (audioContextRef.current?.state === "suspended") {
      audioContextRef.current.resume().catch(console.error);
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
    }
    analyserRef.current = audioContextRef.current.createAnalyser();
    analyserRef.current.fftSize = 2048; // Higher fidelity
    analyserRef.current.smoothingTimeConstant = 0.85; // Smoother transitions

    // Create a new source node from the stream
    sourceNodeRef.current =
      audioContextRef.current.createMediaStreamSource(stream);
    sourceNodeRef.current.connect(analyserRef.current);
    visualizedStreamIdRef.current = stream.id; // Mark this stream as visualized

    const canvas = document.getElementById("visualizer") as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const resizeCanvas = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    };

    resizeCanvasListenerRef.current = resizeCanvas;
    window.addEventListener("resize", resizeCanvasListenerRef.current);
    resizeCanvas();

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

    // Track time for wave effects
    let time = 0;

    const draw = () => {
      // Get frequency data
      analyserRef.current!.getByteFrequencyData(dataArray);

      // Calculate dimensions
      const width = canvas.width;
      const height = canvas.height;

      // Clear with gradient background
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "#0a0322"); // Deep purple
      gradient.addColorStop(1, "#1a1a2e"); // Dark blue
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // Draw spectrum bars with glow
      const barCount = 64; // Fewer bars for smoother look
      const barWidth = width / barCount - 2;
      const binSize = Math.floor(dataArray.length / barCount);

      // Add subtle grid
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 0.5;
      for (let i = 0; i < height; i += 20) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(width, i);
        ctx.stroke();
      }

      // Draw frequency bars with glow
      for (let i = 0; i < barCount; i++) {
        // Get average value for this segment
        let sum = 0;
        for (let j = 0; j < binSize; j++) {
          sum += dataArray[i * binSize + j];
        }
        const value = sum / binSize;

        // Calculate bar height with some exponential scaling
        const barHeight = Math.pow(value / 255, 1.5) * height;

        // Position x coordinate
        const x = i * (barWidth + 2);

        // Create gradient for this bar
        const hue = 250 - (value / 255) * 150; // Purple to pink
        const saturation = 80 + (value / 255) * 20;
        const lightness = 50 + (value / 255) * 10;

        // Glow effect
        ctx.shadowColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        ctx.shadowBlur = 15;

        // Main bar gradient
        const barGradient = ctx.createLinearGradient(
          0,
          height,
          0,
          height - barHeight,
        );
        barGradient.addColorStop(
          0,
          `hsl(${hue}, ${saturation}%, ${lightness}%)`,
        );
        barGradient.addColorStop(
          1,
          `hsl(${hue + 30}, ${saturation}%, ${lightness + 20}%)`,
        );

        ctx.fillStyle = barGradient;
        ctx.fillRect(x, height - barHeight, barWidth, barHeight);

        // Add reflection
        ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.3)`;
        ctx.fillRect(x, height, barWidth, barHeight * 0.2);
      }

      // Draw center line with ripple effect
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 2;
      ctx.beginPath();

      // Add pulsing wave at bottom
      ctx.beginPath();
      for (let x = 0; x < width; x++) {
        const y = height - 10 + Math.sin(x * 0.03 + time * 2) * 5;
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.strokeStyle = "rgba(120, 100, 255, 0.5)";
      ctx.stroke();

      // Update time for wave effect
      time += 0.02;

      // Continue animation
      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();
  }

  function stopVisualization() {
    console.log("stopVisualization called.");
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
      console.log("Animation frame canceled.");
    }
    // Disconnect the source node to stop it from processing audio
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
      console.log("Source node disconnected.");
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
      console.log("Analyser node disconnected.");
    }
    if (resizeCanvasListenerRef.current) {
      window.removeEventListener("resize", resizeCanvasListenerRef.current);
      resizeCanvasListenerRef.current = null;
    }
    visualizedStreamIdRef.current = null; // Reset visualized stream ID
    console.log("Visualized stream ID reset.");
  }

  // Check for mobile device on component mount
  useEffect(() => {
    // Basic check for mobile devices
    const checkMobile = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(
        userAgent,
      );
    };

    const mobile = checkMobile();
    setIsMobile(mobile);

    if (mobile) {
      // Force microphone mode on mobile as getDisplayMedia isn't supported
      setShareType("microphone");
    }
  }, []);

  // Copy room link and show toast
  // Function to create a UI button to enable audio for a specific stream
  const createAudioEnableButton = (
    userId: string,
    audioElement: HTMLAudioElement,
  ): void => {
    // Remove any existing button
    const existingButton = document.getElementById(`enable-audio-${userId}`);
    if (existingButton) existingButton.remove();

    // Create new button with a more subtle and aesthetic design
    const button = document.createElement("button");
    button.id = `enable-audio-${userId}`;

    // Create an icon and text wrapper for better aesthetics
    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.alignItems = "center";
    wrapper.style.gap = "8px";

    // Add audio icon using emoji (can be replaced with SVG for production)
    const icon = document.createElement("span");
    icon.textContent = "🔊";
    icon.style.fontSize = "16px";

    // Add text
    const text = document.createElement("span");
    text.textContent = "Enable Audio";

    wrapper.appendChild(icon);
    wrapper.appendChild(text);
    button.appendChild(wrapper);

    // Position in the bottom right corner instead of center screen
    button.style.position = "fixed";
    button.style.bottom = "20px";
    button.style.right = "20px";
    button.style.padding = "10px 15px";
    button.style.backgroundColor = "rgba(139, 92, 246, 0.85)";
    button.style.backdropFilter = "blur(8px)";
    button.style.color = "white";
    button.style.border = "none";
    button.style.borderRadius = "8px";
    button.style.fontWeight = "500";
    button.style.fontSize = "14px";
    button.style.zIndex = "10000";
    button.style.cursor = "pointer";
    button.style.boxShadow = "0 2px 10px rgba(0, 0, 0, 0.2)";
    button.style.transition = "all 0.2s ease";

    // Add hover effect
    button.onmouseover = () => {
      button.style.backgroundColor = "#7C3AED";
    };
    button.onmouseout = () => {
      button.style.backgroundColor = "#8B5CF6";
    };

    // Add click handler
    button.onclick = () => {
      audioElement
        .play()
        .then(() => {
          console.log("Audio enabled by user interaction");
          toast.success("Audio enabled!");
          button.remove();
        })
        .catch((err) => {
          console.error(
            "Still could not play audio after user interaction:",
            err,
          );
          toast.error(
            "Still having trouble with audio. Try refreshing the page.",
          );
        });
    };

    document.body.appendChild(button);

    // Add a subtle pulse animation (without transform since it's not centered)
    const keyframes = [
      {
        boxShadow: "0 2px 10px rgba(139, 92, 246, 0.3)",
        backgroundColor: "rgba(139, 92, 246, 0.85)",
      },
      {
        boxShadow: "0 2px 15px rgba(139, 92, 246, 0.7)",
        backgroundColor: "rgba(139, 92, 246, 0.95)",
      },
      {
        boxShadow: "0 2px 10px rgba(139, 92, 246, 0.3)",
        backgroundColor: "rgba(139, 92, 246, 0.85)",
      },
    ];

    button.animate(keyframes, {
      duration: 2000,
      iterations: Infinity,
    });

    // Show toast with instructions
    toast.success(
      "Click the audio button in the bottom right to enable sound",
      { duration: 5000 },
    );
  };

  const copyLink = () => {
    const link = window.location.href;
    navigator.clipboard
      .writeText(link)
      .then(() => toast.success("Invite link copied!"))
      .catch(() => toast.error("Failed to copy link"));
  };

  return (
    <motion.div
      className="min-h-screen bg-gradient-to-br from-gray-950 to-gray-900 text-white p-4 md:p-8 flex flex-col"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <Toaster position="top-right" />
      <div className="max-w-7xl mx-auto w-full flex flex-col flex-grow">
        <div className="flex justify-between items-center mb-6 flex-shrink-0">
          <div className="flex items-center space-x-4">
            <Logo size={50} />
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
              Room: {roomId}
            </h1>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              className="p-2 rounded-full bg-purple-500/20 backdrop-blur-sm hover:bg-purple-500/30 text-white transition-all duration-300 border border-purple-500/30"
              onClick={copyLink}
              title="Copy invite link"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
              </svg>
            </motion.button>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 rounded-lg shadow-lg transition-all duration-300"
            onClick={() => navigate("/")}
          >
            Leave Room
          </motion.button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 flex-grow min-h-0">
          {/* Main Content */}
          <div className="lg:col-span-9 flex flex-col gap-6">
            {/* Visualizer and Controls */}
            <motion.div
              className="bg-black-glass backdrop-blur-xl rounded-xl p-6 shadow-xl border border-white-glass flex-grow flex flex-col justify-between"
              variants={itemVariants}
            >
              <div className="flex-grow flex items-center justify-center relative">
                <canvas
                  id="visualizer"
                  className="w-full h-full rounded-lg bg-transparent"
                />
                {/* Voting Controls */}
                {sharingUser && !isSharing && (
                  <div className="absolute top-3 right-3 z-10 flex items-center space-x-3 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-purple-500/30 shadow-lg">
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      className={`p-1.5 rounded-full flex items-center justify-center transition-all duration-300 ${hasVoted === "up" ? "bg-green-500/30 text-green-400" : "hover:bg-gray-700/50 text-gray-400"}`}
                      onClick={() => handleVote("up")}
                      disabled={isSharing}
                    >
                      <motion.svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                        animate={
                          hasVoted === "up" ? { scale: [1, 1.2, 1] } : {}
                        }
                        transition={{ duration: 0.3 }}
                      >
                        <path d="M12 3l8 8h-6v10h-4v-10h-6l8-8z" />
                      </motion.svg>
                      <span className="ml-1 font-semibold text-sm">
                        {sharingUser.upvotes || 0}
                      </span>
                    </motion.button>
                    <div className="h-6 w-px bg-purple-500/30"></div>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      className={`p-1.5 rounded-full flex items-center justify-center transition-all duration-300 ${hasVoted === "down" ? "bg-red-500/30 text-red-400" : "hover:bg-gray-700/50 text-gray-400"}`}
                      onClick={() => handleVote("down")}
                      disabled={isSharing}
                    >
                      <motion.svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                        animate={
                          hasVoted === "down" ? { scale: [1, 1.2, 1] } : {}
                        }
                        transition={{ duration: 0.3 }}
                      >
                        <path d="M12 21l-8-8h6v-10h4v10h6l-8 8z" />
                      </motion.svg>
                      <span className="ml-1 font-semibold text-sm">
                        {sharingUser.downvotes || 0}
                      </span>
                    </motion.button>
                  </div>
                )}
                {isSharing && sharingUser && (
                  <div className="absolute top-3 right-3 z-10 flex items-center space-x-3 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-purple-500/30 shadow-lg">
                    <div className="flex items-center p-1.5 text-green-400">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 3l8 8h-6v10h-4v-10h-6l8-8z" />
                      </svg>
                      <span className="ml-1 font-semibold text-sm">
                        {sharingUser.upvotes || 0}
                      </span>
                    </div>
                    <div className="h-6 w-px bg-purple-500/30"></div>
                    <div className="flex items-center p-1.5 text-red-400">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 21l-8-8h6v-10h4v10h6l-8 8z" />
                      </svg>
                      <span className="ml-1 font-semibold text-sm">
                        {sharingUser.downvotes || 0}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-white-glass mt-4">
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  {!sharingUser && (
                    <>
                      {/* Source Selection Toggle */}
                      <div className="bg-black-glass backdrop-blur-sm border border-white-glass rounded-lg p-1 flex items-center">
                        <button
                          onClick={() => setShareType("system")}
                          disabled={isMobile}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all duration-300 ${
                            shareType === "system"
                              ? "bg-purple-600 text-white shadow-lg"
                              : "text-gray-300 hover:bg-gray-700/50"
                          } ${isMobile ? "cursor-not-allowed opacity-50" : ""}`}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-5 w-5"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M3 5a2 2 0 012-2h10a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm2 0v6h10V5H5z"
                              clipRule="evenodd"
                            />
                            <path d="M3 14a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
                          </svg>
                          System
                        </button>
                        <button
                          onClick={() => setShareType("microphone")}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all duration-300 ${shareType === "microphone" ? "bg-purple-600 text-white shadow-lg" : "text-gray-300 hover:bg-gray-700/50"}`}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-5 w-5"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
                              clipRule="evenodd"
                            />
                          </svg>
                          Mic
                        </button>
                      </div>

                      {/* Share Button */}
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="px-6 py-3 rounded-lg shadow-lg text-lg font-semibold bg-gradient-to-r from-purple-500 to-purple-700 hover:from-purple-600 hover:to-purple-800 transition-all duration-300 flex items-center justify-center space-x-2"
                        onClick={startSharing}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-6 w-6"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path d="M4.34 2.827a1 1 0 011.32 0l1.413 1.415a1 1 0 010 1.318L4.22 8.414a1 1 0 01-1.319 0L1.586 7.1a1 1 0 010-1.318L2.9 4.366a1 1 0 011.44-.002zM10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm0 14a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zm-5.66-2.173a1 1 0 010-1.318l2.854-2.854a1 1 0 011.318 0l2.854 2.854a1 1 0 010 1.318l-1.414 1.414a1 1 0 01-1.318 0L10 13.414l-1.414 1.414a1 1 0 01-1.318 0l-1.414-1.414zm11.318-9.854a1 1 0 010 1.318L12.8 8.414a1 1 0 01-1.318 0L8.627 5.56a1 1 0 010-1.318l1.414-1.414a1 1 0 011.318 0L14.214 5.7a1 1 0 011.318 0l1.414 1.414z" />
                        </svg>
                        <span>Share Audio</span>
                      </motion.button>
                    </>
                  )}
                  {isSharing && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="px-6 py-3 rounded-lg shadow-lg text-lg font-semibold bg-gradient-to-r from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 transition-all duration-300 flex items-center justify-center space-x-2"
                      onClick={stopSharing}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-6 w-6"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span>Stop Sharing</span>
                    </motion.button>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Users List */}
            <motion.div
              className="bg-black-glass backdrop-blur-xl rounded-xl p-6 shadow-xl border border-white-glass"
              variants={itemVariants}
            >
              <h2 className="text-xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
                Connected Users ({users.length})
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {users.map((user) => (
                  <motion.div
                    key={user.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className={`p-3 rounded-lg text-center backdrop-blur-sm transition-all duration-300 ${
                      user.isSharing
                        ? "bg-purple-500/20 border border-purple-500 shadow-lg shadow-purple-500/20"
                        : "bg-gray-700/50 border border-gray-600/20"
                    }`}
                  >
                    <span className="font-medium text-sm">{user.name}</span>
                    {user.isSharing && (
                      <span className="block text-xs text-purple-300 mt-1">
                        Sharing
                      </span>
                    )}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Chat Panel */}
          <motion.div
            className="lg:col-span-3 bg-black-glass backdrop-blur-xl rounded-xl shadow-xl border border-white-glass flex flex-col h-full p-4"
            variants={itemVariants}
          >
            <div className="p-4 border-b border-white-glass">
              <h2 className="text-xl font-bold text-center bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-blue-500">
                Live Chat
              </h2>
            </div>
            <div className="flex-grow p-4 overflow-y-auto">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 mb-4 ${
                    msg.username ===
                    (localStorage.getItem("username") || "Anonymous")
                      ? "flex-row-reverse"
                      : ""
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center font-bold text-sm">
                    {msg.username.charAt(0).toUpperCase()}
                  </div>
                  <div
                    className={`chat-message p-3 rounded-lg max-w-[85%] ${
                      msg.username ===
                      (localStorage.getItem("username") || "Anonymous")
                        ? "bg-purple-600 text-white rounded-br-none"
                        : "bg-gray-700 text-gray-200 rounded-bl-none"
                    } ${msg.username === "System" ? "bg-gray-800 text-center w-full max-w-full" : ""}`}
                  >
                    <div className="text-xs text-gray-400 mb-1">
                      {msg.username}
                    </div>
                    <div className="text-sm">{msg.text}</div>
                    <div className="text-xs text-gray-500 mt-1 text-right">
                      {msg.timestamp}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-white-glass">
              <form
                className="flex items-center justify-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage(newMessage);
                  setNewMessage("");
                }}
              >
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                />
                <button
                  type="submit"
                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold p-2 rounded-lg transition-colors flex-shrink-0"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 12h14M12 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </form>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default Room;
