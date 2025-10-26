import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { fetchGalleryData, isWideItem } from '../utils/galleryData'
import './Gallery.css'

function Gallery() {
  const [galleryItems, setGalleryItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [loadedImages, setLoadedImages] = useState(new Set())
  const gridRef = useRef(null)

  // Fetch gallery data from Google Sheets on mount
  useEffect(() => {
    const loadGalleryData = async () => {
      try {
        setLoading(true)
        const items = await fetchGalleryData()
        setGalleryItems(items)
        setError(null)
      } catch (err) {
        setError('Failed to load gallery. Please try again later.')
        console.error('Gallery load error:', err)
      } finally {
        setLoading(false)
      }
    }

    loadGalleryData()
  }, [])

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

      {loading && (
        <div className="gallery-loading">
          <p>Loading gallery...</p>
        </div>
      )}

      {error && (
        <div className="gallery-error">
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && (
        <div className="masonry-grid" ref={gridRef}>
          {galleryItems.map((item, index) => (
            <div
              key={item.id || index}
              className={`masonry-item ${isWideItem(index) ? 'wide' : ''} ${
                loadedImages.has(index) ? 'loaded' : ''
              }`}
            >
              <img
                src={`/${item.src}`}
                alt={item.alt}
                loading="lazy"
                onLoad={(e) => handleImageLoad(e, index)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Gallery
