// ============================================================
// Login.jsx — Simple email + password login
// ============================================================
import { useState } from 'react'
import { supabase } from '../supabase'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Eye, EyeOff } from 'lucide-react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  
  const [isSignup, setIsSignup] = useState(false)
  const [isFlipping, setIsFlipping] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const toggleMode = () => {
    setIsFlipping(true)
    setTimeout(() => {
      setIsSignup(!isSignup)
      setError('')
      setIsFlipping(false)
    }, 250) // 250ms half-flip duration
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isSignup) {
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.')
        }
        
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: firstName,
              last_name: lastName,
            }
          }
        })
        if (error) throw error

        navigate('/agent1')
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error

        navigate('/agent1')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fcfcfc] text-[#3d3d3d] font-sans" style={{ perspective: '1000px' }}>
      <div 
        className={`bg-white border border-[#e5e5e5] rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-8 w-full max-w-[420px] transition-all duration-300 ${
          isFlipping ? 'opacity-0 scale-95 rotate-y-90' : 'opacity-100 scale-100 rotate-y-0'
        }`}
        style={{ transformStyle: 'preserve-3d' }}
      >
        
        <div className="text-center mb-8 flex flex-col items-center">
          <Sparkles className="text-[#d97757] mb-3" size={28} strokeWidth={1.5} />
          <h1 className="text-[28px] text-[#3d3d3d] font-serif tracking-tight leading-tight">
            {isSignup ? 'Create account' : 'Welcome back'}
          </h1>
          <p className="text-[#888] text-[14px] mt-2">
            {isSignup ? "Welcome! Let's get started" : "Continue to Kyros AI"}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 text-[13px] px-4 py-2.5 rounded-lg mb-6 border border-red-100 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {isSignup && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[13px] font-medium text-[#555] mb-1.5 block">First name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 bg-[#fcfcfc] border border-[#e5e5e5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#d0d0d0] focus:bg-white transition-all text-[14px] text-[#3d3d3d]"
                />
              </div>
              <div className="flex-1">
                <label className="text-[13px] font-medium text-[#555] mb-1.5 block">Last name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 bg-[#fcfcfc] border border-[#e5e5e5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#d0d0d0] focus:bg-white transition-all text-[14px] text-[#3d3d3d]"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-[13px] font-medium text-[#555] mb-1.5 block">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2.5 bg-[#fcfcfc] border border-[#e5e5e5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#d0d0d0] focus:bg-white transition-all text-[14px] text-[#3d3d3d]"
            />
          </div>

          <div>
            <label className="text-[13px] font-medium text-[#555] mb-1.5 block">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-2.5 pr-10 bg-[#fcfcfc] border border-[#e5e5e5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#d0d0d0] focus:bg-white transition-all text-[14px] text-[#3d3d3d]"
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-[11px] text-[#a0a0a0] hover:text-[#555] transition-colors"
              >
                {showPassword ? <EyeOff size={18} strokeWidth={1.5} /> : <Eye size={18} strokeWidth={1.5} />}
              </button>
            </div>
          </div>

          {isSignup && (
            <div>
              <label className="text-[13px] font-medium text-[#555] mb-1.5 block">Confirm password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-2.5 pr-10 bg-[#fcfcfc] border border-[#e5e5e5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#d0d0d0] focus:bg-white transition-all text-[14px] text-[#3d3d3d]"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black text-white py-2.5 rounded-xl font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 text-[14px] mt-2"
          >
            {loading ? 'Please wait...' : isSignup ? 'Sign up' : 'Continue'}
          </button>
        </form>

        <p className="text-center text-[13px] text-[#888] mt-6">
          {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={toggleMode}
            disabled={isFlipping}
            className="text-[#3d3d3d] font-medium hover:underline transition-all"
          >
            {isSignup ? 'Log in' : 'Sign up'}
          </button>
        </p>
      </div>
    </div>
  )
}
