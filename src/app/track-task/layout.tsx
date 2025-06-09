
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import '../globals.css'; // Assuming globals.css is in src/app
import { Toaster } from "@/components/ui/toaster";
import { Providers } from '@/components/providers'; // If session is needed, otherwise remove

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Lacak Progres Tugas - NotaryFlow',
  description: 'Lacak progres tugas notaris Anda menggunakan nomor pekerjaan.',
};

export default function TrackTaskLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <Providers> {/* SessionProvider might not be strictly needed if no session-dependent UI here, but good for consistency if header/footer is shared */}
      <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-background text-foreground">
        {children}
      </div>
      <Toaster />
    </Providers>
  );
}
