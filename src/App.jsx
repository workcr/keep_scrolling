import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import Gallery from './components/Gallery'
import './App.css'

function Home() {
  return (
    <div className="home">
      <h1>The Work of Rodrigo Mendes</h1>
      <nav>
        <Link to="/gallery">View Gallery</Link>
      </nav>
    </div>
  )
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/gallery" element={<Gallery />} />
      </Routes>
    </Router>
  )
}

export default App
