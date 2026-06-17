'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { AlertCircle, Loader2, Maximize2, Minimize2 } from 'lucide-react';

interface RtspPlayerProps {
  serial: string;
  apiFetch: any;
  apiBaseUrl: string;
  className?: string;
}

interface WebkitDocument extends Document {
  webkitFullscreenElement?: Element;
  webkitExitFullscreen?: () => Promise<void>;
}

interface WebkitHTMLDivElement extends HTMLDivElement {
  webkitRequestFullscreen?: () => Promise<void>;
}

interface WebkitVideoElement extends HTMLVideoElement {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
}

let globalReqCounter = 0;

export function RtspPlayer({ serial, apiFetch, apiBaseUrl, className }: RtspPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<string>('16/9');
  const wsRef = useRef<WebSocket | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const queueRef = useRef<Uint8Array[]>([]);
  const objectUrlRef = useRef<string | null>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const watchdogTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onFullscreenChange = () => {
      const fsElement = document.fullscreenElement || (document as WebkitDocument).webkitFullscreenElement;
      setIsFullscreen(fsElement === containerRef.current);
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    const video = videoRef.current;
    const c = containerRef.current;

    // Check if device is iOS (iPhone, iPad, iPod)
    const isIOS = typeof navigator !== 'undefined' && (
      /iPad|iPhone|iPod/.test(navigator.userAgent) || 
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );

    if (isIOS && video) {
      const webkitVideo = video as WebkitVideoElement;
      if (typeof webkitVideo.webkitEnterFullscreen === 'function') {
        try {
          webkitVideo.webkitEnterFullscreen();
          return;
        } catch (err) {
          console.warn('[RtspPlayer] Failed to enter webkit fullscreen on iOS:', err);
        }
      }
    }

    if (!c) return;

    const requestFs = c.requestFullscreen || (c as WebkitHTMLDivElement).webkitRequestFullscreen;
    const exitFs = document.exitFullscreen || (document as WebkitDocument).webkitExitFullscreen;
    const fsElement = document.fullscreenElement || (document as WebkitDocument).webkitFullscreenElement;

    if (requestFs && exitFs) {
      try {
        if (fsElement) {
          await exitFs.call(document);
        } else {
          await requestFs.call(c);
        }
        return;
      } catch (err) {
        console.warn('[RtspPlayer] Failed to toggle native fullscreen:', err);
      }
    }

    // CSS-based fullscreen fallback for iOS Safari on iPhone
    setIsFullscreen((prev) => !prev);
  };

  const isCssFullscreen = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const fsElement = document.fullscreenElement || (document as WebkitDocument).webkitFullscreenElement;
    return isFullscreen && !fsElement;
  }, [isFullscreen]);

  const appendNext = () => {
    const mediaSource = mediaSourceRef.current;
    const sourceBuffer = sourceBufferRef.current;
    const queue = queueRef.current;
    
    // Critical guard: MediaSource must be open to append buffers safely
    if (!mediaSource || mediaSource.readyState !== 'open') return;
    if (!sourceBuffer || sourceBuffer.updating || queue.length === 0) return;

    try {
      const chunk = queue.shift();
      if (chunk) {
        sourceBuffer.appendBuffer(chunk as unknown as BufferSource);
        
        // Fast-path fallback for instant playback start
        if (!started) {
          setStarted(true);
          setLoading(false);
        }
      }
    } catch (err) {
      console.error('[RtspPlayer] Append error:', err);
    }
  };

  const clearRender = (stopBackend = false) => {
    // Invalidate any active asynchronous stream initialization requests
    activeRequestIdRef.current = null;

    setLoading(false);
    setStarted(false);
    setAspectRatio('16/9');

    // Clear active retry timeout to prevent background execution after unmount or switch
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    if (watchdogTimeoutRef.current) {
      clearTimeout(watchdogTimeoutRef.current);
      watchdogTimeoutRef.current = null;
    }

    // Close WebSocket
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }

    // Clear SourceBuffer listeners
    if (sourceBufferRef.current) {
      try {
        sourceBufferRef.current.removeEventListener('updateend', appendNext);
      } catch {}
      sourceBufferRef.current = null;
    }

    // Cleanup MediaSource
    if (mediaSourceRef.current) {
      try {
        if (mediaSourceRef.current.readyState === 'open') {
          mediaSourceRef.current.endOfStream();
        }
      } catch {}
      mediaSourceRef.current = null;
    }

    // Revoke Object URL
    if (objectUrlRef.current) {
      try {
        URL.revokeObjectURL(objectUrlRef.current);
      } catch {}
      objectUrlRef.current = null;
    }

    // Reset video element
    if (videoRef.current) {
      videoRef.current.onplaying = null;
      videoRef.current.onloadedmetadata = null;
      videoRef.current.src = '';
      try {
        videoRef.current.load();
      } catch {}
    }

    queueRef.current = [];
  };

  const initStream = async () => {
    if (!videoRef.current || !serial) return;
    
    clearRender(false);

    // Generate a unique token for this request sequence
    const reqId = `${globalReqCounter++}-${retryCountRef.current}`;
    activeRequestIdRef.current = reqId;

    setLoading(true);
    setError(null);

    try {
      console.log(`[RtspPlayer] Requesting live stream for serial: "${serial}" (reqId: ${reqId})`);
      const response = await apiFetch(`${apiBaseUrl}/river/devices/${serial}/stream`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'ไม่สามารถดึงข้อมูลสตรีมได้');
      }

      // Convert SDP response from stream service into Go2RTC WebSocket URL
      const wsUrl = `wss://cctv.mueangsmart.com/api/ws?src=${serial}`;

      console.log(`[RtspPlayer] Connecting WebRTC/MSE WebSocket: "${wsUrl}"`);

      // 2. Set up MediaSource
      const mediaSource = new MediaSource();
      mediaSourceRef.current = mediaSource;
      
      const objectUrl = URL.createObjectURL(mediaSource);
      objectUrlRef.current = objectUrl;
      
      const video = videoRef.current;
      video.src = objectUrl;

      video.onloadedmetadata = () => {
        if (video.videoWidth && video.videoHeight) {
          setAspectRatio(`${video.videoWidth}/${video.videoHeight}`);
        }
      };

      video.onplaying = () => {
        setStarted(true);
        setLoading(false);
        if (watchdogTimeoutRef.current) {
          clearTimeout(watchdogTimeoutRef.current);
          watchdogTimeoutRef.current = null;
        }
      };

      video.ontimeupdate = () => {
        if (video.currentTime > 0) {
          setStarted(true);
          setLoading(false);
          if (watchdogTimeoutRef.current) {
            clearTimeout(watchdogTimeoutRef.current);
            watchdogTimeoutRef.current = null;
          }
        }

        // ⚡ Cellular-Optimized Hybrid Catch-up (Prevents stuttering/jumping)
        // - Moderate delay (1.5s - 4.0s): Smoothly catch up by playing slightly faster (1.15x speed).
        // - Huge delay (> 4.0s): Perform a single hard seek to jump close to the live edge.
        try {
          const buffered = video.buffered;
          if (buffered && buffered.length > 0) {
            const bufferedEnd = buffered.end(buffered.length - 1);
            const delay = bufferedEnd - video.currentTime;

            if (delay > 4.0) {
              // If delay is huge, jump instantly to clear lag
              video.currentTime = bufferedEnd - 0.5;
              video.playbackRate = 1.0;
            } else if (delay > 1.5) {
              // Smoothly catch up without frame skipping/jumping
              video.playbackRate = 1.15;
            } else {
              // Reset to normal speed
              video.playbackRate = 1.0;
            }
          }
        } catch {}
      };

      video.oncanplay = () => {
        setStarted(true);
        setLoading(false);
        if (watchdogTimeoutRef.current) {
          clearTimeout(watchdogTimeoutRef.current);
          watchdogTimeoutRef.current = null;
        }
      };

      mediaSource.addEventListener('sourceopen', () => {
        if (!mediaSourceRef.current || activeRequestIdRef.current !== reqId) return;
        try {
          // 3. Connect to Go2RTC WebSocket
          const ws = new WebSocket(wsUrl);
          ws.binaryType = 'arraybuffer';
          wsRef.current = ws;

          ws.onopen = () => {
            console.log('[RtspPlayer] Go2RTC WebSocket connected. Requesting MSE (H.264 & H.265)...');
            
            // 🛡️ Watchdog Timer for Black Screen Recovery
            const watchdogDelay = 5000;
            
            if (watchdogTimeoutRef.current) clearTimeout(watchdogTimeoutRef.current);
            watchdogTimeoutRef.current = setTimeout(() => {
              if (activeRequestIdRef.current === reqId && !video.currentTime) {
                console.warn(`[RtspPlayer] CanPlay Watchdog triggered! Stalled black screen detected after ${watchdogDelay / 1000}s. Force reconnecting...`);
                initStream();
              }
            }, watchdogDelay);

            // Request both H.264 and H.265 codecs to restore compatibility for HEVC-only cameras
            ws.send(JSON.stringify({
              type: 'mse',
              value: 'avc1.640029,avc1.64002A,avc1.640033,hvc1.1.6.L153.B0'
            }));
          };

          ws.onmessage = async (e) => {
            if (typeof e.data === 'string') {
              // Parse negotiated codec from Go2RTC
              try {
                const msg = JSON.parse(e.data);
                if (msg.type === 'mse' && mediaSourceRef.current) {
                  const negotiatedCodec = msg.value;
                  console.log('[RtspPlayer] Negotiated mime/codecs from Go2RTC:', negotiatedCodec);
                  
                  const sourceBuffer = mediaSourceRef.current.addSourceBuffer(negotiatedCodec);
                  sourceBuffer.mode = 'segments';
                  sourceBuffer.addEventListener('updateend', appendNext);
                  sourceBufferRef.current = sourceBuffer;
                  
                  // Reset retry count on successful MSE negotiation
                  retryCountRef.current = 0;
                }
              } catch (parseErr) {
                console.error('[RtspPlayer] Failed to parse Go2RTC MSE response:', parseErr);
              }
            } else {
              // Binary media segment
              const buffer = new Uint8Array(e.data);
              queueRef.current.push(buffer);
              appendNext();
            }
          };

          ws.onclose = () => {
            console.log('[RtspPlayer] Go2RTC WebSocket connection closed.');
            // Only retry if this is the active WebSocket connection!
            if (wsRef.current !== ws) {
              console.log('[RtspPlayer] Old WebSocket closed, ignoring.');
              return;
            }
            if (!started) {
              if (retryCountRef.current < 4) {
                retryCountRef.current += 1;
                console.log(`[RtspPlayer] Stream not started yet. Retrying in 1.5s (Attempt ${retryCountRef.current}/4)...`);
                if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
                retryTimeoutRef.current = setTimeout(() => {
                  if (mediaSourceRef.current) { // Ensure component is still mounted
                    initStream();
                  }
                }, 1500);
              } else {
                setError('กล้องกำลังเชื่อมต่อระบบ กรุณารอครู่หนึ่งหรือกดรีโหลดข้อมูล');
                setLoading(false);
              }
            }
          };

          ws.onerror = (err) => {
            console.error('[RtspPlayer] Go2RTC WebSocket Error:', err);
            if (started || retryCountRef.current >= 4) {
              setError('การเชื่อมต่อสัญญาณภาพล้มเหลว');
            }
            setLoading(false);
          };

        } catch (err) {
          console.error('[RtspPlayer] SourceBuffer initialization failed:', err);
          setError('ล้มเหลวในการตั้งค่าตัวประสานเครื่องเล่นวิดีโอ');
          setLoading(false);
        }
      });

    } catch (err) {
      console.error('[RtspPlayer] Stream initialization failed:', err);
      const errorMsg = err instanceof Error ? err.message : 'ล้มเหลวในการเชื่อมต่อกล้องวงจรปิด';
      setError(errorMsg);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (serial) {
      retryCountRef.current = 0;
      initStream();
    }
    return () => clearRender(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serial]);

  return (
    <div 
      ref={containerRef} 
      className={`relative w-full bg-black rounded-2xl overflow-hidden shadow-inner ${isCssFullscreen ? 'fixed inset-0 w-screen h-screen z-[9999] rounded-none' : ''} ${className || ''}`}
      style={isCssFullscreen ? { height: '100vh', width: '100vw' } : { aspectRatio }}
    >
      <video
        ref={videoRef}
        id="cctv-detail-video"
        className="w-full h-full cursor-pointer"
        style={{ 
          backgroundColor: 'black',
          width: '100%',
          height: '100%',
          objectFit: 'contain'
        }}
        autoPlay
        playsInline
        muted
        onClick={toggleFullscreen}
      />

      <button
        type="button"
        onClick={toggleFullscreen}
        className="absolute bottom-3 right-3 z-20 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3 py-2 text-[11px] font-semibold tracking-wide text-white backdrop-blur-md transition-all hover:bg-black/65 hover:scale-[1.02] active:scale-[0.98]"
        title={isFullscreen ? 'ออกจากเต็มจอ' : 'ขยายเต็มจอ'}
        aria-label={isFullscreen ? 'ออกจากเต็มจอ' : 'ขยายเต็มจอ'}
      >
        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        <span className="hidden sm:inline">{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
      </button>
      
      {loading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white z-10 backdrop-blur-md">
          <Loader2 className="animate-spin w-10 h-10 mb-3 text-indigo-400" />
          <span className="text-sm font-semibold font-mono tracking-wider animate-pulse">
            CONNECTING LIVE FEED...
          </span>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 text-white p-6 text-center z-10">
          <AlertCircle className="w-12 h-12 text-rose-500 mb-3" />
          <h4 className="font-semibold text-slate-200 text-base mb-1">เกิดข้อผิดพลาดในการโหลดกล้อง</h4>
          <p className="text-xs text-slate-400 max-w-xs">{error}</p>
        </div>
      )}
    </div>
  );
}
