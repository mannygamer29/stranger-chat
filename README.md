# Stranger Chat

A text-based random chat application similar to Omegle, built with React, Node.js, and Socket.IO.

## Features

- Connect with random strangers for text chat
- Simple and clean user interface
- Real-time messaging
- "Next" button to skip to a new stranger
- No video/audio functionality (text-only)

## Prerequisites

- Node.js (v16 or higher)
- npm (v7 or higher)

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm run install:all
   ```

## Running the Application

To start both the client and server:
```bash
npm start
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend: http://localhost:5000

## Development

- Client (React) runs on port 3000
- Server (Node.js) runs on port 5000

## Tech Stack

- Frontend:
  - React with TypeScript
  - Socket.IO client
  - Tailwind CSS for styling

- Backend:
  - Node.js with Express
  - Socket.IO for real-time communication
  - TypeScript for type safety

## Safety Features

- Text-only chat (no video/audio)
- Ability to skip to a new stranger
- No personal information required
- No chat history stored 