import type { Metadata, Viewport } from 'next';
import './globals.css';
import RegisterSW from '@/components/RegisterSW';

export const metadata: Metadata = {
  title: 'Family Hub',
  description: 'Our family dashboard and media request portal',
  applicationName: 'Family Hub',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: { capable: true, title: 'Family Hub', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#1B4F8A',
};

// Dark by default; a saved preference of "light" switches it before first paint.
const themeScript = `try{if(localStorage.getItem('fh-theme')!=='light')document.documentElement.classList.add('dark')}catch(e){document.documentElement.classList.add('dark')}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Older iOS versions still look for this tag */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-screen font-sans">
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
