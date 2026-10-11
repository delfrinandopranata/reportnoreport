import type { ReactNode } from 'react'
import { Wordmark } from '../ui/Wordmark'

/** The signed-out page: wordmark above one paper card. */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen grid place-items-center p-4 sm:p-6">
      <div className="w-full max-w-[440px] flex flex-col items-center gap-6">
        <Wordmark size="lg" />
        {children}
      </div>
    </main>
  )
}
