import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, Send, Sparkles, Bookmark, Share2, MoreVertical, CheckCircle2, Clock, Link as LinkIcon, Copy, ThumbsUp, ThumbsDown, User } from 'lucide-react'
import { supabase } from '../supabase'

export default function Agent3() {
  const [sessionId, setSessionId] = useState(null)
  const [videoId, setVideoId] = useState(null)
  
  const [chatInput, setChatInput] = useState('')
  const [chatHistory, setChatHistory] = useState([])
  const [isTyping, setIsTyping] = useState(true)
  
  const [videoData, setVideoData] = useState(null)
  const [transcriptData, setTranscriptData] = useState([])
  const [activeTab, setActiveTab] = useState('Description')

  const chatScrollRef = useRef(null)
  const hasInitializedRef = useRef(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sid = params.get('session_id')
    const vid = params.get('video_id')
    
    if (sid && vid) {
      setSessionId(sid)
      setVideoId(vid)
      
      if (!hasInitializedRef.current) {
        hasInitializedRef.current = true
        initDeepDive(sid, vid)
      }
    } else {
      setIsTyping(false)
    }
  }, [])

  const scrollToBottom = () => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTo({
        top: chatScrollRef.current.scrollHeight,
        behavior: 'smooth'
      })
    }
  }

  // Auto-scroll chat
  useEffect(() => {
    scrollToBottom()
  }, [chatHistory])

  const initDeepDive = async (sid, vid) => {
    try {
      const { data: history } = await supabase
        .from('messages')
        .select('*')
        .eq('session_id', sid)
        .eq('phase', `agent3_${vid}`)
        .order('created_at', { ascending: true })

      let hasHistory = false;
      if (history && history.length > 0) {
        setChatHistory(history)
        hasHistory = true;
      }

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token

      const formData = new FormData()
      formData.append('session_id', sid)
      formData.append('video_id', vid)

      const response = await fetch('http://localhost:8000/api/agent3/init', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      })
      const data = await response.json()

      console.log("====== RAW VIDEO INFO (from backend) ======")
      console.log(data.raw_video_info)
      console.log("====== METADATA (from backend) ======")
      console.log(data.metadata)
      console.log("===========================================")

      
      if (data.metadata) setVideoData(data.metadata)
      if (data.transcript) setTranscriptData(data.transcript)

      if (!hasHistory) {
        const welcomeMsg = data.msg || "I've analyzed the video! What would you like to know?"
        setChatHistory([{ role: 'assistant', content: welcomeMsg, isNew: true }])
        
        await supabase.from('messages').insert([{
          session_id: sid,
          role: 'assistant',
          content: welcomeMsg,
          phase: `agent3_${vid}`
        }])
      }

    } catch (err) {
      console.error(err)
      if (!hasHistory) {
        setChatHistory([{ role: 'assistant', content: "Sorry, I couldn't process this video's transcript.", isNew: true }])
      }
    } finally {
      setIsTyping(false)
    }
  }

  const handleSendMessage = async (customMsg = null) => {
    const userMsg = customMsg || chatInput
    if (!userMsg.trim() || isTyping) return

    setChatInput('')
    
    const newHistory = [...chatHistory, { role: 'user', content: userMsg }]
    setChatHistory(newHistory)
    setIsTyping(true)

    await supabase.from('messages').insert([{
      session_id: sessionId,
      role: 'user',
      content: userMsg,
      phase: `agent3_${videoId}`
    }])

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token

      const formData = new FormData()
      formData.append('video_id', videoId)
      formData.append('message', userMsg)
      formData.append('chat_history', JSON.stringify(newHistory))

      const response = await fetch('http://localhost:8000/api/agent3/chat', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      })
      const data = await response.json()
      
      const botResponse = data.response || "I couldn't process that right now."
      setChatHistory(prev => [...prev, { role: 'assistant', content: botResponse, isNew: true }])
      
      await supabase.from('messages').insert([{
        session_id: sessionId,
        role: 'assistant',
        content: botResponse,
        phase: `agent3_${videoId}`
      }])

    } catch (err) {
      console.error(err)
    } finally {
      setIsTyping(false)
    }
  }

  const suggestionChips = [
    "Explain execution plan in detail",
    "How do indexes work?",
    "Show an example of bad vs good query"
  ]

  return (
    <div className="flex-1 grid grid-cols-5 h-full bg-[#fdfdfd] overflow-hidden font-sans text-[#111]">
      
      {/* LEFT PANE: Video Player & Details (60% = 3/5) */}
      <div className="col-span-3 flex flex-col border-r border-[#e5e5e5] bg-white overflow-y-auto relative min-h-0">
        
        {/* Top Header */}
        <div className="sticky top-0 z-10 px-6 py-4 flex items-center justify-start bg-white border-b border-[#f0f0f0]">
          <h1 className="text-[20px] font-serif flex items-center gap-2 text-[#3d3d3d]">
            Deep Dive
          </h1>
        </div>

        <div className="p-6 max-w-4xl mx-auto w-full space-y-6">
          {/* Video Embed */}
          <div className="w-full aspect-video rounded-xl overflow-hidden shadow-lg bg-black">
            {videoId ? (
              <iframe 
                src={`https://www.youtube.com/embed/${videoId}`} 
                className="w-full h-full"
                frameBorder="0" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                allowFullScreen
              ></iframe>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/50">No video selected</div>
            )}
          </div>

          {/* Video Title & Channel */}
          <div>
            <h2 className="text-[22px] font-bold leading-tight mb-3">
              {videoData ? videoData.title : "Loading..."}
            </h2>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-teal-500 flex items-center justify-center text-white font-bold text-lg">
                  {videoData && videoData.channel ? videoData.channel.charAt(0).toUpperCase() : "V"}
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <span className="font-semibold text-[15px]">{videoData ? videoData.channel : "Channel Name"}</span>
                    <CheckCircle2 size={14} className="text-gray-400" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-[#e0e0e0] flex items-center gap-8 mt-2">
            {['Description', 'Overview', 'Transcript'].map((tab) => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 text-[14px] font-medium relative ${activeTab === tab ? 'text-[#111]' : 'text-gray-500 hover:text-gray-800'}`}
              >
                {tab}
                {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#111] rounded-t-full"></div>}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === 'Description' && (
            <div className="bg-[#f8f9fa] rounded-2xl p-6 border border-[#f0f0f0]">
              <h3 className="font-semibold text-[15px] mb-4">Video Description</h3>
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 text-[14px] text-gray-700 whitespace-pre-wrap">
                {videoData?.description || "No description available."}
              </div>
            </div>
          )}

          {activeTab === 'Overview' && (
            <div className="bg-[#f8f9fa] rounded-2xl p-6 border border-[#f0f0f0]">
              <h3 className="font-semibold text-[15px] mb-2">About this video</h3>
              <p className="text-[14px] text-gray-600 leading-relaxed mb-6">
                Overview and metadata for the selected video.
              </p>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-xl p-3 border border-[#f0f0f0]">
                  <div className="text-[12px] text-gray-500 mb-1">Duration</div>
                  <div className="font-semibold text-[14px]">{videoData ? videoData.duration : "--:--"}</div>
                </div>
                <div className="bg-white rounded-xl p-3 border border-[#f0f0f0]">
                  <div className="text-[12px] text-gray-500 mb-1">Views</div>
                  <div className="font-semibold text-[14px]">{videoData ? videoData.views : "---"}</div>
                </div>
                <div className="bg-white rounded-xl p-3 border border-[#f0f0f0]">
                  <div className="text-[12px] text-gray-500 mb-1">Published</div>
                  <div className="font-semibold text-[14px]">{videoData ? videoData.published : "---"}</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Transcript' && (
            <div className="bg-[#f8f9fa] rounded-2xl p-6 border border-[#f0f0f0]">
              <h3 className="font-semibold text-[15px] mb-4">Video Transcript</h3>
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                {transcriptData && transcriptData.length > 0 ? (
                  transcriptData.map((t, idx) => (
                    <div key={idx} className="flex gap-4">
                      <div className="text-[13px] text-indigo-500 font-medium shrink-0 pt-0.5">
                        {Math.floor(t.start / 60)}:{Math.floor(t.start % 60).toString().padStart(2, '0')}
                      </div>
                      <p className="text-[14px] text-[#3d3d3d] leading-relaxed">
                        {t.text}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-[14px] text-gray-500">No transcript available for this video.</p>
                )}
              </div>
            </div>
          )}


          
          {/* Bottom Padding spacer */}
          <div className="h-10"></div>
        </div>
      </div>

      {/* RIGHT PANE: Chat Interface (40% = 2/5) */}
      <div className="col-span-2 flex flex-col h-full bg-[#fdfdfd] relative min-h-0">
        <div className="flex-1 overflow-y-auto w-full" ref={chatScrollRef}>
          <div className="px-6 py-6 mx-auto w-full">
            
            {/* Welcome Card */}
            <div className="mb-8 border border-[#eaeaea] rounded-xl p-5 flex flex-col gap-1.5 bg-[#fcfcfc]">
              <h3 className="font-medium text-[15px] text-[#3d3d3d]">I've analyzed the video</h3>
              <p className="text-[14px] text-gray-500">You can ask me anything about the content or concepts discussed.</p>
            </div>

            <div className="space-y-6 pb-24">
              {chatHistory.slice(1).map((msg, idx) => {
                const isLastAssistant = msg.role === 'assistant' && idx === chatHistory.slice(1).length - 1;
                return (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    
                    <div className={`max-w-[85%] flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} gap-1.5`}>
                      <div className={`px-5 py-4 text-[14px] leading-relaxed ${
                        msg.role === 'user' 
                          ? 'bg-[#f0f0f0] text-[#3d3d3d] rounded-2xl' 
                          : 'bg-transparent text-[#3d3d3d] w-full'
                      }`}>
                        {msg.role === 'assistant' && isLastAssistant && msg.isNew ? (
                          <Typewriter 
                            text={msg.content} 
                            speed={10} 
                            onType={scrollToBottom} 
                          />
                        ) : msg.role === 'user' ? (
                          msg.content
                        ) : (
                          <FormattedText text={msg.content} />
                        )}
                        
                        {/* Action icons for Assistant */}
                        {msg.role === 'assistant' && (
                          <div className="flex items-center gap-3 text-gray-400 mt-4">
                            <button className="hover:text-gray-600 transition-colors"><Copy size={14} /></button>
                            <button className="hover:text-gray-600 transition-colors"><ThumbsUp size={14} /></button>
                            <button className="hover:text-gray-600 transition-colors"><ThumbsDown size={14} /></button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              
              {isTyping && (
                <div className="flex justify-start mt-4 px-5">
                  <div className="flex items-center gap-1.5 text-[#a0a0a0] h-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#d0d0d0] animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-[#d0d0d0] animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-[#d0d0d0] animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Floating Chat Input Area */}
        <div className="flex-none px-6 pb-6 pt-0 bg-gradient-to-t from-[#fdfdfd] via-[#fdfdfd] to-transparent sticky bottom-0 flex flex-col items-center z-10">
          
          {/* Suggestion Chips Removed */}

          <div className="w-full shadow-[0_8px_30px_rgb(0,0,0,0.06)] bg-white border border-[#eaeaea] rounded-2xl flex flex-col relative transition-all focus-within:ring-2 focus-within:ring-gray-200 focus-within:border-gray-300">
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (chatInput.trim()) handleSendMessage()
                }
              }}
              placeholder="Ask questions about this video..."
              className="w-full bg-transparent resize-none outline-none px-5 py-4 text-[#3d3d3d] text-[14px] placeholder:text-gray-400 min-h-[60px]"
              rows={1}
            />

            <div className="absolute right-3 bottom-3 flex items-center gap-2">
              <button 
                onClick={() => handleSendMessage()}
                disabled={!chatInput.trim() || isTyping}
                className="w-8 h-8 rounded-full bg-[#111] text-white flex items-center justify-center hover:bg-[#333] disabled:opacity-40 disabled:hover:bg-[#111] transition-colors shadow-sm"
              >
                <Send size={14} className="ml-0.5" />
              </button>
            </div>
          </div>
          <span className="text-[11px] text-[#a0a0a0] mt-3 mb-0 text-center w-full">
            Kyros is an AI and can make mistakes.
          </span>
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
                  return <strong key={k} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>
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
    
    setDisplayedText(text.slice(0, 1))
    
    return () => clearInterval(timer)
  }, [text, speed])

  return <FormattedText text={displayedText} />
}
