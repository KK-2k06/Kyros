import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { Send, ArrowLeft, PlayCircle, Loader2 } from 'lucide-react'

export default function Agent2() {
  const [sessionId, setSessionId] = useState(null)
  const [videos, setVideos] = useState([])
  const [queries, setQueries] = useState([])
  const [loadingVideos, setLoadingVideos] = useState(true)

  const [chatHistory, setChatHistory] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const chatEndRef = useRef(null)

  const hasFetchedRef = useRef(false)
  const hasLoadedHistoryRef = useRef(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sid = params.get('session_id')
    if (sid) {
      setSessionId(sid)
      const forceFetch = params.get('force_fetch') === 'true'
      if (!hasFetchedRef.current) {
        hasFetchedRef.current = true
        checkAndFetchVideos(sid, forceFetch)
      }
      if (!hasLoadedHistoryRef.current) {
        hasLoadedHistoryRef.current = true
        loadChatHistory(sid)
      }
    } else {
      setLoadingVideos(false)
    }
  }, [])

  const checkAndFetchVideos = async (sid, forceFetch = false) => {
    try {
      const { data: dbVideos } = await supabase
        .from('messages')
        .select('content')
        .eq('session_id', sid)
        .eq('phase', 'agent2_videos')
        .order('created_at', { ascending: true })

      if (dbVideos && dbVideos.length > 0) {
        // Videos already exist in DB
        let allVideos = [];
        let allQueries = [];
        for (const row of dbVideos) {
            try {
                const savedData = JSON.parse(row.content);
                if (savedData.videos) allVideos = [...allVideos, ...savedData.videos];
                if (savedData.queries) allQueries = [...allQueries, ...savedData.queries];
            } catch (e) {}
        }
        
        if (allVideos.length > 0 && !forceFetch) {
            setVideos(allVideos)
            if (allQueries.length > 0) setQueries(allQueries)
            setLoadingVideos(false)
            return
        }
        // If forceFetch is true, we still set the old videos temporarily while fetching new ones
        if (allVideos.length > 0 && forceFetch) {
            setVideos(allVideos)
            if (allQueries.length > 0) setQueries(allQueries)
        }
      }

      // 2. If not in DB, fetch from API
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) return

      const formData = new FormData()
      formData.append('session_id', sid)

      const response = await fetch('http://localhost:8000/api/agent2/fetch-videos', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })
      const data = await response.json()
      
      if (data.videos) {
        setVideos(prev => [...prev, ...data.videos])
        
        await supabase.from('messages').insert([{
          session_id: sid,
          role: 'system',
          content: JSON.stringify(data),
          phase: 'agent2_videos'
        }])

        if (forceFetch) {
            // Insert a message in chat history with the new videos
            const botMessage = "I have fetched a new set of recommended videos based on your updated gap analysis!"
            setChatHistory(prev => [...prev, { role: 'assistant', content: botMessage, videos: data.videos, isNew: true }])
            await saveMessageToDb(sid, 'assistant', botMessage, data.videos)
            
            // Remove force_fetch from URL so refresh doesn't refetch
            window.history.replaceState({}, '', `/agent2?session_id=${sid}`)
        }
      }
      if (data.queries) {
        setQueries(prev => [...prev, ...data.queries])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingVideos(false)
    }
  }

  const loadChatHistory = async (sid) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sid)
      .eq('phase', 'agent2')
      .order('created_at', { ascending: true })
    
    if (data && data.length > 0) {
      const parsedHistory = data.map(msg => {
          let parsedContent = msg.content;
          let videos = null;
          try {
              const obj = JSON.parse(msg.content);
              if (obj.text) {
                  parsedContent = obj.text;
                  videos = obj.videos;
              }
          } catch(e) {}
          return { ...msg, content: parsedContent, videos };
      });
      setChatHistory(parsedHistory)
    } else {
      // First time in agent 2
      const initialMsg = {
        role: 'assistant',
        content: "I've fetched the most relevant video tutorials based on your gap analysis. Which topic would you like to focus on first? Or let me know if you want me to find videos for something else!",
        isNew: true
      }
      setChatHistory([initialMsg])
      await saveMessageToDb(sid, 'assistant', initialMsg.content)
    }
  }

  const saveMessageToDb = async (sid, role, content, videos = null) => {
    const payload = videos ? JSON.stringify({ text: content, videos }) : content;
    await supabase.from('messages').insert([{
      session_id: sid,
      role: role,
      content: payload,
      phase: 'agent2'
    }])
  }

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !sessionId) return

    const userMsg = chatInput
    setChatInput('')
    
    const newHistory = [...chatHistory, { role: 'user', content: userMsg }]
    setChatHistory(newHistory)
    await saveMessageToDb(sessionId, 'user', userMsg)

    setIsTyping(true)
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token

      const formData = new FormData()
      formData.append('message', userMsg)
      formData.append('chat_history', JSON.stringify(newHistory))

      const response = await fetch('http://localhost:8000/api/agent2/chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })
      const data = await response.json()
      
      const botResponse = data.response || "I couldn't process that right now."
      
      const newMsg = { role: 'assistant', content: botResponse, isNew: true }
      if (data.new_videos && data.new_videos.length > 0) {
          newMsg.videos = data.new_videos;
      }
      
      setChatHistory(prev => [...prev, newMsg])
      await saveMessageToDb(sessionId, 'assistant', botResponse, newMsg.videos)

    } catch (err) {
      console.error(err)
    } finally {
      setIsTyping(false)
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    }
  }

  return (
    <div className="flex-1 flex flex-col h-screen relative bg-[#fcfcfc]">
      <div className="flex-1 overflow-y-auto w-full">
        <div className="px-4 md:px-0 py-12 max-w-[760px] mx-auto w-full">
          
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-[28px] font-serif text-[#111]">Video Learning</h1>
          </div>

          {/* Videos Grid Section */}
          <div className="mb-12">
            <h2 className="text-[14px] font-semibold uppercase tracking-wider text-[#888] mb-4">Recommended Tutorials</h2>
            
            {loadingVideos ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map(i => (
                  <div key={i} className="animate-pulse bg-[#f0f0f0] rounded-xl h-[180px]"></div>
                ))}
              </div>
            ) : videos.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {videos.map(video => (
                  <VideoCard key={video.id} video={video} sessionId={sessionId} />
                ))}
              </div>
            ) : (
              <div className="bg-[#f9f9f9] border border-[#e5e5e5] rounded-xl p-8 text-center text-[#888]">
                No videos found. Ask me to search for specific topics!
              </div>
            )}
          </div>

          {/* Chat Section */}
          <div className="space-y-8 pb-24">
            {chatHistory.map((msg, idx) => {
              const isLastAssistant = msg.role === 'assistant' && idx === chatHistory.length - 1;
              return (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[95%] flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} gap-2`}>
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
                          onType={() => chatEndRef.current?.scrollIntoView()} 
                        />
                      ) : msg.role === 'user' ? (
                        msg.content
                      ) : (
                        <FormattedText text={msg.content} />
                      )}
                    </div>
                  )}
                  {msg.videos && msg.videos.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-2 w-full max-w-[800px]">
                      {msg.videos.map(video => (
                        <VideoCard key={video.id} video={video} sessionId={sessionId} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )})}
            {isTyping && (
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

      {/* Floating Chat Input Area */}
      <div className="flex-none px-4 pb-4 pt-0 bg-[#fcfcfc] sticky bottom-0 flex flex-col items-center">
        <div className="w-full flex flex-col items-center">
          <div className="w-full mx-auto max-w-[760px] shadow-sm bg-white border border-[#e5e5e5] rounded-[24px] p-2 flex flex-col relative transition-all focus-within:ring-2 focus-within:ring-[#e5e5e5] focus-within:border-transparent">
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (chatInput.trim()) handleSendMessage()
                }
              }}
              placeholder="Ask about the videos or request more topics..."
              className="w-full bg-transparent resize-none outline-none px-4 pb-3 pt-3 text-[#3d3d3d] text-[15px] placeholder:text-[#a0a0a0]"
              rows={1}
            />

            <div className="flex items-center justify-between px-2 pb-2">
              <div className="relative"></div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleSendMessage}
                  disabled={!chatInput.trim() || isTyping}
                  className="p-1.5 rounded-full bg-black text-white hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-black transition-colors"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
        <span className="text-[12px] text-[#888] mt-3 mb-1">
          Kyros is an AI and can make mistakes. Please double-check responses.
        </span>
      </div>
    </div>
  )
}

function VideoCard({ video, sessionId }) {
  return (
    <div 
      onClick={() => {
        const url = new URL(video.link)
        const videoId = url.searchParams.get('v') || video.link.split('/').pop()
        window.location.href = `/agent3?session_id=${sessionId}&video_id=${videoId}`
      }}
      className="group block bg-white rounded-xl overflow-hidden border border-[#e5e5e5] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:border-[#d0d0d0] transition-all duration-300 transform hover:-translate-y-1 cursor-pointer w-full text-left"
    >
      <div className="relative aspect-video bg-[#000]">
        {video.thumbnail ? (
          <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#222]">
            <PlayCircle size={32} className="text-[#888]" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <PlayCircle size={48} className="text-white drop-shadow-md" />
        </div>
        {video.duration && (
          <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[11px] font-medium px-1.5 py-0.5 rounded">
            {video.duration}
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="text-[13px] font-medium text-[#111] line-clamp-2 leading-snug mb-1 group-hover:text-blue-600 transition-colors">
          {video.title}
        </h3>
        <div className="flex items-center text-[11px] text-[#888] gap-1.5">
          <span className="truncate">{video.channel || "YouTube"}</span>
          {video.views && (
            <>
              <span className="w-1 h-1 rounded-full bg-[#ccc]"></span>
              <span>{video.views}</span>
            </>
          )}
        </div>
      </div>
    </div>
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
