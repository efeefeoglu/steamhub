import type { Metadata } from 'next'; import './globals.css';
export const metadata: Metadata = { title: 'Steam Scout — Turn Steam pages into data', description: 'Discover, enrich, filter and export Steam game data.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
