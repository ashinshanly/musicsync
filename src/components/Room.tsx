import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { io, Socket } from 'socket.io-client';
import Logo from './Logo';

interface User {
  id: string;
  name: string;
  isSharing: boolean;
}

interface PeerConnection {
  connection: RTCPeerConnection;
  stream?: MediaStream;
}

// Stub for SDP modification
function modifySDP(sdp: string): string {
  // Currently a no-op stub
  return sdp;
}

// Stub for audio visualization setup
function setupAudioVisualization(stream: MediaStream): void {
  // TODO: implement audio visualization
}

// Stub for stopping audio visualization
function stopVisualization(): void {
  // TODO: implement visualization cleanup
}

const SOCKET_URL = process.env.NODE_ENV === 'production' 
  ? 'https://musicsync-server.onrender.com' // Replace with your Render.com URL once deployed
  : 'http://localhost:3001';

const Room: React.FC = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareType, setShareType] = useState<'microphone' | 'system'>('system');
  const [sharingUser, setSharingUser] = useState<User | null>(null);
  
  const socketRef = useRef<Socket>();
  const localStreamRef = useRef<MediaStream>();
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>();
  const peersRef = useRef<Map<string, PeerConnection>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const iceCandidateQueuesRef = useRef<Map<string, RTCIceCandidate[]>>(new Map());

  useEffect(() => {
    // Initialize WebSocket connection
    socketRef.current = io(SOCKET_URL);
    const username = localStorage.getItem('username') || 'Anonymous';
    
    socketRef.current.emit('join-room', { roomId, username });

    socketRef.current.on('user-joined', ({ users: roomUsers }) => {
      setUsers(roomUsers);
      // Update sharing user if someone is already sharing
      const currentlySharing = roomUsers.find((user: User) => user.isSharing);
      setSharingUser(currentlySharing || null);
    });

    socketRef.current.on('user-left', ({ userId, wasSharing, users: roomUsers }) => {
      setUsers(roomUsers);
      if (wasSharing) {
        setSharingUser(null);
        stopVisualization();
      }
    });

    socketRef.current.on('user-started-sharing', async ({ userId, username }) => {
      setUsers(prevUsers => {
        const updatedUsers = prevUsers.map(user => ({
          ...user,
          isSharing: user.id === userId
        }));
        // Find and set the sharing user from the updated users array
        const sharingUser = updatedUsers.find(user => user.id === userId);
        setSharingUser(sharingUser || null);
        return updatedUsers;
      });

      // If this is a new user joining a room with an active sharing session,
      // initiate the WebRTC connection with the sharing user
      if (userId !== socketRef.current?.id) {
        try {
          console.log('Setting up connection with sharing user:', userId);
          const pc = createPeerConnection(userId);
          
          // Create and send offer to the sharing user
          const offer = await pc.connection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: false
          });
          await pc.connection.setLocalDescription(offer);
          
          console.log('Sending offer to sharing user:', userId);
          socketRef.current?.emit('offer', { offer, to: userId });
        } catch (error) {
          console.error('Error setting up connection with sharing user:', error);
          setError('Failed to connect to sharing user. Please try joining the room again.');
        }
      }
    });

    socketRef.current.on('user-stopped-sharing', ({ userId }) => {
      setUsers(prevUsers => {
        const updatedUsers = prevUsers.map(user => ({
          ...user,
          isSharing: false
        }));
        setSharingUser(null);
        return updatedUsers;
      });
      stopVisualization();
    });

    socketRef.current.on('offer', async ({ offer, from }) => {
      try {
        console.log('Received offer from:', from);
        console.log('Original offer SDP:', offer.sdp);
        
        // Create peer connection if it doesn't exist
        let pc = peersRef.current.get(from);
        if (!pc) {
          console.log('Creating new peer connection for:', from);
          pc = createPeerConnection(from);
        } else {
          console.log('Using existing peer connection for:', from);
          pc.connection.close();
          pc = createPeerConnection(from);
        }
        
        // Initialize ICE candidate queue for this peer
        iceCandidateQueuesRef.current.set(from, []);
        
        // Set up the ontrack handler for receiving audio
        pc.connection.ontrack = (event) => {
          console.log('Received track from peer:', event.streams[0]);
          const [stream] = event.streams;
          
          // Create or get existing audio element for this user
          let audioElement = audioElementsRef.current.get(from);
          if (!audioElement) {
            audioElement = new Audio();
            audioElement.autoplay = true;
            (audioElement as any).playsInline = true;
            audioElement.id = `audio-${from}`;
            audioElementsRef.current.set(from, audioElement);
            
            // Add error handling for audio playback
            audioElement.onerror = (e) => {
              console.error('Audio playback error:', e);
              setError('Error playing received audio. Please check your audio output settings.');
            };
          }

          // Set the stream as the source and play
          audioElement.srcObject = stream;
          const playPromise = audioElement.play();
          if (playPromise !== undefined) {
            playPromise.catch(error => {
              console.error('Error playing audio:', error);
              setError('Failed to play received audio. Try clicking anywhere on the page.');
              // Try to play again after a short delay
              const currentAudioElement = audioElement;
              if (currentAudioElement) {
                setTimeout(() => {
                  currentAudioElement.play().catch(console.error);
                }, 1000);
              }
            });
          }

          // Set up visualization for the received stream
          if (stream.getAudioTracks().length > 0) {
            setupAudioVisualization(stream);
          }
        };
        
        // Set the remote description
        try {
          console.log('Setting remote description...');
          const modifiedOffer = new RTCSessionDescription({
            type: 'offer',
            sdp: modifySDP(offer.sdp)
          });
          console.log('Modified offer SDP:', modifiedOffer.sdp);
          
          // Check if we're in a valid state to set remote description
          if (pc.connection.signalingState !== 'stable') {
            console.log('Current signaling state:', pc.connection.signalingState);
            console.log('Rolling back to stable state...');
            await pc.connection.setLocalDescription({ type: 'rollback' });
          }
          
          await pc.connection.setRemoteDescription(modifiedOffer);
          console.log('Remote description set successfully');
          
          // Process any queued ICE candidates
          const queue = iceCandidateQueuesRef.current.get(from);
          if (queue && queue.length > 0) {
            console.log('Processing queued ICE candidates:', queue.length);
            for (const candidate of queue) {
              try {
                await pc.connection.addIceCandidate(candidate);
              } catch (err) {
                console.error('Error adding queued ICE candidate:', err);
              }
            }
            iceCandidateQueuesRef.current.delete(from);
          }
        } catch (err) {
          console.error('Error setting remote description:', err);
          // Try to recover by creating a new peer connection
          console.log('Attempting to recover by creating new peer connection...');
          pc.connection.close();
          pc = createPeerConnection(from);
          peersRef.current.set(from, pc);
          
          // Try setting remote description again
          try {
            const modifiedOffer = new RTCSessionDescription({
              type: 'offer',
              sdp: modifySDP(offer.sdp)
            });
            await pc.connection.setRemoteDescription(modifiedOffer);
            console.log('Successfully recovered and set remote description');
          } catch (recoveryErr) {
            console.error('Recovery failed:', recoveryErr);
            throw new Error('Failed to process offer from sharing user');
          }
        }
        
        // Create and send answer
        try {
          // Add local audio tracks for sharer to send audio
          if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(track => {
              console.log('Adding local track for sharer to peer:', from);
              pc.connection.addTrack(track, localStreamRef.current as MediaStream);
            });
          }
          console.log('Creating answer...');
          const answer = await pc.connection.createAnswer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: false
          });
          console.log('Answer created successfully');
          
          // Set local description with the original answer first
          await pc.connection.setLocalDescription(answer);
          
          // Then modify the SDP and send
          const modifiedAnswer = new RTCSessionDescription({
            type: 'answer',
            sdp: modifySDP(answer.sdp)
          });
          
          console.log('Sending answer to:', from);
          socketRef.current?.emit('answer', { answer: modifiedAnswer, to: from });
        } catch (err) {
          console.error('Error creating answer:', err);
          throw new Error('Failed to create answer');
        }
      } catch (err) {
        console.error('Error handling offer:', err);
        setError(err instanceof Error ? err.message : 'Failed to establish connection with sharing user. Please try again.');
      }
    });

    socketRef.current.on('answer', async ({ answer, from }) => {
      try {
        console.log('Received answer from:', from);
        console.log('Original answer SDP:', answer.sdp);
        
        const pc = peersRef.current.get(from);
        if (pc) {
          try {
            console.log('Setting remote description from answer...');
            // Modify SDP to ensure audio is properly negotiated
            const modifiedAnswer = new RTCSessionDescription({
              type: 'answer',
              sdp: modifySDP(answer.sdp)
            });
            console.log('Modified answer SDP:', modifiedAnswer.sdp);
            
            await pc.connection.setRemoteDescription(modifiedAnswer);
            console.log('Successfully set remote description from:', from);
          } catch (err) {
            console.error('Error setting remote description from answer:', err);
            throw new Error('Failed to process answer from peer');
          }
        } else {
          console.error('No peer connection found for:', from);
          throw new Error('Connection not found');
        }
      } catch (err) {
        console.error('Error handling answer:', err);
        setError(err instanceof Error ? err.message : 'Failed to process answer from peer');
      }
    });

    socketRef.current.on('ice-candidate', async ({ candidate, from }) => {
      try {
        console.log('Received ICE candidate from:', from);
        const pc = peersRef.current.get(from);
        
        if (!pc) {
          console.error('No peer connection found for ICE candidate from:', from);
          return;
        }

        if (!candidate) {
          console.log('Received null ICE candidate from:', from);
          return;
        }

        try {
          console.log('Adding ICE candidate:', candidate);
          await pc.connection.addIceCandidate(new RTCIceCandidate(candidate));
          console.log('Successfully added ICE candidate from:', from);
        } catch (err) {
          console.error('Error adding ICE candidate:', err);
          // Don't throw error, just log it
          // Some ICE candidates might fail to add, but that's okay
        }
      } catch (err) {
        console.error('Error handling ICE candidate:', err);
        // Don't throw error, just log it
        // ICE candidate errors are not critical
      }
    });

    return () => {
      localStreamRef.current?.getTracks().forEach(track => track.stop());
      audioElementsRef.current.forEach(audio => {
        audio.srcObject = null;
        audio.remove();
      });
      audioElementsRef.current.clear();
      peersRef.current.forEach(peer => {
        peer.connection.close();
      });
      socketRef.current?.disconnect();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [roomId]);

  const createPeerConnection = (userId: string) => {
    console.log('Creating peer connection for user:', userId);
    
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        {
          urls: [
            'turn:openrelay.metered.ca:80',
            'turn:openrelay.metered.ca:443',
            'turn:openrelay.metered.ca:443?transport=tcp'
          ],
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ],
      iceCandidatePoolSize: 10,
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    });

    // Add comprehensive connection state monitoring
    pc.oniceconnectionstatechange = () => {
      console.log(`ICE connection state with ${userId}:`, pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        console.log('Attempting to restart ICE for peer:', userId);
        pc.restartIce();
      }
    };

    pc.onicegatheringstatechange = () => {
      console.log(`ICE gathering state with ${userId}:`, pc.iceGatheringState);
    };

    pc.onsignalingstatechange = () => {
      console.log(`Signaling state with ${userId}:`, pc.signalingState);
      if (pc.signalingState === 'closed') {
        console.log('Signaling state closed, cleaning up peer connection');
        pc.close();
        peersRef.current.delete(userId);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${userId}:`, pc.connectionState);
      if (pc.connectionState === 'connected') {
        console.log('Successfully connected to peer:', userId);
        setError(null); // Clear any previous errors
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        console.log('Connection failed or disconnected, attempting to recover');
        setError('Connection lost. Attempting to reconnect...');
        // Try to recover by creating a new connection
        setTimeout(() => {
          if (peersRef.current.has(userId)) {
            const newPc = createPeerConnection(userId);
            peersRef.current.set(userId, newPc);
          }
        }, 2000);
      }
    };

    // Add negotiation needed handler
    pc.onnegotiationneeded = async () => {
      console.log('Negotiation needed for peer:', userId);
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: false
        });
        await pc.setLocalDescription(offer);
        socketRef.current?.emit('offer', { offer, to: userId });
      } catch (err) {
        console.error('Error during negotiation:', err);
        setError('Failed to negotiate connection. Please try again.');
      }
    };

    // Set up the ontrack handler for receiving audio
    pc.ontrack = (event) => handleTrack(event, userId);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Sending ICE candidate to:', userId);
        socketRef.current?.emit('ice-candidate', {
          candidate: event.candidate,
          to: userId
        });
      } else {
        console.log('ICE gathering completed for:', userId);
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
        if (peer.connection.connectionState === 'failed' || 
            peer.connection.connectionState === 'disconnected') {
          console.log('Detected failed connection for:', userId);
          setError('Connection lost. Attempting to reconnect...');
          const newPc = createPeerConnection(userId);
          peersRef.current.set(userId, newPc);
        }
      });
    };

    const interval = setInterval(checkConnectionStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const startSharing = async () => {
    // Check if someone else is already sharing
    if (sharingUser) {
      setError('Someone else is already sharing. Please wait for them to stop.');
      return;
    }

    // Check if we're already sharing
    if (isSharing) {
      setError('You are already sharing audio.');
      return;
    }

    try {
      let stream: MediaStream;

      if (shareType === 'microphone') {
        console.log('Requesting microphone access...');
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false
        });
        console.log('Microphone access granted:', stream.getAudioTracks()[0].label);
      } else {
        console.log('Requesting system audio access...');
        stream = await navigator.mediaDevices.getDisplayMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
          video: {
            width: 1,
            height: 1,
            frameRate: 1
          }
        });
        
        // Check if audio track was actually obtained
        const audioTrack = stream.getAudioTracks()[0];
        if (!audioTrack) {
          throw new Error('No audio track was captured. Please make sure to select a window/tab and enable "Share audio".');
        }
        console.log('System audio access granted:', audioTrack.label);

        // Stop the dummy video track if it exists
        stream.getVideoTracks().forEach(track => track.stop());
      }

      // Verify stream properties
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        console.log('Stream properties:', {
          enabled: audioTrack.enabled,
          readyState: audioTrack.readyState,
          label: audioTrack.label,
          kind: audioTrack.kind,
          id: audioTrack.id
        });

        // Ensure track is enabled
        audioTrack.enabled = true;
      }

      // Store the stream reference
      localStreamRef.current = stream;

      // Set up visualization immediately after getting the stream
      setupAudioVisualization(stream);

      console.log('Creating peer connections for users:', users);
      
      // Create a base offer to ensure consistent m-line ordering
      const basePc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' },
          {
            urls: [
              'turn:openrelay.metered.ca:80',
              'turn:openrelay.metered.ca:443',
              'turn:openrelay.metered.ca:443?transport=tcp'
            ],
            username: 'openrelayproject',
            credential: 'openrelayproject'
          }
        ],
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      });

      // Add the track to the base connection
      stream.getAudioTracks().forEach(track => {
        basePc.addTrack(track, stream);
      });

      // Create the base offer
      const baseOffer = await basePc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });

      // Close the base connection
      basePc.close();

      // Create peer connections and add tracks
      for (const user of users) {
        if (user.id !== socketRef.current?.id) {
          console.log('Setting up connection for user:', user.id);
          const pc = createPeerConnection(user.id);
          
          // Add tracks to the peer connection with proper configuration
          stream.getAudioTracks().forEach(track => {
            console.log('Adding track to peer connection:', track.label);
            // Ensure track is enabled
            track.enabled = true;
            // Add track with proper stream
            pc.connection.addTrack(track, stream);
          });

          // Create and send offer using the base offer as a template
          const createAndSendOffer = async () => {
            try {
              console.log('Creating offer for user:', user.id);
              const offer = await pc.connection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: false
              });
              
              // Set local description first
              await pc.connection.setLocalDescription(offer);
              
              // Then modify the SDP and send
              const modifiedOffer = new RTCSessionDescription({
                type: 'offer',
                sdp: modifySDP(offer.sdp)
              });
              
              console.log('Sending offer to user:', user.id);
              socketRef.current?.emit('offer', { offer: modifiedOffer, to: user.id });
            } catch (err) {
              console.error('Error creating/sending offer:', err);
              setError('Failed to establish connection. Please try again.');
            }
          };

          // Create and send offer immediately
          createAndSendOffer();

          // Also set up negotiation needed handler for future renegotiations
          pc.connection.onnegotiationneeded = createAndSendOffer;

          // Add connection state monitoring
          pc.connection.onconnectionstatechange = () => {
            console.log(`Connection state with ${user.id}:`, pc.connection.connectionState);
            if (pc.connection.connectionState === 'connected') {
              console.log('Successfully connected to peer:', user.id);
              // Verify audio track is still enabled
              const audioTrack = stream.getAudioTracks()[0];
              if (audioTrack) {
                console.log('Verifying audio track after connection:', {
                  enabled: audioTrack.enabled,
                  readyState: audioTrack.readyState
                });
                audioTrack.enabled = true;
              }
            }
          };
        }
      }

      setIsSharing(true);
      // Update local states immediately using the previous state
      setUsers(prevUsers => {
        const updatedUsers = prevUsers.map(user => ({
          ...user,
          isSharing: user.id === socketRef.current?.id
        }));
        const currentUser = updatedUsers.find(user => user.id === socketRef.current?.id);
        if (currentUser) {
          setSharingUser(currentUser);
        }
        return updatedUsers;
      });

      socketRef.current?.emit('start-sharing');

      // Handle stream ending
      stream.getAudioTracks()[0].onended = () => {
        console.log('Audio track ended');
        stopSharing();
      };

      // Handle browser tab/window close
      window.addEventListener('beforeunload', stopSharing);
    } catch (error) {
      console.error('Error starting audio share:', error);
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError(
          shareType === 'microphone'
            ? 'Failed to access microphone. Please check your browser permissions and ensure you have a working microphone.'
            : 'Failed to capture system audio. Please make sure to select a window/tab and enable the "Share audio" option in the dialog.'
        );
      }
      setIsSharing(false);
    }
  };

  const stopSharing = () => {
    // Remove beforeunload listener
    window.removeEventListener('beforeunload', stopSharing);

    // Stop all tracks
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    
    // Close all peer connections
    peersRef.current.forEach(peer => {
      peer.connection.close();
    });
    peersRef.current.clear();

    // Clean up audio elements
    audioElementsRef.current.forEach(audio => {
      audio.srcObject = null;
      audio.remove();
    });
    audioElementsRef.current.clear();

    setIsSharing(false);
    socketRef.current?.emit('stop-sharing');
    stopVisualization();
  };

  const setupAudioVisualization = (stream: MediaStream, userId?: string) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      // Create a new analyser for this stream
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;

      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyser);
      
      // Store the analyser reference
      analyserRef.current = analyser;
      
      // Start visualization immediately
      startVisualization();
    } catch (err) {
      console.error('Error setting up visualization:', err);
    }
  };

  const startVisualization = () => {
    if (!analyserRef.current) return;

    const canvas = document.getElementById('visualizer') as HTMLCanvasElement;
    if (!canvas) {
      console.error('Visualizer canvas not found');
      return;
    }

    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) {
      console.error('Could not get canvas context');
      return;
    }

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!analyserRef.current || !canvasCtx) return;

      animationFrameRef.current = requestAnimationFrame(draw);
      analyserRef.current.getByteFrequencyData(dataArray);

      // Clear the canvas
      canvasCtx.fillStyle = '#0A0A0F';
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = dataArray[i];
        const hue = ((i / bufferLength) * 360) + ((Date.now() / 50) % 360);
        const gradient = canvasCtx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
        gradient.addColorStop(0, `hsla(${hue}, 100%, 50%, 0.8)`);
        gradient.addColorStop(1, `hsla(${hue + 60}, 100%, 50%, 0.2)`);
        
        canvasCtx.fillStyle = gradient;
        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
    };

    // Start the visualization loop
    draw();
  };

  const stopVisualization = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
  };

  // Add autoplay unblock handler with more aggressive approach
  useEffect(() => {
    const unblockAutoplay = () => {
      audioElementsRef.current.forEach(audio => {
        if (audio.paused) {
          console.log('Attempting to unblock autoplay for audio element');
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.catch(error => {
              console.error('Error playing audio:', error);
              // Show user feedback about needing interaction
              if (error.name === 'NotAllowedError') {
                setError('Please click anywhere on the page to start audio playback');
              }
              // Try to play again after a short delay
              setTimeout(() => {
                audio.play().catch(console.error);
              }, 1000);
            });
          }
        }
      });
    };

    // Add multiple event listeners to increase chances of unblocking
    const events = ['click', 'touchstart', 'keydown', 'focus', 'mousedown', 'mouseup'];
    events.forEach(event => {
      document.addEventListener(event, unblockAutoplay);
    });

    // Also try to unblock on component mount
    unblockAutoplay();

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, unblockAutoplay);
      });
    };
  }, []);

  // Modify the handleTrack function to properly handle visualization
  const handleTrack = (event: RTCTrackEvent, userId: string) => {
    console.log('Received track from peer:', event.streams[0]);
    const [stream] = event.streams;
    
    // Create or get existing audio element for this user
    let audioElement = audioElementsRef.current.get(userId);
    if (!audioElement) {
      audioElement = new Audio();
      audioElement.autoplay = true;
      (audioElement as any).playsInline = true;
      audioElement.id = `audio-${userId}`;
      audioElementsRef.current.set(userId, audioElement);
      
      // Add error handling for audio playback
      audioElement.onerror = (e) => {
        console.error('Audio playback error:', e);
        setError('Error playing received audio. Please check your audio output settings.');
      };

      // Add volume control
      audioElement.volume = 1.0;
    }

    // Set the stream as the source and play
    audioElement.srcObject = stream;
    const playPromise = audioElement.play();
    if (playPromise !== undefined) {
      playPromise.catch(error => {
        console.error('Error playing audio:', error);
        if (error.name === 'NotAllowedError') {
          setError('Please click anywhere on the page to start audio playback');
        } else {
          setError('Failed to play received audio. Try clicking anywhere on the page.');
        }
        // Try to play again after a short delay
        const currentAudioElement = audioElement;
        if (currentAudioElement) {
          setTimeout(() => {
            currentAudioElement.play().catch(console.error);
          }, 1000);
        }
      });
    }

    // Set up visualization for the received stream if this is the sharing user
    if (stream.getAudioTracks().length > 0 && userId === sharingUser?.id) {
      setupAudioVisualization(stream, userId);
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

  const modifySDP = (sdp: string | undefined) => {
    if (!sdp) return '';
    
    console.log('Original SDP:', sdp);
    
    // Split SDP into lines and filter out empty lines
    const lines = sdp.split('\r\n').filter(line => line.trim() !== '');
    let modifiedLines: string[] = [];
    let audioMid = '0';
    let hasAudio = false;
    let bundleGroup: string | null = null;
    let audioSectionIndex = -1;
    let hasSendRecv = false;
    
    // First pass: find audio section and bundle group
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.startsWith('a=group:BUNDLE')) {
        bundleGroup = line;
        console.log('Found BUNDLE group:', bundleGroup);
        // Extract MID from bundle group
        audioMid = line.split(' ')[1];
      }
      
      if (line.startsWith('m=audio')) {
        hasAudio = true;
        audioSectionIndex = i;
        console.log('Found audio section at index:', i);
      }

      if (line.startsWith('a=sendrecv')) {
        hasSendRecv = true;
      }
    }
    
    // Second pass: process and modify lines while preserving order
    let currentMediaSection: string | null = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Track current media section
      if (line.startsWith('m=')) {
        currentMediaSection = line;
        modifiedLines.push(line);
        continue;
      }
      
      // Skip the original bundle group, we'll add it in the correct position
      if (line.startsWith('a=group:BUNDLE')) {
        continue;
      }
      
      // Add MID after the c= line in audio section
      if (line.startsWith('c=IN IP4') && currentMediaSection?.startsWith('m=audio')) {
        modifiedLines.push(line);
        modifiedLines.push(`a=mid:${audioMid}`);
        continue;
      }
      
      // Skip any existing MID lines for audio sections
      if (line.startsWith('a=mid:') && currentMediaSection?.startsWith('m=audio')) {
        continue;
      }
      
      modifiedLines.push(line);
    }
    
    // Add the bundle group in the correct position (after session-level attributes)
    let insertIndex = 0;
    for (let i = 0; i < modifiedLines.length; i++) {
      if (modifiedLines[i].startsWith('m=')) {
        insertIndex = i;
        break;
      }
    }
    
    // Insert bundle group before the first media section
    modifiedLines.splice(insertIndex, 0, `a=group:BUNDLE ${audioMid}`);
    
    // Ensure we have all necessary audio attributes
    const hasOpus = modifiedLines.some(line => line.includes('opus/48000'));
    if (!hasOpus) {
      modifiedLines.push('a=rtpmap:111 opus/48000/2');
      modifiedLines.push('a=rtcp-fb:111 transport-cc');
      modifiedLines.push('a=fmtp:111 minptime=10;useinbandfec=1');
    }
    
    // Add direction attribute if not present
    if (!hasSendRecv) {
      modifiedLines.push('a=sendrecv');
    }
    
    // Add required SDP attributes
    if (!modifiedLines.some(line => line.startsWith('a=ice-options:trickle'))) {
      modifiedLines.push('a=ice-options:trickle');
    }
    
    // Ensure proper line endings
    const modifiedSDP = modifiedLines.join('\r\n') + '\r\n';
    console.log('Modified SDP:', modifiedSDP);
    
    // Verify SDP structure
    const hasValidAudioSection = modifiedSDP.includes('m=audio');
    const hasValidBundleGroup = modifiedSDP.includes(`a=group:BUNDLE ${audioMid}`);
    const hasValidMid = modifiedSDP.includes(`a=mid:${audioMid}`);
    const hasValidOpus = modifiedSDP.includes('opus/48000');
    
    console.log('SDP Validation:', {
      hasValidAudioSection,
      hasValidBundleGroup,
      hasValidMid,
      hasValidOpus
    });
    
    if (!hasValidAudioSection || !hasValidBundleGroup || !hasValidMid || !hasValidOpus) {
      console.error('Invalid SDP structure detected');
      throw new Error('Failed to create valid SDP');
    }
    
    return modifiedSDP;
  };

  // Update the cleanup effect
  useEffect(() => {
    return () => {
      stopVisualization();
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      // Clean up all peer connections
      peersRef.current.forEach((peer, userId) => {
        console.log('Cleaning up peer connection for:', userId);
        peer.connection.close();
      });
      peersRef.current.clear();
      
      // Clean up all audio elements
      audioElementsRef.current.forEach(audio => {
        audio.srcObject = null;
        audio.remove();
      });
      audioElementsRef.current.clear();
      
      // Clean up ICE candidate queues
      iceCandidateQueuesRef.current.clear();
    };
  }, []);

  return (
    <motion.div
      className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white p-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center space-x-4">
            <Logo size={60} className="hidden md:block" />
            <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
              Room: {roomId}
            </h1>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg shadow-lg transition-colors"
            onClick={() => navigate('/')}
          >
            Leave Room
          </motion.button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Audio Controls */}
          <div className="lg:col-span-2 bg-gray-800 rounded-xl p-6 shadow-xl">
            <div className="flex flex-col items-center space-y-6">
              {sharingUser && !isSharing && (
                <div className="text-center p-4 bg-purple-500/20 border border-purple-500 rounded-lg w-full">
                  <span className="font-medium text-purple-300">{sharingUser.name}</span>
                  <span className="text-gray-300"> is currently sharing audio</span>
                </div>
              )}

              {!sharingUser && (
                <>
                  <div className="flex items-center space-x-4 mb-4">
                    <button
                      onClick={() => setShareType('system')}
                      className={`px-4 py-2 rounded-lg transition-colors ${
                        shareType === 'system'
                          ? 'bg-purple-500 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      System Audio
                    </button>
                    <button
                      onClick={() => setShareType('microphone')}
                      className={`px-4 py-2 rounded-lg transition-colors ${
                        shareType === 'microphone'
                          ? 'bg-purple-500 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      Microphone
                    </button>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="px-6 py-3 rounded-lg shadow-lg text-lg font-semibold transition-colors bg-purple-500 hover:bg-purple-600"
                    onClick={startSharing}
                  >
                    Share {shareType === 'microphone' ? 'Microphone' : 'System Audio'}
                  </motion.button>
                </>
              )}

              {isSharing && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-6 py-3 rounded-lg shadow-lg text-lg font-semibold transition-colors bg-red-500 hover:bg-red-600"
                  onClick={stopSharing}
                >
                  Stop Sharing
                </motion.button>
              )}

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full p-4 bg-red-500/20 border border-red-500 rounded-lg text-red-100"
                >
                  {error}
                </motion.div>
              )}

              <canvas
                id="visualizer"
                className="w-full h-64 rounded-lg bg-gray-900"
                width="800"
                height="200"
              />
            </div>
          </div>

          {/* Users List - Always visible */}
          <div className="bg-gray-800 rounded-xl p-6 shadow-xl h-fit">
            <h2 className="text-2xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
              Connected Users ({users.length})
            </h2>
            <div className="space-y-4">
              {users.map((user) => (
                <motion.div
                  key={user.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className={`p-4 rounded-lg ${
                    user.isSharing
                      ? 'bg-purple-500/20 border border-purple-500'
                      : 'bg-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{user.name}</span>
                    {user.isSharing && (
                      <span className="px-2 py-1 text-sm bg-purple-500 rounded-full">
                        Sharing Audio
                      </span>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default Room; 