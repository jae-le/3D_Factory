/** 화면 아래 가운데 상태 태그 (편집 격자 칸 수 · 배치 모드 안내) */
export function EditTag({ text }: { text: string }) {
  return (
    <p className="edit-tag" role="status">
      {text}
    </p>
  )
}
