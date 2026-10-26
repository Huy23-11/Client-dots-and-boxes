// ─── Shared Types & Data ─────────────────────────────────────────────────────

export type BoardSize = 3 | 4 | 5
export type Page = 'auth' | 'home' | 'chat' | 'game' | 'create-room'
export type RankTier = 'Đồng' | 'Bạc' | 'Vàng' | 'Bạch Kim' | 'Kim Cương' | 'Thách Đấu'
export type PlayerStatus = 'idle' | 'playing' | 'offline'

export interface UserProfile {
  username: string
  money: number
  rankPoints: number
  rankTier: RankTier
  nationality: string
  flag: string
  gamesPlayed: number
  gamesWon: number
  initials: string
  status: PlayerStatus
}

export interface OnlinePlayer {
  username: string
  status: 'idle' | 'playing'
  rankTier: RankTier
  flag: string
}

export interface OfflinePlayer {
  username: string
  flag: string
  rankTier: RankTier
  lastSeen: string
}

export interface LeaderboardEntry {
  userId?: number
  rank: number
  username: string
  flag: string
  rankTier: RankTier
  wins: number
  rankPoints: number
  isSelf?: boolean
}

export interface ChatMsg {
  id: number
  user: string
  text: string
  time: string
  flag: string
  isSelf?: boolean
}

export interface BoardSizeOption {
  n: BoardSize
  label: string
  desc: string
  duration: string
  boxes: string
}

// ─── Board Size Options ───────────────────────────────────────────────────────

export const BOARD_SIZE_OPTIONS: BoardSizeOption[] = [
  { n: 3, label: '3×3', desc: 'Nhỏ',   duration: '~5 phút',  boxes: '9 ô'  },
  { n: 4, label: '4×4', desc: 'Chuẩn', duration: '~15 phút', boxes: '16 ô' },
  { n: 5, label: '5×5', desc: 'Lớn',   duration: '~30 phút', boxes: '25 ô' },
]

// ─── Mock Data ────────────────────────────────────────────────────────────────

export const MOCK_USER: UserProfile = {
  username: 'QuangHuy99',
  money: 5250,
  rankPoints: 3420,
  rankTier: 'Bạch Kim',
  nationality: 'Việt Nam',
  flag: '🇻🇳',
  gamesPlayed: 147,
  gamesWon: 89,
  initials: 'QH',
  status: 'idle',
}

export const ONLINE_PLAYERS: OnlinePlayer[] = [
  { username: 'DragonMaster', status: 'idle',    rankTier: 'Kim Cương', flag: '🇻🇳' },
  { username: 'NightWolf',    status: 'playing',  rankTier: 'Thách Đấu', flag: '🇰🇷' },
  { username: 'BlueRaven',    status: 'idle',    rankTier: 'Kim Cương', flag: '🇺🇸' },
  { username: 'StarFox88',    status: 'playing',  rankTier: 'Vàng',      flag: '🇯🇵' },
  { username: 'ShadowFist',   status: 'idle',    rankTier: 'Vàng',      flag: '🇹🇭' },
  { username: 'TigerKing',    status: 'playing',  rankTier: 'Bạc',       flag: '🇨🇳' },
  { username: 'IronWing',     status: 'idle',    rankTier: 'Đồng',      flag: '🇵🇭' },
  { username: 'VortexX',      status: 'playing',  rankTier: 'Kim Cương', flag: '🇻🇳' },
]

export const OFFLINE_PLAYERS: OfflinePlayer[] = [
  { username: 'SilverBolt', flag: '🇯🇵', rankTier: 'Bạc',       lastSeen: '2 giờ trước'  },
  { username: 'RedPhoenix', flag: '🇨🇳', rankTier: 'Vàng',      lastSeen: '5 giờ trước'  },
  { username: 'GreenArrow', flag: '🇹🇭', rankTier: 'Đồng',      lastSeen: 'Hôm qua'      },
  { username: 'TechWizard', flag: '🇸🇬', rankTier: 'Bạch Kim',  lastSeen: 'Hôm qua'      },
  { username: 'IceQueen',   flag: '🇻🇳', rankTier: 'Kim Cương', lastSeen: '2 ngày trước' },
]

export const LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, username: 'NightWolf',    flag: '🇰🇷', rankTier: 'Thách Đấu', wins: 312, rankPoints: 5870 },
  { rank: 2, username: 'DragonMaster', flag: '🇻🇳', rankTier: 'Thách Đấu', wins: 289, rankPoints: 5620 },
  { rank: 3, username: 'BlueRaven',    flag: '🇺🇸', rankTier: 'Kim Cương', wins: 241, rankPoints: 4980 },
  { rank: 4, username: 'VortexX',      flag: '🇻🇳', rankTier: 'Kim Cương', wins: 198, rankPoints: 4450 },
  { rank: 5, username: 'QuangHuy99',   flag: '🇻🇳', rankTier: 'Bạch Kim',  wins: 89,  rankPoints: 3420, isSelf: true },
  { rank: 6, username: 'ShadowFist',   flag: '🇹🇭', rankTier: 'Vàng',      wins: 76,  rankPoints: 2840 },
  { rank: 7, username: 'StarFox88',    flag: '🇯🇵', rankTier: 'Vàng',      wins: 54,  rankPoints: 2210 },
]

export const INITIAL_MESSAGES: ChatMsg[] = [
  { id: 1, user: 'DragonMaster', text: 'Ai muốn đấu không? Tôi đang rảnh 😈', time: '10:28', flag: '🇻🇳' },
  { id: 2, user: 'BlueRaven',    text: 'Chơi nào! Ghép ngẫu nhiên hay tạo phòng?',     time: '10:29', flag: '🇺🇸' },
  { id: 3, user: 'NightWolf',    text: 'Dots & Boxes siêu hay, nghiện rồi 🔥',          time: '10:30', flag: '🇰🇷' },
  { id: 4, user: 'ShadowFist',   text: 'Tip: chừa cạnh cuối hộp cho đối thủ 😂',       time: '10:33', flag: '🇹🇭' },
  { id: 5, user: 'NightWolf',    text: 'GG! Tôi vừa thắng 5 trận liên tiếp ⚡',        time: '10:35', flag: '🇰🇷' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function rankClass(tier: RankTier): string {
  const map: Record<RankTier, string> = {
    'Đồng': 'rank-bronze', 'Bạc': 'rank-silver', 'Vàng': 'rank-gold',
    'Bạch Kim': 'rank-platinum', 'Kim Cương': 'rank-diamond', 'Thách Đấu': 'rank-master',
  }
  return map[tier]
}

export function rankIcon(tier: RankTier): string {
  const map: Record<RankTier, string> = {
    'Đồng': '🥉', 'Bạc': '🥈', 'Vàng': '🥇',
    'Bạch Kim': '💠', 'Kim Cương': '💎', 'Thách Đấu': '⚡',
  }
  return map[tier]
}

export function rankColor(tier: RankTier): string {
  const map: Record<RankTier, string> = {
    'Đồng': '#cd7f32', 'Bạc': '#b0b8c8', 'Vàng': '#fbbf24',
    'Bạch Kim': '#8ec8e8', 'Kim Cương': '#6ee7f7', 'Thách Đấu': '#f97316',
  }
  return map[tier]
}

export function getWinRate(played: number, won: number): string {
  if (played === 0) return '0%'
  return `${Math.round((won / played) * 100)}%`
}

export function now(): string {
  const d = new Date()
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

export function playerColor(p: OnlinePlayer | OfflinePlayer): string {
  return rankColor(p.rankTier)
}
