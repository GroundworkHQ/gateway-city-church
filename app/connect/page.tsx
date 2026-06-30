import { redirect } from 'next/navigation'

export default function ConnectRoot() {
  const churchId = process.env.NEXT_PUBLIC_CHURCH_ID
  if (!churchId) redirect('/')
  redirect(`/visit/${churchId}`)
}
