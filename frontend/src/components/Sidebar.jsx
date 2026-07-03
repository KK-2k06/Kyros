// ============================================================
// Sidebar.jsx — Navigation between the 4 agents + logout
// ============================================================
import { useState, useEffect } from 'react'
import kyrosLogo from '../assets/kyros.png'
import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { 
  Menu, SquarePen, FolderClosed, Sparkles, SlidersHorizontal,
  MessageSquare, UserRound, LogOut, ChevronDown, Download
} from 'lucide-react'

export default function Sidebar() {
  const navigate = useNavigate()
  const [isCollapsed, setIsCollapsed] = useState(false)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const [sessions, setSessions] = useState([])

  useEffect(() => {
    const fetchSessions = async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (userData?.user) {
        const { data } = await supabase.from('sessions')
          .select('id, title')
          .eq('user_id', userData.user.id)
          .order('created_at', { ascending: false })
        if (data) setSessions(data)
      }
    }
    fetchSessions()
    
    // Listen for custom event when a new session is created or title updated
    const handleUpdate = () => fetchSessions()
    window.addEventListener('sessionsUpdated', handleUpdate)
    return () => window.removeEventListener('sessionsUpdated', handleUpdate)
  }, [])

  return (
    <div className={`${isCollapsed ? 'w-[68px]' : 'w-[260px]'} h-screen bg-[#f9f9f9] border-r border-[#e5e5e5] flex flex-col text-[14px] transition-all duration-300 flex-shrink-0 relative`}>
      
      {/* Top Header Icons */}
      <div className={`flex items-center ${isCollapsed ? 'justify-center flex-col gap-4 py-4' : 'justify-between px-4 py-3'} text-[#666]`}>
        <div className="flex items-center gap-3">
          <img src={kyrosLogo} alt="Kyros" className="h-10 w-10 object-contain" />
          {!isCollapsed && <span className="font-serif text-[18px] text-[#111] tracking-tight">Kyros</span>}
        </div>
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 rounded-md hover:bg-[#eaeaea] transition-colors"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Menu size={18} strokeWidth={1.5} />
        </button>
      </div>



      {/* New Session Button */}
      <div className={`mb-4 mt-2 ${isCollapsed ? 'px-2' : 'px-3'} whitespace-nowrap overflow-hidden`}>
        <button 
          onClick={() => window.location.href = '/agent1'}
          className={`w-full flex items-center ${isCollapsed ? 'justify-center p-2' : 'gap-2 px-3 py-2'} bg-[#ebebeb] hover:bg-[#e0e0e0] text-[#3d3d3d] rounded-lg transition-colors font-medium`}
        >
          <span className="text-lg leading-none mb-0.5">+</span>
          {!isCollapsed && "New session"}
        </button>
      </div>

      {/* Core Nav - Pipeline Phases */}
      <nav className={`space-y-0.5 mb-6 ${isCollapsed ? 'px-2' : 'px-3'} whitespace-nowrap overflow-hidden`}>
        <div 
          onClick={() => {
            const sid = new URLSearchParams(window.location.search).get('session_id')
            if (sid) window.location.href = `/agent1?session_id=${sid}`
            else navigate('/agent1')
          }}
          className={`flex items-center ${isCollapsed ? 'justify-center p-2' : 'gap-2.5 px-3 py-1.5'} ${window.location.pathname.includes('/agent1') ? 'text-[#3d3d3d] bg-[#ebebeb] font-medium' : 'text-[#888] hover:bg-[#ebebeb]'} rounded-lg cursor-pointer transition-colors`} 
          title="Phase 1: Gap Analysis"
        >
          <FolderClosed size={16} strokeWidth={1.5} />
          {!isCollapsed && <span>Gap Analysis</span>}
        </div>
        <div 
          onClick={() => {
            const sid = new URLSearchParams(window.location.search).get('session_id')
            if (sid) window.location.href = `/agent2?session_id=${sid}`
          }}
          className={`flex items-center ${isCollapsed ? 'justify-center p-2' : 'gap-2.5 px-3 py-1.5'} ${window.location.pathname.includes('/agent2') ? 'text-[#3d3d3d] bg-[#ebebeb] font-medium' : 'text-[#888] hover:bg-[#ebebeb]'} rounded-lg cursor-pointer transition-colors`} 
          title="Phase 2: Video Learning"
        >
          <Sparkles size={16} strokeWidth={1.5} />
          {!isCollapsed && <span>Video Learning</span>}
        </div>
        <div 
          onClick={() => {
            const sid = new URLSearchParams(window.location.search).get('session_id')
            if (sid) window.location.href = `/agent3?session_id=${sid}`
          }}
          className={`flex items-center ${isCollapsed ? 'justify-center p-2' : 'gap-2.5 px-3 py-1.5'} ${window.location.pathname.includes('/agent3') ? 'text-[#3d3d3d] bg-[#ebebeb] font-medium' : 'text-[#888] hover:bg-[#ebebeb]'} rounded-lg cursor-pointer transition-colors`} 
          title="Phase 3: Deep Dive"
        >
          <SlidersHorizontal size={16} strokeWidth={1.5} />
          {!isCollapsed && <span>Deep Dive</span>}
        </div>
        <div 
          onClick={() => {
            const sid = new URLSearchParams(window.location.search).get('session_id')
            if (sid) window.location.href = `/test?session_id=${sid}`
          }}
          className={`flex items-center ${isCollapsed ? 'justify-center p-2' : 'gap-2.5 px-3 py-1.5'} ${window.location.pathname.includes('/test') ? 'text-[#3d3d3d] bg-[#ebebeb] font-medium' : 'text-[#888] hover:bg-[#ebebeb]'} rounded-lg cursor-pointer transition-colors`} 
          title="Phase 4: Mock Interview"
        >
          <MessageSquare size={16} strokeWidth={1.5} />
          {!isCollapsed && <span>Mock Interview</span>}
        </div>
      </nav>

      {/* Recents Section */}
      <div className={`flex-1 overflow-y-auto ${isCollapsed ? 'hidden' : 'px-3 whitespace-nowrap'}`}>
        <div className="flex items-center justify-between px-3 mb-2">
          <h3 className="text-[11px] font-semibold text-[#888] uppercase tracking-wider">Recents</h3>
          <button 
            onClick={() => navigate('/chats')}
            className="text-[11px] text-[#888] hover:text-[#3d3d3d] transition-colors flex items-center gap-0.5"
          >
            View all
          </button>
        </div>
        <div className="space-y-0.5">
          {sessions.map((session) => {
            const isActive = session.id === new URLSearchParams(window.location.search).get('session_id')
            const currentPath = window.location.pathname === '/chats' ? '/agent1' : window.location.pathname
            return (
              <div 
                key={session.id} 
                onClick={() => window.location.href = `${currentPath}?session_id=${session.id}`}
                className={`px-3 py-1.5 text-[13px] rounded-lg cursor-pointer truncate transition-colors ${
                  isActive 
                    ? 'bg-[#ebebeb] text-[#111] font-medium' 
                    : 'text-[#555] hover:bg-[#ebebeb]'
                }`}
              >
                {session.title}
              </div>
            )
          })}
        </div>
      </div>

      {/* Bottom Profile / Logout */}
      <div className={`mt-auto ${isCollapsed ? 'p-2' : 'p-3'} whitespace-nowrap overflow-hidden`}>
        <button 
          onClick={handleLogout}
          className={`w-full flex items-center ${isCollapsed ? 'justify-center p-2' : 'justify-between p-2'} rounded-xl border border-[#e5e5e5] bg-white hover:bg-[#fafafa] shadow-sm transition-colors text-[#3d3d3d]`}
          title="Log Out"
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-[#e5e5e5] flex items-center justify-center text-xs font-medium text-gray-600">
              U
            </div>
            {!isCollapsed && <div className="text-sm font-medium">User</div>}
          </div>
          {!isCollapsed && <LogOut size={14} strokeWidth={1.5} className="text-[#888]" />}
        </button>
      </div>
    </div>
  )
}
