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
    const initializeMedia = async () => {
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

        // Initialize WebRTC with more robust configuration
        const configuration: RTCConfiguration = {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            // Add TURN servers for better connectivity
            {
              urls: 'turn:numb.viagenie.ca',
              credential: 'muazkh',
              username: 'webrtc@live.com'
            }
          ],
          iceCandidatePoolSize: 10,
          bundlePolicy: 'max-bundle' as RTCBundlePolicy,
          rtcpMuxPolicy: 'require' as RTCRtcpMuxPolicy
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
            console.log('New ICE candidate:', event.candidate);
            socket.emit('ice-candidate', {
              target: partnerId,
              candidate: event.candidate
            });
          }
        };

        // Enhanced connection state handling
        peerConnection.onconnectionstatechange = () => {
          console.log('Connection state:', peerConnection.connectionState);
          switch (peerConnection.connectionState) {
            case 'connected':
              console.log('WebRTC connection established');
              break;
            case 'disconnected':
            case 'failed':
              console.log('WebRTC connection failed or disconnected');
              setIsRemoteStreamReady(false);
              if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = null;
              }
              setError('Connection lost. Please try reconnecting.');
              break;
            case 'closed':
              console.log('WebRTC connection closed');
              setIsRemoteStreamReady(false);
              if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = null;
              }
              break;
          }
        };

        // Enhanced ICE connection state handling
        peerConnection.oniceconnectionstatechange = () => {
          console.log('ICE connection state:', peerConnection.iceConnectionState);
          if (peerConnection.iceConnectionState === 'failed') {
            console.log('ICE connection failed, restarting ICE...');
            peerConnection.restartIce();
          }
        };

        // Handle incoming stream with enhanced error handling
        peerConnection.ontrack = (event) => {
          console.log('Received remote track:', event.track.kind);
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = event.streams[0];
            setIsRemoteStreamReady(true);
            setError(''); // Clear any previous errors
          }
        };

        // Create and send offer with enhanced error handling
        try {
          const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
          });
          await peerConnection.setLocalDescription(offer);
          console.log('Sending offer:', offer);
          socket.emit('offer', {
            target: partnerId,
            offer: peerConnection.localDescription
          });
        } catch (err) {
          console.error('Error creating offer:', err);
          setError('Failed to establish video connection. Please try again.');
        }

        // Handle incoming answer with enhanced error handling
        socket.on('answer', async (data: { answer: RTCSessionDescriptionInit, from: string }) => {
          if (data.from === partnerId && peerConnectionRef.current) {
            try {
              console.log('Received answer:', data.answer);
              await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
            } catch (err) {
              console.error('Error setting remote description:', err);
              setError('Failed to establish video connection. Please try again.');
            }
          }
        });

        // Handle incoming ICE candidates with enhanced error handling
        socket.on('ice-candidate', async (data: { candidate: RTCIceCandidateInit, from: string }) => {
          if (data.from === partnerId && peerConnectionRef.current) {
            try {
              console.log('Received ICE candidate:', data.candidate);
              await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (e) {
              console.error('Error adding ICE candidate:', e);
              // Don't set error here as this is not critical
            }
          }
        });

        // Handle incoming offer with enhanced error handling
        socket.on('offer', async (data: { offer: RTCSessionDescriptionInit, from: string }) => {
          if (data.from === partnerId && peerConnectionRef.current) {
            try {
              console.log('Received offer:', data.offer);
              await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
              const answer = await peerConnectionRef.current.createAnswer();
              await peerConnectionRef.current.setLocalDescription(answer);
              console.log('Sending answer:', answer);
              socket.emit('answer', {
                target: partnerId,
                answer: peerConnectionRef.current.localDescription
              });
            } catch (err) {
              console.error('Error handling offer:', err);
              setError('Failed to establish video connection. Please try again.');
            }
          }
        });

      } catch (err) {
        console.error('Error accessing media devices:', err);
        setError('Could not access camera or microphone. Please check your permissions and try again.');
      }
    };

    if (!isPartnerDisconnected) {
      initializeMedia();
    }

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
    };
  }, [partnerId, socket, isPartnerDisconnected]);

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