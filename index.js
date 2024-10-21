// index.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const axios = require('axios'); // For AI API calls

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
  },
});

app.use(cors());
app.use(express.json());

// In-memory storage for game rooms
let gameRooms = {};

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Create Game Room
  socket.on('createGame', (callback) => {
    const roomCode = generateRoomCode();
    gameRooms[roomCode] = {
      host: socket.id,
      players: [],
      gameState: {
        phase: 'waiting',
        round: 1,
        prompts: [],
        imageUrl: '',
        captions: [],
        votes: {},
      },
      scores: {},
    };
    socket.join(roomCode);
    callback({ roomCode });
  });

  // Join Game Room
  socket.on('joinGame', ({ roomCode, playerName }, callback) => {
    const room = gameRooms[roomCode];
    if (room) {
      room.players.push({ id: socket.id, name: playerName });
      room.scores[socket.id] = 0; // Initialize player's score
      socket.join(roomCode);
      io.to(roomCode).emit('updatePlayers', room.players);
      callback({ success: true });
    } else {
      callback({ success: false, message: 'Room not found.' });
    }
  });

  // Start Game
  socket.on('startGame', ({ roomCode }) => {
    const room = gameRooms[roomCode];
    if (room && socket.id === room.host) {
      room.gameState.phase = 'promptSubmission';
      io.to(roomCode).emit('phaseChange', room.gameState.phase);
    }
  });

  // Handle Prompt Submission
  socket.on('submitPrompt', async ({ roomCode, prompt }) => {
    const room = gameRooms[roomCode];
    if (room) {
      room.gameState.prompts.push({ id: socket.id, prompt });

      // Once all prompts are submitted
      if (room.gameState.prompts.length === room.players.length) {
        // For simplicity, select a random prompt
        const selectedPrompt = room.gameState.prompts[Math.floor(Math.random() * room.gameState.prompts.length)].prompt;

        // Generate AI Image
        try {
          const imageUrl = await generateAIImage(selectedPrompt);
          room.gameState.imageUrl = imageUrl;
          room.gameState.phase = 'captionSubmission';
          io.to(roomCode).emit('imageGenerated', { imageUrl });
          io.to(roomCode).emit('phaseChange', room.gameState.phase);
        } catch (error) {
          console.error(error);
        }
      }
    }
  });

  // Handle Caption Submission
  socket.on('submitCaption', ({ roomCode, caption }) => {
    const room = gameRooms[roomCode];
    if (room) {
      room.gameState.captions.push({ id: socket.id, caption });

      // Check if all captions are submitted
      if (room.gameState.captions.length === room.players.length) {
        room.gameState.phase = 'voting';
        io.to(roomCode).emit('captionsReady', room.gameState.captions);
        io.to(roomCode).emit('phaseChange', room.gameState.phase);
      }
    }
  });

  // Provide initial game state and players
  socket.on('getGameState', ({ roomCode }, callback) => {
    const room = gameRooms[roomCode];
    if (room) {
      callback(room.gameState, room.players);
    }
  });

  // Handle Voting
  socket.on('submitVote', ({ roomCode, votedCaptionId }) => {
    const room = gameRooms[roomCode];
    if (room) {
      room.gameState.votes[socket.id] = votedCaptionId;

      // Check if all votes are in
      if (Object.keys(room.gameState.votes).length === room.players.length) {
        // Tally votes
        const voteCounts = {};
        for (let vote of Object.values(room.gameState.votes)) {
          voteCounts[vote] = (voteCounts[vote] || 0) + 1;
        }
        // Determine winner(s)
        const maxVotes = Math.max(...Object.values(voteCounts));
        const winners = Object.keys(voteCounts).filter(
          (key) => voteCounts[key] === maxVotes
        );

        // Update scores
        winners.forEach((winnerId) => {
          room.scores[winnerId] += 1;
        });

        // Prepare round results
        const result = {
          winners,
          scores: room.scores,
        };

        room.gameState.phase = 'result';
        io.to(roomCode).emit('roundResult', result);
        io.to(roomCode).emit('phaseChange', room.gameState.phase);

        // Reset gameState for next round after a delay
        setTimeout(() => {
          room.gameState.round += 1;
          room.gameState.phase = 'promptSubmission';
          room.gameState.prompts = [];
          room.gameState.imageUrl = '';
          room.gameState.captions = [];
          room.gameState.votes = {};
          io.to(roomCode).emit('phaseChange', room.gameState.phase);
        }, 10000); // Wait 10 seconds before next round
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    // Remove player from game rooms
    for (let roomCode in gameRooms) {
      const room = gameRooms[roomCode];
      room.players = room.players.filter((player) => player.id !== socket.id);
      delete room.scores[socket.id];

      // If host leaves, assign a new host
      if (room.host === socket.id && room.players.length > 0) {
        room.host = room.players[0].id;
      }

      io.to(roomCode).emit('updatePlayers', room.players);

      // If room is empty, delete it
      if (room.players.length === 0) {
        delete gameRooms[roomCode];
      }
    }
  });
});

// Helper Functions
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

async function generateAIImage(prompt) {
  // Placeholder for AI API call
  // Replace with actual API call to your AI service
  // For example, using OpenAI API (ensure to handle API keys securely)
  return 'https://example.com/generated-image.png';
}

server.listen(4000, () => {
  console.log('Server is running on port 4000');
});
