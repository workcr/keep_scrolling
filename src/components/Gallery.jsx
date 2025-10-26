import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { galleryImages, isWideItem } from '../galleryData'
import './Gallery.css'

function Gallery() {
  const [loadedImages, setLoadedImages] = useState(new Set())
  const gridRef = useRef(null)

  const resizeGridItem = (item) => {
    if (!item) return

    const grid = gridRef.current
    if (!grid) return

    const rowHeight = 10 // matches grid-auto-rows
    const rowGap = 20 // matches gap

    const img = item.querySelector('img')
    if (!img || !img.complete) return

    const contentHeight = img.getBoundingClientRect().height
    const rowSpan = Math.ceil((contentHeight + rowGap) / (rowHeight + rowGap))

    item.style.gridRowEnd = `span ${rowSpan}`
  }

  const handleImageLoad = (event, index) => {
    setLoadedImages(prev => new Set([...prev, index]))

    // Calculate and set the row span for this item
    const item = event.target.parentElement
    resizeGridItem(item)
  }

  // Recalculate on window resize
  useEffect(() => {
    const resizeAllGridItems = () => {
      if (!gridRef.current) return
      const items = gridRef.current.querySelectorAll('.masonry-item')
      items.forEach(item => resizeGridItem(item))
    }

    window.addEventListener('resize', resizeAllGridItems)
    return () => window.removeEventListener('resize', resizeAllGridItems)
  }, [])

  return (
    <div className="gallery-container">
      <header className="gallery-header">
        <Link to="/" className="back-link">← Back</Link>
        <h1>Gallery</h1>
      </header>

      <div className="masonry-grid" ref={gridRef}>
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
              onLoad={(e) => handleImageLoad(e, index)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export default Gallery
