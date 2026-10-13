'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  UploadCloud, 
  CheckCheck, 
  PieChart, 
  ReceiptText 
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

export function MobileNav() {
  const pathname = usePathname();

  const navItems: NavItem[] = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Dropzone', href: '/dropzone', icon: UploadCloud },
    { name: 'Review', href: '/review', icon: CheckCheck },
    { name: 'Budget', href: '/budget', icon: PieChart },
    { name: 'Ledger', href: '/transactions', icon: ReceiptText },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800 bg-zinc-950/85 backdrop-blur-xl px-2 py-2 safe-area-bottom">
      <div className="max-w-md mx-auto flex items-center justify-around">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all duration-200 text-xs font-medium relative group',
                isActive
                  ? 'text-emerald-400 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              )}
            >
              <div
                className={cn(
                  'p-1.5 rounded-lg transition-transform duration-200',
                  isActive ? 'bg-emerald-500/15 scale-110' : 'group-hover:bg-zinc-800/50'
                )}
              >
                <Icon className={cn('w-5 h-5', isActive ? 'text-emerald-400' : 'text-zinc-400')} />
              </div>
              <span className="mt-1 text-[11px] tracking-tight">{item.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
