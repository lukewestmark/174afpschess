import { SignalingServer } from './signaling-server.js';

const server = new SignalingServer();

console.log('Starting signaling server...\n');

server.start(8080).catch((error) => {
  console.error('Failed to start signaling server:', error.message);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down signaling server...');
  server.shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\nShutting down signaling server...');
  server.shutdown();
  process.exit(0);
});
