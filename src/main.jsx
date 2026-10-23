import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AdminPortal, OwnerPortal } from './Portals.jsx'
import PublicSpaceSubmission from './PublicSpaceSubmission.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/list-a-space" element={<PublicSpaceSubmission />} />
        <Route path="/owner/*" element={<OwnerPortal />} />
        <Route path="/admin/*" element={<AdminPortal />} />
        <Route path="*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
