/** Show the result only after the browser settles the write, including when permission is denied. */
export async function copyText(text: string, successMessage?: string, label = text): Promise<boolean> {
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    // Permission denied, the document lost focus, or the clipboard API is unavailable.
  }
  const toast = document.getElementById('brutal-toast');
  if (toast) {
    toast.textContent = copied ? successMessage ?? toast.dataset.copied + label : toast.dataset.copyFailed!;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2400);
  }
  return copied;
}
