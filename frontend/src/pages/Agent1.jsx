// ============================================================
// Agent1.jsx — Minimalist Landing & Gap Analyser
// ============================================================
import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import { supabase } from '../supabase'
import { 
  Plus, Send, Sparkles, ChevronDown, 
  Search, Video, GraduationCap, Mic, Code, Lightbulb, PenTool, Coffee, FileText
} from 'lucide-react'

const API_URL = 'http://localhost:8000'

export default function Agent1() {
  const [resumeFile, setResumeFile] = useState(null)
  const [jdFile, setJdFile] = useState(null)
  const [hasStartedChat, setHasStartedChat] = useState(false)
  const [chatHistory, setChatHistory] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  
  // Controls whether the file upload boxes are visible
  const [showUploads, setShowUploads] = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  
  const updateResumeRef = useRef(null)
  const updateJdRef = useRef(null)
  
  const chatEndRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const isUserScrolledUp = useRef(false)

  const handleScroll = () => {
    if (!scrollContainerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100
    isUserScrolledUp.current = !isNearBottom
  }

  useEffect(() => {
    const loadSession = async () => {
      const params = new URLSearchParams(window.location.search)
      const sid = params.get('session_id')
      if (sid) {
        setSessionId(sid)
        setHasStartedChat(true)
        const { data: msgs } = await supabase.from('messages').select('*').eq('session_id', sid).or('phase.eq.agent1,phase.is.null').order('created_at', { ascending: true })
        if (msgs) {
          setChatHistory(msgs.map(m => ({
            role: m.role,
            content: m.content,
            files: m.files || []
          })))
        }
      }
    }
    loadSession()
  }, [])

  const getAuthToken = async () => {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token
  }

  const handleAnalyse = async () => {
    if (!resumeFile || !jdFile) return
    setHasStartedChat(true)
    
    const userMessageContent = chatInput.trim()
    const files = [
      { name: resumeFile.name, type: 'PDF' },
      { name: jdFile.name, type: 'PDF' }
    ]

    setChatHistory(prev => [...prev, { role: 'user', content: userMessageContent, files }])
    setChatInput('')
    setChatLoading(true)

    try {
      const { data: userData } = await supabase.auth.getUser()
      const user = userData.user
      const token = await getAuthToken()

      let currentSessionId = sessionId
      
      // 1. Create Session if not exists
      if (!currentSessionId) {
        const { data: sessionData } = await supabase
          .from('sessions')
          .insert([{ user_id: user.id, title: 'New Conversation', agent_type: 'agent1' }])
          .select().single()
        
        currentSessionId = sessionData.id
        setSessionId(currentSessionId)
        window.history.pushState({}, '', `?session_id=${currentSessionId}`)
      }

      // 2. Insert user message
      await supabase.from('messages').insert([{
        session_id: currentSessionId,
        role: 'user',
        content: userMessageContent,
        files: files
      }])

      // 3. Generate title in background
      if (!sessionId) {
        if (userMessageContent) {
          axios.post(`${API_URL}/api/agent1/title`, new URLSearchParams({ message: userMessageContent }), {
            headers: { Authorization: `Bearer ${token}` }
          }).then(async (res) => {
            if (res.data.title) {
              await supabase.from('sessions').update({ title: res.data.title }).eq('id', currentSessionId)
              window.dispatchEvent(new Event('sessionsUpdated'))
            }
          })
        } else {
          await supabase.from('sessions').update({ title: 'Gap Analysis' }).eq('id', currentSessionId)
          window.dispatchEvent(new Event('sessionsUpdated'))
        }
      }

      // 4. Send to backend for analysis
      const formData = new FormData()
      formData.append('resume', resumeFile)
      formData.append('jd', jdFile)
      formData.append('session_id', currentSessionId)

      setResumeFile(null)
      setJdFile(null)
      setChatInput('')

      const response = await axios.post(`${API_URL}/api/agent1/analyse`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
      })
      const gapData = response.data.gap_analysis
      const analysisMessage = `📊 **Overall Match: ${gapData.match_percentage}%**\n\n${gapData.summary}\n\n🎯 **Top Priority:**\n${gapData.top_priority_to_learn}\n\n💪 **Strengths:**\n${gapData.strengths.map(s => `• ${s}`).join('\n')}\n\n⚠️ **Weaknesses:**\n${gapData.weaknesses.map(w => `• ${w}`).join('\n')}\n\n🔍 **Skill Gaps:**\n${gapData.gaps.map(g => `• **${g.skill}**: ${g.reason}`).join('\n')}`
      
      setChatHistory(prev => [...prev, { role: 'assistant', content: analysisMessage, isNew: true }])
      
      // 5. Insert AI message
      await supabase.from('messages').insert([{
        session_id: currentSessionId,
        role: 'assistant',
        content: analysisMessage,
        phase: 'agent1'
      }])

    } catch (err) {
      console.error(err)
      setChatHistory(prev => [...prev, { role: 'assistant', content: 'Sorry, the analysis failed.', isNew: true }])
    } finally {
      setChatLoading(false)
    }
  }

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return

    const userMessage = chatInput
    setChatInput('')
    setChatHistory((prev) => [...prev, { role: 'user', content: userMessage }])
    setChatLoading(true)

    try {
      const { data: userData } = await supabase.auth.getUser()
      const user = userData.user
      const token = await getAuthToken()
      
      let currentSessionId = sessionId
      
      if (!currentSessionId) {
        const { data: sessionData } = await supabase
          .from('sessions')
          .insert([{ user_id: user.id, title: 'New Conversation', agent_type: 'agent1' }])
          .select().single()
        currentSessionId = sessionData.id
        setSessionId(currentSessionId)
        window.history.pushState({}, '', `?session_id=${currentSessionId}`)
        setHasStartedChat(true)

        axios.post(`${API_URL}/api/agent1/title`, new URLSearchParams({ message: userMessage }), {
          headers: { Authorization: `Bearer ${token}` }
        }).then(async (res) => {
          if (res.data.title) {
            await supabase.from('sessions').update({ title: res.data.title }).eq('id', currentSessionId)
            window.dispatchEvent(new Event('sessionsUpdated'))
          }
        })
      }

      await supabase.from('messages').insert([{
        session_id: currentSessionId,
        role: 'user',
        content: userMessage,
        phase: 'agent1'
      }])

      const formData = new FormData()
      formData.append('message', userMessage)
      formData.append('session_id', currentSessionId)
      formData.append('chat_history', JSON.stringify(chatHistory))

      const response = await axios.post(`${API_URL}/api/agent1/chat`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
      })
      
      const assistantMessage = response.data.answer
      setChatHistory((prev) => [
        ...prev,
        { role: 'assistant', content: assistantMessage, sources: response.data.sources_used, isNew: true },
      ])
      
      await supabase.from('messages').insert([{
        session_id: currentSessionId,
        role: 'assistant',
        content: assistantMessage,
        phase: 'agent1'
      }])

    } catch (err) {
      console.error(err)
      setChatHistory((prev) => [...prev, { role: 'assistant', content: 'Sorry, something went wrong.', isNew: true }])
    } finally {
      setChatLoading(false)
    }
  }

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory])

  // --- SHARED INPUT BOX ---
  const renderInputBox = (isLanding) => (
    <div className="w-full flex flex-col items-center">
      <input type="file" ref={updateResumeRef} className="hidden" accept=".pdf" 
        onClick={(e) => { e.target.value = null }}
        onChange={(e) => {
          if (e.target.files[0]) { setResumeFile(e.target.files[0]); setShowPlusMenu(false); }
        }} 
      />
      <input type="file" ref={updateJdRef} className="hidden" accept=".pdf" 
        onClick={(e) => { e.target.value = null }}
        onChange={(e) => {
          if (e.target.files[0]) { setJdFile(e.target.files[0]); setShowPlusMenu(false); }
        }} 
      />
      
      <div className={`w-full mx-auto ${isLanding ? 'max-w-[720px] mb-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)]' : 'max-w-[760px] shadow-sm'} bg-white border border-[#e5e5e5] rounded-[24px] p-2 flex flex-col relative transition-all focus-within:ring-2 focus-within:ring-[#e5e5e5] focus-within:border-transparent`}>
      
      {/* Attached Files display */}
      {(!isLanding && (resumeFile || jdFile)) && (
        <div className="flex items-center gap-2 px-4 pt-3 pb-1">
          {resumeFile && <span className="bg-[#f5f5f5] text-[#666] text-[12px] px-2 py-1 rounded-md border border-[#e5e5e5] flex items-center gap-1"><FileText size={12} /> {resumeFile.name}</span>}
          {jdFile && <span className="bg-[#f5f5f5] text-[#666] text-[12px] px-2 py-1 rounded-md border border-[#e5e5e5] flex items-center gap-1"><FileText size={12} /> {jdFile.name}</span>}
        </div>
      )}

      <textarea
        value={chatInput}
        onChange={(e) => setChatInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (!hasStartedChat && resumeFile && jdFile) handleAnalyse()
            else if (hasStartedChat && (resumeFile || jdFile)) {
              if (!resumeFile || !jdFile) alert('Please upload both Resume and JD to re-analyse.')
              else handleAnalyse()
            }
            else if (chatInput.trim()) handleSendMessage()
          }
        }}
        placeholder={isLanding ? "What do you want to figure out today?" : "Ask a follow up question..."}
        className={`w-full bg-transparent resize-none outline-none px-4 pb-3 text-[#3d3d3d] text-[15px] placeholder:text-[#a0a0a0] ${(!isLanding && (resumeFile || jdFile)) ? 'pt-1' : 'pt-3'}`}
        rows={1}
        onFocus={() => isLanding && setShowUploads(true)}
      />

      <div className="flex items-center justify-between px-2 pb-2">
        <div className="relative">
          <button 
            onClick={() => isLanding ? setShowUploads(!showUploads) : setShowPlusMenu(!showPlusMenu)}
            className="p-1.5 rounded-full hover:bg-[#f5f5f5] text-[#888] transition-colors"
          >
            <Plus size={20} strokeWidth={1.5} />
          </button>
          
          {showPlusMenu && !isLanding && (
            <div className="absolute bottom-[calc(100%+10px)] left-0 bg-white shadow-[0_4px_24px_rgba(0,0,0,0.1)] border border-[#e5e5e5] rounded-[16px] py-2 w-56 flex flex-col z-50 animate-in fade-in zoom-in-95 duration-200">
              <button onClick={() => updateResumeRef.current?.click()} className="flex items-center gap-3 px-4 py-2 text-[14px] text-[#3d3d3d] hover:bg-[#f5f5f5] text-left transition-colors">
                <FileText size={16} className="text-[#888]" />
                Upload Resume
              </button>
              <button onClick={() => updateJdRef.current?.click()} className="flex items-center gap-3 px-4 py-2 text-[14px] text-[#3d3d3d] hover:bg-[#f5f5f5] text-left transition-colors">
                <FileText size={16} className="text-[#888]" />
                Upload Job Description
              </button>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[#666] bg-[#f5f5f5] hover:bg-[#ebebeb] rounded-lg transition-colors">
            Gemini Flash <ChevronDown size={14} />
          </button>
          <button 
            onClick={() => {
              if (!hasStartedChat && resumeFile && jdFile) handleAnalyse()
              else if (hasStartedChat && (resumeFile || jdFile)) {
                if (!resumeFile || !jdFile) alert('Please upload both Resume and JD to re-analyse.')
                else handleAnalyse()
              }
              else if (chatInput.trim()) handleSendMessage()
            }}
            disabled={
              (!hasStartedChat && !resumeFile && !jdFile && !chatInput.trim()) ||
              (hasStartedChat && !chatInput.trim() && !resumeFile && !jdFile) ||
              chatLoading
            }
            className="p-1.5 rounded-full bg-black text-white hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-black transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
      </div>
      {!isLanding && (
        <span className="text-[12px] text-[#888] mt-3 mb-1">
          Kyros is an AI and can make mistakes. Please double-check responses.
        </span>
      )}
    </div>
  )

  // --- RENDERING INITIAL LANDING STATE ---
  if (!hasStartedChat) {
    return (
      <div className="flex-1 flex flex-col items-center pt-28 px-4 relative overflow-y-auto bg-[#fcfcfc]">
        
        <h1 className="text-[36px] text-[#3d3d3d] font-serif tracking-tight mb-8 flex items-center gap-3">
          <Sparkles className="text-[#d97757]" size={32} strokeWidth={1.5} />
          Welcome to Kyros!
        </h1>

        {renderInputBox(true)}

        {/* Pill Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-2 max-w-[700px] mb-8">
          <PillButton icon={Code} label="Gap Analyser" onClick={() => setShowUploads(true)} />
          <PillButton icon={GraduationCap} label="Learn" />
          <PillButton icon={Lightbulb} label="Create" />
          <PillButton icon={PenTool} label="Write" />
          <PillButton icon={Coffee} label="Life stuff" />
        </div>

        {/* File Upload Area (Expands when needed) */}
        {showUploads && (
          <div className="w-full max-w-[720px] grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-4 duration-300">
            <FileUploadBox label="Resume (PDF)" file={resumeFile} onChange={setResumeFile} />
            <FileUploadBox label="Job Description (PDF)" file={jdFile} onChange={setJdFile} />
          </div>
        )}
      </div>
    )
  }

  // --- RENDERING CHAT STATE ---
  return (
    <div className="flex-1 flex flex-col h-screen relative bg-[#fcfcfc]">
      
      {/* Floating Agent 2 Action Popup */}
      {chatHistory.some(msg => msg.role === 'assistant') && (
        <div 
          onClick={() => window.location.href = `/agent2?session_id=${sessionId}&force_fetch=true`}
          className="fixed top-6 right-6 z-50 bg-[#fef5d4] border border-[#f0df98] px-3 py-1.5 rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.06)] flex items-center gap-2 cursor-pointer hover:bg-[#faeed0] transition-colors animate-in fade-in slide-in-from-top-4 duration-500"
        >
          <span className="text-[#8e6a00] text-[12px] font-medium">Fetch Learning Videos</span>
        </div>
      )}

      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto w-full"
      >
        <div className="px-4 md:px-0 py-12 max-w-[760px] mx-auto w-full">
          {/* Chat History */}
          <div className="space-y-8 pb-24">
          {chatHistory.map((msg, i) => {
            const isLastAssistant = msg.role === 'assistant' && i === chatHistory.length - 1;
            return (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[95%] flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} gap-2`}>
                  
                  {/* Render File Cards for User Messages */}
                  {msg.files && msg.files.length > 0 && (
                    <div className="flex gap-2 flex-wrap justify-end mb-1">
                      {msg.files.map((f, idx) => (
                        <div key={idx} className="bg-[#f2f2f2] rounded-[16px] w-[100px] h-[100px] p-3 flex flex-col justify-between shadow-sm">
                          <span className="text-[12px] font-medium text-[#666]">{f.type}</span>
                          <span className="text-[13px] text-[#3d3d3d] truncate w-full" title={f.name}>{f.name}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Render Text Bubble */}
                  {msg.content && (
                    <div className={`px-5 py-4 rounded-[20px] text-[15px] leading-relaxed ${
                      msg.role === 'user' 
                        ? 'bg-[#f0f0f0] text-[#3d3d3d]' 
                        : 'bg-transparent text-[#3d3d3d] w-full text-justify'
                    }`}>
                      {msg.role === 'assistant' && isLastAssistant && msg.isNew ? (
                        <Typewriter 
                          text={msg.content} 
                          speed={10} 
                          onType={() => {
                            if (!isUserScrolledUp.current) {
                              chatEndRef.current?.scrollIntoView()
                            }
                          }} 
                        />
                      ) : (
                        <FormattedText text={msg.content} />
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          {chatLoading && (
            <div className="flex justify-start ml-5 mt-4">
              <div className="flex items-center gap-1.5 text-[#a0a0a0]">
                <div className="w-2 h-2 rounded-full bg-[#d0d0d0] animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-[#d0d0d0] animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-[#d0d0d0] animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
        </div>
      </div>

      {/* Floating Chat Input & Pipeline Action */}
      <div className="flex-none px-4 pb-4 pt-0 bg-[#fcfcfc] sticky bottom-0 flex flex-col items-center">
        {renderInputBox(false)}
      </div>
    </div>
  )
}

// ── Shared UI Components ──────────────────────────────

function PillButton({ icon: Icon, label, onClick }) {
  return (
    <button 
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-1.5 border border-[#e5e5e5] bg-white hover:bg-[#f5f5f5] text-[#555] rounded-full text-[13px] font-medium transition-colors shadow-sm"
    >
      <Icon size={14} className="text-[#888]" />
      {label}
    </button>
  )
}

function FileUploadBox({ label, file, onChange }) {
  return (
    <label className="border border-dashed border-[#d0d0d0] bg-white rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer hover:border-[#a0a0a0] transition-colors h-[100px]">
      <span className="text-[13px] font-medium text-[#555]">{label}</span>
      {file ? (
        <span className="text-[12px] text-[#2c2c2c] mt-2 font-medium truncate max-w-[90%]">
          {file.name}
        </span>
      ) : (
        <span className="text-[12px] text-[#888] mt-1">Click to upload</span>
      )}
      <input type="file" accept=".pdf" className="hidden" onChange={(e) => onChange(e.target.files[0])} />
    </label>
  )
}

function FormattedText({ text }) {
  if (!text) return null;
  return (
    <div className="space-y-3">
      {text.split('\n\n').map((paragraph, i) => (
        <div key={i} className="leading-relaxed">
          {paragraph.split('\n').map((line, j) => (
            <div key={j} className="min-h-[1.5em]">
              {line.split(/(\*\*.*?\*\*)/g).map((part, k) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                  return <strong key={k} className="font-semibold text-black">{part.slice(2, -2)}</strong>
                }
                return <span key={k}>{part}</span>
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function Typewriter({ text, speed = 15, onType }) {
  const [displayedText, setDisplayedText] = useState('')
  const onTypeRef = useRef(onType)

  useEffect(() => {
    onTypeRef.current = onType
  }, [onType])

  useEffect(() => {
    const startTime = Date.now()
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime
      const charsToShow = Math.floor(elapsed / speed)
      
      setDisplayedText(text.slice(0, charsToShow))
      if (onTypeRef.current) onTypeRef.current()
      
      if (charsToShow >= text.length) {
        clearInterval(timer)
      }
    }, speed)
    
    // Initial render
    setDisplayedText(text.slice(0, 1))
    
    return () => clearInterval(timer)
  }, [text, speed])

  return <FormattedText text={displayedText} />
}
