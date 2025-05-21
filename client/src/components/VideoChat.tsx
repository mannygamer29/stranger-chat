import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';

interface VideoChatProps {
  partnerId: string;
  socket: Socket;
  commonTags: string[];
  onNext: () => void;
  onReport: () => void;
  isPartnerDisconnected: boolean;
  onStartNewChat: () => void;
}

const VideoChat: React.FC<VideoChatProps> = ({
  partnerId,
  socket,
  commonTags,
  onNext,
  onReport,
  isPartnerDisconnected,
  onStartNewChat
}) => {
  const navigate = useNavigate();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [error, setError] = useState<string>('');
  const [isPortrait, setIsPortrait] = useState(window.innerHeight > window.innerWidth);
  const [isLocalStreamReady, setIsLocalStreamReady] = useState(false);
  const [isRemoteStreamReady, setIsRemoteStreamReady] = useState(false);
  const isInitiatorRef = useRef(false);
  const pendingCandidatesRef = useRef<RTCIceCandidate[]>([]);
  const hasStartedNegotiationRef = useRef(false);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const negotiationInProgressRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 3;
  const [selectedIceCandidate, setSelectedIceCandidate] = useState<RTCIceCandidate | null>(null);
  const iceCandidatesRef = useRef<RTCIceCandidate[]>([]);

  useEffect(() => {
    const handleOrientationChange = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };

    window.addEventListener('resize', handleOrientationChange);
    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      window.removeEventListener('resize', handleOrientationChange);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, []);

  useEffect(() => {
    const handleConnect = () => {
      console.log('[Socket] Connected to signaling server');
      setIsSocketConnected(true);
      reconnectAttemptsRef.current = 0;
    };

    const handleDisconnect = () => {
      console.log('[Socket] Disconnected from signaling server');
      setIsSocketConnected(false);
      setError('Lost connection to server. Attempting to reconnect...');
    };

    const handleConnectError = (error: Error) => {
      console.error('[Socket] Connection error:', error);
      setError('Failed to connect to server. Please check your internet connection.');
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);

    // Set initial connection state
    setIsSocketConnected(socket.connected);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
    };
  }, [socket]);

  useEffect(() => {
    const initializeMedia = async () => {
      if (!isSocketConnected) {
        console.log('[WebRTC] Waiting for socket connection...');
        return;
      }

      if (isPartnerDisconnected) {
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          setIsLocalStreamReady(true);
        }

        // Enhanced WebRTC configuration with multiple TURN servers
        const configuration: RTCConfiguration = {
          iceServers: [
            // Google STUN servers
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            // OpenRelay TURN servers
            {
              urls: 'turn:openrelay.metered.ca:80',
              username: 'openrelayproject',
              credential: 'openrelayproject'
            },
            {
              urls: 'turn:openrelay.metered.ca:443',
              username: 'openrelayproject',
              credential: 'openrelayproject'
            },
            {
              urls: 'turn:openrelay.metered.ca:443?transport=tcp',
              username: 'openrelayproject',
              credential: 'openrelayproject'
            },
            // Additional TURN servers
            {
              urls: 'turn:numb.viagenie.ca',
              credential: 'muazkh',
              username: 'webrtc@live.com'
            },
            {
              urls: 'turn:turn.anyfirewall.com:443?transport=tcp',
              credential: 'webrtc',
              username: 'webrtc'
            }
          ],
          iceCandidatePoolSize: 10,
          bundlePolicy: 'max-bundle' as RTCBundlePolicy,
          rtcpMuxPolicy: 'require' as RTCRtcpMuxPolicy,
          iceTransportPolicy: 'all' as RTCIceTransportPolicy
        };

        const peerConnection = new RTCPeerConnection(configuration);
        peerConnectionRef.current = peerConnection;

        // Add local stream to peer connection
        stream.getTracks().forEach(track => {
          if (peerConnectionRef.current) {
            peerConnectionRef.current.addTrack(track, stream);
          }
        });

        // Enhanced ICE candidate handling
        peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            console.log('[WebRTC] New ICE candidate:', event.candidate);
            // Store candidate for potential filtering
            iceCandidatesRef.current.push(event.candidate);
            
            // Prioritize TURN candidates
            if (event.candidate.candidate.includes('relay') || 
                event.candidate.candidate.includes('turn')) {
              console.log('[WebRTC] Found TURN candidate, using it');
              setSelectedIceCandidate(event.candidate);
              socket.emit('ice-candidate', {
                target: partnerId,
                candidate: event.candidate
              });
            } else if (!selectedIceCandidate) {
              // If no TURN candidate yet, use this one
              setSelectedIceCandidate(event.candidate);
              socket.emit('ice-candidate', {
                target: partnerId,
                candidate: event.candidate
              });
            }
          } else {
            console.log('[WebRTC] ICE gathering completed');
            // If we haven't sent any candidates yet, send the best one
            if (!selectedIceCandidate && iceCandidatesRef.current.length > 0) {
              const bestCandidate = iceCandidatesRef.current.reduce((best, current) => {
                // Prioritize UDP over TCP
                if (current.protocol === 'udp' && best.protocol !== 'udp') return current;
                // Prioritize candidates with lower priority (higher priority number)
                const currentPriority = current.priority ?? 0;
                const bestPriority = best.priority ?? 0;
                if (currentPriority > bestPriority) return current;
                return best;
              });
              console.log('[WebRTC] Using best available candidate:', bestCandidate);
              socket.emit('ice-candidate', {
                target: partnerId,
                candidate: bestCandidate
              });
            }
          }
        };

        // Enhanced connection state handling
        peerConnection.onconnectionstatechange = () => {
          console.log('[WebRTC] Connection state changed:', peerConnection.connectionState);
          switch (peerConnection.connectionState) {
            case 'connected':
              console.log('[WebRTC] Connection established successfully');
              setError('');
              reconnectAttemptsRef.current = 0;
              // Clear ICE candidates after successful connection
              iceCandidatesRef.current = [];
              setSelectedIceCandidate(null);
              break;
            case 'connecting':
              console.log('[WebRTC] Attempting to establish connection...');
              setError('Connecting to partner...');
              break;
            case 'disconnected':
            case 'failed':
              console.log('[WebRTC] Connection', peerConnection.connectionState);
              if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttemptsRef.current++;
                console.log(`[WebRTC] Attempting to reconnect (${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})...`);
                setError(`Connection lost. Attempting to reconnect (${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})...`);
                
                // Clear ICE candidates and selected candidate on reconnect
                iceCandidatesRef.current = [];
                setSelectedIceCandidate(null);
                
                if (peerConnectionRef.current) {
                  // Try to force TURN usage on reconnect
                  const turnConfig = {
                    ...configuration,
                    iceTransportPolicy: 'relay' as RTCIceTransportPolicy
                  };
                  peerConnectionRef.current.setConfiguration(turnConfig);
                  peerConnectionRef.current.restartIce();
                }
              } else {
                console.log('[WebRTC] Max reconnection attempts reached');
                setError('Connection failed. Please try refreshing the page.');
                setIsRemoteStreamReady(false);
                if (remoteVideoRef.current) {
                  remoteVideoRef.current.srcObject = null;
                }
              }
              break;
            case 'closed':
              console.log('[WebRTC] Connection closed');
              setIsRemoteStreamReady(false);
              if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = null;
              }
              break;
          }
        };

        // Enhanced ICE connection state handling
        peerConnection.oniceconnectionstatechange = () => {
          console.log('[WebRTC] ICE connection state:', peerConnection.iceConnectionState);
          switch (peerConnection.iceConnectionState) {
            case 'checking':
              console.log('[WebRTC] Checking ICE connection...');
              break;
            case 'connected':
              console.log('[WebRTC] ICE connection established');
              setError('');
              break;
            case 'failed':
              console.log('[WebRTC] ICE connection failed, attempting restart...');
              peerConnection.restartIce();
              setError('Connection failed. Attempting to reconnect...');
              break;
            case 'disconnected':
              console.log('[WebRTC] ICE connection disconnected');
              setError('Connection lost. Attempting to reconnect...');
              break;
          }
        };

        // Handle incoming stream with enhanced error handling
        peerConnection.ontrack = (event) => {
          console.log('[WebRTC] Received remote track:', event.track.kind, event.streams[0].id);
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = event.streams[0];
            setIsRemoteStreamReady(true);
            setError('');
          }
        };

        // Handle negotiation needed event
        peerConnection.onnegotiationneeded = async () => {
          if (negotiationInProgressRef.current) {
            console.log('[WebRTC] Negotiation already in progress, skipping...');
            return;
          }

          if (!isSocketConnected) {
            console.log('[WebRTC] Socket not connected, deferring negotiation...');
            return;
          }

          negotiationInProgressRef.current = true;

          try {
            const socketId = socket.id;
            if (!socketId) {
              console.error('[WebRTC] Socket ID not available, retrying in 1s...');
              setTimeout(() => {
                negotiationInProgressRef.current = false;
                const event = new Event('negotiationneeded');
                peerConnection.dispatchEvent(event);
              }, 1000);
              return;
            }

            const shouldBeInitiator = socketId < partnerId;
            isInitiatorRef.current = shouldBeInitiator;

            if (shouldBeInitiator) {
              console.log('[WebRTC] Creating offer as initiator...');
              const offer = await peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true,
                iceRestart: true
              });
              await peerConnection.setLocalDescription(offer);
              socket.emit('offer', {
                target: partnerId,
                offer: peerConnection.localDescription
              });
            } else {
              console.log('[WebRTC] Waiting for offer as responder...');
            }
          } catch (err) {
            console.error('[WebRTC] Error during negotiation:', err);
            setError('Failed to establish video connection. Please try refreshing the page.');
          } finally {
            negotiationInProgressRef.current = false;
          }
        };

        // Handle incoming answer with enhanced error handling
        socket.on('answer', async (data: { answer: RTCSessionDescriptionInit, from: string }) => {
          console.log('[WebRTC] Received answer from:', data.from);
          if (data.from === partnerId && peerConnectionRef.current && isInitiatorRef.current) {
            try {
              if (peerConnectionRef.current.signalingState !== 'have-local-offer') {
                console.log('[WebRTC] Ignoring answer - wrong signaling state:', peerConnectionRef.current.signalingState);
                return;
              }
              console.log('[WebRTC] Setting remote description from answer...');
              await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
              console.log('[WebRTC] Remote description set successfully');
              
              // Add any pending candidates
              while (pendingCandidatesRef.current.length > 0) {
                const candidate = pendingCandidatesRef.current.shift();
                if (candidate) {
                  try {
                    await peerConnectionRef.current.addIceCandidate(candidate);
                    console.log('[WebRTC] Added pending ICE candidate');
                  } catch (e) {
                    console.error('[WebRTC] Error adding pending ICE candidate:', e);
                  }
                }
              }
            } catch (err) {
              console.error('[WebRTC] Error setting remote description from answer:', err);
              setError('Failed to establish video connection. Please try refreshing the page.');
            }
          }
        });

        // Handle incoming ICE candidates with enhanced error handling
        socket.on('ice-candidate', async (data: { candidate: RTCIceCandidateInit, from: string }) => {
          console.log('[WebRTC] Received ICE candidate from:', data.from);
          if (data.from === partnerId && peerConnectionRef.current) {
            try {
              const candidate = new RTCIceCandidate(data.candidate);
              if (peerConnectionRef.current.remoteDescription) {
                console.log('[WebRTC] Adding ICE candidate...');
                await peerConnectionRef.current.addIceCandidate(candidate);
                console.log('[WebRTC] ICE candidate added successfully');
              } else {
                console.log('[WebRTC] Storing ICE candidate for later');
                pendingCandidatesRef.current.push(candidate);
              }
            } catch (e) {
              console.error('[WebRTC] Error adding ICE candidate:', e);
            }
          }
        });

        // Handle incoming offer with enhanced error handling
        socket.on('offer', async (data: { offer: RTCSessionDescriptionInit, from: string }) => {
          console.log('[WebRTC] Received offer from:', data.from);
          if (data.from === partnerId && peerConnectionRef.current) {
            try {
              if (peerConnectionRef.current.signalingState !== 'stable') {
                console.log('[WebRTC] Ignoring offer - wrong signaling state:', peerConnectionRef.current.signalingState);
                return;
              }
              isInitiatorRef.current = false;
              console.log('[WebRTC] Setting remote description from offer...');
              await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
              console.log('[WebRTC] Creating answer...');
              const answer = await peerConnectionRef.current.createAnswer();
              console.log('[WebRTC] Setting local description from answer...');
              await peerConnectionRef.current.setLocalDescription(answer);
              console.log('[WebRTC] Sending answer to partner:', partnerId);
              socket.emit('answer', {
                target: partnerId,
                answer: peerConnectionRef.current.localDescription
              });
            } catch (err) {
              console.error('[WebRTC] Error handling offer:', err);
              setError('Failed to establish video connection. Please try refreshing the page.');
            }
          }
        });

      } catch (err) {
        console.error('Error accessing media devices:', err);
        setError('Could not access camera or microphone. Please check your permissions and try again.');
      }
    };

    initializeMedia();

    return () => {
      // Enhanced cleanup
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      if (localVideoRef.current?.srcObject) {
        const stream = localVideoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => {
          track.stop();
          stream.removeTrack(track);
        });
        localVideoRef.current.srcObject = null;
      }
      setIsLocalStreamReady(false);
      setIsRemoteStreamReady(false);
      hasStartedNegotiationRef.current = false;
      negotiationInProgressRef.current = false;
      reconnectAttemptsRef.current = 0;
      iceCandidatesRef.current = [];
      setSelectedIceCandidate(null);
    };
  }, [partnerId, socket, isPartnerDisconnected, isSocketConnected]);

  const toggleCamera = () => {
    if (localVideoRef.current?.srcObject) {
      const stream = localVideoRef.current.srcObject as MediaStream;
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOn(videoTrack.enabled);
      }
    }
  };

  const toggleMic = () => {
    if (localVideoRef.current?.srcObject) {
      const stream = localVideoRef.current.srcObject as MediaStream;
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicOn(audioTrack.enabled);
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-100 dark:bg-gray-900">
      {/* Video Grid */}
      <div className="flex-1 relative p-4">
        {isPartnerDisconnected ? (
          <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
            <div className="mb-4 text-gray-600 dark:text-gray-400">
              <p className="text-xl font-medium mb-2">Partner Disconnected</p>
              <p className="text-sm">Your video chat partner has left the conversation.</p>
            </div>
            <div className="flex gap-4">
              <button
                onClick={onStartNewChat}
                className="px-6 py-3 bg-blue-500 text-white rounded-lg font-medium
                  hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                  dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-400 dark:focus:ring-offset-gray-800"
              >
                Find New Chat
              </button>
              <button
                onClick={() => navigate('/')}
                className="px-6 py-3 bg-gray-500 text-white rounded-lg font-medium
                  hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2
                  dark:bg-gray-600 dark:hover:bg-gray-700 dark:focus:ring-gray-400 dark:focus:ring-offset-gray-800"
              >
                Return Home
              </button>
            </div>
          </div>
        ) : (
          <div className={`grid ${
            isPortrait 
              ? 'grid-rows-2 gap-4'
              : 'grid-cols-2 gap-4'
          } h-full`}>
            {/* Remote Video */}
            <div className={`relative bg-black rounded-lg overflow-hidden ${
              isPortrait 
                ? 'aspect-[9/16] mx-auto w-full max-w-md'
                : 'aspect-video'
            }`}>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              {!isRemoteStreamReady && (
                <div className="absolute inset-0 flex items-center justify-center text-white bg-gray-900 bg-opacity-75">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-2"></div>
                    <p>Waiting for partner...</p>
                  </div>
                </div>
              )}
            </div>

            {/* Local Video */}
            <div className={`relative bg-black rounded-lg overflow-hidden ${
              isPortrait 
                ? 'aspect-[9/16] mx-auto w-full max-w-md'
                : 'aspect-video'
            }`}>
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {!isLocalStreamReady && (
                <div className="absolute inset-0 flex items-center justify-center text-white bg-gray-900 bg-opacity-75">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-2"></div>
                    <p>Loading camera...</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 px-4 py-2 rounded-lg z-10">
            {error}
          </div>
        )}

        {/* Common Tags */}
        {!isPartnerDisconnected && commonTags.length > 0 && (
          <div className="absolute top-4 right-4 flex flex-wrap gap-2 z-10">
            {commonTags.map(tag => (
              <span
                key={tag}
                className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      {!isPartnerDisconnected && (
        <div className="p-4 bg-white dark:bg-gray-800 border-t dark:border-gray-700">
          <div className="flex justify-center space-x-4">
            <button
              onClick={toggleCamera}
              className={`p-3 rounded-full ${
                isCameraOn
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                  : 'bg-red-500 text-white'
              }`}
              aria-label={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
            >
              {isCameraOn ? '📹' : '🚫'}
            </button>
            <button
              onClick={toggleMic}
              className={`p-3 rounded-full ${
                isMicOn
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                  : 'bg-red-500 text-white'
              }`}
              aria-label={isMicOn ? 'Mute microphone' : 'Unmute microphone'}
            >
              {isMicOn ? '🎤' : '🔇'}
            </button>
            <button
              onClick={onNext}
              className="p-3 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
              aria-label="Next person"
            >
              ⏭️
            </button>
            <button
              onClick={onReport}
              className="p-3 rounded-full bg-red-500 text-white"
              aria-label="Report user"
            >
              ⚠️
            </button>
            <button
              onClick={() => navigate('/')}
              className="p-3 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
              aria-label="Return home"
            >
              ←
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoChat; 