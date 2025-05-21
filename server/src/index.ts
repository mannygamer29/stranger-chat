import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface UserPreferences {
  tags: string[];
  language: string;
  ageGroup: string;
  agreeToGuidelines: boolean;
}

interface WaitingUser {
  socketId: string;
  preferences: UserPreferences;
  isVideoChat: boolean;
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Store waiting users and active chat pairs
const waitingUsers: WaitingUser[] = [];
const chatPairs: Map<string, string> = new Map();
const reportedUsers: Set<string> = new Set();
const videoChatPairs: Map<string, string> = new Map();

// List of banned words (using partial matches to catch variations)
const BANNED_WORDS = [
  'n1gg', 'n1gger', 'n1gga', 'n1ggas', 'n1ggers', // n-word variations
  'r3tard', 'r3tarded', // r-word variations
  'f4ggot', 'f4g', // f-word variations
  'k1ke', // k-word variations
  'sp1c', 'sp1ck', // s-word variations
  'ch1nk', // c-word variations
  'w3tback', // w-word variations
  't0welhead', // t-word variations
  'g00k', // g-word variations
  'd1ke', // d-word variations
  'tr4nny', // t-word variations
  'wh0re', 'slut', // derogatory terms
  'n4zi', 'n4zis', // hate speech
  'terrorist', 'terrorism', // potentially harmful terms
];

// Function to check if a message contains banned words
const containsBannedWords = (message: string): boolean => {
  const normalizedMessage = message.toLowerCase().replace(/[^a-z0-9]/g, '');
  return BANNED_WORDS.some(word => {
    const normalizedWord = word.toLowerCase().replace(/[^a-z0-9]/g, '');
    return normalizedMessage.includes(normalizedWord);
  });
};

// Function to filter out banned words from a message
const filterMessage = (message: string): string => {
  if (!containsBannedWords(message)) {
    return message;
  }
  
  let filteredMessage = message;
  BANNED_WORDS.forEach(word => {
    const regex = new RegExp(word, 'gi');
    filteredMessage = filteredMessage.replace(regex, '***');
  });
  
  return filteredMessage;
};

// Helper function to find common tags between two users
const findCommonTags = (user1Tags: string[], user2Tags: string[]): string[] => {
  return user1Tags.filter(tag => user2Tags.includes(tag));
};

// Helper function to validate user preferences
const validatePreferences = (preferences: any): preferences is UserPreferences => {
  return (
    preferences &&
    Array.isArray(preferences.tags) &&
    typeof preferences.language === 'string' &&
    typeof preferences.ageGroup === 'string' &&
    typeof preferences.agreeToGuidelines === 'boolean'
  );
};

// Helper function to find the best match for a user
const findBestMatch = (user: WaitingUser): WaitingUser | null => {
  if (waitingUsers.length === 0) return null;

  // Sort waiting users by number of common tags and language match
  const matches = waitingUsers
    .filter(waitingUser => 
      waitingUser.socketId !== user.socketId && 
      !reportedUsers.has(waitingUser.socketId) &&
      waitingUser.preferences.language === user.preferences.language
    )
    .map(waitingUser => ({
      user: waitingUser,
      commonTags: findCommonTags(user.preferences.tags, waitingUser.preferences.tags),
      ageGroupMatch: waitingUser.preferences.ageGroup === user.preferences.ageGroup
    }))
    .filter(match => match.commonTags.length > 0)
    .sort((a, b) => {
      // First sort by number of common tags
      if (b.commonTags.length !== a.commonTags.length) {
        return b.commonTags.length - a.commonTags.length;
      }
      // Then by age group match
      return b.ageGroupMatch ? 1 : -1;
    });

  return matches.length > 0 ? matches[0].user : null;
};

io.on('connection', (socket: Socket) => {
  console.log('User connected:', socket.id);

  // Handle user looking for a chat
  socket.on('findChat', (data: { preferences: UserPreferences, isVideoChat: boolean }) => {
    // Validate preferences
    if (!validatePreferences(data.preferences)) {
      console.error('Invalid preferences received from user:', socket.id);
      socket.emit('error', 'Invalid preferences format');
      return;
    }

    // Remove user from waiting list if already present
    const existingIndex = waitingUsers.findIndex(u => u.socketId === socket.id);
    if (existingIndex !== -1) {
      waitingUsers.splice(existingIndex, 1);
    }

    const user: WaitingUser = { 
      socketId: socket.id, 
      preferences: data.preferences,
      isVideoChat: data.isVideoChat 
    };

    // Find a match based on chat type and preferences
    const match = findBestMatch(user);

    if (match) {
      // Remove matched user from waiting list
      const matchIndex = waitingUsers.findIndex(u => u.socketId === match.socketId);
      if (matchIndex !== -1) {
        waitingUsers.splice(matchIndex, 1);
      }

      // Create chat pair based on chat type
      if (data.isVideoChat) {
        videoChatPairs.set(socket.id, match.socketId);
        videoChatPairs.set(match.socketId, socket.id);
      } else {
        chatPairs.set(socket.id, match.socketId);
        chatPairs.set(match.socketId, socket.id);
      }

      // Find common tags
      const commonTags = findCommonTags(user.preferences.tags, match.preferences.tags);

      // Notify both users
      io.to(socket.id).emit('chatFound', { 
        commonTags,
        isVideoChat: data.isVideoChat,
        partnerId: match.socketId
      });
      io.to(match.socketId).emit('chatFound', { 
        commonTags,
        isVideoChat: data.isVideoChat,
        partnerId: socket.id
      });
    } else {
      // Add to waiting list
      waitingUsers.push(user);
      socket.emit('waiting');
    }
  });

  // WebRTC Signaling
  socket.on('offer', (data: { target: string, offer: RTCSessionDescriptionInit }) => {
    const partnerId = videoChatPairs.get(socket.id);
    if (partnerId === data.target) {
      io.to(data.target).emit('offer', {
        offer: data.offer,
        from: socket.id
      });
    }
  });

  socket.on('answer', (data: { target: string, answer: RTCSessionDescriptionInit }) => {
    const partnerId = videoChatPairs.get(socket.id);
    if (partnerId === data.target) {
      io.to(data.target).emit('answer', {
        answer: data.answer,
        from: socket.id
      });
    }
  });

  socket.on('ice-candidate', (data: { target: string, candidate: RTCIceCandidateInit }) => {
    const partnerId = videoChatPairs.get(socket.id);
    if (partnerId === data.target) {
      io.to(data.target).emit('ice-candidate', {
        candidate: data.candidate,
        from: socket.id
      });
    }
  });

  // Handle "next" request
  socket.on('next', () => {
    const partnerId = chatPairs.get(socket.id) || videoChatPairs.get(socket.id);
    if (partnerId) {
      // Notify partner that chat ended
      io.to(partnerId).emit('chatEnded');
      // Remove the chat pair
      chatPairs.delete(socket.id);
      chatPairs.delete(partnerId);
      videoChatPairs.delete(socket.id);
      videoChatPairs.delete(partnerId);
    }
    // Start looking for a new chat
    const user = waitingUsers.find(u => u.socketId === socket.id);
    if (user) {
      socket.emit('findChat', {
        preferences: user.preferences,
        isVideoChat: user.isVideoChat
      });
    }
  });

  // Handle chat messages with moderation
  socket.on('message', (message: string) => {
    const partnerId = chatPairs.get(socket.id);
    if (partnerId) {
      // Filter the message for banned words
      const filteredMessage = filterMessage(message);
      
      // If the message was filtered, notify the sender
      if (filteredMessage !== message) {
        socket.emit('messageModerated', {
          original: message,
          filtered: filteredMessage,
          reason: 'Message contained inappropriate language'
        });
      }
      
      // Send the filtered message to the partner
      io.to(partnerId).emit('message', filteredMessage);
      
      // If the message contained banned words, log it for moderation
      if (filteredMessage !== message) {
        console.log(`Moderated message from ${socket.id}:`, {
          original: message,
          filtered: filteredMessage,
          timestamp: new Date().toISOString()
        });
      }
    }
  });

  // Handle user reports
  socket.on('report', (reason: string) => {
    const partnerId = chatPairs.get(socket.id) || videoChatPairs.get(socket.id);
    if (partnerId) {
      // Add reported user to the set
      reportedUsers.add(partnerId);
      // Log the report (in a real app, you'd want to store this in a database)
      console.log(`User ${socket.id} reported ${partnerId} for: ${reason}`);
      // End the chat
      io.to(partnerId).emit('chatEnded');
      chatPairs.delete(socket.id);
      chatPairs.delete(partnerId);
      videoChatPairs.delete(socket.id);
      videoChatPairs.delete(partnerId);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const partnerId = chatPairs.get(socket.id) || videoChatPairs.get(socket.id);
    if (partnerId) {
      // Notify partner that chat ended
      io.to(partnerId).emit('chatEnded');
      chatPairs.delete(socket.id);
      chatPairs.delete(partnerId);
      videoChatPairs.delete(socket.id);
      videoChatPairs.delete(partnerId);
    }
    // Remove from waiting list if present
    const waitingIndex = waitingUsers.findIndex(u => u.socketId === socket.id);
    if (waitingIndex !== -1) {
      waitingUsers.splice(waitingIndex, 1);
    }
    // Remove from reported users if present
    reportedUsers.delete(socket.id);
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
}); 