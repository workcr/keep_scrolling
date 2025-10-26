import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { fetchGalleryData, isWideItem } from '../utils/galleryData'
import './Gallery.css'

function Gallery() {
  const [allItems, setAllItems] = useState([]) // All items from sheet
  const [displayedItems, setDisplayedItems] = useState([]) // Items currently shown
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [loadedImages, setLoadedImages] = useState(new Set())
  const [currentIndex, setCurrentIndex] = useState(0) // Track position in full list
  const gridRef = useRef(null)
  const sentinelRef = useRef(null)

  const INITIAL_LOAD = 20 // Load first 20 items
  const BATCH_SIZE = 15 // Load 15 more when scrolling
  const MAX_ITEMS = 50 // Keep max 50 items in DOM

  // Add autoplay parameters to video URL
  const getVideoUrl = (src) => {
    if (!src) return src

    const separator = src.includes('?') ? '&' : '?'
    return `${src}${separator}autoplay=1&muted=1&loop=1&background=1`
  }

  // Fetch gallery data from Google Sheets on mount
  useEffect(() => {
    const loadGalleryData = async () => {
      try {
        setLoading(true)
        const items = await fetchGalleryData()
        setAllItems(items)
        // Load initial batch
        setDisplayedItems(items.slice(0, Math.min(INITIAL_LOAD, items.length)))
        setCurrentIndex(Math.min(INITIAL_LOAD, items.length))
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

    // Check for both images and video containers
    const img = item.querySelector('img')
    const video = item.querySelector('.video-container')

    let contentHeight = 0

    if (img && img.complete) {
      contentHeight = img.getBoundingClientRect().height
    } else if (video) {
      contentHeight = video.getBoundingClientRect().height
    } else {
      return
    }

    const rowSpan = Math.ceil((contentHeight + rowGap) / (rowHeight + rowGap))
    item.style.gridRowEnd = `span ${rowSpan}`
  }

  const handleImageLoad = (event, index) => {
    setLoadedImages(prev => new Set([...prev, index]))

    // Calculate and set the row span for this item
    const item = event.target.parentElement
    resizeGridItem(item)
  }

  // Recalculate on window resize and when items are loaded
  useEffect(() => {
    const resizeAllGridItems = () => {
      if (!gridRef.current) return
      const items = gridRef.current.querySelectorAll('.masonry-item')
      items.forEach(item => resizeGridItem(item))
    }

    window.addEventListener('resize', resizeAllGridItems)
    return () => window.removeEventListener('resize', resizeAllGridItems)
  }, [])

  // Load more items (infinite scroll)
  const loadMoreItems = () => {
    if (allItems.length === 0) return

    const nextItems = []
    let index = currentIndex

    // Load next batch, looping back to start if needed
    for (let i = 0; i < BATCH_SIZE; i++) {
      nextItems.push(allItems[index % allItems.length])
      index++
    }

    setDisplayedItems(prev => {
      const newItems = [...prev, ...nextItems]
      // Keep only last MAX_ITEMS to prevent DOM bloat
      if (newItems.length > MAX_ITEMS) {
        return newItems.slice(newItems.length - MAX_ITEMS)
      }
      return newItems
    })

    setCurrentIndex(index)
  }

  // Set up Intersection Observer for infinite scroll
  useEffect(() => {
    if (!sentinelRef.current || allItems.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreItems()
        }
      },
      { threshold: 0.1, rootMargin: '200px' } // Trigger 200px before reaching sentinel
    )

    observer.observe(sentinelRef.current)

    return () => observer.disconnect()
  }, [allItems, currentIndex, displayedItems])

  // Resize grid items when displayed items change
  useEffect(() => {
    if (displayedItems.length > 0) {
      // Wait for items to be rendered
      setTimeout(() => {
        if (!gridRef.current) return
        const items = gridRef.current.querySelectorAll('.masonry-item')
        items.forEach(item => resizeGridItem(item))
      }, 100)
    }
  }, [displayedItems])

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
        <>
          <div className="masonry-grid" ref={gridRef}>
            {displayedItems.map((item, index) => (
              <div
                key={`${item.id}-${index}-${currentIndex}`}
                className={`masonry-item ${isWideItem(index) ? 'wide' : ''} ${
                  loadedImages.has(index) ? 'loaded' : ''
                }`}
              >
                {item.mediaType === 'video' ? (
                  <div className="video-container" style={{ aspectRatio: item.aspectRatio || '16 / 9' }}>
                    <iframe
                      src={getVideoUrl(item.src)}
                      frameBorder="0"
                      allow="autoplay; fullscreen; picture-in-picture"
                      allowFullScreen
                      title={item.alt}
                      onLoad={() => {
                        setLoadedImages(prev => new Set([...prev, index]))
                        const container = document.querySelector(`[data-index="${index}"]`)
                        if (container) resizeGridItem(container.parentElement)
                      }}
                    ></iframe>
                  </div>
                ) : (
                  <img
                    src={`/${item.src}`}
                    alt={item.alt}
                    loading="lazy"
                    onLoad={(e) => handleImageLoad(e, index)}
                  />
                )}
              </div>
            ))}
          </div>
          {/* Sentinel element for infinite scroll */}
          <div ref={sentinelRef} className="scroll-sentinel" style={{ height: '20px' }} />
        </>
      )}
    </div>
  )
}

export default Gallery
