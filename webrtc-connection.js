export class WebRTCConnection {
  constructor(isHost) {
    this.isHost = isHost;
    this.peerConnection = null;
    this.reliableChannel = null;
    this.unreliableChannel = null;
    this.iceCandidates = [];
    this.pendingIceCandidates = []; // Queue for candidates received before remote description
    this.messageCallback = null;
    this.connectionStateCallback = null;
    this.remoteDescriptionSet = false;
    this.remoteUfrag = null;
    this.defaultIceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun.l.google.com:5349' },
      { urls: 'stun:stun1.l.google.com:3478' },
      { urls: 'stun:stun1.l.google.com:5349' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:5349' },
      { urls: 'stun:stun3.l.google.com:3478' },
      { urls: 'stun:stun3.l.google.com:5349' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:5349' }
    ];

    const customIceServers = this.getCustomIceServers();
    const sanitizedCustomIce = this.sanitizeIceServers(customIceServers);

    this.config = {
      iceServers: sanitizedCustomIce || this.defaultIceServers,
      iceCandidatePoolSize: 10
    };
  }

  async initialize() {
    try {
      this.peerConnection = new RTCPeerConnection(this.config);
    } catch (error) {
      console.warn('Failed to create RTCPeerConnection with custom ICE servers, falling back to defaults:', error);
      this.config.iceServers = this.defaultIceServers;
      this.peerConnection = new RTCPeerConnection(this.config);
    }

    // Set up ICE candidate handling
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.iceCandidates.push(event.candidate);
        console.log('🧊 ICE candidate generated:', event.candidate.candidate.substring(0, 50) + '...');
      }
    };

    this.peerConnection.onicecandidateerror = (event) => {
      console.error('ICE candidate error:', {
        errorCode: event.errorCode,
        errorText: event.errorText,
        url: event.url,
        hostCandidate: event.hostCandidate
      });
    };

    // Monitor connection state
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      console.log('🔗 Connection state:', state);
      if (this.connectionStateCallback) {
        this.connectionStateCallback(state);
      }
    };

    // Set up ICE connection state monitoring
    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('❄️  ICE connection state:', this.peerConnection.iceConnectionState);
    };

    if (this.isHost) {
      // Host creates data channels
      await this.createDataChannels();
    } else {
      // Guest waits for data channels from host
      this.peerConnection.ondatachannel = (event) => {
        console.log('📡 Received data channel:', event.channel.label);

        if (event.channel.label === 'game-state') {
          this.reliableChannel = event.channel;
          this.setupChannelHandlers(this.reliableChannel);
        } else if (event.channel.label === 'battle-updates') {
          this.unreliableChannel = event.channel;
          this.setupChannelHandlers(this.unreliableChannel);
        }
      };
    }

    console.log(`✅ WebRTC initialized as ${this.isHost ? 'HOST' : 'GUEST'}`);
  }

  async createDataChannels() {
    // Reliable channel for critical game state
    this.reliableChannel = this.peerConnection.createDataChannel('game-state', {
      ordered: true,
      maxRetransmits: null
    });
    this.setupChannelHandlers(this.reliableChannel);
    console.log('📺 Created reliable channel: game-state');

    // Unreliable channel for real-time battle updates
    this.unreliableChannel = this.peerConnection.createDataChannel('battle-updates', {
      ordered: false,
      maxRetransmits: 0
    });
    this.setupChannelHandlers(this.unreliableChannel);
    console.log('📺 Created unreliable channel: battle-updates');
  }

  setupChannelHandlers(channel) {
    channel.onopen = () => {
      console.log(`✅ Data channel opened: ${channel.label}`);
    };

    channel.onclose = () => {
      console.log(`❌ Data channel closed: ${channel.label}`);
    };

    channel.onerror = (error) => {
      console.error(`⚠️  Data channel error on ${channel.label}:`, error);
    };

    channel.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (this.messageCallback) {
          this.messageCallback(message);
        }
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    };
  }

  async createOffer() {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    console.log('📤 Created offer');
    return offer;
  }

  async createAnswer(offer) {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    await this.setRemoteDescription(offer);

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    console.log('📤 Created answer');
    return answer;
  }

  async setRemoteDescription(description) {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(description));
    this.remoteDescriptionSet = true;
    this.remoteUfrag = this.extractRemoteUfrag(this.peerConnection.remoteDescription?.sdp);
    console.log('📥 Set remote description');

    await this.flushPendingIceCandidates();
  }

  async addIceCandidate(candidate) {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    if (!candidate) return;

    // Drop candidates that belong to a different ICE username fragment (stale session)
    if (this.remoteUfrag && candidate.usernameFragment && candidate.usernameFragment !== this.remoteUfrag) {
      console.warn(`Skipping ICE candidate with stale ufrag (${candidate.usernameFragment}), expected ${this.remoteUfrag}`);
      return;
    }

    if (!this.remoteDescriptionSet) {
      console.log('⏳ Queueing ICE candidate (waiting for remote description)');
      this.pendingIceCandidates.push(candidate);
      return;
    }

    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      console.log('📥 Added ICE candidate');
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  }

  getIceCandidates() {
    return this.iceCandidates;
  }

  sendMessage(channel, message) {
    let targetChannel;

    if (channel === 'battle-updates') {
      targetChannel = this.unreliableChannel;
    } else {
      targetChannel = this.reliableChannel;
    }

    if (targetChannel && targetChannel.readyState === 'open') {
      try {
        targetChannel.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('Error sending message:', error);
        return false;
      }
    } else {
      console.warn(`Channel ${channel} not ready (state: ${targetChannel?.readyState})`);
      return false;
    }
  }

  onMessage(callback) {
    this.messageCallback = callback;
  }

  onConnectionStateChange(callback) {
    this.connectionStateCallback = callback;
  }

  isConnected() {
    return this.peerConnection?.connectionState === 'connected';
  }

  close() {
    if (this.reliableChannel) {
      this.reliableChannel.close();
    }
    if (this.unreliableChannel) {
      this.unreliableChannel.close();
    }
    if (this.peerConnection) {
      this.peerConnection.close();
    }
    this.pendingIceCandidates = [];
    console.log('🛑 WebRTC connection closed');
  }

  async flushPendingIceCandidates() {
    if (!this.remoteDescriptionSet || this.pendingIceCandidates.length === 0) {
      return;
    }

    const queue = [...this.pendingIceCandidates];
    this.pendingIceCandidates = [];

    for (const candidate of queue) {
      await this.addIceCandidate(candidate);
    }
  }

  sanitizeIceServers(servers) {
    if (!servers || !Array.isArray(servers)) return null;

    const normalized = [];

    for (const server of servers) {
      if (!server || !server.urls) continue;
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];

      // Only allow stun/turn/turns schemes, skip placeholders or malformed entries
      const validUrls = urls.filter((u) =>
        typeof u === 'string' &&
        /^[tT]urns?:[^\\s<>]+$/.test(u) || /^[sS]tuns?:[^\\s<>]+$/.test(u)
      );

      if (validUrls.length === 0) continue;

      normalized.push({
        ...server,
        urls: validUrls
      });
    }

    return normalized.length > 0 ? normalized : null;
  }

  getCustomIceServers() {
    // Allow specifying TURN/STUN servers via window.TURN_CONFIG or localStorage.turn_config
    try {
      const globalConfig = typeof window !== 'undefined' ? window.TURN_CONFIG : null;
      if (globalConfig?.iceServers) {
        return globalConfig.iceServers;
      }

      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('turn_config') : null;
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.iceServers) {
          return parsed.iceServers;
        }
      }
    } catch (error) {
      console.warn('Failed to load custom ICE servers:', error);
    }

    return null;
  }

  extractRemoteUfrag(sdp) {
    if (!sdp) return null;
    const match = sdp.match(/a=ice-ufrag:([^\r\n]+)/);
    return match ? match[1] : null;
  }
}
