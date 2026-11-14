export {}

const loading = document.querySelector<HTMLElement>('#loading-screen')
const loadingStatus = document.querySelector<HTMLElement>('#loading-status')
const retry = document.querySelector<HTMLButtonElement>('#loading-retry')

try {
  await import('./main')
  loading?.remove()
} catch (error) {
  console.error('Redline Outpost failed to start.', error)
  if (loadingStatus) loadingStatus.textContent = 'The mission console could not start. Check your connection, then try again.'
  if (loading) loading.setAttribute('aria-busy', 'false')
  if (retry) {
    retry.hidden = false
    retry.addEventListener('click', () => window.location.reload())
    retry.focus()
  }
}
