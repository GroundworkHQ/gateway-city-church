'use client'

import { useParams, useRouter } from 'next/navigation'
import VisitorDetail from '../../VisitorDetail'

export default function VisitorProfilePage() {
  const { churchId, visitorId } = useParams() as { churchId: string; visitorId: string }
  const router = useRouter()

  return (
    <div className="h-screen bg-[#0D1B2A] text-white flex flex-col">
      <div className="border-b border-white/10 px-6 py-3 flex-shrink-0">
        <span className="text-[#B8832A] font-serif">✝ Gateway City Church</span>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <VisitorDetail
          visitorId={visitorId}
          churchId={churchId}
          onBack={() => router.push(`/admin/${churchId}`)}
          onDelete={() => router.push(`/admin/${churchId}`)}
        />
      </div>
    </div>
  )
}
