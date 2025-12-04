import { WebRTCConnection } from './webrtc-connection.js';

export class NetworkManager {
  constructor(isHost) {
    this.isHost = isHost;
    this.connection = null;
    this.signalingServerUrl = null;
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

    // In browser, we'll use a simple in-memory signaling approach
    // Store offer/answer/ICE in localStorage for same-machine testing
    // For real LAN, user needs to manually share connection data
    this.signalingServerUrl = `http://localhost:${port}`;

    // Get local IPs from a simple endpoint (if signaling server is running)
    let ips = [];
    try {
      const response = await fetch(`${this.signalingServerUrl}/local-ips`);
      if (response.ok) {
        const data = await response.json();
        ips = data.ips;
      }
    } catch (error) {
      // Signaling server not running, use localStorage for same-machine testing
      console.log('⚠️  Signaling server not detected. Using localStorage for same-machine testing.');
      ips = [{ address: 'localhost', interface: 'localhost', isPrimary: true }];
    }

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

    // Store offer for signaling
    await this.storeOffer(offer);

    // Poll for answer from guest
    this.waitForAnswer();

    // Start ICE candidate exchange
    this.startIceCandidateExchange(this.signalingServerUrl);

    return ips;
  }

  async storeOffer(offer) {
    // Try HTTP signaling first
    try {
      await fetch(`${this.signalingServerUrl}/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer })
      });
      console.log('📤 Offer stored on signaling server');
    } catch (error) {
      // Fallback to localStorage for same-machine testing
      localStorage.setItem('webrtc_offer', JSON.stringify(offer));
      console.log('📤 Offer stored in localStorage');
    }
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
    try {
      await fetch(`${baseUrl}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer })
      });
      console.log('📤 Sent answer to host (HTTP)');
    } catch (error) {
      // Fallback to localStorage
      localStorage.setItem('webrtc_answer', JSON.stringify(answer));
      console.log('📤 Sent answer to host (localStorage)');
    }

    // Start ICE candidate exchange
    this.startIceCandidateExchange(baseUrl);
  }

  async fetchOfferWithRetry(baseUrl, maxRetries = 15, delay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(`${baseUrl}/offer`);
        if (response.ok) {
          const data = await response.json();
          console.log('📥 Received offer from host (HTTP)');
          return data.offer;
        } else if (response.status === 503) {
          console.log(`⏳ Waiting for host offer... (attempt ${i + 1}/${maxRetries})`);
        }
      } catch (error) {
        // Try localStorage fallback
        const offerStr = localStorage.getItem('webrtc_offer');
        if (offerStr) {
          console.log('📥 Received offer from host (localStorage)');
          return JSON.parse(offerStr);
        }
        console.log(`⏳ Host not ready... (attempt ${i + 1}/${maxRetries})`);
      }

      await this.sleep(delay * Math.min(1.5 ** i, 3)); // Exponential backoff, max 3x
    }

    throw new Error('Failed to connect to host: timeout');
  }

  waitForAnswer() {
    this.answerPollInterval = setInterval(async () => {
      let answer = null;

      // Try HTTP first
      try {
        const response = await fetch(`${this.signalingServerUrl}/answer`);
        if (response.ok) {
          const data = await response.json();
          answer = data.answer;
        }
      } catch (error) {
        // Try localStorage fallback
        const answerStr = localStorage.getItem('webrtc_answer');
        if (answerStr) {
          answer = JSON.parse(answerStr);
          localStorage.removeItem('webrtc_answer'); // Consume it
        }
      }

      if (answer) {
        console.log('📥 Received answer from guest');
        await this.connection.setRemoteDescription(answer);
        clearInterval(this.answerPollInterval);
        this.answerPollInterval = null;
      }
    }, 500);
  }

  startIceCandidateExchange(baseUrl) {
    const storageKey = this.isHost ? 'webrtc_ice_host' : 'webrtc_ice_guest';
    const opponentKey = this.isHost ? 'webrtc_ice_guest' : 'webrtc_ice_host';

    // Send our ICE candidates
    setInterval(() => {
      const candidates = this.connection.getIceCandidates();
      if (candidates.length === 0) return;

      // Try HTTP first
      fetch(`${baseUrl}/ice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate: candidates[candidates.length - 1], // Send latest
          isHost: this.isHost
        })
      }).catch(() => {
        // Fallback to localStorage
        const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
        stored.push(...candidates);
        localStorage.setItem(storageKey, JSON.stringify(stored));
      });
    }, 1000);

    // Fetch opponent's ICE candidates
    this.icePollInterval = setInterval(async () => {
      let candidates = [];

      // Try HTTP first
      try {
        const response = await fetch(`${baseUrl}/ice?host=${this.isHost}`);
        if (response.ok) {
          const data = await response.json();
          candidates = data.candidates;
        }
      } catch (error) {
        // Fallback to localStorage
        const stored = localStorage.getItem(opponentKey);
        if (stored) {
          candidates = JSON.parse(stored);
          localStorage.removeItem(opponentKey); // Consume them
        }
      }

      // Add candidates to connection
      for (const candidate of candidates) {
        await this.connection.addIceCandidate(candidate);
      }

      // Stop polling if connected
      if (this.connection?.isConnected()) {
        clearInterval(this.icePollInterval);
        this.icePollInterval = null;
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

    // Clean up localStorage
    localStorage.removeItem('webrtc_offer');
    localStorage.removeItem('webrtc_answer');
    localStorage.removeItem('webrtc_ice_host');
    localStorage.removeItem('webrtc_ice_guest');

    console.log('👋 Disconnected');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
