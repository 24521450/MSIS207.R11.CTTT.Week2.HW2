export function createAbortError(message = 'Audio task was cancelled.'): DOMException {
  return new DOMException(message, 'AbortError')
}

export function describeAudioError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error
  }

  return 'An unknown audio error occurred.'
}
