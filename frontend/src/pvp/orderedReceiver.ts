/** Serializes asynchronous packet decoding without coupling the behavior to WebRTC. */
export function createOrderedPvpReceiver<T>(
  decode: (raw: string) => Promise<T | null>,
  deliver: (message: T) => void,
): (raw: string) => void {
  let queue: Promise<void> = Promise.resolve();
  return (raw: string) => {
    queue = queue
      .then(async () => {
        const message = await decode(raw);
        if (message) deliver(message);
      })
      // A malformed packet must not prevent later valid packets from processing.
      .catch(() => undefined);
  };
}
