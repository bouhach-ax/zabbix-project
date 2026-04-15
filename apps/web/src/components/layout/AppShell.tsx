import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'

/**
 * Main application layout wrapping all authenticated pages.
 * Structure:
 * - Fixed sidebar on the left (collapsed: 64px, expanded: 256px)
 * - Top bar at the top of the content area
 * - Main content area (scrollable)
 * Dark mode enabled by default.
 */
function AppShell() {
  return (
    <div className="dark flex h-screen bg-gray-50 font-ui dark:bg-brand-dark">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export { AppShell }
