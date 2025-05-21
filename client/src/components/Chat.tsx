import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import { filterMessage } from '../utils/moderation';
import VideoChat from './VideoChat';

interface Message {
  text: string;
  isOwn: boolean;
  timestamp: number;
  wasModerated?: boolean;
}

interface UserPreferences {
  tags: string[];
  language: string;
  ageGroup: string;
  agreeToGuidelines: boolean;
  isVideoChat: boolean;
}

interface ModeratedMessage {
  original: string;
  filtered: string;
  reason: string;
}

const Chat: React.FC = () => {
  const navigate = useNavigate();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [status, setStatus] = useState<'waiting' | 'chatting' | 'disconnected' | 'error'>('disconnected');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [commonTags, setCommonTags] = useState<string[]>([]);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });
  const [moderationNotification, setModerationNotification] = useState<ModeratedMessage | null>(null);
  const [isVideoChat, setIsVideoChat] = useState(false);
  const [partnerId, setPartnerId] = useState<string>('');
  const [isPartnerDisconnected, setIsPartnerDisconnected] = useState(false);

  useEffect(() => {
    // Load preferences from localStorage
    const storedPreferences = localStorage.getItem('chatPreferences');
    if (!storedPreferences) {
      navigate('/');
      return;
    }

    const preferences: UserPreferences = JSON.parse(storedPreferences);
    setIsVideoChat(preferences.isVideoChat);
    const newSocket = io(process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000');
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setStatus('waiting');
      setErrorMessage('');
      // Send preferences when connecting
      newSocket.emit('findChat', {
        preferences,
        isVideoChat: preferences.isVideoChat
      });
    });

    newSocket.on('error', (error: string) => {
      setStatus('error');
      setErrorMessage(error);
      console.error('Server error:', error);
    });

    newSocket.on('waiting', () => {
      setStatus('waiting');
      setMessages([]);
      setCommonTags([]);
      setErrorMessage('');
    });

    newSocket.on('chatFound', (data: { commonTags: string[], isVideoChat: boolean, partnerId: string }) => {
      setStatus('chatting');
      setMessages([]);
      setCommonTags(data.commonTags);
      setErrorMessage('');
      setPartnerId(data.partnerId);
    });

    newSocket.on('chatEnded', () => {
      setStatus('disconnected');
      setIsPartnerDisconnected(true);
      setMessages([]);
      setCommonTags([]);
      setErrorMessage('');
    });

    newSocket.on('message', (message: string) => {
      setMessages(prev => [...prev, { 
        text: message, 
        isOwn: false,
        timestamp: Date.now()
      }]);
    });

    newSocket.on('messageModerated', (data: ModeratedMessage) => {
      setModerationNotification(data);
      // Clear the notification after 5 seconds
      setTimeout(() => setModerationNotification(null), 5000);
    });

    newSocket.on('disconnect', () => {
      setStatus('disconnected');
      setErrorMessage('Disconnected from server');
    });

    return () => {
      newSocket.close();
    };
  }, [navigate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Apply dark mode class to body
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMessage.trim() && socket && status === 'chatting') {
      // Pre-filter the message on the client side
      const filteredMessage = filterMessage(inputMessage);
      const wasModerated = filteredMessage !== inputMessage;

      socket.emit('message', inputMessage);
      setMessages(prev => [...prev, { 
        text: filteredMessage, 
        isOwn: true,
        timestamp: Date.now(),
        wasModerated
      }]);
      setInputMessage('');
    }
  };

  const handleNext = () => {
    if (socket) {
      socket.emit('next');
    }
  };

  const handleReport = () => {
    if (socket && reportReason.trim()) {
      socket.emit('report', reportReason);
      setShowReportModal(false);
      setReportReason('');
      handleNext();
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const handleStartNewChat = () => {
    setIsPartnerDisconnected(false);
    if (socket) {
      const storedPreferences = localStorage.getItem('chatPreferences');
      if (storedPreferences) {
        const preferences: UserPreferences = JSON.parse(storedPreferences);
        socket.emit('findChat', {
          preferences,
          isVideoChat: preferences.isVideoChat
        });
      }
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto p-4 bg-gray-100 dark:bg-gray-900 transition-colors duration-200">
      {isVideoChat ? (
        <VideoChat
          partnerId={partnerId}
          socket={socket!}
          commonTags={commonTags}
          onNext={handleNext}
          onReport={() => setShowReportModal(true)}
          isPartnerDisconnected={isPartnerDisconnected}
          onStartNewChat={handleStartNewChat}
        />
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg flex-1 flex flex-col transition-colors duration-200">
          {/* Status Bar */}
          <div className="p-4 border-b dark:border-gray-700">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => navigate('/')}
                  className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  ← Back
                </button>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">Stranger Chat</h1>
              </div>
              <div className="flex items-center space-x-4">
                {status === 'chatting' && commonTags.length > 0 && (
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Common interests:</span>
                    <div className="flex flex-wrap gap-1">
                      {commonTags.map(tag => (
                        <span
                          key={tag}
                          className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center space-x-4">
                  <button
                    onClick={() => setDarkMode(!darkMode)}
                    className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200"
                  >
                    {darkMode ? '🌞' : '🌙'}
                  </button>
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${
                      status === 'chatting' ? 'bg-green-500' :
                      status === 'waiting' ? 'bg-yellow-500' :
                      status === 'error' ? 'bg-red-500' :
                      'bg-gray-500'
                    }`} />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {status === 'chatting' ? 'Chatting' :
                       status === 'waiting' ? 'Waiting for stranger...' :
                       status === 'error' ? 'Error' :
                       'Disconnected'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            {errorMessage && (
              <div className="mt-2 p-2 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 rounded text-sm">
                {errorMessage}
              </div>
            )}
            
            {/* Moderation Notification */}
            {moderationNotification && (
              <div className="mt-2 p-2 bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-200 rounded text-sm">
                <p>Your message was moderated:</p>
                <p className="font-medium">Original: {moderationNotification.original}</p>
                <p className="font-medium">Filtered: {moderationNotification.filtered}</p>
                <p className="text-xs mt-1">Reason: {moderationNotification.reason}</p>
              </div>
            )}
          </div>

          {/* Disconnection Message */}
          {isPartnerDisconnected && (
            <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
              <div className="mb-4 text-gray-600 dark:text-gray-400">
                <p className="text-xl font-medium mb-2">Partner Disconnected</p>
                <p className="text-sm">Your chat partner has left the conversation.</p>
              </div>
              <div className="flex gap-4">
                <button
                  onClick={handleStartNewChat}
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
          )}

          {/* Messages */}
          {!isPartnerDisconnected && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.isOwn ? 'justify-end' : 'justify-start'}`}
                >
                  <div className="flex flex-col max-w-[70%]">
                    <div
                      className={`rounded-lg p-3 break-words ${
                        message.isOwn
                          ? message.wasModerated
                            ? 'bg-yellow-500 text-white'
                            : 'bg-blue-500 text-white'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                      }`}
                    >
                      {message.text}
                      {message.wasModerated && (
                        <span className="block text-xs mt-1 opacity-75">
                          (Message was moderated)
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {formatTimestamp(message.timestamp)}
                    </span>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Input Form */}
          {!isPartnerDisconnected && (
            <form onSubmit={sendMessage} className="p-4 border-t dark:border-gray-700">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  disabled={status !== 'chatting'}
                />
                <button
                  type="submit"
                  disabled={status !== 'chatting'}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-blue-600 dark:hover:bg-blue-700"
                >
                  Send
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={status !== 'chatting'}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-600 dark:hover:bg-gray-700"
                >
                  Next
                </button>
                {status === 'chatting' && (
                  <button
                    type="button"
                    onClick={() => setShowReportModal(true)}
                    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"
                  >
                    Report
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      )}

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full transition-colors duration-200">
            <h3 className="text-lg font-medium mb-4 text-gray-900 dark:text-white">Report User</h3>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Please describe the reason for reporting..."
              className="w-full p-2 border rounded-lg mb-4 h-32 resize-none dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowReportModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleReport}
                disabled={!reportReason.trim()}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-red-600 dark:hover:bg-red-700"
              >
                Submit Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Chat; 