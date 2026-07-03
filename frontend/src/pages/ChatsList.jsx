import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { Search } from 'lucide-react'

export default function ChatsList() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [isDeleting, setIsDeleting] = useState(false)

  const fetchSessions = async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (userData?.user) {
      const { data } = await supabase.from('sessions')
        .select('id, title, created_at')
        .eq('user_id', userData.user.id)
        .order('created_at', { ascending: false })
      if (data) setSessions(data)
    }
  }

  useEffect(() => {
    fetchSessions()
  }, [])

  // Functional Search Filter!
  const filteredSessions = sessions.filter(session => 
    session.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleSelectAll = () => {
    if (selectedIds.length === filteredSessions.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredSessions.map(s => s.id))
    }
  }

  const toggleSelect = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    )
  }

  const handleDelete = async () => {
    if (selectedIds.length === 0) return
    setIsDeleting(true)
    
    // Supabase allows us to batch delete by passing an array to .in()
    const { error } = await supabase
      .from('sessions')
      .delete()
      .in('id', selectedIds)

    if (!error) {
      await fetchSessions()
      setIsSelectionMode(false)
      setSelectedIds([])
      // Notify other components (like Sidebar) that sessions changed
      window.dispatchEvent(new Event('sessionsUpdated'))
    } else {
      console.error(error)
      alert("Failed to delete chats")
    }
    setIsDeleting(false)
  }

  return (
    <div className="flex-1 bg-white h-screen overflow-y-auto pt-10 px-8 lg:px-20">
      <div className="max-w-[800px] mx-auto w-full">
        
        {/* Header section */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-[28px] font-serif text-[#111]">Chats</h1>
          
          <div className="flex items-center gap-3">
            {isSelectionMode ? (
              <>
                <span className="text-[14px] text-[#666] mr-2">{selectedIds.length} selected</span>
                <button 
                  onClick={handleSelectAll}
                  className="px-4 py-2 text-[14px] font-medium text-[#3d3d3d] border border-[#e5e5e5] hover:bg-[#f5f5f5] rounded-lg transition-colors"
                >
                  Select all
                </button>
                <button 
                  onClick={handleDelete}
                  disabled={selectedIds.length === 0 || isDeleting}
                  className="px-4 py-2 text-[14px] font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:hover:bg-red-600 rounded-lg transition-colors"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
                <button 
                  onClick={() => { setIsSelectionMode(false); setSelectedIds([]); }}
                  className="px-4 py-2 text-[14px] font-medium text-[#3d3d3d] hover:bg-[#f5f5f5] rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button 
                  onClick={() => setIsSelectionMode(true)}
                  className="px-4 py-2 text-[14px] font-medium text-[#3d3d3d] border border-[#e5e5e5] hover:bg-[#f5f5f5] rounded-lg transition-colors"
                >
                  Select chats
                </button>
                <button 
                  onClick={() => navigate('/agent1')}
                  className="px-4 py-2 text-[14px] font-medium text-white bg-[#111] hover:bg-black rounded-lg transition-colors"
                >
                  New chat
                </button>
              </>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mb-8">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#888]" />
          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats..."
            className="w-full pl-11 pr-4 py-3 bg-white border border-[#4d90fe] rounded-[16px] text-[15px] outline-none shadow-[0_0_0_2px_rgba(77,144,254,0.1)] focus:shadow-[0_0_0_3px_rgba(77,144,254,0.2)] transition-shadow placeholder:text-[#a0a0a0]"
          />
        </div>

        {/* Chats List */}
        <div className="flex flex-col">
          {filteredSessions.map(session => {
            const dateStr = new Date(session.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            return (
              <div 
                key={session.id}
                className="flex items-center justify-between py-4 border-b border-[#f0f0f0] hover:bg-[#fafafa] px-2 rounded-lg transition-colors group cursor-pointer"
                onClick={() => isSelectionMode ? toggleSelect(session.id) : navigate(`/agent1?session_id=${session.id}`)}
              >
                <div className="flex items-center gap-4 min-w-0">
                  {isSelectionMode && (
                    <input 
                      type="checkbox"
                      checked={selectedIds.includes(session.id)}
                      onChange={() => toggleSelect(session.id)}
                      onClick={e => e.stopPropagation()}
                      className="w-4 h-4 rounded border-gray-300 text-[#111] focus:ring-[#111] cursor-pointer"
                    />
                  )}
                  <span className="text-[15px] text-[#3d3d3d] font-medium truncate">
                    {session.title}
                  </span>
                </div>
                <span className="text-[13px] text-[#888] whitespace-nowrap ml-4">
                  {dateStr}
                </span>
              </div>
            )
          })}
          
          {filteredSessions.length === 0 && (
            <div className="py-8 text-center text-[#888] text-[14px]">
              No chats found.
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
