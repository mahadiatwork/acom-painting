import { BottomNav } from '@/components/BottomNav'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted flex justify-center">
      <div className="w-full max-w-md bg-background min-h-screen shadow-xl flex flex-col relative">
        {children}
        <BottomNav />
      </div>
    </div>
  )
}



