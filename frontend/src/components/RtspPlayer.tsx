'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { AlertCircle, Loader2, Maximize2, Minimize2, VideoOff, RefreshCw, Camera } from 'lucide-react';

interface RtspPlayerProps {
  serial: string;
  apiFetch: any;
  apiBaseUrl: string;
  className?: string;
  fillParent?: boolean;
  hideControls?: boolean;
  style?: React.CSSProperties;
  onVideoClick?: () => void;
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

export function RtspPlayer({ serial, apiFetch, apiBaseUrl, className, fillParent, hideControls, style, onVideoClick }: RtspPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<string>('16/9');
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const queueRef = useRef<Uint8Array[]>([]);
  const objectUrlRef = useRef<string | null>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const watchdogTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
          if (watchdogTimeoutRef.current) {
            clearTimeout(watchdogTimeoutRef.current);
            watchdogTimeoutRef.current = null;
          }
        }
        if (videoRef.current && videoRef.current.paused) {
          videoRef.current.play().catch(() => {});
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
    setRetryCountdown(null);
    setSnapshotUrl(null);

    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    // Clear active retry timeout to prevent background execution after unmount or switch
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    if (watchdogTimeoutRef.current) {
      clearTimeout(watchdogTimeoutRef.current);
      watchdogTimeoutRef.current = null;
    }

    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
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

  const triggerFailureRecovery = (reason: string) => {
    if (started) return;
    console.warn(`[RtspPlayer] Stream failure for "${serial}": ${reason}. Initiating auto-recovery...`);
    setError(reason);
    setLoading(false);

    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }
    if (watchdogTimeoutRef.current) {
      clearTimeout(watchdogTimeoutRef.current);
      watchdogTimeoutRef.current = null;
    }

    // Try fetching latest snapshot from Go2RTC
    const snapUrl = `https://cctv.mueangsmart.com/api/frame.jpeg?src=${serial}&t=${Date.now()}`;
    const img = new Image();
    img.onload = () => {
      // If snapshot is non-trivial image
      if (img.width > 50 && img.height > 50) {
        setSnapshotUrl(snapUrl);
      }
    };
    img.src = snapUrl;

    // Start auto-reconnect timer (8 seconds)
    const RETRY_SECONDS = 8;
    setRetryCountdown(RETRY_SECONDS);

    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    countdownIntervalRef.current = setInterval(() => {
      setRetryCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
          setRetryCountdown(null);
          setError(null);
          setSnapshotUrl(null);
          initStream();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
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

      
      // Start periodic heartbeat (every 45s) to keep backend stream session and TTL alive
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = setInterval(async () => {
        if (activeRequestIdRef.current === reqId && serial) {
          try {
            await apiFetch(`${apiBaseUrl}/river/devices/${serial}/stream`, { method: "POST" });
            console.log(`[RtspPlayer] Stream heartbeat sent for "${serial}"`);
          } catch (hbErr) {
            console.warn("[RtspPlayer] Stream heartbeat error:", hbErr);
          }
        }
      }, 45000);

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
            
            // 🛡️ Watchdog Timer for Black Screen Detection & Auto-Recovery (8 seconds)
            const watchdogDelay = 8000;
            
            if (watchdogTimeoutRef.current) clearTimeout(watchdogTimeoutRef.current);
            watchdogTimeoutRef.current = setTimeout(() => {
              if (activeRequestIdRef.current === reqId && !video.currentTime && !started) {
                console.warn(`[RtspPlayer] CanPlay Watchdog triggered! Stalled stream detected after ${watchdogDelay / 1000}s.`);
                triggerFailureRecovery('ไม่มีสัญญาณภาพ (RTSP Stalled)');
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
              // Parse response from Go2RTC
              try {
                const msg = JSON.parse(e.data);
                if (msg.type === 'error') {
                  console.warn(`[RtspPlayer] Go2RTC error for "${serial}":`, msg.value);
                  triggerFailureRecovery(msg.value || 'สัญญาณกล้องขัดข้อง (i/o timeout)');
                  return;
                }
                if (msg.type === 'mse' && mediaSourceRef.current) {
                  const negotiatedCodec = msg.value;
                  console.log('[RtspPlayer] Negotiated mime/codecs from Go2RTC:', negotiatedCodec);
                  
                  const sourceBuffer = mediaSourceRef.current.addSourceBuffer(negotiatedCodec);
                  sourceBuffer.mode = 'segments';
                  sourceBuffer.addEventListener('updateend', appendNext);
                  sourceBufferRef.current = sourceBuffer;
                  
                  retryCountRef.current = 0;
                }
              } catch (parseErr) {
                console.error('[RtspPlayer] Failed to parse Go2RTC message:', parseErr);
              }
            } else {
              // Binary media segment arrived successfully!
              const buffer = new Uint8Array(e.data);
              queueRef.current.push(buffer);
              appendNext();
              if (watchdogTimeoutRef.current) {
                clearTimeout(watchdogTimeoutRef.current);
                watchdogTimeoutRef.current = null;
              }
              if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
                countdownIntervalRef.current = null;
              }
              setRetryCountdown(null);
              setError(null);
            }
          };

          ws.onclose = () => {
            console.log('[RtspPlayer] Go2RTC WebSocket connection closed.');
            if (wsRef.current !== ws) {
              console.log('[RtspPlayer] Old WebSocket closed, ignoring.');
              return;
            }

            // Always auto-reconnect if component is still active
            if (activeRequestIdRef.current === reqId) {
              const delay = started ? 2500 : 1500;
              console.log(`[RtspPlayer] Stream connection dropped. Auto-reconnecting in ${delay}ms...`);
              if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
              retryTimeoutRef.current = setTimeout(() => {
                if (activeRequestIdRef.current === reqId) {
                  initStream();
                }
              }, delay);
            }
          };

          ws.onerror = (err) => {
            console.error('[RtspPlayer] Go2RTC WebSocket Error:', err);
            if (started || retryCountRef.current >= 4) {
              setError('สัญญาณภาพขัดข้อง');
            }
            setLoading(false);
          };

        } catch (err) {
          console.error('[RtspPlayer] SourceBuffer initialization failed:', err);
          setError('ไม่สามารถเปิดสัญญาณภาพกล้องได้');
          setLoading(false);
        }
      });

    } catch (err) {
      console.error('[RtspPlayer] Stream initialization failed:', err);
      const errorMsg = err instanceof Error ? err.message : 'ไม่สามารถเชื่อมต่อกล้องวงจรปิดได้';
      triggerFailureRecovery(errorMsg);
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
      style={isCssFullscreen ? { height: '100vh', width: '100vw' } : (fillParent ? { width: '100%', height: '100%', ...style } : { aspectRatio, ...style })}
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
        onClick={(e) => {
          if (onVideoClick) {
            e.stopPropagation();
            e.preventDefault();
            onVideoClick();
          } else {
            toggleFullscreen();
          }
        }}
      />

      {!hideControls && (
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
      )}
      
      {loading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white z-10 backdrop-blur-md">
          <Loader2 className="animate-spin w-10 h-10 mb-3 text-indigo-400" />
          <span className="text-sm font-semibold font-mono tracking-wider animate-pulse">
            CONNECTING LIVE FEED...
          </span>
        </div>
      )}

      {/* 1. SNAPSHOT FALLBACK WITH AUTO-RETRY OVERLAY */}
      {snapshotUrl && !started && (
        <div className="absolute inset-0 z-10 w-full h-full bg-black flex items-center justify-center overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={snapshotUrl}
            alt={`Snapshot ${serial}`}
            className="w-full h-full object-contain"
          />
          <div className="absolute top-1.5 left-1.5 z-20 flex items-center space-x-1.5 bg-black/80 backdrop-blur-md px-2 py-0.5 rounded-full border border-amber-500/50 shadow">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
            <span className="text-[8px] font-mono font-bold text-amber-200">
              SNAPSHOT • RETRY IN {retryCountdown || 8}s
            </span>
          </div>
          <button
            onClick={() => {
              if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
              setRetryCountdown(null);
              setError(null);
              setSnapshotUrl(null);
              initStream();
            }}
            title="ลองเชื่อมต่อสดใหม่อีกครั้ง"
            className="absolute bottom-1.5 right-1.5 z-20 px-2 py-0.5 rounded bg-indigo-600/90 hover:bg-indigo-600 text-white transition flex items-center space-x-1 text-[8.5px] font-bold shadow backdrop-blur-sm"
          >
            <RefreshCw className="w-2.5 h-2.5" />
            <span>เชื่อมต่อสด</span>
          </button>
        </div>
      )}

      {/* 2. TACTICAL NOC NO SIGNAL OVERLAY WITH AUTO-RETRY COUNTDOWN */}
      {error && !snapshotUrl && !started && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/95 text-white p-3 text-center z-10 border border-slate-800">
          <div className="w-7 h-7 rounded-full bg-rose-950/90 border border-rose-800 flex items-center justify-center mb-1 shadow-inner">
            <VideoOff className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
          </div>
          <h4 className="font-mono font-black text-rose-400 text-[10.5px] tracking-wider uppercase">
            NO VIDEO SIGNAL
          </h4>
          <p className="text-[9px] text-slate-400 max-w-[190px] truncate mt-0.5 font-mono">
            {error.includes('timeout') ? 'RTSP I/O TIMEOUT' : error}
          </p>
          <div className="mt-2 flex items-center space-x-1.5">
            <span className="text-[8.5px] font-mono text-slate-400">
              ลองใหม่ใน {retryCountdown !== null ? `${retryCountdown}s` : '...'}
            </span>
            <button
              onClick={() => {
                if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
                setRetryCountdown(null);
                setError(null);
                initStream();
              }}
              className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[8.5px] font-bold transition flex items-center space-x-1 shadow-sm"
            >
              <RefreshCw className="w-2.5 h-2.5" />
              <span>ลองทันที</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
