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
    this.primaryHostIp = null;
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
        this.primaryHostIp = (ips.find(ip => ip.isPrimary) || ips[0] || {}).address || null;
        console.log(`\nSignaling server running on port ${port}`);
        console.log('\nLocal IP addresses:');
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
      console.log('Sent offer to guest');
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
        // Reset previous session state so stale ICE/answers don't leak into new connections
        this.guestAnswer = null;
        this.hostIceCandidates = [];
        this.guestIceCandidates = [];

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        console.log('Received offer from host (signaling state reset)');
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
      console.log('Sent answer to host');
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
        console.log('Received answer from guest');
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  }

  handleGetIce(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const isHost = url.searchParams.get('host') === 'true';

    const store = isHost ? this.guestIceCandidates : this.hostIceCandidates;
    const candidates = store.splice(0, store.length); // return and clear

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
        const clientIp = this.cleanIp(req.socket.remoteAddress);
        const fallbackIp = isHost ? this.primaryHostIp : clientIp;

        const candidate = this.sanitizeCandidate(data.candidate, fallbackIp);
        const desc = this.describeCandidate(candidate?.candidate);

        if (isHost) {
          this.hostIceCandidates.push(candidate);
          console.log(`Stored host ICE candidate (total: ${this.hostIceCandidates.length}) ${desc}`);
        } else {
          this.guestIceCandidates.push(candidate);
          console.log(`Stored guest ICE candidate (total: ${this.guestIceCandidates.length}) ${desc}`);
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
    console.log('Host offer set and ready');
  }

  getAnswer() {
    return this.guestAnswer;
  }

  shutdown() {
    if (this.server) {
      this.server.close(() => {
        console.log('Signaling server shut down');
      });
    }
  }

  sanitizeCandidate(candidate, fallbackIp) {
    if (!candidate || !candidate.candidate || !fallbackIp) {
      return candidate;
    }

    // Only rewrite mDNS/obfuscated hostnames
    if (!candidate.candidate.includes('.local')) {
      return candidate;
    }

    const parts = candidate.candidate.split(' ');
    if (parts.length < 6) {
      return candidate;
    }

    // SDP grammar: foundation component protocol priority address port typ ...
    parts[4] = fallbackIp;

    return { ...candidate, candidate: parts.join(' ') };
  }

  cleanIp(ip) {
    if (!ip) return null;
    // Strip IPv6-mapped IPv4 prefix
    if (ip.startsWith('::ffff:')) {
      return ip.replace('::ffff:', '');
    }
    return ip;
  }

  describeCandidate(cand) {
    try {
      if (!cand) return '';
      const parts = cand.split(' ');
      const address = parts[4];
      const protocol = parts[2];
      const port = parts[5];
      const typeIndex = parts.indexOf('typ');
      const typ = typeIndex >= 0 ? parts[typeIndex + 1] : 'unknown';
      return `[${typ} ${protocol} ${address}:${port}]`;
    } catch {
      return '';
    }
  }
}
