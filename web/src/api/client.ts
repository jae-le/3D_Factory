/** 서버 API 호출 실패 — 화면은 kind 로 어떤 오류 페이지·안내를 보일지 정한다 */
export type ApiErrorKind =
  | 'notFound'
  | 'server'
  | 'network'
  | 'unauthorized'
  | 'forbidden'
  | 'locked'
  | 'conflict'
  | 'badRequest'
  | 'other'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number | null
  constructor(kind: ApiErrorKind, status: number | null, message: string) {
    super(message)
    this.kind = kind
    this.status = status
  }
}

// 502·503·504 는 서버가 꺼졌거나 중간(프록시)에서 끊긴 것 → 연결 끊김으로 봄
const UNREACHABLE = new Set([502, 503, 504])
const KIND: Record<number, ApiErrorKind> = {
  400: 'badRequest',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'notFound',
  409: 'conflict',
  423: 'locked',
}

/** 로그인이 풀렸음을 화면 전체에 알림 (AuthProvider 가 듣고 로그인 화면으로) */
export const UNAUTHORIZED_EVENT = 'f3d:unauthorized'

async function handle<T>(url: string, send: () => Promise<Response>, read: (r: Response) => Promise<T> = (r) => r.json() as Promise<T>): Promise<T> {
  let r: Response
  try {
    r = await send()
  } catch {
    throw new ApiError('network', null, '서버에 연결할 수 없습니다.')
  }
  if (r.ok) return (r.status === 204 ? undefined : await read(r)) as T
  const body = (await r.json().catch(() => null)) as { detail?: string } | null
  const kind: ApiErrorKind = UNREACHABLE.has(r.status)
    ? 'network'
    : (KIND[r.status] ?? (r.status >= 500 ? 'server' : 'other'))
  if (kind === 'unauthorized' && !url.startsWith('/api/auth/')) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
  throw new ApiError(kind, r.status, body?.detail ?? `요청 실패 (${r.status})`)
}

/** 응답 코드·본문 → ApiError (XMLHttpRequest 업로드처럼 fetch 를 안 쓰는 곳에서) */
export function apiErrorOf(status: number, detail: string | undefined): ApiError {
  const kind: ApiErrorKind = UNREACHABLE.has(status) ? 'network' : (KIND[status] ?? (status >= 500 ? 'server' : 'other'))
  if (kind === 'unauthorized') window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
  return new ApiError(kind, status, detail ?? `요청 실패 (${status})`)
}

export function apiJson<T>(url: string): Promise<T> {
  return handle<T>(url, () => fetch(url))
}

/** 파일 바이트 받기 (도면 원본) */
export function apiBuffer(url: string): Promise<ArrayBuffer> {
  return handle<ArrayBuffer>(url, () => fetch(url), (r) => r.arrayBuffer())
}

/** 쿠키 XSRF-TOKEN (서버가 응답마다 내려줌) — 바꾸는 요청에 머리 X-XSRF-TOKEN 으로 */
export function csrfToken(): string {
  const m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/)
  return m ? decodeURIComponent(m[1]) : ''
}

/** 파일을 담은 폼(multipart) 보내기 — Content-Type 은 브라우저가 경계값과 함께 붙임 */
export function apiSendForm<T>(method: 'POST' | 'PUT', url: string, body: FormData): Promise<T> {
  return handle<T>(url, () => fetch(url, { method, headers: { 'X-XSRF-TOKEN': csrfToken() }, body }))
}

export function apiSend<T>(method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, body?: unknown): Promise<T> {
  return handle<T>(url, () =>
    fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': csrfToken() },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  )
}
