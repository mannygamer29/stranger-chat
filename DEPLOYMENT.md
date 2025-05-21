# Deployment Guide for Stranger Chat

This guide will help you deploy the Stranger Chat application to various free hosting platforms.

## Prerequisites

1. A GitHub account
2. Node.js installed locally
3. Git installed locally
4. MongoDB Atlas account (for database)

## Environment Setup

### 1. Client Environment (.env in client directory)
```
REACT_APP_API_URL=<your-backend-url>
REACT_APP_SOCKET_URL=<your-backend-url>
```

### 2. Server Environment (.env in server directory)
```
PORT=5000
NODE_ENV=production
CLIENT_URL=<your-frontend-url>
MONGODB_URI=<your-mongodb-uri>
```

## Deployment Options

### Option 1: Render.com (Recommended)

#### Backend Deployment
1. Create a Render account
2. Create a new Web Service
3. Connect your GitHub repository
4. Configure the service:
   - Name: stranger-chat-backend
   - Environment: Node
   - Build Command: `cd server && npm install`
   - Start Command: `cd server && npm start`
   - Add environment variables from server/.env

#### Frontend Deployment
1. In Render, create a new Static Site
2. Connect your GitHub repository
3. Configure the site:
   - Name: stranger-chat-frontend
   - Build Command: `cd client && npm install && npm run build`
   - Publish Directory: `client/build`
   - Add environment variables from client/.env

### Option 2: Vercel + Railway

#### Backend Deployment (Railway)
1. Create a Railway account
2. Create a new project
3. Connect your GitHub repository
4. Configure the service:
   - Set the root directory to `server`
   - Add environment variables
   - Deploy

#### Frontend Deployment (Vercel)
1. Create a Vercel account
2. Import your GitHub repository
3. Configure the project:
   - Framework Preset: Create React App
   - Root Directory: `client`
   - Build Command: `npm run build`
   - Output Directory: `build`
   - Add environment variables

### Option 3: Netlify + Fly.io

#### Backend Deployment (Fly.io)
1. Install Fly CLI: `curl -L https://fly.io/install.sh | sh`
2. Login: `fly auth login`
3. Create app: `fly apps create stranger-chat-backend`
4. Deploy: `fly deploy`
5. Set environment variables: `fly secrets set KEY=VALUE`

#### Frontend Deployment (Netlify)
1. Create a Netlify account
2. Connect your GitHub repository
3. Configure the build:
   - Base directory: `client`
   - Build command: `npm run build`
   - Publish directory: `build`
   - Add environment variables

## Required Code Changes

### 1. Update CORS Configuration (server/src/index.ts)
```typescript
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});
```

### 2. Update Socket Connection (client/src/components/Chat.tsx)
```typescript
const newSocket = io(process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000');
```

### 3. Update API Calls (if any)
```typescript
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
```

## Database Setup

1. Create a MongoDB Atlas account
2. Create a new cluster
3. Get your connection string
4. Add it to your backend environment variables as MONGODB_URI

## Security Considerations

1. Enable HTTPS (automatic with most platforms)
2. Set up proper CORS configuration
3. Use environment variables for sensitive data
4. Implement rate limiting
5. Set up proper error handling

## Monitoring

1. Set up error logging
2. Monitor application performance
3. Set up alerts for critical issues

## Troubleshooting

Common issues and solutions:

1. CORS errors:
   - Check CORS configuration
   - Verify environment variables
   - Ensure URLs are correct

2. Connection issues:
   - Verify socket connection URL
   - Check if ports are open
   - Verify environment variables

3. Build failures:
   - Check build logs
   - Verify Node.js version
   - Check for missing dependencies

## Maintenance

1. Regular updates:
   - Keep dependencies updated
   - Monitor for security vulnerabilities
   - Update environment variables as needed

2. Backup:
   - Regular database backups
   - Environment variable backups
   - Configuration backups

## Support

If you encounter any issues:
1. Check the platform's documentation
2. Review the application logs
3. Check for common issues in the troubleshooting section
4. Contact platform support if needed 