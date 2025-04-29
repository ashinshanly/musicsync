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
  const negotiationAttemptsRef = useRef<Map<string, number>>(new Map());

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

    socketRef.current.on('user-started-sharing', async ({ userId, username }) => {
      // Skip redundant negotiation if already connected
      if (peersRef.current.has(userId)) {
        console.log('Already connected to sharing user:', userId, '- skipping negotiation');
        return;
      }
      setUsers(prevUsers => {
        const updatedUsers = prevUsers.map(user => ({
          ...user,
          isSharing: user.id === userId
        }));
        const sharingUser = updatedUsers.find(user => user.id === userId);
        setSharingUser(sharingUser || null);
        return updatedUsers;
      });

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
                toast.error('Try clicking anywhere on the page.');
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
              pc!.connection.addTrack(track, localStreamRef.current as MediaStream);
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
        
        if (!pc) {
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

    // Add recvonly audio transceiver to ensure remote audio on Safari/mobile
    if ('addTransceiver' in pc) {
      try {
        pc.addTransceiver('audio', { direction: 'recvonly' });
      } catch (e) {
        console.warn('Transceiver add failed:', e);
      }
    }

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
        //setError(null); // Clear any previous errors
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        console.log('Connection failed or disconnected, attempting to recover');
        toast.error('Attempting to reconnect...');
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
        toast.error('Failed to negotiate connection. Please try again.');
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
          toast.error('Attempting to reconnect...');
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
              //toast.error('Failed to establish connection. Please try again.');
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

    // Set up visualization for the received stream if this is the sharing user
    if (stream.getAudioTracks().length > 0 && userId === sharingUser?.id) {
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

  // Audio visualization using Web Audio API
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
    analyserRef.current.fftSize = 2048;
    const source = audioContextRef.current.createMediaStreamSource(stream);
    source.connect(analyserRef.current);
    const canvas = document.getElementById('visualizer') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    const draw = () => {
      analyserRef.current!.getByteFrequencyData(dataArray);
      ctx.fillStyle = '#0A0A0F'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / dataArray.length) * 2.5;
      let x = 0;
      dataArray.forEach((v, i) => {
        const barHeight = v;
        const hue = (i / dataArray.length) * 360;
        ctx.fillStyle = `hsl(${hue},100%,50%)`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      });
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
      analyserRef.current.disconnect(); analyserRef.current = null;
    }
  }

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

  // Copy room link and show toast
  const copyLink = () => {
    const link = window.location.href;
    navigator.clipboard.writeText(link)
      .then(() => toast.success('Invite link copied!'))
      .catch(() => toast.error('Failed to copy link'));
  };

  return (
    <motion.div
      className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white p-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <Toaster position="top-right" />
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
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg shadow-lg transition-colors ml-4"
            onClick={copyLink}
          >
            🔗 Copy invite link
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

              {/* Inline error UI removed; notifications shown via toast */}

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