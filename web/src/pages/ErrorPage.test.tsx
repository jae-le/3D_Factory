import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ErrorPage } from './ErrorPage'

describe('ErrorPage', () => {
  it('404: 제목·코드·처음으로 링크', () => {
    render(<ErrorPage code="404" />)
    expect(screen.getByRole('heading', { name: '찾을 수 없습니다' })).toBeInTheDocument()
    expect(screen.getByText('404')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '처음으로' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull()
  })

  it('연결 끊김: 코드 숫자 없이 다시 시도 버튼', () => {
    const retry = vi.fn()
    render(<ErrorPage code="offline" onRetry={retry} />)
    expect(screen.getByRole('heading', { name: '서버에 연결할 수 없습니다' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('500·403 제목, detail 은 기본 설명을 대신함', () => {
    const { unmount } = render(<ErrorPage code="500" detail="설비 목록을 불러오지 못했습니다." />)
    expect(screen.getByRole('heading', { name: '서버에서 오류가 났습니다' })).toBeInTheDocument()
    expect(screen.getByText('설비 목록을 불러오지 못했습니다.')).toBeInTheDocument()
    unmount()
    render(<ErrorPage code="403" />)
    expect(screen.getByRole('heading', { name: '이 화면을 볼 권한이 없습니다' })).toBeInTheDocument()
  })
})
