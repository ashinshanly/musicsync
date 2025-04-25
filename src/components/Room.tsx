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
        
        const pc = createPeerConnection(from);
        
        // Ensure ontrack is set up before setting remote description
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
          await pc.connection.setRemoteDescription(modifiedOffer);
          console.log('Remote description set successfully');
        } catch (err) {
          console.error('Error setting remote description:', err);
          throw new Error('Failed to process offer from sharing user');
        }
        
        // Create and send answer
        try {
          console.log('Creating answer...');
          const answer = await pc.connection.createAnswer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: false
          });
          console.log('Answer created successfully');
          
          // Modify SDP to ensure audio is properly negotiated
          const modifiedAnswer = new RTCSessionDescription({
            type: 'answer',
            sdp: modifySDP(answer.sdp)
          });
          
          try {
            console.log('Setting local description...');
            console.log('Modified answer SDP:', modifiedAnswer.sdp);
            await pc.connection.setLocalDescription(modifiedAnswer);
            console.log('Local description set successfully');
          } catch (err) {
            console.error('Error setting local description:', err);
            throw new Error('Failed to set local description');
          }
          
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
        if (pc) {
          try {
            console.log('Adding ICE candidate...');
            await pc.connection.addIceCandidate(new RTCIceCandidate(candidate));
            console.log('Successfully added ICE candidate from:', from);
          } catch (err) {
            console.error('Error adding ICE candidate:', err);
            throw new Error('Failed to process ICE candidate');
          }
        } else {
          console.error('No peer connection found for ICE candidate from:', from);
          throw new Error('Connection not found for ICE candidate');
        }
      } catch (err) {
        console.error('Error handling ICE candidate:', err);
        setError(err instanceof Error ? err.message : 'Failed to process ICE candidate');
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
    };

    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${userId}:`, pc.connectionState);
      if (pc.connectionState === 'connected') {
        console.log('Successfully connected to peer:', userId);
        // Verify audio tracks are properly connected
        const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
        if (sender?.track) {
          console.log('Audio track is active:', sender.track.enabled);
        }
      } else if (pc.connectionState === 'failed') {
        console.log('Connection failed with peer:', userId);
        setError('Connection failed. Please try sharing again.');
        stopSharing();
      }
    };

    pc.ondatachannel = (event) => {
      console.log('Data channel opened with peer:', userId);
    };

    // Set up the ontrack handler for receiving audio
    pc.ontrack = (event) => {
      console.log('Received track from peer:', event.streams[0]);
      const [stream] = event.streams;
      
      // Verify track properties
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        console.log('Audio track properties:', {
          enabled: audioTrack.enabled,
          muted: audioTrack.muted,
          readyState: audioTrack.readyState,
          label: audioTrack.label
        });
      }
      
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
          muted: audioTrack.muted,
          readyState: audioTrack.readyState,
          label: audioTrack.label
        });
      }

      // Store the stream reference
      localStreamRef.current = stream;

      console.log('Creating peer connections for users:', users);
      
      // Create peer connections and add tracks
      users.forEach(user => {
        if (user.id !== socketRef.current?.id) {
          console.log('Setting up connection for user:', user.id);
          const pc = createPeerConnection(user.id);
          
          // Add tracks to the peer connection
          stream.getAudioTracks().forEach(track => {
            console.log('Adding track to peer connection:', track.label);
            // Ensure track is enabled
            track.enabled = true;
            // Add track with proper stream
            pc.connection.addTrack(track, stream);
          });

          // Handle connection state changes
          pc.connection.onconnectionstatechange = () => {
            console.log(`Connection state with ${user.id}:`, pc.connection.connectionState);
            if (pc.connection.connectionState === 'failed' || pc.connection.connectionState === 'disconnected') {
              console.log('Attempting to reconnect to peer:', user.id);
              // Try to reestablish the connection
              const newPc = createPeerConnection(user.id);
              stream.getAudioTracks().forEach(track => {
                track.enabled = true;
                newPc.connection.addTrack(track, stream);
              });
              peersRef.current.set(user.id, newPc);
            }
          };

          // Handle track events
          pc.connection.ontrack = (event) => {
            console.log('Track event received from:', user.id);
            const [stream] = event.streams;
            if (stream.getAudioTracks().length > 0) {
              console.log('Audio track received from:', user.id);
              // Verify track properties
              const audioTrack = stream.getAudioTracks()[0];
              if (audioTrack) {
                console.log('Received track properties:', {
                  enabled: audioTrack.enabled,
                  muted: audioTrack.muted,
                  readyState: audioTrack.readyState,
                  label: audioTrack.label
                });
              }
            }
          };

          // Handle negotiation needed
          pc.connection.onnegotiationneeded = async () => {
            console.log('Negotiation needed for peer:', user.id);
            try {
              const offer = await pc.connection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: false
              });
              
              // Modify SDP to ensure audio is properly negotiated
              const modifiedOffer = new RTCSessionDescription({
                type: 'offer',
                sdp: offer.sdp?.replace('a=mid:0', 'a=mid:audio') || ''
              });
              
              await pc.connection.setLocalDescription(modifiedOffer);
              socketRef.current?.emit('offer', { offer: modifiedOffer, to: user.id });
            } catch (err) {
              console.error('Error creating offer:', err);
            }
          };
        }
      });

      // Create and send offers to all peers
      const offers = await Promise.all(
        users
          .filter(user => user.id !== socketRef.current?.id)
          .map(async user => {
            const pc = peersRef.current.get(user.id);
            if (pc) {
              console.log('Creating offer for user:', user.id);
              const offer = await pc.connection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: false
              });
              
              // Modify SDP to ensure audio is properly negotiated
              const modifiedOffer = new RTCSessionDescription({
                type: 'offer',
                sdp: offer.sdp?.replace('a=mid:0', 'a=mid:audio') || ''
              });
              
              await pc.connection.setLocalDescription(modifiedOffer);
              return { offer: modifiedOffer, to: user.id };
            }
          })
      );

      // Send all offers
      offers.forEach(offer => {
        if (offer) {
          console.log('Sending offer to user:', offer.to);
          socketRef.current?.emit('offer', offer);
        }
      });

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
      setupAudioVisualization(stream);

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

  const setupAudioVisualization = (stream: MediaStream) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      if (analyserRef.current) {
        analyserRef.current.disconnect();
      }

      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;

      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      
      // Don't connect to destination to prevent audio feedback
      // analyserRef.current.connect(audioContextRef.current.destination);
      
      startVisualization();
    } catch (err) {
      console.error('Error setting up visualization:', err);
    }
  };

  const startVisualization = () => {
    if (!analyserRef.current) return;

    const canvas = document.getElementById('visualizer') as HTMLCanvasElement;
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!analyserRef.current || !canvasCtx) return;

      animationFrameRef.current = requestAnimationFrame(draw);
      analyserRef.current.getByteFrequencyData(dataArray);

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

    draw();
  };

  const stopVisualization = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };

  // Add autoplay unblock handler with more aggressive approach
  useEffect(() => {
    const unblockAutoplay = () => {
      audioElementsRef.current.forEach(audio => {
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.error('Error playing audio:', error);
            // Try to play again after a short delay
            setTimeout(() => {
              audio.play().catch(console.error);
            }, 1000);
          });
        }
      });
    };

    // Add multiple event listeners to increase chances of unblocking
    document.addEventListener('click', unblockAutoplay);
    document.addEventListener('touchstart', unblockAutoplay);
    document.addEventListener('keydown', unblockAutoplay);
    window.addEventListener('focus', unblockAutoplay);

    return () => {
      document.removeEventListener('click', unblockAutoplay);
      document.removeEventListener('touchstart', unblockAutoplay);
      document.removeEventListener('keydown', unblockAutoplay);
      window.removeEventListener('focus', unblockAutoplay);
    };
  }, []);

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
    
    // Split SDP into lines
    const lines = sdp.split('\r\n');
    let modifiedLines: string[] = [];
    let audioMid = '0';
    let hasAudio = false;
    
    // Process each line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Find audio m= line
      if (line.startsWith('m=audio')) {
        hasAudio = true;
        // Extract the MID from the a=mid line that follows
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].startsWith('a=mid:')) {
            audioMid = lines[j].split('a=mid:')[1];
            break;
          }
        }
      }
      
      // Keep the original line
      modifiedLines.push(line);
    }
    
    // If no audio section found, add one
    if (!hasAudio) {
      modifiedLines.push('m=audio 9 UDP/TLS/RTP/SAVPF 111 103 104 9 0 8 106 105 13 110 112 113 126');
      modifiedLines.push('c=IN IP4 0.0.0.0');
      modifiedLines.push('a=rtcp:9 IN IP4 0.0.0.0');
      modifiedLines.push('a=ice-ufrag:audio');
      modifiedLines.push('a=ice-pwd:audio');
      modifiedLines.push('a=ice-options:trickle');
      modifiedLines.push('a=fingerprint:sha-256 audio');
      modifiedLines.push('a=setup:actpass');
      modifiedLines.push('a=mid:audio');
      modifiedLines.push('a=sendrecv');
      modifiedLines.push('a=rtcp-mux');
      modifiedLines.push('a=rtpmap:111 opus/48000/2');
      modifiedLines.push('a=rtcp-fb:111 transport-cc');
      modifiedLines.push('a=fmtp:111 minptime=10;useinbandfec=1');
      audioMid = 'audio';
    }
    
    // Update BUNDLE group to use the correct MID
    modifiedLines = modifiedLines.map(line => {
      if (line.startsWith('a=group:BUNDLE')) {
        return `a=group:BUNDLE ${audioMid}`;
      }
      return line;
    });
    
    return modifiedLines.join('\r\n');
  };

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