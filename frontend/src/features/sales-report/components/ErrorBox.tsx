interface Props {
  message: string | null
}

export function ErrorBox({ message }: Props) {
  if (!message) return null
  return <div className="error-box">{message}</div>
}
