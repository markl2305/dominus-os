import './globals.css'
import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import localFont from 'next/font/local'

const inter = localFont({
  variable: '--font-inter',
  display: 'swap',
  src: [
    { path: '../../public/fonts/Inter-100.ttf', weight: '100', style: 'normal' },
    { path: '../../public/fonts/Inter-200.ttf', weight: '200', style: 'normal' },
    { path: '../../public/fonts/Inter-300.ttf', weight: '300', style: 'normal' },
    { path: '../../public/fonts/Inter-400.ttf', weight: '400', style: 'normal' },
    { path: '../../public/fonts/Inter-500.ttf', weight: '500', style: 'normal' },
    { path: '../../public/fonts/Inter-600.ttf', weight: '600', style: 'normal' },
    { path: '../../public/fonts/Inter-700.ttf', weight: '700', style: 'normal' },
    { path: '../../public/fonts/Inter-800.ttf', weight: '800', style: 'normal' },
    { path: '../../public/fonts/Inter-900.ttf', weight: '900', style: 'normal' }
  ]
})

export const metadata: Metadata = {
  title: 'Dominus OS — Human-Governed Operating System',
  description: 'Dominus OS is a Human-Governed Operating System. Run AI as accountable processes. See everything. Stop everything. Keep authority human.',
  openGraph: {
    title: 'Dominus OS — Human-Governed Operating System',
    description: 'Run AI as accountable processes. See everything. Stop everything. Keep authority human.',
    url: 'https://dominusos.ai',
  },
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className={`${inter.variable} bg-background text-foreground`}>{children}</body>
    </html>
  )
}
