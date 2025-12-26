document.addEventListener('DOMContentLoaded', () => {
  const flash = document.getElementById('flash-message')
  if (!flash) return

  setTimeout(() => {
    flash.style.opacity = '0'
    flash.style.transform = 'scale(0.98)'

    setTimeout(() => {
      flash.style.display = 'none'
    }, 400)
  }, 4000)
})
