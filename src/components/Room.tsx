/* eslint-disable @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps */

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { io, Socket } from 'socket.io-client';
import Logo from './Logo';
import toast, { Toaster } from 'react-hot-toast';

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

const SOCKET_URL = process.env.NODE_ENV === 'production' 
  ? 'https://musicsync-server.onrender.com'
  : 'http://localhost:3001';

// Generate random username if none provided
function generateUsername(): string {
  const adjectives = ['Swift','Mellow','Brisk','Cosmic','Lunar','Solar'];
  const nouns = ['Beat','Wave','Rhythm','Echo','Pulse','Vibe'];
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
  const [shareType, setShareType] = useState<'microphone' | 'system'>('microphone');
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [sharingUser, setSharingUser] = useState<User | null>(null);
  const [hasVoted, setHasVoted] = useState<'up' | 'down' | null>(null);
  
  const socketRef = useRef<Socket>();
  const localStreamRef = useRef<MediaStream>();
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>();
  const peersRef = useRef<Map<string, PeerConnection>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const iceCandidateQueuesRef = useRef<Map<string, RTCIceCandidate[]>>(new Map());
  const negotiationAttemptsRef = useRef<Map<string, number>>(new Map());

  // Function to handle voting
  const handleVote = (voteType: 'up' | 'down') => {
    if (!sharingUser || !socketRef.current) return;
    
    // Don't allow re-votes of the same type
    if (hasVoted === voteType) return;
    
    // Don't allow voting on your own stream
    if (isSharing) return;
    
    console.log('Sending vote:', { targetUserId: sharingUser.id, voteType });
    
    // Emit vote event to server
    socketRef.current.emit('vote', {
      roomId,
      targetUserId: sharingUser.id,
      voteType
    });
    
    // Optimistically update the UI
    // This ensures the user sees immediate feedback even if there's network latency
    setUsers(prevUsers => {
      return prevUsers.map(user => {
        if (user.id === sharingUser.id) {
          const currentUpvotes = user.upvotes || 0;
          const currentDownvotes = user.downvotes || 0;
          
          if (voteType === 'up') {
            // If switching from downvote, decrement downvotes
            const newDownvotes = hasVoted === 'down' ? Math.max(0, currentDownvotes - 1) : currentDownvotes;
            return { ...user, upvotes: currentUpvotes + 1, downvotes: newDownvotes };
          } else {
            // If switching from upvote, decrement upvotes
            const newUpvotes = hasVoted === 'up' ? Math.max(0, currentUpvotes - 1) : currentUpvotes;
            return { ...user, downvotes: currentDownvotes + 1, upvotes: newUpvotes };
          }
        }
        return user;
      });
    });
    
    // Also update sharingUser if it's the same one
    setSharingUser(prev => {
      if (prev && prev.id === sharingUser.id) {
        const currentUpvotes = prev.upvotes || 0;
        const currentDownvotes = prev.downvotes || 0;
        
        if (voteType === 'up') {
          const newDownvotes = hasVoted === 'down' ? Math.max(0, currentDownvotes - 1) : currentDownvotes;
          const newValue = { ...prev, upvotes: currentUpvotes + 1, downvotes: newDownvotes };
          console.log('Optimistically updating sharing user:', newValue);
          return newValue;
        } else {
          const newUpvotes = hasVoted === 'up' ? Math.max(0, currentUpvotes - 1) : currentUpvotes;
          const newValue = { ...prev, downvotes: currentDownvotes + 1, upvotes: newUpvotes };
          console.log('Optimistically updating sharing user:', newValue);
          return newValue;
        }
      }
      return prev;
    });
    
    // Update local state
    setHasVoted(voteType);
    
    // Show toast notification
    if (voteType === 'up') {
      toast.success('You upvoted this audio stream!');
    } else {
      toast.success('You downvoted this audio stream');
    }
  };
  
  useEffect(() => {
    // Initialize WebSocket connection
    socketRef.current = io(SOCKET_URL);
    let username = localStorage.getItem('username');
    if (!username) {
      username = generateUsername();
      localStorage.setItem('username', username);
    }
    
    socketRef.current.emit('join-room', { roomId, username });

    socketRef.current.on('user-joined', async ({ users: roomUsers }) => {
      setUsers(roomUsers);
      // Update sharing user if someone is already sharing
      const currentlySharing = roomUsers.find((user: User) => user.isSharing);
      setSharingUser(currentlySharing || null);
      // If someone is already sharing, initiate negotiation as a late joiner
      if (currentlySharing && currentlySharing.id !== socketRef.current!.id) {
        try {
          const pc = createPeerConnection(currentlySharing.id);
          const offer = await pc.connection.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
          await pc.connection.setLocalDescription(offer);
          socketRef.current!.emit('offer', { offer, to: currentlySharing.id });
        } catch (negErr) {
          console.error('Late-join negotiation failed:', negErr);
        }
      }
    });

    socketRef.current.on('user-left', ({ userId, wasSharing, users: roomUsers }) => {
      setUsers(roomUsers);
      if (wasSharing) {
        setSharingUser(null);
        stopVisualization();
      }
    });

    // Handle vote updates from other users
    // Remove any existing listeners to prevent duplicates
    socketRef.current.off('vote-update');
    socketRef.current.on('vote-update', ({ userId, upvotes, downvotes }) => {
      console.log('Vote update received:', { userId, upvotes, downvotes });
      
      setUsers(prevUsers => {
        return prevUsers.map(user => {
          if (user.id === userId) {
            return { ...user, upvotes, downvotes };
          }
          return user;
        });
      });
      
      // Update sharing user if needed
      setSharingUser(prev => {
        if (prev && prev.id === userId) {
          console.log('Updating sharing user with new vote counts:', { upvotes, downvotes });
          return { ...prev, upvotes, downvotes };
        }
        return prev;
      });
    });

    socketRef.current.on('user-started-sharing', async ({ userId, username }) => {
      // Skip redundant negotiation if already connected
      if (peersRef.current.has(userId)) {
        console.log('Already connected to sharing user:', userId, '- skipping negotiation');
        return;
      }
      setUsers(prevUsers => {
        const updatedUsers = prevUsers.map(user => ({
          ...user,
          isSharing: user.id === userId,
          // Reset voting stats for new sharing session
          ...(user.id === userId && { upvotes: 0, downvotes: 0 })
        }));
        const sharingUser = updatedUsers.find(user => user.id === userId);
        setSharingUser(sharingUser || null);
        return updatedUsers;
      });
      
      // Reset vote state when a new user starts sharing
      setHasVoted(null);

      // If this is a new user joining a room with an active sharing session,
      // initiate the WebRTC connection only if not already connected
      if (userId !== socketRef.current?.id && !peersRef.current.has(userId)) {
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
          const prev = negotiationAttemptsRef.current.get(userId) || 0;
          if (prev < 2) {
            negotiationAttemptsRef.current.set(userId, prev + 1);
            setTimeout(async () => {
              try {
                console.log('Retrying connection with sharing user:', userId);
                const pcRetry = createPeerConnection(userId);
                const offerRetry = await pcRetry.connection.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
                await pcRetry.connection.setLocalDescription(offerRetry);
                socketRef.current?.emit('offer', { offer: offerRetry, to: userId });
              } catch (retryErr) {
                console.error('Retry failed for:', userId, retryErr);
              }
            }, 2000);
          } else {
            toast.error('Failed to connect to sharing user. Please try joining the room again.');
          }
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
      // Reset vote state when sharing stops
      setHasVoted(null);
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
        if (!iceCandidateQueuesRef.current.has(from)) {
          iceCandidateQueuesRef.current.set(from, []);
        }
        
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
            audioElement.setAttribute('playsinline', '');
            audioElement.style.display = 'none';
            document.body.appendChild(audioElement);
            audioElement.id = `audio-${from}`;
            audioElementsRef.current.set(from, audioElement);
            
            // Add error handling for audio playback
            audioElement.onerror = (e) => {
              console.error('Audio playback error:', e);
              toast.error('Error playing received audio. Please check your audio output settings.');
            };
          }

          // Set the stream as the source and play
          audioElement.srcObject = stream;
          const playPromise = audioElement.play();
          if (playPromise !== undefined) {
            playPromise.catch(error => {
              console.error('Error playing audio:', error);
              if (error.name === 'NotAllowedError') {
                toast.error('Please click anywhere on the page to start audio playback');
              } else {
                toast.error('Failed to play received audio. Try clicking anywhere on the page.');
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
          
          // If we're the sharer, make sure we add our tracks after setting remote desc
          if (localStreamRef.current && isSharing && pc) {
            console.log('Adding local tracks as sharer to new connection with:', from);
            const peerConnection = pc; // Create stable reference for callback
            localStreamRef.current.getAudioTracks().forEach(track => {
              try {
                peerConnection.connection.addTrack(track, localStreamRef.current as MediaStream);
              } catch (e) {
                console.warn('Error adding track after setRemoteDescription:', e);
              }
            });
          }
          
          // Process any queued ICE candidates
          const queue = iceCandidateQueuesRef.current.get(from);
          if (queue && queue.length > 0 && pc) {
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
          console.log('Creating answer...');
          const answer = await pc.connection.createAnswer();
          await pc.connection.setLocalDescription(answer);
          console.log('Answer created successfully');
          
          // Set local description with the original answer first
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
        //toast.error(err instanceof Error ? err.message : 'Failed to establish connection with sharing user. Please try again.');
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
            
            // Drain any ICE candidates queued before answer
            const answerQueue = iceCandidateQueuesRef.current.get(from);
            if (answerQueue && answerQueue.length) {
              console.log(`Draining ${answerQueue.length} queued ICE candidates for ${from}`);
              for (const cand of answerQueue) {
                try {
                  await pc.connection.addIceCandidate(new RTCIceCandidate(cand));
                } catch (e) {
                  console.error('Error draining ICE candidate:', e);
                }
              }
              iceCandidateQueuesRef.current.delete(from);
            }
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
        //toast.error(err instanceof Error ? err.message : 'Failed to process answer from peer');
      }
    });

    socketRef.current.on('ice-candidate', async ({ candidate, from }) => {
      try {
        console.log('Received ICE candidate from:', from);
        const pc = peersRef.current.get(from);
        
        if (!pc || !pc.connection.remoteDescription) {
          console.warn('Peer connection not ready for ICE candidate from:', from, '- queueing');
          if (candidate) {
            const queue = iceCandidateQueuesRef.current.get(from) || [];
            queue.push(candidate);
            iceCandidateQueuesRef.current.set(from, queue);
          }
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

  // Resume AudioContext on user gesture to enable visualizer
  useEffect(() => {
    const resumeCtx = () => {
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume().catch(console.error);
      }
    };
    const events = ['click', 'touchstart'];
    events.forEach(evt => document.addEventListener(evt, resumeCtx));
    return () => events.forEach(evt => document.removeEventListener(evt, resumeCtx));
  }, []);

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

    // Stable audio m-line: add transceiver before negotiating
    if (localStreamRef.current) {
      // For sharing user: add tracks directly so they're actually sent
      localStreamRef.current.getAudioTracks().forEach(track => {
        try { 
          console.log(`Adding track to connection for ${userId}:`, track.label);
          pc.addTrack(track, localStreamRef.current as MediaStream);
        } catch (e) { 
          console.warn('Adding track failed:', e); 
        }
      });
    } else {
      try { pc.addTransceiver('audio', { direction: 'recvonly' }); }
      catch (e) { console.warn('addTransceiver recvonly failed:', e); }
    }

    // Add comprehensive connection state monitoring
    pc.oniceconnectionstatechange = () => {
      console.log(`ICE connection state with ${userId}:`, pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        console.log('Restarting ICE for peer:', userId);
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
        if (peer.connection.connectionState === 'failed' || peer.connection.connectionState === 'disconnected') {
          console.log('Restarting ICE for peer:', userId);
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
      toast.error('Someone else is already sharing. Please wait for them to stop.');
      return;
    }

    // Check if we're already sharing
    if (isSharing) {
      toast.error('You are already sharing audio.');
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
        // Check if getDisplayMedia is supported
        if (!navigator.mediaDevices.getDisplayMedia) {
          throw new Error('System audio sharing is not supported on this device. Please use microphone sharing instead.');
        }
        
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
        toast.error(error.message);
      } else {
        toast.error(
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

  const handleTrack = (event: RTCTrackEvent, userId: string) => {
    // Determine stream: use provided streams or fallback to new MediaStream from the received track
    const stream = (event.streams && event.streams.length > 0)
      ? event.streams[0]
      : new MediaStream([event.track]);
    console.log('Received track from peer:', stream);
    
    // Create or get existing audio element for this user
    let audioElement = audioElementsRef.current.get(userId);
    if (!audioElement) {
      audioElement = new Audio();
      audioElement.autoplay = true;
      (audioElement as any).playsInline = true;
      audioElement.setAttribute('playsinline', '');
      audioElement.style.display = 'none';
      document.body.appendChild(audioElement);
      audioElement.id = `audio-${userId}`;
      audioElementsRef.current.set(userId, audioElement);
      
      // Add error handling for audio playback
      audioElement.onerror = (e) => {
        console.error('Audio playback error:', e);
        toast.error('Error playing received audio. Please check your audio output settings.');
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
          toast.error('Please click anywhere on the page to start audio playback');
        } else {
          toast.error('Failed to play received audio. Try clicking anywhere on the page.');
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

  const modifySDP = (sdp: string | undefined): string => {
    if (!sdp) return '';
    // enforce Opus stereo in SDP
    return sdp.replace(/a=fmtp:111 (.*)/, 'a=fmtp:111 $1; stereo=1; sprop-stereo=1');
  };

  // Audio visualization using Web Audio API with improved aesthetics
  function setupAudioVisualization(stream: MediaStream) {
    // Stop any existing visualization loop and resume audio context
    stopVisualization();
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume().catch(console.error);
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    analyserRef.current = audioContextRef.current.createAnalyser();
    analyserRef.current.fftSize = 2048; // Higher fidelity
    analyserRef.current.smoothingTimeConstant = 0.85; // Smoother transitions
    
    const source = audioContextRef.current.createMediaStreamSource(stream);
    source.connect(analyserRef.current);
    const canvas = document.getElementById('visualizer') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
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
      gradient.addColorStop(0, '#0a0322'); // Deep purple
      gradient.addColorStop(1, '#1a1a2e'); // Dark blue
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      
      // Draw spectrum bars with glow
      const barCount = 64; // Fewer bars for smoother look
      const barWidth = (width / barCount) - 2;
      const binSize = Math.floor(dataArray.length / barCount);
      
      // Add subtle grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
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
        const hue = 250 - (value / 255 * 150); // Purple to pink
        const saturation = 80 + (value / 255 * 20);
        const lightness = 50 + (value / 255 * 10);
        
        // Glow effect
        ctx.shadowColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        ctx.shadowBlur = 15;
        
        // Main bar gradient
        const barGradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
        barGradient.addColorStop(0, `hsl(${hue}, ${saturation}%, ${lightness}%)`);
        barGradient.addColorStop(1, `hsl(${hue + 30}, ${saturation}%, ${lightness + 20}%)`);
        
        ctx.fillStyle = barGradient;
        ctx.fillRect(x, height - barHeight, barWidth, barHeight);
        
        // Add reflection
        ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.3)`;
        ctx.fillRect(x, height, barWidth, barHeight * 0.2);
      }
      
      // Draw center line with ripple effect
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
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
      ctx.strokeStyle = 'rgba(120, 100, 255, 0.5)';
      ctx.stroke();
      
      // Update time for wave effect
      time += 0.02;
      
      // Continue animation
      animationFrameRef.current = requestAnimationFrame(draw);
    };
    
    draw();
  }

  function stopVisualization() {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect(); 
      analyserRef.current = null;
    }
  }

  // Check for mobile device on component mount
  useEffect(() => {
    // Basic check for mobile devices
    const checkMobile = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(userAgent);
    };
    
    const mobile = checkMobile();
    setIsMobile(mobile);
    
    if (mobile) {
      // Force microphone mode on mobile as getDisplayMedia isn't supported
      setShareType('microphone');
    }
  }, []);

  // Copy room link and show toast
  const copyLink = () => {
    const link = window.location.href;
    navigator.clipboard.writeText(link)
      .then(() => toast.success('Invite link copied!'))
      .catch(() => toast.error('Failed to copy link'));
  };

  return (
    <motion.div
      className="min-h-screen bg-gradient-to-br from-gray-950 to-gray-900 text-white p-4 md:p-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <Toaster position="top-right" />
      <div className="max-w-6xl mx-auto backdrop-blur-sm bg-black/20 rounded-2xl p-4 md:p-6 shadow-2xl border border-purple-500/10">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center space-x-3">
            <Logo size={60} className="hidden md:block" />
            <div className="flex items-center">
              <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
                Room: {roomId}
              </h1>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="ml-3 p-2 rounded-full bg-purple-500/20 backdrop-blur-sm hover:bg-purple-500/30 text-white transition-all duration-300 border border-purple-500/30"
                onClick={copyLink}
                title="Copy invite link"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                  <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                </svg>
              </motion.button>
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 rounded-lg shadow-lg transition-all duration-300"
            onClick={() => navigate('/')}
          >
            Leave Room
          </motion.button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Audio Controls */}
          <div className="lg:col-span-2 bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-sm rounded-xl p-6 shadow-xl border border-purple-500/10 transition-all duration-300 hover:border-purple-500/30">
            <div className="flex flex-col items-center space-y-6">
              {sharingUser && !isSharing && (
                <div className="text-center p-4 bg-purple-500/20 border border-purple-500 rounded-lg w-full backdrop-blur-sm shadow-lg mb-4">
                  <div className="flex items-center justify-center">
                    <span className="font-medium text-purple-300">{sharingUser.name}</span>
                    <span className="text-gray-300"> is currently sharing audio</span>
                  </div>
                </div>
              )}

              {!sharingUser && (
                <>
                  <div className="flex items-center space-x-4 mb-4">
                    <button
                      onClick={() => setShareType('system')}
                      disabled={isMobile}
                      className={`px-4 py-2 rounded-lg transition-colors ${
                        shareType === 'system'
                          ? 'bg-purple-500 text-white'
                          : isMobile 
                            ? 'bg-gray-600 text-gray-400 cursor-not-allowed opacity-60'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      System Audio
                      {isMobile && <span className="block text-xs mt-1">Not available on mobile</span>}
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
                    className="px-6 py-3 rounded-lg shadow-lg text-lg font-semibold bg-gradient-to-r from-purple-500 to-purple-700 hover:from-purple-600 hover:to-purple-800 transition-all duration-300 flex items-center justify-center space-x-2"
                    onClick={startSharing}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      {shareType === 'microphone' ? (
                        <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                      ) : (
                        <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                      )}
                    </svg>
                    <span>Share {shareType === 'microphone' ? 'Microphone' : 'System Audio'}</span>
                  </motion.button>
                </>
              )}

              {isSharing && sharingUser && (
                <div className="space-y-4">
                  <div className="text-center p-4 bg-purple-500/30 border border-purple-500/50 rounded-lg w-full backdrop-blur-sm shadow-lg">
                    <div className="flex justify-center items-center">
                      <span className="font-medium text-white">You are sharing audio</span>
                    </div>
                  </div>
                  
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="px-6 py-3 rounded-lg shadow-lg text-lg font-semibold bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 transition-all duration-300 flex items-center justify-center space-x-2"
                    onClick={stopSharing}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                    </svg>
                    <span>Stop Sharing</span>
                  </motion.button>
                </div>
              )}

              {/* Inline error UI removed; notifications shown via toast */}

              <div className="w-full rounded-xl overflow-hidden shadow-[0_0_30px_rgba(138,58,185,0.3)] border border-purple-500/20 bg-gray-950 relative group transition-all duration-500 hover:shadow-[0_0_40px_rgba(138,58,185,0.4)]">
                <div className="absolute -top-0.5 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-purple-500 to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-300"></div>
                
                {/* Voting Controls - Now positioned at the top of the visualizer */}
                {sharingUser && !isSharing && (
                  <div className="absolute top-3 right-3 z-10 flex items-center space-x-3 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-purple-500/30 shadow-lg">
                    {/* Upvote Button */}
                    <motion.button 
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      className={`p-1.5 rounded-full flex items-center justify-center transition-all duration-300 ${hasVoted === 'up' ? 'bg-green-500/30 text-green-400' : 'hover:bg-gray-700/50 text-gray-400'}`}
                      onClick={() => handleVote('up')}
                      disabled={isSharing}
                    >
                      <motion.svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        className="h-5 w-5" 
                        fill="currentColor" 
                        viewBox="0 0 24 24" 
                        animate={hasVoted === 'up' ? { scale: [1, 1.2, 1] } : {}}
                        transition={{ duration: 0.3 }}
                      >
                        <path d="M12 3l8 8h-6v10h-4v-10h-6l8-8z" />
                      </motion.svg>
                      <span className="ml-1 font-semibold text-sm">{sharingUser.upvotes || 0}</span>
                    </motion.button>
                    
                    {/* Divider */}
                    <div className="h-6 w-px bg-purple-500/30"></div>
                    
                    {/* Downvote Button */}
                    <motion.button 
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      className={`p-1.5 rounded-full flex items-center justify-center transition-all duration-300 ${hasVoted === 'down' ? 'bg-red-500/30 text-red-400' : 'hover:bg-gray-700/50 text-gray-400'}`}
                      onClick={() => handleVote('down')}
                      disabled={isSharing}
                    >
                      <motion.svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        className="h-5 w-5" 
                        fill="currentColor" 
                        viewBox="0 0 24 24" 
                        animate={hasVoted === 'down' ? { scale: [1, 1.2, 1] } : {}}
                        transition={{ duration: 0.3 }}
                      >
                        <path d="M12 21l-8-8h6v-10h4v10h6l-8 8z" />
                      </motion.svg>
                      <span className="ml-1 font-semibold text-sm">{sharingUser.downvotes || 0}</span>
                    </motion.button>
                  </div>
                )}
                
                {/* Show vote counts to the sharer on visualizer */}
                {isSharing && sharingUser && (
                  <div className="absolute top-3 right-3 z-10 flex items-center space-x-3 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-purple-500/30 shadow-lg">
                    <div className="flex items-center">
                      <div className="p-1.5 flex items-center justify-center text-green-400">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 3l8 8h-6v10h-4v-10h-6l8-8z" />
                        </svg>
                        <span className="ml-1 font-semibold text-sm">{sharingUser.upvotes || 0}</span>
                      </div>
                    </div>
                    
                    <div className="h-6 w-px bg-purple-500/30"></div>
                    
                    <div className="flex items-center">
                      <div className="p-1.5 flex items-center justify-center text-red-400">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 21l-8-8h6v-10h4v10h6l-8 8z" />
                        </svg>
                        <span className="ml-1 font-semibold text-sm">{sharingUser.downvotes || 0}</span>
                      </div>
                    </div>
                  </div>
                )}
                
                <canvas
                  id="visualizer"
                  className="w-full h-64 rounded-lg bg-transparent"
                  width="800"
                  height="200"
                />
              </div>
            </div>
          </div>

          {/* Users List - Always visible */}
          <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-sm rounded-xl p-6 shadow-xl border border-blue-500/10 transition-all duration-300 hover:border-blue-500/30 h-fit">
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
                  className={`p-4 rounded-lg backdrop-blur-sm transition-all duration-300 ${
                    user.isSharing
                      ? 'bg-purple-500/20 border border-purple-500 shadow-lg shadow-purple-500/20'
                      : 'bg-gray-700/50 hover:bg-gray-700/70 border border-gray-600/20 hover:border-gray-500/30'
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