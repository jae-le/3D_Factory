/** AI 챗봇 · 변경 이력 · Claude API 관리 (서버 응답 모양) */
export type AiReason = 'no-master-key' | 'no-key' | 'disabled' | 'over-limit'
export interface AiStatus { enabled: boolean; reason: AiReason | null }
export const REASON_TEXT: Record<AiReason, string> = {
  'no-master-key': '서버에 F3D_AI_MASTER_KEY 가 설정되지 않았습니다',
  'no-key': 'Claude API 키가 등록되지 않았습니다 (관리자 › Claude API 관리)',
  disabled: 'AI 챗봇이 사용 중지되어 있습니다 (관리자 › Claude API 관리)',
  'over-limit': '이번 달 AI 사용 한도를 넘었습니다',
}

export type ChangeKind =
  | 'placement.move' | 'placement.rotate' | 'placement.rename' | 'placement.update' | 'placement.add' | 'placement.delete'
  | 'station.update' | 'plan.partition.add' | 'plan.partition.delete' | 'plan.zone.rename'
export interface PlacementSnap { id?: number; name: string; modelId?: number | null; x: number; y: number; rot: number; hintLabel?: string }
export interface PartitionSnap { id: string; pts: [number, number][]; h: number; t: number }
export interface ProposalItem { seq: number; kind: ChangeKind; target: string; targetKey: string; before: unknown; after: unknown; label: string }
export interface Proposal { id: string; items: ProposalItem[] }
export interface Skip { seq: number; reason: string }
export interface ApplyResult { batchId: string; drawingId: number; applied: number; skipped: Skip[] }
export interface ChatUsage { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; costUsd: number }
export type ChatEvent =
  | { type: 'text'; t: string }
  | { type: 'tool'; name: string; label: string }
  | { type: 'proposal'; proposal: Proposal }
  | { type: 'done'; usage: ChatUsage }
  | { type: 'error'; message: string }

export type AiModel = 'claude-opus-5-5' | 'claude-sonnet-5-5' | 'claude-haiku-5-5'
/** 관리자 모델 고르기 (가격 USD / 1M 토큰: 입력 · 출력) */
export const AI_MODELS: { id: AiModel; label: string; price: string }[] = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', price: '입력 $4 · 출력 $20 / 1M 토큰' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', price: '입력 $2 · 출력 $10 / 1M 토큰' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', price: '입력 $0.10 · 출력 $0.50 / 1M 토큰' },
]
export interface AiSettings { hasKey: boolean; keyHint: string | null; model: AiModel; monthlyLimitUsd: number; enabled: boolean; masterKey: boolean; updatedBy: string | null; updatedAt: string }
export interface AiTestResult { ok: boolean; model: string | null; latencyMs: number | null; message: string | null }
export interface UsageRow { key: string; calls: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; costUsd: number }
export interface UsageReport { month: UsageRow; limitUsd: number; rows: UsageRow[]; from: string; to: string; group: 'day' | 'user' }
export interface ChangeEntry {
  id: number; at: string; username: string | null; source: 'USER' | 'AI'; drawingId: number; drawingName: string; batchId: string
  kind: ChangeKind; target: string | null; before: unknown; after: unknown; reverted: boolean; revertedBy: string | null; revertedAt: string | null
}
export interface ChangePage { items: ChangeEntry[]; total: number; page: number; size: number }
