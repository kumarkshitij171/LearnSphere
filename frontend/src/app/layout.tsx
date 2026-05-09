import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Navbar } from '@/components/layout/navbar';
import { Toaster } from 'sonner';
import { ReduxProvider } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: 'LMS — Learn Anything',
    description: 'A modern learning management system',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body className={inter.className}>
                <ReduxProvider>
                    <Navbar />
                    <main>{children}</main>
                    <Toaster position="top-right" richColors />
                </ReduxProvider>
            </body>
        </html>
    );
}
