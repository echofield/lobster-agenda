import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Lobster Agenda',
  description: 'Studio planning for Roman & Lobster',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
