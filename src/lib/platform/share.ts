export function supportsNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export async function shareResult(data: { title: string; text: string; url: string }): Promise<'shared' | 'copied' | 'cancelled'> {
  if (supportsNativeShare()) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (error) {
      // Dismissing the sheet must not silently overwrite the clipboard.
      if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
        return 'cancelled';
      }
    }
  }
  if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
  await navigator.clipboard.writeText(`${data.text}\n\n${data.url}`);
  return 'copied';
}
