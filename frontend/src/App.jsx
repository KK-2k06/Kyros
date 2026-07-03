// ============================================================
// App.jsx — Main app with routing
// ============================================================
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Agent1 from './pages/Agent1'
import Agent2 from './pages/Agent2'
import Agent3 from './pages/Agent3'
import Agent4 from './pages/Agent4'
import ChatsList from './pages/ChatsList'
import ProtectedRoute from './components/ProtectedRoute'
import Sidebar from './components/Sidebar'

// Layout wraps protected pages with the sidebar
function Layout({ children }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      {children}
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/agent1"
          element={
            <ProtectedRoute>
              <Layout>
                <Agent1 />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/chats"
          element={
            <ProtectedRoute>
              <Layout>
                <ChatsList />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/agent2"
          element={
            <ProtectedRoute>
              <Layout>
                <Agent2 />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/agent3"
          element={
            <ProtectedRoute>
              <Layout>
                <Agent3 />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/test"
          element={
            <ProtectedRoute>
              <Layout>
                <Agent4 />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/agent1" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
