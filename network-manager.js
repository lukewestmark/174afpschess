import { WebRTCConnection } from './webrtc-connection.js';
import { SignalingServer } from './signaling-server.js';

export class NetworkManager {
  constructor(isHost) {
    this.isHost = isHost;
    this.connection = null;
    this.signalingServer = null;
    this.messageCallback = null;
    this.connectionStateCallback = null;
    this.icePollInterval = null;
    this.answerPollInterval = null;
  }

  async startHost(port = 8080) {
    if (!this.isHost) {
      throw new Error('Only host can start signaling server');
    }

    console.log('🎮 Starting as HOST...');

    // Start signaling server
    this.signalingServer = new SignalingServer();
    const ips = await this.signalingServer.start(port);

    // Initialize WebRTC
    this.connection = new WebRTCConnection(true);
    await this.connection.initialize();

    // Set up message handling
    this.connection.onMessage((message) => {
      if (this.messageCallback) {
        this.messageCallback(message);
      }
    });

    // Set up connection state handling
    this.connection.onConnectionStateChange((state) => {
      if (this.connectionStateCallback) {
        this.connectionStateCallback(state);
      }

      // Shut down signaling server once connected
      if (state === 'connected' && this.signalingServer) {
        console.log('🎉 P2P connection established! Shutting down signaling server...');
        setTimeout(() => {
          this.signalingServer.shutdown();
        }, 2000);
      }
    });

    // Create offer
    const offer = await this.connection.createOffer();
    this.signalingServer.setOffer(offer);

    // Poll for answer from guest
    this.waitForAnswer();

    // Start ICE candidate exchange
    this.startIceCandidateExchange(`http://localhost:${port}`);

    return ips;
  }

  async connectToHost(hostIP, port = 8080) {
    if (this.isHost) {
      throw new Error('Host cannot connect to another host');
    }

    console.log(`🎮 Connecting to HOST at ${hostIP}:${port}...`);

    const baseUrl = `http://${hostIP}:${port}`;

    // Initialize WebRTC
    this.connection = new WebRTCConnection(false);
    await this.connection.initialize();

    // Set up message handling
    this.connection.onMessage((message) => {
      if (this.messageCallback) {
        this.messageCallback(message);
      }
    });

    // Set up connection state handling
    this.connection.onConnectionStateChange((state) => {
      if (this.connectionStateCallback) {
        this.connectionStateCallback(state);
      }
    });

    // Wait for and fetch offer from host
    const offer = await this.fetchOfferWithRetry(baseUrl);

    // Create answer
    const answer = await this.connection.createAnswer(offer);

    // Send answer to host
    await fetch(`${baseUrl}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer })
    });

    console.log('📤 Sent answer to host');

    // Start ICE candidate exchange
    this.startIceCandidateExchange(baseUrl);
  }

  async fetchOfferWithRetry(baseUrl, maxRetries = 15, delay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(`${baseUrl}/offer`);
        if (response.ok) {
          const data = await response.json();
          console.log('📥 Received offer from host');
          return data.offer;
        } else if (response.status === 503) {
          console.log(`⏳ Waiting for host offer... (attempt ${i + 1}/${maxRetries})`);
        }
      } catch (error) {
        console.log(`⏳ Host not ready... (attempt ${i + 1}/${maxRetries})`);
      }

      await this.sleep(delay * Math.min(1.5 ** i, 3)); // Exponential backoff, max 3x
    }

    throw new Error('Failed to connect to host: timeout');
  }

  waitForAnswer() {
    this.answerPollInterval = setInterval(async () => {
      const answer = this.signalingServer.getAnswer();
      if (answer) {
        console.log('📥 Received answer from guest');
        await this.connection.setRemoteDescription(answer);
        clearInterval(this.answerPollInterval);
        this.answerPollInterval = null;
      }
    }, 500);
  }

  startIceCandidateExchange(baseUrl) {
    // Send our ICE candidates
    setInterval(() => {
      const candidates = this.connection.getIceCandidates();
      candidates.forEach(async (candidate) => {
        try {
          await fetch(`${baseUrl}/ice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              candidate: candidate,
              isHost: this.isHost
            })
          });
        } catch (error) {
          // Silently fail - signaling server might be shut down
        }
      });
    }, 1000);

    // Fetch opponent's ICE candidates
    this.icePollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${baseUrl}/ice?host=${this.isHost}`);
        if (response.ok) {
          const data = await response.json();
          for (const candidate of data.candidates) {
            await this.connection.addIceCandidate(candidate);
          }
        }
      } catch (error) {
        // Silently fail - signaling server might be shut down
        if (this.connection?.isConnected()) {
          // Connection established, can stop polling
          clearInterval(this.icePollInterval);
          this.icePollInterval = null;
        }
      }
    }, 1000);
  }

  send(type, data, channel = 'game-state') {
    if (!this.connection) {
      console.warn('Cannot send: connection not established');
      return false;
    }

    const message = { type, ...data };
    return this.connection.sendMessage(channel, message);
  }

  onMessage(callback) {
    this.messageCallback = callback;
  }

  onConnectionStateChange(callback) {
    this.connectionStateCallback = callback;
  }

  isConnected() {
    return this.connection?.isConnected() || false;
  }

  disconnect() {
    if (this.icePollInterval) {
      clearInterval(this.icePollInterval);
    }
    if (this.answerPollInterval) {
      clearInterval(this.answerPollInterval);
    }
    if (this.connection) {
      this.connection.close();
    }
    if (this.signalingServer) {
      this.signalingServer.shutdown();
    }
    console.log('👋 Disconnected');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
