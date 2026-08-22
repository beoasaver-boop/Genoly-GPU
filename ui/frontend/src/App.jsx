import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Device from './pages/Device.jsx'
import Qc from './pages/Qc.jsx'
import Kmer from './pages/Kmer.jsx'
import Variants from './pages/Variants.jsx'
import Quantitative from './pages/Quantitative.jsx'
import Gblup from './pages/Gblup.jsx'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/device" element={<Device />} />
        <Route path="/qc" element={<Qc />} />
        <Route path="/kmer" element={<Kmer />} />
        <Route path="/variants" element={<Variants />} />
        <Route path="/quantitative" element={<Quantitative />} />
        <Route path="/gblup" element={<Gblup />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}