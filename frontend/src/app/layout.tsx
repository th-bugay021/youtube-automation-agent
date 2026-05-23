import './globals.css';
import type { Metadata } from 'next';
import { Providers } from '@/providers/providers';

export const metadata: Metadata = {
  title: 'YouTube Automation',
  description: 'Semi-autonomous YouTube content management',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
