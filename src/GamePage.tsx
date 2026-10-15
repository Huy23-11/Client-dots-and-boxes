import { useState, useEffect, useRef } from 'react'
import type { BoardSize, UserProfile } from './data'
import { rankIcon, rankColor, rankClass } from './data'

// ─── Game Types ───────────────────────────────────────────────────────────────

interface GameState {
  n: number
  h: boolean[][]   // h[r][c]: horizontal edge, r∈[0,n], c∈[0,n-1]
  v: boolean[][]   // v[r][c]: vertical edge,   r∈[0,n-1], c∈[0,n]
  boxes: (null | 0 | 1)[][]  // 0=player(X/blue), 1=bot(O/red)
  turn: 0 | 1
  scores: [number, number]
  gameOver: boolean
}

interface HoveredEdge { type: 'h' | 'v'; r: number; c: number }

// ─── Game Logic ───────────────────────────────────────────────────────────────

function initGame(n: number): GameState {
  return {
    n,
    h: Array.from({ length: n + 1 }, () => Array(n).fill(false)),
    v: Array.from({ length: n }, () => Array(n + 1).fill(false)),
    boxes: Array.from({ length: n }, () => Array(n).fill(null)),
    turn: 0,
    scores: [0, 0],
    gameOver: false,
  }
}

function isBoxDone(h: boolean[][], v: boolean[][], r: number, c: number): boolean {
  return h[r][c] && h[r + 1][c] && v[r][c] && v[r][c + 1]
}

function placeEdge(state: GameState, type: 'h' | 'v', r: number, c: number): GameState {
  const newH = state.h.map(row => [...row])
  const newV = state.v.map(row => [...row])
  const newBoxes = state.boxes.map(row => [...row]) as (null | 0 | 1)[][]
  const scores: [number, number] = [...state.scores] as [number, number]

  if (type === 'h') newH[r][c] = true
  else newV[r][c] = true

  let completed = false

  const checkBox = (br: number, bc: number) => {
    if (br < 0 || br >= state.n || bc < 0 || bc >= state.n) return
    if (newBoxes[br][bc] !== null) return
    if (isBoxDone(newH, newV, br, bc)) {
      newBoxes[br][bc] = state.turn
      scores[state.turn]++
      completed = true
    }
  }

  if (type === 'h') { checkBox(r - 1, c); checkBox(r, c) }
  else              { checkBox(r, c - 1); checkBox(r, c) }

  const total = state.n * state.n
  const gameOver = scores[0] + scores[1] === total

  return {
    ...state,
    h: newH, v: newV, boxes: newBoxes, scores,
    turn: completed ? state.turn : (1 - state.turn as 0 | 1),
    gameOver,
  }
}

function getBotMove(state: GameState): { type: 'h' | 'v'; r: number; c: number } | null {
  const { n, h, v } = state
  const avail: { type: 'h' | 'v'; r: number; c: number }[] = []
  for (let r = 0; r <= n; r++) for (let c = 0; c < n; c++) if (!h[r][c]) avail.push({ type: 'h', r, c })
  for (let r = 0; r < n; r++) for (let c = 0; c <= n; c++) if (!v[r][c]) avail.push({ type: 'v', r, c })
  if (!avail.length) return null

  // 1. Take any move that completes a box
  const completing = avail.filter(m => {
    const th = h.map(row => [...row]); const tv = v.map(row => [...row])
    if (m.type === 'h') th[m.r][m.c] = true; else tv[m.r][m.c] = true
    const affected = m.type === 'h'
      ? [[m.r - 1, m.c], [m.r, m.c]]
      : [[m.r, m.c - 1], [m.r, m.c]]
    return affected.some(([br, bc]) => br >= 0 && br < n && bc >= 0 && bc < n && isBoxDone(th, tv, br, bc))
  })
  if (completing.length) return completing[Math.floor(Math.random() * completing.length)]

  // 2. Avoid giving opponent 3-sided boxes
  const safe = avail.filter(m => {
    const th = h.map(row => [...row]); const tv = v.map(row => [...row])
    if (m.type === 'h') th[m.r][m.c] = true; else tv[m.r][m.c] = true
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        const sides = (th[r][c] ? 1 : 0) + (th[r+1][c] ? 1 : 0) + (tv[r][c] ? 1 : 0) + (tv[r][c+1] ? 1 : 0)
        if (sides === 3) return false
      }
    return true
  })
  if (safe.length) return safe[Math.floor(Math.random() * safe.length)]

  // 3. Fallback: random
  return avail[Math.floor(Math.random() * avail.length)]
}

// ─── Player Card ──────────────────────────────────────────────────────────────

function PlayerCard({
  label, name, flag, rankTier, score, isActive, isBot, thinking
}: {
  label: 'X' | 'O'; name: string; flag: string; rankTier: import('./data').RankTier
  score: number; isActive: boolean; isBot?: boolean; thinking?: boolean
}) {
  const isX = label === 'X'
  const accentColor = isX ? '#4f8ef7' : '#f74f5e'
  const rc = rankColor(rankTier)

  return (
    <div className="flex flex-col items-center gap-2 px-5 py-4 rounded-2xl transition-all"
      style={{
        background: isActive ? `${accentColor}18` : 'rgba(255,255,255,0.04)',
        border: `2px solid ${isActive ? accentColor : 'rgba(255,255,255,0.08)'}`,
        boxShadow: isActive ? `0 0 20px ${accentColor}33` : 'none',
        minWidth: 140,
      }}>
      {/* Symbol badge */}
      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl font-black"
        style={{ background: `${accentColor}22`, border: `2px solid ${accentColor}`, fontFamily: 'var(--font-display)', color: accentColor }}>
        {isBot && thinking ? '…' : label}
      </div>
      {/* Name */}
      <div className="text-center">
        <p className="text-sm font-bold leading-none" style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>
          {flag} {name}
        </p>
        <p className={`text-xs mt-0.5 ${rankClass(rankTier)}`} style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
          {rankIcon(rankTier)} {rankTier}
        </p>
      </div>
      {/* Score */}
      <div className="text-3xl font-black" style={{ fontFamily: 'var(--font-display)', color: accentColor, textShadow: `0 0 16px ${accentColor}88` }}>
        {score}
      </div>
      {isActive && (
        <div className="text-xs font-medium" style={{ color: accentColor, fontFamily: 'var(--font-mono)', fontSize: 9 }}>
          {thinking ? 'ĐANG SUY NGHĨ...' : '◀ LƯỢT CỦA BẠN'}
        </div>
      )}
    </div>
  )
}

// ─── Game Board SVG ───────────────────────────────────────────────────────────

function GameBoard({ state, onEdge, canPlay }: {
  state: GameState
  onEdge: (type: 'h' | 'v', r: number, c: number) => void
  canPlay: boolean
}) {
  const [hovered, setHovered] = useState<HoveredEdge | null>(null)
  const { n, h, v, boxes } = state

  const CELL = n === 3 ? 90 : n === 4 ? 80 : 68
  const PAD = 36
  const DOT_R = 5
  const SIZE = n * CELL + PAD * 2

  return (
    <div className="rounded-2xl p-4 shadow-2xl" style={{ background: 'rgba(8,11,26,0.8)', border: '1px solid rgba(79,142,247,0.15)' }}>
      <svg width={SIZE} height={SIZE} style={{ display: 'block' }}>
        {/* Completed boxes */}
        {boxes.map((row, r) =>
          row.map((owner, c) => {
            if (owner === null) return null
            const x = PAD + c * CELL
            const y = PAD + r * CELL
            const fill  = owner === 0 ? 'rgba(79,142,247,0.22)' : 'rgba(247,79,94,0.22)'
            const color = owner === 0 ? '#4f8ef7' : '#f74f5e'
            const mark  = owner === 0 ? 'X' : 'O'
            return (
              <g key={`box-${r}-${c}`}>
                <rect x={x + 2} y={y + 2} width={CELL - 4} height={CELL - 4} fill={fill} rx={4} className="box-complete" />
                <text
                  x={x + CELL / 2} y={y + CELL / 2}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={CELL * 0.38} fontWeight="900"
                  fontFamily="'Rajdhani', sans-serif"
                  fill={color} opacity={0.9}
                  className="box-complete"
                >
                  {mark}
                </text>
              </g>
            )
          })
        )}

        {/* Horizontal edges */}
        {Array.from({ length: n + 1 }, (_, r) =>
          Array.from({ length: n }, (_, c) => {
            const drawn = h[r][c]
            const isHov = !drawn && canPlay && hovered?.type === 'h' && hovered.r === r && hovered.c === c
            const x1 = PAD + c * CELL + DOT_R + 3
            const x2 = PAD + (c + 1) * CELL - DOT_R - 3
            const y  = PAD + r * CELL
            return (
              <g key={`h-${r}-${c}`}>
                <line x1={x1} y1={y} x2={x2} y2={y}
                  stroke={drawn ? '#c4cde8' : isHov ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.09)'}
                  strokeWidth={drawn ? 3.5 : isHov ? 3 : 1.5}
                  strokeLinecap="round"
                  style={{ transition: 'stroke 0.12s, stroke-width 0.12s' }}
                  pointerEvents="none"
                />
                {!drawn && (
                  <rect
                    x={PAD + c * CELL} y={y - 11} width={CELL} height={22}
                    fill="transparent"
                    style={{ cursor: canPlay ? 'pointer' : 'default' }}
                    onMouseEnter={() => canPlay && setHovered({ type: 'h', r, c })}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => canPlay && onEdge('h', r, c)}
                  />
                )}
              </g>
            )
          })
        )}

        {/* Vertical edges */}
        {Array.from({ length: n }, (_, r) =>
          Array.from({ length: n + 1 }, (_, c) => {
            const drawn = v[r][c]
            const isHov = !drawn && canPlay && hovered?.type === 'v' && hovered.r === r && hovered.c === c
            const x  = PAD + c * CELL
            const y1 = PAD + r * CELL + DOT_R + 3
            const y2 = PAD + (r + 1) * CELL - DOT_R - 3
            return (
              <g key={`v-${r}-${c}`}>
                <line x1={x} y1={y1} x2={x} y2={y2}
                  stroke={drawn ? '#c4cde8' : isHov ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.09)'}
                  strokeWidth={drawn ? 3.5 : isHov ? 3 : 1.5}
                  strokeLinecap="round"
                  style={{ transition: 'stroke 0.12s, stroke-width 0.12s' }}
                  pointerEvents="none"
                />
                {!drawn && (
                  <rect
                    x={x - 11} y={PAD + r * CELL} width={22} height={CELL}
                    fill="transparent"
                    style={{ cursor: canPlay ? 'pointer' : 'default' }}
                    onMouseEnter={() => canPlay && setHovered({ type: 'v', r, c })}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => canPlay && onEdge('v', r, c)}
                  />
                )}
              </g>
            )
          })
        )}

        {/* Dots */}
        {Array.from({ length: n + 1 }, (_, r) =>
          Array.from({ length: n + 1 }, (_, c) => (
            <circle key={`d-${r}-${c}`}
              cx={PAD + c * CELL} cy={PAD + r * CELL} r={DOT_R}
              fill="#4f8ef7"
              style={{ filter: 'drop-shadow(0 0 4px rgba(79,142,247,0.8))' }}
            />
          ))
        )}
      </svg>
    </div>
  )
}

// ─── Game Over Overlay ────────────────────────────────────────────────────────

function GameOverOverlay({ scores, onReplay, onHome }: {
  scores: [number, number]; onReplay: () => void; onHome: () => void
}) {
  const playerWin = scores[0] > scores[1]
  const draw = scores[0] === scores[1]
  return (
    <div className="fade-in absolute inset-0 flex items-center justify-center z-30 rounded-2xl"
      style={{ background: 'rgba(8,11,26,0.88)', backdropFilter: 'blur(8px)' }}>
      <div className="slide-up text-center px-8 py-10">
        <div className="text-6xl mb-3">{draw ? '🤝' : playerWin ? '🏆' : '😔'}</div>
        <h2 className="text-3xl font-black mb-1 tracking-widest"
          style={{ fontFamily: 'var(--font-display)', color: draw ? '#f7c04f' : playerWin ? '#4f8ef7' : '#f74f5e' }}>
          {draw ? 'HÒA!' : playerWin ? 'CHIẾN THẮNG!' : 'THUA CUỘC!'}
        </h2>
        <p className="text-lg mb-6" style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-mono)' }}>
          {scores[0]} – {scores[1]}
        </p>
        <div className="flex gap-3 justify-center">
          <button className="btn-primary px-6 py-2.5" onClick={onReplay}>Chơi lại</button>
          <button className="btn-ghost px-6 py-2.5" onClick={onHome}>Trang chủ</button>
        </div>
      </div>
    </div>
  )
}

// ─── GamePage ─────────────────────────────────────────────────────────────────

interface GamePageProps {
  boardSize: BoardSize
  user: UserProfile
  onBack: () => void
}

const BOT_NAME = 'RoboX99'
const BOT_RANK: import('./data').RankTier = 'Vàng'

export default function GamePage({ boardSize, user, onBack }: GamePageProps) {
  const [state, setState] = useState<GameState>(() => initGame(boardSize))
  const [botThinking, setBotThinking] = useState(false)

  // Track edges placed to detect bot's turn change
  const edgesPlaced = state.h.flat().filter(Boolean).length + state.v.flat().filter(Boolean).length

  // Bot move effect
  useEffect(() => {
    if (state.turn !== 1 || state.gameOver) return

    setBotThinking(true)
    const delay = 600 + Math.random() * 900
    const timer = setTimeout(() => {
      setState(prev => {
        if (prev.turn !== 1 || prev.gameOver) return prev
        const move = getBotMove(prev)
        return move ? placeEdge(prev, move.type, move.r, move.c) : prev
      })
      setBotThinking(false)
    }, delay)

    return () => { clearTimeout(timer); setBotThinking(false) }
  }, [state.turn, state.gameOver, edgesPlaced])

  const handleEdge = (type: 'h' | 'v', r: number, c: number) => {
    if (state.turn !== 0 || state.gameOver || botThinking) return
    setState(prev => placeEdge(prev, type, r, c))
  }

  const restart = () => { setState(initGame(boardSize)); setBotThinking(false) }

  const totalBoxes = boardSize * boardSize
  const remaining = totalBoxes - state.scores[0] - state.scores[1]

  return (
    <div className="dot-grid min-h-screen flex flex-col" style={{ color: '#e8eaf6' }}>
      {/* Header */}
      <div className="glass border-b flex items-center gap-3 px-5 py-3" style={{ borderColor: 'rgba(79,142,247,0.15)' }}>
        <button className="icon-btn" onClick={onBack} style={{ width: 36, height: 36 }} title="Quay về">
          ←
        </button>
        <h2 className="font-bold tracking-widest text-sm" style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.1em', fontSize: 15 }}>
          DOTS & BOXES — {boardSize}×{boardSize}
        </h2>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.35)' }}>
            {remaining} ô còn lại
          </span>
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={restart}>Chơi lại</button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        {/* Score row */}
        <div className="flex items-center gap-6">
          <PlayerCard
            label="X" name={user.username} flag={user.flag} rankTier={user.rankTier}
            score={state.scores[0]} isActive={state.turn === 0 && !state.gameOver}
          />

          <div className="flex flex-col items-center gap-1 px-4">
            <span className="text-2xl font-black" style={{ fontFamily: 'var(--font-display)', color: 'rgba(255,255,255,0.15)' }}>VS</span>
            <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.3)' }}>
              {boardSize}×{boardSize}
            </span>
          </div>

          <PlayerCard
            label="O" name={BOT_NAME} flag="🤖" rankTier={BOT_RANK}
            score={state.scores[1]} isActive={state.turn === 1 && !state.gameOver}
            isBot thinking={botThinking}
          />
        </div>

        {/* Board */}
        <div className="relative">
          <GameBoard state={state} onEdge={handleEdge} canPlay={state.turn === 0 && !state.gameOver && !botThinking} />
          {state.gameOver && (
            <GameOverOverlay scores={state.scores} onReplay={restart} onHome={onBack} />
          )}
        </div>

        {/* Status bar */}
        <div className="glass rounded-xl px-6 py-3 flex items-center gap-4"
          style={{ border: '1px solid rgba(255,255,255,0.07)', minWidth: 280 }}>
          {!state.gameOver && (
            <>
              <div className="w-2.5 h-2.5 rounded-full pulse flex-shrink-0"
                style={{ background: state.turn === 0 ? '#4f8ef7' : '#f74f5e' }} />
              <span className="text-sm flex-1" style={{ color: 'rgba(255,255,255,0.7)' }}>
                {state.turn === 0 ? 'Lượt của bạn — hãy vẽ một cạnh!' : botThinking ? `${BOT_NAME} đang suy nghĩ...` : 'Đang chờ...'}
              </span>
            </>
          )}
          {state.gameOver && (
            <span className="text-sm" style={{ color: '#f7c04f' }}>🏁 Trận đấu kết thúc</span>
          )}
          <button className="btn-ghost px-3 py-1 text-xs" onClick={onBack}
            style={{ color: 'rgba(247,79,94,0.7)', borderColor: 'rgba(247,79,94,0.2)' }}>
            Bỏ cuộc
          </button>
        </div>
      </div>

      {/* Box-pop animation in style */}
      <style>{`
        @keyframes box-complete {
          0%   { transform: scale(0.3); opacity: 0; }
          65%  { transform: scale(1.12); }
          100% { transform: scale(1);   opacity: 1; }
        }
        .box-complete { animation: box-complete 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
      `}</style>
    </div>
  )
}
