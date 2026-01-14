/**
 * StreamRecoveryManager - Monitors stream activity and handles timeouts
 * 
 * Provides automatic recovery mechanism when streams stall or timeout.
 * Based on bolt.diy's implementation.
 */

export interface StreamRecoveryOptions {
  maxRetries?: number;
  timeout?: number;
  onTimeout?: () => void;
  onRecovery?: () => void;
  onMaxRetriesReached?: () => void;
}

export class StreamRecoveryManager {
  private _retryCount = 0;
  private _timeoutHandle: NodeJS.Timeout | null = null;
  private _lastActivity: number = Date.now();
  private _isActive = false;
  private _options: Required<Omit<StreamRecoveryOptions, 'onTimeout' | 'onRecovery' | 'onMaxRetriesReached'>> & StreamRecoveryOptions;

  constructor(options: StreamRecoveryOptions = {}) {
    this._options = {
      maxRetries: 3,
      timeout: 45000, // 45 seconds default - generous for code generation
      ...options,
    };
  }

  /**
   * Start monitoring stream activity
   */
  startMonitoring(): void {
    this._isActive = true;
    this._lastActivity = Date.now();
    this._resetTimeout();
    console.log('[StreamRecovery] Started monitoring');
  }

  /**
   * Update activity timestamp - call this whenever stream activity is detected
   */
  updateActivity(): void {
    if (!this._isActive) {
      return;
    }
    
    this._lastActivity = Date.now();
    this._resetTimeout();
  }

  /**
   * Reset the timeout timer
   */
  private _resetTimeout(): void {
    if (this._timeoutHandle) {
      clearTimeout(this._timeoutHandle);
      this._timeoutHandle = null;
    }

    if (!this._isActive) {
      return;
    }

    this._timeoutHandle = setTimeout(() => {
      if (this._isActive) {
        console.warn(`[StreamRecovery] Stream timeout detected after ${this._options.timeout}ms`);
        this._handleTimeout();
      }
    }, this._options.timeout);
  }

  /**
   * Handle timeout event
   */
  private _handleTimeout(): void {
    if (this._retryCount >= this._options.maxRetries) {
      console.error(`[StreamRecovery] Max retries (${this._options.maxRetries}) reached`);
      this.stop();

      if (this._options.onMaxRetriesReached) {
        this._options.onMaxRetriesReached();
      }

      return;
    }

    this._retryCount++;
    console.log(`[StreamRecovery] Attempting recovery (attempt ${this._retryCount}/${this._options.maxRetries})`);

    if (this._options.onTimeout) {
      this._options.onTimeout();
    }

    // Reset monitoring after recovery attempt
    this._lastActivity = Date.now();
    this._resetTimeout();

    if (this._options.onRecovery) {
      this._options.onRecovery();
    }
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    this._isActive = false;

    if (this._timeoutHandle) {
      clearTimeout(this._timeoutHandle);
      this._timeoutHandle = null;
    }

    console.log(`[StreamRecovery] Stopped monitoring (${this._retryCount} retries used)`);
  }

  /**
   * Get current status
   */
  getStatus(): {
    isActive: boolean;
    retryCount: number;
    lastActivity: number;
    timeSinceLastActivity: number;
    maxRetries: number;
  } {
    return {
      isActive: this._isActive,
      retryCount: this._retryCount,
      lastActivity: this._lastActivity,
      timeSinceLastActivity: Date.now() - this._lastActivity,
      maxRetries: this._options.maxRetries,
    };
  }

  /**
   * Check if we can still retry
   */
  canRetry(): boolean {
    return this._retryCount < this._options.maxRetries;
  }
}
