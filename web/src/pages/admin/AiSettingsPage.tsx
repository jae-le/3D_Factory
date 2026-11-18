import { KeyRound, PlugZap, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { deleteAiKey, getAiSettings, getGeminiModels, saveAiSettings, setAiKey, testAi } from '../../ai/api'
import { AI_MODELS, type AiModel, type AiSettings, type AiTestResult } from '../../ai/types'
import { Modal } from '../../components/Modal'
import { when } from './format'

/** 관리자 › AI API 관리: 키(암호화 저장 · 힌트만 보임) · 연결 테스트 · 모델 · 월 한도 · 사용 여부 */
export function AiSettingsPage() {
  const [s, setS] = useState<AiSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [key, setKey] = useState('')
  const [keyError, setKeyError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [test, setTest] = useState<AiTestResult | 'running' | null>(null)
  const [form, setForm] = useState<{ model: AiModel; limit: string; enabled: boolean; daily: string }>({ model: 'claude-opus-5-5', limit: '50', enabled: false, daily: '500' })
  const [saved, setSaved] = useState<string | null>(null)
  const [gemini, setGemini] = useState<{ id: string; label: string }[]>([])
  const [geminiMsg, setGeminiMsg] = useState<string | null>(null)
  const loadGemini = () => {
    setGeminiMsg('불러오는 중…')
    getGeminiModels()
      .then((l) => {
        setGemini(l)
        setGeminiMsg(l.length ? `Gemini 모델 ${l.length}개를 불러왔습니다` : '쓸 수 있는 Gemini 모델이 없습니다 (Gemini 키인지 확인하세요)')
      })
      .catch((e: Error) => setGeminiMsg(e.message))
  }
  const options = [...AI_MODELS.map((m) => ({ id: m.id, label: m.label })), ...gemini.filter((g) => !AI_MODELS.some((m) => m.id === g.id)).map((g) => ({ id: g.id, label: `${g.label} (${g.id})` }))]
  const take = (v: AiSettings) => {
    setS(v)
    setForm({ model: v.model, limit: String(v.monthlyLimitUsd), enabled: v.enabled, daily: String(v.geminiDailyLimit) })
  }
  useEffect(() => {
    getAiSettings().then(take).catch((e: Error) => setError(e.message))
  }, [])

  const register = (e: FormEvent) => {
    e.preventDefault()
    setKeyError(null)
    setAiKey(key.trim())
      .then((v) => {
        take(v)
        setKey('')
        setTest(null)
      })
      .catch((err: Error) => setKeyError(err.message))
  }
  const remove = () =>
    deleteAiKey()
      .then((v) => {
        take(v)
        setDeleting(false)
        setTest(null)
      })
      .catch((err: Error) => setKeyError(err.message))
  const runTest = () => {
    setTest('running')
    testAi().then(setTest).catch((err: Error) => setTest({ ok: false, model: null, latencyMs: null, message: err.message }))
  }
  const save = (e: FormEvent) => {
    e.preventDefault()
    setSaved(null)
    const limit = Number(form.limit)
    if (!form.limit.trim() || !Number.isFinite(limit) || limit < 0) return setError('월 한도는 0 이상 USD 로 입력하세요.')
    const daily = Number(form.daily)
    if (!form.daily.trim() || !Number.isInteger(daily) || daily < 0) return setError('Gemini 하루 한도는 0 이상 정수로 입력하세요.')
    setError(null)
    saveAiSettings({ model: form.model, monthlyLimitUsd: limit, enabled: form.enabled, geminiDailyLimit: daily })
      .then((v) => {
        take(v)
        setSaved('저장했습니다.')
      })
      .catch((err: Error) => setError(err.message))
  }

  if (!s) return <section className="kp-card kp-section" aria-label="AI API 관리">{error ? <p className="kp-error-text">{error}</p> : <p className="kp-desc">불러오는 중…</p>}</section>
  const price = AI_MODELS.find((m) => m.id === form.model)?.price
  return (
    <section className="kp-card kp-section" aria-label="AI API 관리">
      <div className="kp-section-head">
        <div>
          <h2>AI API 관리</h2>
          <p className="kp-desc">AI 챗봇이 쓰는 API 키와 모델·월 한도입니다. Claude 키(sk-ant-…) 또는 Gemini 키(AIza…, Google AI Studio)를 넣고, 모델을 키에 맞게 고르세요. 키는 서버에 암호화해 저장하고 화면에는 끝 4자리만 보입니다.</p>
        </div>
      </div>
      {!s.masterKey && (
        <p className="kp-error-text ai-warn" role="alert">
          F3D_AI_MASTER_KEY 가 설정되지 않아 키를 저장할 수 없습니다
        </p>
      )}

      <h3 className="ai-sub">API 키</h3>
      <p className="ai-key-state">
        <KeyRound size={14} aria-hidden /> <span className={s.hasKey ? 'kp-state ok' : 'kp-state off'}>{s.hasKey ? `등록됨 ${s.keyHint ?? ''}` : '미등록'}</span>
      </p>
      <form className="kp-filter" onSubmit={register}>
        <label className="kp-field">
          <span>API 키</span>
          <input className="kp-input ai-key" type="password" autoComplete="off" placeholder="sk-ant-… 또는 AIza…" value={key} onChange={(e) => setKey(e.target.value)} />
        </label>
        <button className="kp-btn kp-btn-primary kp-btn-sm" type="submit" disabled={!s.masterKey || !key.trim()}>
          등록
        </button>
        {s.hasKey && (
          <button className="kp-btn kp-btn-text kp-btn-sm" type="button" onClick={() => setDeleting(true)}>
            <Trash2 size={14} aria-hidden /> 키 삭제
          </button>
        )}
        <button className="kp-btn kp-btn-stroke kp-btn-sm" type="button" disabled={!s.hasKey || test === 'running'} onClick={runTest}>
          <PlugZap size={14} aria-hidden /> 연결 테스트
        </button>
      </form>
      {keyError && <p className="kp-error-text">{keyError}</p>}
      {test === 'running' && <p className="kp-desc">연결 확인 중…</p>}
      {test && test !== 'running' && (
        <p className={test.ok ? 'kp-state ok' : 'kp-state bad'}>{test.ok ? `연결됨 · ${test.model} · ${test.latencyMs} ms` : `연결 실패: ${test.message}`}</p>
      )}

      <h3 className="ai-sub">사용 설정</h3>
      <form className="kp-form ai-settings" onSubmit={save}>
        <label className="kp-field">
          <span>모델</span>
          <select className="kp-input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value as AiModel })}>
            {options.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
            {!options.some((m) => m.id === form.model) && <option value={form.model}>{form.model}</option>}
          </select>
        </label>
        <span className="kp-help">
          <button className="kp-btn kp-btn-stroke kp-btn-sm" type="button" disabled={!s?.hasKey} onClick={loadGemini}>
            Gemini 모델 불러오기
          </button>{' '}
          {geminiMsg ?? 'Gemini 키를 저장한 뒤 누르면, 이 키로 쓸 수 있는 모델을 Google 에서 받아 목록에 넣습니다.'}
        </span>
        <span className="kp-help">{price}</span>
        {form.model.startsWith('gemini-') && (
          <>
            <label className="kp-field">
              <span>Gemini 하루 요청 한도 (RPD)</span>
              <input className="kp-input" type="number" min={0} step={1} value={form.daily} onChange={(e) => setForm({ ...form, daily: e.target.value })} />
            </label>
            <span className="kp-help">
              {s?.geminiToday != null && s.model === form.model ? `오늘 ${s.geminiToday} / ${s.geminiDailyLimit}회 사용 · ` : ''}
              무료 등급의 모델별 하루 한도입니다 (AI Studio › 비율 제한의 RPD). 미국 태평양 시간 자정(한국 오후 4~5시)에 초기화되고, 닿으면 챗봇이 멈춥니다. 질문 하나에 도구를 쓰면 여러 번 셉니다.
            </span>
          </>
        )}
        <label className="kp-field">
          <span>월 한도 (USD)</span>
          <input className="kp-input" type="number" min={0} step="0.01" value={form.limit} onChange={(e) => setForm({ ...form, limit: e.target.value })} />
        </label>
        <label className="ai-check">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
          AI 챗봇 사용
        </label>
        {error && <p className="kp-error-text">{error}</p>}
        {saved && <p className="kp-state ok">{saved}</p>}
        <div>
          <button className="kp-btn kp-btn-primary kp-btn-sm" type="submit">
            저장
          </button>
        </div>
        <p className="kp-help">마지막 변경: {s.updatedBy ?? '—'} · {when(s.updatedAt)}</p>
      </form>

      {deleting && (
        <Modal title="AI API 키 삭제" onClose={() => setDeleting(false)}>
          <p className="kp-desc">키를 지우면 AI 챗봇을 쓸 수 없습니다. 지울까요?</p>
          <div className="kp-modal-actions">
            <button className="kp-btn kp-btn-text kp-btn-sm" onClick={() => setDeleting(false)}>
              닫기
            </button>
            <button className="kp-btn kp-btn-primary kp-btn-sm" onClick={() => void remove()}>
              삭제
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
}
