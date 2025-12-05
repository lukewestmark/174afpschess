-## Purpose

This file helps AI coding agents become productive quickly in this repository by capturing the project's architecture, run/debug workflows, message shapes, and project-specific conventions.

**Big Picture**
- **Project type:**: Single-page WebGL client (Three.js) + simple Node WebSocket server.
- **Client entry:**: `index.html` -> `main.js` (uses ES modules, `type: "module"` in `package.json`).
- **Game logic:**: `chess.js` exports `ChessGame` which holds `board`, `currentTurn`, `selectedPiece`, and `validMoves`.
- **Server:**: `server.js` implements a minimal WebSocket server (port `8080`) using the `ws` package; it stores `gameState` and broadcasts messages to connected clients.

**How to run (dev & server)**
- **Install:**: `npm install`
- **Start dev client (Vite):**: `npm run dev` (serves the client app; default Vite port)
- **Start server:**: `npm run server` (runs `node server.js` — listens on `ws://localhost:8080`)
- **Build/preview:**: `npm run build` then `npm run preview` (client only). For multiplayer testing, run the `server` in parallel.

**Important file-level notes & examples**
- **`server.js` (WebSocket server):**: listens on port `8080` and expects JSON messages with `type` fields: `init`, `join`, `move`, `select`. The server broadcasts `gameState` messages containing `{ board, currentTurn, players }`.
- **`main.js` (client):**: connects with `new WebSocket('ws://localhost:8080')`. On `open` it sends an `init` message:

  ```js
  { type: 'init', board: game.board, currentTurn: game.currentTurn }
  ```

- **Move message shape (client -> server):**

  ```js
  {
    type: 'move',
    fromRow, fromCol, toRow, toCol,
    board,               // full board array is sent by the client
    currentTurn
  }
  ```

- **Select message shape (client -> server):**

  ```js
  { type: 'select', row, col, validMoves, playerColor }
  ```

- **Broadcasted game state (server -> clients):**

  ```js
  { type: 'gameState', state: { board, currentTurn, players } }
  ```

**Project-specific conventions & patterns**
- **Client-authoritative visual updates:**: The client renders directly from `ChessGame` in `chess.js`; UI updates come from the local `game` instance which is synchronized by server `gameState` messages. The server currently accepts the full `board` from clients rather than validating moves server-side.
- **Simple server model:**: `gameState.players` stores WebSocket objects for `white` and `black`. When a client joins, `server.js` assigns `ws.playerColor = color` and broadcasts `playerJoined` / `playerLeft` events.
- **ES module + Vite:**: Keep `import` paths relative (e.g., `import { ChessGame } from './chess.js'`). Vite is the dev tool; avoid CommonJS `require` in client code.
- **Rendering conventions:**: Piece meshes are generated in `main.js` via `createPieceMesh(type, color)`. If changing visuals, update this function and the `updateBoard()` placement logic.

**Debugging tips**
- **WebSocket dev loop:**: Start `npm run server` first, then `npm run dev`. If client logs `Disconnected from server`, it will auto-reconnect after 3s (`setTimeout(connectToServer, 3000)`).
- **Ports:**: Server uses port `8080`. Vite commonly runs on `5173`. Confirm Vite port from the `dev` output.
- **Browser debugging:**: Use DevTools to inspect WebSocket frames and console logs. Server logs connections and message handling on stdout.

**Where to change game rules vs UI**
- **Game logic/rules:**: Modify `chess.js` methods (`getValidMoves`, `movePiece`, pawn/rook/etc. move helpers`). This file is canonical for rules and state transitions.
- **UI & interaction:**: `main.js` handles pointer lock, raycasting, controls, and mesh creation. Visual-only changes belong here.
- **Network behavior:**: `server.js` defines message routing and broadcast semantics. If you need authoritative move validation, add a server-side `validateMove` step before applying `gameState.board` updates.

**Dependencies of interest**
- `three` (client rendering)
- `vite` (dev server / build)
- `ws` (server WebSocket)

If anything in this summary seems incomplete or you want additional examples (e.g., typical WebSocket messages recorded during a play session, or a recommended server-side move validator stub), tell me which part to expand and I'll update this file.
