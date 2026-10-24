import { useState, useEffect, useRef } from 'react'
import type { UserProfile } from './data'
import { rankIcon, rankClass } from './data'
import { wsService } from './services/websocket'
import {
  OP,
  splitServerMessage,
  parseMoveResult,
  parseGameOver,
  describeInvalidMove,
  msgMakeMove,
  msgSurrender,
  edgeToDots,
  dotsToEdge,
  type ActiveMatch,
  type EdgeRef,
  type GameOverMsg,
  type MoveResultMsg,
} from './services/protocol'

// ─── Game Types ───────────────────────────────────────────────────────────────
//
// Client CHỈ HIỂN THỊ: toàn bộ luật chơi (hợp lệ, ăn ô, lượt, điểm, thắng/thua) do server quyết định.
// Phía "mình" luôn là X (xanh) = chỉ số 0, đối thủ luôn là O (đỏ) = chỉ số 1.

interface GameState {
  n: number
  h: boolean[][]   // h[r][c]: horizontal edge, r∈[0,n], c∈[0,n-1]
  v: boolean[][]   // v[r][c]: vertical edge,   r∈[0,n-1], c∈[0,n]
  boxes: (null | 0 | 1)[][]  // 0=mình(X/blue), 1=đối thủ(O/red)
  turn: 0 | 1                // lượt hiện tại theo server
  scores: [number, number]   // [mình, đối thủ]
}

type Outcome = 'win' | 'lose' | 'draw'

interface GameResult {
  outcome: Outcome
  scores: [number, number]
  reason: string
  iSurrendered: boolean
}

interface HoveredEdge { type: 'h' | 'v'; r: number; c: number }

// ─── Hiển thị theo dữ liệu server ─────────────────────────────────────────────

// role 1 đi trước. Nếu mình là role 1 thì lượt đầu là của mình.
function initGame(n: number, myRole: 1 | 2): GameState {
  return {
    n,
    h: Array.from({ length: n + 1 }, () => Array(n).fill(false)),
    v: Array.from({ length: n }, () => Array(n + 1).fill(false)),
    boxes: Array.from({ length: n }, () => Array(n).fill(null)),
    turn: myRole === 1 ? 0 : 1,
    scores: [0, 0],
  }
}

// Áp dụng nội dung MOVE_RESULT: vẽ cạnh, đánh dấu các ô vừa khép kín cho người đi, cập nhật điểm và lượt
function applyMove(
  state: GameState,
  edge: EdgeRef,
  completedBoxes: { r: number; c: number }[],
  mover: 0 | 1,
  scores: [number, number],
  nextTurn: 0 | 1 | null
): GameState {
  const h = state.h.map(row => [...row])
  const v = state.v.map(row => [...row])
  const boxes = state.boxes.map(row => [...row]) as (null | 0 | 1)[][]

  const grid = edge.type === 'h' ? h : v
  if (grid[edge.r] !== undefined && grid[edge.r][edge.c] !== undefined) {
    grid[edge.r][edge.c] = true
  }

  for (const b of completedBoxes) {
    if (b.r >= 0 && b.r < state.n && b.c >= 0 && b.c < state.n) {
      boxes[b.r][b.c] = mover
    }
  }

  return { ...state, h, v, boxes, scores, turn: nextTurn ?? state.turn }
}

function outcomeFromScores(scores: [number, number]): Outcome {
  if (scores[0] === scores[1]) return 'draw'
  return scores[0] > scores[1] ? 'win' : 'lose'
}

// ─── Player Card ──────────────────────────────────────────────────────────────

function PlayerCard({
  label, name, flag, rankTier, score, isActive, isOpponent, waiting
}: {
  label: 'X' | 'O'; name: string; flag: string; rankTier: import('./data').RankTier
  score: number; isActive: boolean; isOpponent?: boolean; waiting?: boolean
}) {
  const isX = label === 'X'
  const accentColor = isX ? '#4f8ef7' : '#f74f5e'

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
        {isOpponent && isActive ? '…' : label}
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
          {isOpponent ? 'ĐỐI THỦ ĐANG ĐI...' : waiting ? 'ĐANG GỬI NƯỚC ĐI...' : '◀ LƯỢT CỦA BẠN'}
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

function reasonText(result: GameResult): string | null {
  switch (result.reason) {
    case 'SURRENDER':
      return result.iSurrendered ? 'Bạn đã đầu hàng' : 'Đối thủ đã đầu hàng'
    case 'DISCONNECT':
      return 'Đối thủ đã mất kết nối'
    default:
      return null
  }
}

function GameOverOverlay({ result, onPlayAgain, onHome }: {
  result: GameResult; onPlayAgain: () => void; onHome: () => void
}) {
  const { outcome, scores } = result
  const playerWin = outcome === 'win'
  const draw = outcome === 'draw'
  const reason = reasonText(result)
  return (
    <div className="fade-in absolute inset-0 flex items-center justify-center z-30 rounded-2xl"
      style={{ background: 'rgba(8,11,26,0.88)', backdropFilter: 'blur(8px)' }}>
      <div className="slide-up text-center px-8 py-10">
        <div className="text-6xl mb-3">{draw ? '🤝' : playerWin ? '🏆' : '😔'}</div>
        <h2 className="text-3xl font-black mb-1 tracking-widest"
          style={{ fontFamily: 'var(--font-display)', color: draw ? '#f7c04f' : playerWin ? '#4f8ef7' : '#f74f5e' }}>
          {draw ? 'HÒA!' : playerWin ? 'CHIẾN THẮNG!' : 'THUA CUỘC!'}
        </h2>
        <p className="text-lg mb-1" style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-mono)' }}>
          {scores[0]} – {scores[1]}
        </p>
        <p className="text-xs mb-6" style={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-mono)', minHeight: 16 }}>
          {reason ?? ''}
        </p>
        <div className="flex gap-3 justify-center">
          <button className="btn-primary px-6 py-2.5" onClick={onPlayAgain}>Tìm trận mới</button>
          <button className="btn-ghost px-6 py-2.5" onClick={onHome}>Trang chủ</button>
        </div>
      </div>
    </div>
  )
}

// ─── GamePage ─────────────────────────────────────────────────────────────────

interface GamePageProps {
  match: ActiveMatch
  user: UserProfile
  onBack: () => void
  onPlayAgain: () => void
}

type Timer = ReturnType<typeof setTimeout>

export default function GamePage({ match, user, onBack, onPlayAgain }: GamePageProps) {
  const boardSize = match.boardSize
  const myRole = match.role
  const opponentName = match.opponentDisplayName || match.opponentUsername

  const [state, setState] = useState<GameState>(() => initGame(boardSize, myRole))
  const [result, setResult] = useState<GameResult | null>(null)
  const [pending, setPending] = useState(false)        // đã gửi MAKE_MOVE, đang chờ server phản hồi
  const [leaving, setLeaving] = useState(false)        // đã gửi SURRENDER, đang chờ server
  const [confirmExit, setConfirmExit] = useState(false)
  const [linkLost, setLinkLost] = useState(wsService.getStatus() !== 'connected')
  const [notice, setNotice] = useState<string | null>(null)

  // Server gửi playedBy/nextTurn/winnerId là USER ID, không kèm role → suy ra id của người chơi 1
  // từ nước đi đầu tiên (người chơi 1 luôn đi trước).
  const p1IdRef = useRef<number | null>(null)
  const endedRef = useRef(false)
  const iSurrenderedRef = useRef(false)
  const gameOverRef = useRef<GameOverMsg | null>(null)
  const scoresRef = useRef<[number, number]>([0, 0])
  const pendingTimer = useRef<Timer | null>(null)
  const finishTimer = useRef<Timer | null>(null)
  const leaveTimer = useRef<Timer | null>(null)
  const noticeTimer = useRef<Timer | null>(null)
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack

  const clearTimer = (ref: { current: Timer | null }) => {
    if (ref.current) {
      clearTimeout(ref.current)
      ref.current = null
    }
  }

  const showNotice = (msg: string) => {
    setNotice(msg)
    clearTimer(noticeTimer)
    noticeTimer.current = setTimeout(() => setNotice(null), 2500)
  }

  // ✅ Nhận kết quả từ server
  useEffect(() => {
    const sideOfRole = (role: 1 | 2): 0 | 1 => (role === myRole ? 0 : 1)
    const mineFirst = (p1: number, p2: number): [number, number] =>
      myRole === 1 ? [p1, p2] : [p2, p1]
    const roleOfUser = (userId: number): 1 | 2 => {
      if (p1IdRef.current === null) p1IdRef.current = userId
      return userId === p1IdRef.current ? 1 : 2
    }

    const finish = (outcome: Outcome, scores: [number, number], reason: string) => {
      if (endedRef.current) return
      endedRef.current = true
      clearTimer(finishTimer)
      clearTimer(pendingTimer)
      clearTimer(leaveTimer)
      setPending(false)
      setConfirmExit(false)
      setResult({ outcome, scores, reason, iSurrendered: iSurrenderedRef.current })
    }

    const onMoveResult = (m: MoveResultMsg) => {
      clearTimer(pendingTimer)
      setPending(false)

      const mover = sideOfRole(roleOfUser(m.playedBy))
      const scores = mineFirst(m.p1Score, m.p2Score)
      scoresRef.current = scores
      const nextTurn: 0 | 1 | null =
        m.gameOver || m.nextTurn < 0 ? null : sideOfRole(roleOfUser(m.nextTurn))

      const edge = dotsToEdge(m.r1, m.c1, m.r2, m.c2)
      if (edge) {
        setState(prev => applyMove(prev, edge, m.completedBoxes, mover, scores, nextTurn))
      } else {
        console.error('MOVE_RESULT có cạnh không hợp lệ:', m)
      }

      if (m.gameOver) {
        finish(
          m.isDraw ? 'draw' : outcomeFromScores(scores),
          scores,
          gameOverRef.current?.reason ?? 'GAME_FINISHED'
        )
      }
    }

    const onInvalidMove = (reason: string) => {
      clearTimer(pendingTimer)
      setPending(false)
      showNotice(`⚠️ ${describeInvalidMove(reason)}`)
    }

    const onGameOver = (g: GameOverMsg) => {
      gameOverRef.current = g
      const scores = mineFirst(g.p1Score, g.p2Score)
      scoresRef.current = scores

      switch (g.reason) {
        case 'GAME_FINISHED':
          // Với ván kết thúc bình thường, server gửi GAME_OVER TRƯỚC MOVE_RESULT của nước cuối.
          // Đợi MOVE_RESULT đó để vẽ nốt cạnh/ô cuối rồi mới hiện kết quả (fallback sau 1.5s).
          clearTimer(finishTimer)
          finishTimer.current = setTimeout(
            () => finish(g.isDraw ? 'draw' : outcomeFromScores(scores), scores, g.reason),
            1500
          )
          break
        case 'SURRENDER':
          if (iSurrenderedRef.current) {
            // Mình chủ động thoát giữa trận → server xử thua → về trang chủ
            endedRef.current = true
            clearTimer(leaveTimer)
            onBackRef.current()
          } else {
            finish('win', scores, g.reason)
          }
          break
        case 'DISCONNECT':
          finish('win', scores, g.reason)
          break
        default:
          finish(g.isDraw ? 'draw' : outcomeFromScores(scores), scores, g.reason)
      }
    }

    const offMessage = wsService.subscribe((response) => {
      if (response?.type === 'disconnected' || response?.type === 'error') {
        setLinkLost(true)
        return
      }
      if (response?.type !== 'message') return

      const msg = splitServerMessage(response.data)
      if (!msg) return

      switch (msg.opcode) {
        case OP.MOVE_RESULT: {
          const m = parseMoveResult(msg.params)
          if (m) onMoveResult(m)
          else console.error('Không đọc được MOVE_RESULT:', msg.params)
          break
        }
        case OP.INVALID_MOVE:
          onInvalidMove(msg.params)
          break
        case OP.GAME_OVER: {
          const g = parseGameOver(msg.params)
          if (g) onGameOver(g)
          else console.error('Không đọc được GAME_OVER:', msg.params)
          break
        }
        case OP.OPPONENT_SURRENDER:
          finish('win', scoresRef.current, 'SURRENDER')
          break
        case OP.OPPONENT_DISCONNECT:
          finish('win', scoresRef.current, 'DISCONNECT')
          break
      }
    })

    // Mất kết nối tới bridge → phiên TCP của server cũng mất
    const offStatus = wsService.onStatusChange((s) => {
      if (s !== 'connected') setLinkLost(true)
    })

    return () => {
      offMessage()
      offStatus()
      clearTimer(pendingTimer)
      clearTimer(finishTimer)
      clearTimer(leaveTimer)
      clearTimer(noticeTimer)
    }
  }, [])

  const gameActive = !result && !leaving
  const canPlay = state.turn === 0 && gameActive && !pending && !linkLost

  // ✅ Người chơi chọn một cạnh → chỉ gửi MAKE_MOVE, chưa vẽ gì. Cạnh sẽ hiện khi server trả MOVE_RESULT.
  const handleEdge = (type: 'h' | 'v', r: number, c: number) => {
    if (!canPlay) return
    const [r1, c1, r2, c2] = edgeToDots({ type, r, c })
    wsService.sendMessage(msgMakeMove(r1, c1, r2, c2))
    setPending(true)
    clearTimer(pendingTimer)
    // Phòng trường hợp server không phản hồi: mở khóa sau 4s
    pendingTimer.current = setTimeout(() => setPending(false), 4000)
  }

  // ✅ Thoát giữa trận: xác nhận → gửi SURRENDER
  const handleExitClick = () => {
    if (result || linkLost) {
      onBack()
      return
    }
    if (leaving) return
    setConfirmExit(true)
  }

  const confirmLeave = () => {
    setConfirmExit(false)
    iSurrenderedRef.current = true
    setLeaving(true)
    wsService.sendMessage(msgSurrender())
    // Nếu server không phản hồi (vd. trận đã kết thúc từ trước) thì vẫn về trang chủ
    clearTimer(leaveTimer)
    leaveTimer.current = setTimeout(() => onBackRef.current(), 3000)
  }

  const totalBoxes = boardSize * boardSize
  const remaining = totalBoxes - state.scores[0] - state.scores[1]

  const statusText = linkLost
    ? '⚠️ Mất kết nối tới server'
    : leaving
      ? 'Đang rời trận...'
      : state.turn === 0
        ? pending ? 'Đang gửi nước đi...' : 'Lượt của bạn — hãy vẽ một cạnh!'
        : `${opponentName} đang chọn nước đi...`

  return (
    <div className="dot-grid min-h-screen flex flex-col" style={{ color: '#e8eaf6' }}>
      {/* Header */}
      <div className="glass border-b flex items-center gap-3 px-5 py-3" style={{ borderColor: 'rgba(79,142,247,0.15)' }}>
        <button className="icon-btn" onClick={handleExitClick} style={{ width: 36, height: 36 }} title="Thoát trận">
          ←
        </button>
        <h2 className="font-bold tracking-widest text-sm" style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.1em', fontSize: 15 }}>
          DOTS & BOXES — {boardSize}×{boardSize}
        </h2>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.35)' }}>
            {remaining} ô còn lại
          </span>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        {/* Score row */}
        <div className="flex items-center gap-6">
          <PlayerCard
            label="X" name={user.username} flag={user.flag} rankTier={user.rankTier}
            score={state.scores[0]} isActive={state.turn === 0 && gameActive}
            waiting={pending}
          />

          <div className="flex flex-col items-center gap-1 px-4">
            <span className="text-2xl font-black" style={{ fontFamily: 'var(--font-display)', color: 'rgba(255,255,255,0.15)' }}>VS</span>
            <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.3)' }}>
              {boardSize}×{boardSize}
            </span>
          </div>

          <PlayerCard
            label="O" name={opponentName} flag="👤" rankTier={match.opponentRankTier}
            score={state.scores[1]} isActive={state.turn === 1 && gameActive}
            isOpponent
          />
        </div>

        {/* Board */}
        <div className="relative">
          <GameBoard state={state} onEdge={handleEdge} canPlay={canPlay} />
          {result && (
            <GameOverOverlay result={result} onPlayAgain={onPlayAgain} onHome={onBack} />
          )}
        </div>

        {/* Status bar */}
        <div className="glass rounded-xl px-6 py-3 flex items-center gap-4"
          style={{ border: '1px solid rgba(255,255,255,0.07)', minWidth: 280 }}>
          {!result && (
            <>
              <div className="w-2.5 h-2.5 rounded-full pulse flex-shrink-0"
                style={{ background: linkLost ? '#f7c04f' : state.turn === 0 ? '#4f8ef7' : '#f74f5e' }} />
              <span className="text-sm flex-1" style={{ color: 'rgba(255,255,255,0.7)' }}>
                {statusText}
              </span>
            </>
          )}
          {result && (
            <span className="text-sm" style={{ color: '#f7c04f' }}>🏁 Trận đấu kết thúc</span>
          )}
          <button className="btn-ghost px-3 py-1 text-xs" onClick={handleExitClick}
            disabled={leaving}
            style={{ color: 'rgba(247,79,94,0.7)', borderColor: 'rgba(247,79,94,0.2)' }}>
            {result || linkLost ? 'Thoát' : 'Bỏ cuộc'}
          </button>
        </div>
      </div>

      {/* Confirm exit */}
      {confirmExit && !result && (
        <div className="fade-in fixed inset-0 flex items-center justify-center z-40"
          style={{ background: 'rgba(8,11,26,0.75)', backdropFilter: 'blur(6px)' }}>
          <div className="slide-up glass rounded-2xl px-8 py-7 text-center"
            style={{ border: '1px solid rgba(247,79,94,0.3)', maxWidth: 360 }}>
            <div className="text-4xl mb-2">🏳️</div>
            <h3 className="text-lg font-black mb-1 tracking-widest" style={{ fontFamily: 'var(--font-display)', color: '#f74f5e' }}>
              THOÁT TRẬN ĐẤU?
            </h3>
            <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Nếu thoát bây giờ bạn sẽ bị xử thua và đối thủ giành chiến thắng.
            </p>
            <div className="flex gap-3 justify-center">
              <button className="btn-primary px-5 py-2" onClick={() => setConfirmExit(false)}>Tiếp tục chơi</button>
              <button className="btn-ghost px-5 py-2" onClick={confirmLeave}
                style={{ color: 'rgba(247,79,94,0.85)', borderColor: 'rgba(247,79,94,0.35)' }}>
                Thoát & chịu thua
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notice (nước đi không hợp lệ...) */}
      {notice && (
        <div className="toast fixed bottom-8 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl text-sm font-medium z-50"
          style={{
            background: 'rgba(13,16,35,0.95)',
            border: '1px solid rgba(247,192,79,0.4)',
            color: '#f7c04f',
            backdropFilter: 'blur(8px)',
            whiteSpace: 'nowrap',
          }}>
          {notice}
        </div>
      )}

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