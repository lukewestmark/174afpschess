// Chess game logic
export class ChessGame {
    constructor() {
      this.board = this.initializeBoard();
      this.currentTurn = 'white';
      this.selectedPiece = null;
      this.validMoves = [];
    }
  
    initializeBoard() {
      const board = Array(8).fill(null).map(() => Array(8).fill(null));
      
      // Pawns
      for (let i = 0; i < 8; i++) {
        board[1][i] = { type: 'pawn', color: 'black' };
        board[6][i] = { type: 'pawn', color: 'white' };
      }
      
      // Rooks
      board[0][0] = board[0][7] = { type: 'rook', color: 'black' };
      board[7][0] = board[7][7] = { type: 'rook', color: 'white' };
      
      // Knights
      board[0][1] = board[0][6] = { type: 'knight', color: 'black' };
      board[7][1] = board[7][6] = { type: 'knight', color: 'white' };
      
      // Bishops
      board[0][2] = board[0][5] = { type: 'bishop', color: 'black' };
      board[7][2] = board[7][5] = { type: 'bishop', color: 'white' };
      
      // Queens
      board[0][3] = { type: 'queen', color: 'black' };
      board[7][3] = { type: 'queen', color: 'white' };
      
      // Kings
      board[0][4] = { type: 'king', color: 'black' };
      board[7][4] = { type: 'king', color: 'white' };
      
      return board;
    }
  
    getPiece(row, col) {
      if (row < 0 || row > 7 || col < 0 || col > 7) return null;
      return this.board[row][col];
    }
  
    selectPiece(row, col) {
      const piece = this.getPiece(row, col);
      
      // If clicking on a valid move, make the move
      if (this.selectedPiece && this.validMoves.some(m => m.row === row && m.col === col)) {
        this.movePiece(this.selectedPiece.row, this.selectedPiece.col, row, col);
        this.selectedPiece = null;
        this.validMoves = [];
        return true;
      }
      
      // Select new piece
      if (piece && piece.color === this.currentTurn) {
        this.selectedPiece = { row, col, piece };
        this.validMoves = this.getValidMoves(row, col);
        return false;
      }
      
      // Deselect
      this.selectedPiece = null;
      this.validMoves = [];
      return false;
    }
  
    movePiece(fromRow, fromCol, toRow, toCol) {
      const piece = this.board[fromRow][fromCol];
      this.board[toRow][toCol] = piece;
      this.board[fromRow][fromCol] = null;
      this.currentTurn = this.currentTurn === 'white' ? 'black' : 'white';
    }
  
    getValidMoves(row, col) {
      const piece = this.getPiece(row, col);
      if (!piece) return [];
  
      const moves = [];
      
      switch (piece.type) {
        case 'pawn':
          this.getPawnMoves(row, col, piece.color, moves);
          break;
        case 'rook':
          this.getRookMoves(row, col, piece.color, moves);
          break;
        case 'knight':
          this.getKnightMoves(row, col, piece.color, moves);
          break;
        case 'bishop':
          this.getBishopMoves(row, col, piece.color, moves);
          break;
        case 'queen':
          this.getRookMoves(row, col, piece.color, moves);
          this.getBishopMoves(row, col, piece.color, moves);
          break;
        case 'king':
          this.getKingMoves(row, col, piece.color, moves);
          break;
      }
      
      return moves;
    }
  
    getPawnMoves(row, col, color, moves) {
      const dir = color === 'white' ? -1 : 1;
      const startRow = color === 'white' ? 6 : 1;
      
      // Forward move
      if (!this.getPiece(row + dir, col)) {
        moves.push({ row: row + dir, col });
        
        // Double move from start
        if (row === startRow && !this.getPiece(row + 2 * dir, col)) {
          moves.push({ row: row + 2 * dir, col });
        }
      }
      
      // Captures
      for (const dcol of [-1, 1]) {
        const target = this.getPiece(row + dir, col + dcol);
        if (target && target.color !== color) {
          moves.push({ row: row + dir, col: col + dcol });
        }
      }
    }
  
    getRookMoves(row, col, color, moves) {
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      this.getSlidingMoves(row, col, color, dirs, moves);
    }
  
    getBishopMoves(row, col, color, moves) {
      const dirs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
      this.getSlidingMoves(row, col, color, dirs, moves);
    }
  
    getSlidingMoves(row, col, color, directions, moves) {
      for (const [dr, dc] of directions) {
        let r = row + dr;
        let c = col + dc;
        
        while (r >= 0 && r < 8 && c >= 0 && c < 8) {
          const target = this.getPiece(r, c);
          
          if (!target) {
            moves.push({ row: r, col: c });
          } else {
            if (target.color !== color) {
              moves.push({ row: r, col: c });
            }
            break;
          }
          
          r += dr;
          c += dc;
        }
      }
    }
  
    getKnightMoves(row, col, color, moves) {
      const offsets = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1]
      ];
      
      for (const [dr, dc] of offsets) {
        const r = row + dr;
        const c = col + dc;
        const target = this.getPiece(r, c);
        
        if (r >= 0 && r < 8 && c >= 0 && c < 8) {
          if (!target || target.color !== color) {
            moves.push({ row: r, col: c });
          }
        }
      }
    }
  
    getKingMoves(row, col, color, moves) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          
          const r = row + dr;
          const c = col + dc;
          const target = this.getPiece(r, c);
          
          if (r >= 0 && r < 8 && c >= 0 && c < 8) {
            if (!target || target.color !== color) {
              moves.push({ row: r, col: c });
            }
          }
        }
      }
    }
  }