import { redirect } from 'next/navigation'

export default function AdminRoot() {
  const churchId = process.env.NEXT_PUBLIC_CHURCH_ID
  if (!churchId) redirect('/')
  redirect(`/admin/${churchId}`)
}
