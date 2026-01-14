/**
 * SwitchableStream - A TransformStream that can dynamically switch between source streams
 * 
 * This enables seamless continuation when AI responses are truncated due to token limits.
 * The consumer (frontend) remains unaware of the stream switching - it appears as one continuous stream.
 * 
 * Based on bolt.diy's implementation for handling response continuation.
 */
export default class SwitchableStream extends TransformStream<Uint8Array, Uint8Array> {
  private _controller: TransformStreamDefaultController<Uint8Array> | null = null;
  private _currentReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private _switches = 0;
  private _isClosed = false;

  constructor() {
    let controllerRef: TransformStreamDefaultController<Uint8Array> | undefined;

    super({
      start(controller) {
        controllerRef = controller;
      },
    });

    if (controllerRef === undefined) {
      throw new Error('Controller not properly initialized');
    }

    this._controller = controllerRef;
  }

  /**
   * Switch to a new source stream
   * Cancels the current stream (if any) and starts pumping from the new one
   */
  async switchSource(newStream: ReadableStream<Uint8Array>): Promise<void> {
    if (this._isClosed) {
      console.warn('[SwitchableStream] Cannot switch source - stream is closed');
      return;
    }

    // Cancel the current reader if it exists
    if (this._currentReader) {
      try {
        await this._currentReader.cancel();
      } catch (error) {
        console.warn('[SwitchableStream] Error canceling previous reader:', error);
      }
    }

    this._currentReader = newStream.getReader();
    this._switches++;

    console.log(`[SwitchableStream] Switched to new source (switch #${this._switches})`);

    // Start pumping the new stream
    this._pumpStream();
  }

  /**
   * Pump data from the current reader to the controller
   */
  private async _pumpStream(): Promise<void> {
    if (!this._currentReader || !this._controller) {
      throw new Error('Stream is not properly initialized');
    }

    try {
      while (true) {
        const { done, value } = await this._currentReader.read();

        if (done) {
          console.log('[SwitchableStream] Current source stream completed');
          break;
        }

        if (this._isClosed) {
          console.log('[SwitchableStream] Stream closed during pump, stopping');
          break;
        }

        this._controller.enqueue(value);
      }
    } catch (error) {
      console.error('[SwitchableStream] Error pumping stream:', error);
      
      if (!this._isClosed && this._controller) {
        this._controller.error(error);
      }
    }
  }

  /**
   * Close the stream
   */
  close(): void {
    if (this._isClosed) {
      return;
    }

    this._isClosed = true;

    if (this._currentReader) {
      this._currentReader.cancel().catch(error => {
        console.warn('[SwitchableStream] Error canceling reader during close:', error);
      });
    }

    if (this._controller) {
      try {
        this._controller.terminate();
      } catch (error) {
        console.warn('[SwitchableStream] Error terminating controller:', error);
      }
    }

    console.log(`[SwitchableStream] Closed after ${this._switches} switch(es)`);
  }

  /**
   * Get the number of times the stream source has been switched
   */
  get switches(): number {
    return this._switches;
  }

  /**
   * Check if the stream is closed
   */
  get isClosed(): boolean {
    return this._isClosed;
  }
}
