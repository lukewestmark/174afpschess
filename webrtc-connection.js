export class WebRTCConnection {
  constructor(isHost) {
    this.isHost = isHost;
    this.peerConnection = null;
    this.reliableChannel = null;
    this.unreliableChannel = null;
    this.iceCandidates = [];
    this.messageCallback = null;
    this.connectionStateCallback = null;
    this.remoteDescriptionSet = false;

    this.config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10
    };
  }

  async initialize() {
    this.peerConnection = new RTCPeerConnection(this.config);

    // Set up ICE candidate handling
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.iceCandidates.push(event.candidate);
        console.log('🧊 ICE candidate generated:', event.candidate.candidate.substring(0, 50) + '...');
      }
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

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    this.remoteDescriptionSet = true;

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
    console.log('📥 Set remote description');
  }

  async addIceCandidate(candidate) {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    if (!this.remoteDescriptionSet) {
      console.log('⏳ Queueing ICE candidate (waiting for remote description)');
      // Queue the candidate to be added after remote description is set
      setTimeout(() => this.addIceCandidate(candidate), 100);
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
    console.log('🛑 WebRTC connection closed');
  }
}
