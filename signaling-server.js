import http from 'http';
import { networkInterfaces } from 'os';

export class SignalingServer {
  constructor() {
    this.server = null;
    this.hostOffer = null;
    this.guestAnswer = null;
    this.hostIceCandidates = [];
    this.guestIceCandidates = [];
    this.connected = false;
  }

  getLocalIPs() {
    const interfaces = networkInterfaces();
    const ips = [];

    for (const [name, configs] of Object.entries(interfaces)) {
      if (!configs) continue;

      for (const config of configs) {
        // Only IPv4, non-internal addresses
        if (config.family === 'IPv4' && !config.internal) {
          ips.push({
            address: config.address,
            interface: name,
            isPrimary: name.toLowerCase().includes('en0') || name.toLowerCase().includes('wi-fi')
          });
        }
      }
    }

    return ips;
  }

  async start(port = 8080) {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        // Enable CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        const url = new URL(req.url, `http://localhost:${port}`);

        if (url.pathname === '/offer' && req.method === 'GET') {
          this.handleGetOffer(req, res);
        } else if (url.pathname === '/offer' && req.method === 'POST') {
          this.handlePostOffer(req, res);
        } else if (url.pathname === '/answer' && req.method === 'GET') {
          this.handleGetAnswer(req, res);
        } else if (url.pathname === '/answer' && req.method === 'POST') {
          this.handlePostAnswer(req, res);
        } else if (url.pathname === '/ice' && req.method === 'GET') {
          this.handleGetIce(req, res);
        } else if (url.pathname === '/ice' && req.method === 'POST') {
          this.handlePostIce(req, res);
        } else if (url.pathname === '/local-ips' && req.method === 'GET') {
          this.handleGetLocalIPs(req, res);
        } else if (url.pathname === '/status' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ready' }));
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      this.server.listen(port, () => {
        const ips = this.getLocalIPs();
        console.log(`\n🚀 Signaling server running on port ${port}`);
        console.log('\n📡 Local IP addresses:');
        ips.forEach(ip => {
          const marker = ip.isPrimary ? ' ⭐' : '';
          console.log(`   ${ip.interface}: ${ip.address}${marker}`);
        });
        console.log('\nShare one of these IPs with the guest player.\n');
        resolve(ips);
      });

      this.server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          reject(new Error(`Port ${port} is already in use`));
        } else {
          reject(error);
        }
      });
    });
  }

  handleGetOffer(req, res) {
    if (this.hostOffer) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ offer: this.hostOffer }));
      console.log('📤 Sent offer to guest');
    } else {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Offer not ready yet' }));
    }
  }

  handlePostOffer(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        this.hostOffer = data.offer;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        console.log('📥 Received offer from host');
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  }

  handleGetAnswer(req, res) {
    if (this.guestAnswer) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ answer: this.guestAnswer }));
      console.log('📤 Sent answer to host');
    } else {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Answer not ready yet' }));
    }
  }

  handlePostAnswer(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        this.guestAnswer = data.answer;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        console.log('📥 Received answer from guest');
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  }

  handleGetIce(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const isHost = url.searchParams.get('host') === 'true';

    const candidates = isHost ? this.guestIceCandidates : this.hostIceCandidates;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ candidates }));
  }

  handlePostIce(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const isHost = data.isHost === true;

        if (isHost) {
          this.hostIceCandidates.push(data.candidate);
          console.log(`📤 Stored host ICE candidate (total: ${this.hostIceCandidates.length})`);
        } else {
          this.guestIceCandidates.push(data.candidate);
          console.log(`📥 Stored guest ICE candidate (total: ${this.guestIceCandidates.length})`);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  }

  handleGetLocalIPs(req, res) {
    const ips = this.getLocalIPs();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ips }));
  }

  setOffer(offer) {
    this.hostOffer = offer;
    console.log('✅ Host offer set and ready');
  }

  getAnswer() {
    return this.guestAnswer;
  }

  shutdown() {
    if (this.server) {
      this.server.close(() => {
        console.log('🛑 Signaling server shut down');
      });
    }
  }
}
