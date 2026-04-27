import { useQuery } from '@tanstack/react-query'
import { getJson, type VersionInfo } from '@/api/client'

export function VersionFooter() {
  const { data } = useQuery({
    queryKey: ['version'],
    queryFn: () => getJson<VersionInfo>('/api/version'),
  })

  if (!data) return null

  return (
    <footer className="version-footer">
      <code>{data.version}</code>
      <span className="vm">·</span>
      <span>started {data.started_at.replace('T', ' ')}</span>
    </footer>
  )
}
