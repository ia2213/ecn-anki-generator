import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await getServerSession()
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  // @ts-ignore
  const accessToken = session.access_token
  if (!accessToken) return NextResponse.json({ error: 'Token Google manquant' }, { status: 401 })
  const res = await fetch(
    'https://www.googleapis.com/drive/v3/files?q=mimeType%3D%22application%2Fpdf%22&fields=files(id,name,size,modifiedTime)&orderBy=modifiedTime+desc&pageSize=50',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  return NextResponse.json(await res.json())
}
