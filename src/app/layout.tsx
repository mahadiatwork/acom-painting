import { Inter, Montserrat } from 'next/font/google'
import { Providers } from './providers'
import './globals.css'

const inter = Inter({ 
  subsets: ['latin'], 
  variable: '--font-sans',
  display: 'swap',
})

const montserrat = Montserrat({ 
  subsets: ['latin'], 
  variable: '--font-heading',
  display: 'swap',
})

export const metadata = {
  title: 'Roof Worx - Field Time Entry',
  description: 'Field time tracking application for Roof Worx crews.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${inter.variable} ${montserrat.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

