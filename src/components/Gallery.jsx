import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { galleryImages, isWideItem } from '../galleryData'
import './Gallery.css'

function Gallery() {
  const [loadedImages, setLoadedImages] = useState(new Set())

  const handleImageLoad = (index) => {
    setLoadedImages(prev => new Set([...prev, index]))
  }

  return (
    <div className="gallery-container">
      <header className="gallery-header">
        <Link to="/" className="back-link">← Back</Link>
        <h1>Gallery</h1>
      </header>

      <div className="masonry-grid">
        {galleryImages.map((image, index) => (
          <div
            key={index}
            className={`masonry-item ${isWideItem(index) ? 'wide' : ''} ${
              loadedImages.has(index) ? 'loaded' : ''
            }`}
          >
            <img
              src={`/${image}`}
              alt={`Gallery item ${index + 1}`}
              loading="lazy"
              onLoad={() => handleImageLoad(index)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export default Gallery
