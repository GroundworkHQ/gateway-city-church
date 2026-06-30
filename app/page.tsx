import { redirect } from 'next/navigation'

export default function Home() {
  const churchId = process.env.NEXT_PUBLIC_CHURCH_ID
  if (!churchId) redirect('/admin')
  redirect(`/admin/${churchId}`)
}
