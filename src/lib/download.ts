/**
 * Hand the browser a file to save.
 *
 * The data never leaves the machine: a Blob URL points at memory in this tab,
 * the browser writes it straight to disk, and the object URL is released
 * immediately afterwards. No upload, no round trip, nothing to intercept.
 */
export function downloadText(
  filename: string,
  text: string,
  mimeType: string,
): void {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` })
  const url = URL.createObjectURL(blob)

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()

  // Release the object URL once the click has been handled. Without this the
  // blob stays in memory for the life of the tab.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Read a file the user picked, as text. */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'))
    reader.readAsText(file)
  })
}
