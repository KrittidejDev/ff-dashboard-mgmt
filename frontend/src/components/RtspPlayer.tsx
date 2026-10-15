'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

interface RtspPlayerProps {
  serial: string;
  fallbackImageUrl?: string;
  staggerDelay?: number;
  apiFetch?: any;
  apiBaseUrl?: string;
  className?: string;
  fillParent?: boolean;
  hideControls?: boolean;
  skipStreamWakeup?: boolean;
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
}

/**
 * Register VideoRTC custom element if not already registered (matches Mobile implementation 100%)
 */
if (typeof window !== 'undefined' && !customElements.get('video-rtc')) {
  class VideoRTC extends HTMLElement {
    DISCONNECT_TIMEOUT: number;
    RECONNECT_TIMEOUT: number;
    CODECS: string[];
    mode: string;
    media: string;
    background: boolean;
    visibilityThreshold: number;
    visibilityCheck: boolean;
    pcConfig: RTCConfiguration;
    wsState: number;
    pcState: number;
    video: HTMLVideoElement | null;
    ws: WebSocket | null;
    pc: RTCPeerConnection | null;
    wsURL: string;
    connectTS: number;
    mseCodecs: string;
    disconnectTID: any;
    reconnectTID: any;
    ondata: ((data: any) => void) | null;
    onmessage: any;
    onStreamDropped?: () => void;
    onLive?: () => void;

    constructor() {
      super();

      this.DISCONNECT_TIMEOUT = 5000;
      this.RECONNECT_TIMEOUT = 2000;

      this.CODECS = [
        'avc1.640029',
        'avc1.64002A',
        'avc1.640033',
        'avc1.64001F',
        'avc1.640028',
        'avc1.4D002A',
        'avc1.4D0029',
        'avc1.4D0028',
        'avc1.4D001F',
        'avc1.4D001E',
        'avc1.42001F',
        'avc1.42001E',
        'avc1.420028',
        'hvc1.1.6.L153.B0',
        'hev1.1.6.L153.B0',
        'mp4a.40.2',
        'flac',
        'opus',
      ];

      this.mode = 'webrtc,mse,hls';
      this.media = 'video';
      this.background = false;
      this.visibilityThreshold = 0;
      this.visibilityCheck = true;

      this.pcConfig = {
        bundlePolicy: 'max-bundle',
        iceServers: [
          { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
        ],
      };

      this.wsState = WebSocket.CLOSED;
      this.pcState = WebSocket.CLOSED;
      this.video = null;
      this.ws = null;
      this.pc = null;
      this.wsURL = '';
      this.connectTS = 0;
      this.mseCodecs = '';
      this.disconnectTID = 0;
      this.reconnectTID = 0;
      this.ondata = null;
      this.onmessage = null;
    }

    set src(value: string) {
      if (typeof value !== 'string') value = (value as any).toString();
      if (value.startsWith('http')) {
        value = 'ws' + value.substring(4);
      } else if (value.startsWith('/')) {
        value = 'ws' + location.origin.substring(4) + value;
      }
      this.wsURL = value;
      this.onconnect();
    }

    play() {
      if (!this.video) return;
      this.video.play().catch(() => {
        if (this.video && !this.video.muted) {
          this.video.muted = true;
          this.video.play().catch(() => {});
        }
      });
    }

    send(value: any) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(value));
      }
    }

    codecs(isSupported: (type: string) => boolean) {
      return this.CODECS
        .filter((codec) => this.media.includes(codec.includes('vc1') ? 'video' : 'audio'))
        .filter((codec) => isSupported('video/mp4; codecs="' + codec + '"'))
        .join();
    }

    connectedCallback() {
      if (this.disconnectTID) {
        clearTimeout(this.disconnectTID);
        this.disconnectTID = 0;
      }
      if (this.video) {
        const seek = this.video.seekable;
        if (seek.length > 0) {
          this.video.currentTime = seek.end(seek.length - 1);
        }
        this.play();
      } else {
        this.oninit();
      }
      this.onconnect();
    }

    disconnectedCallback() {
      if (this.background || this.disconnectTID) return;
      if (this.wsState === WebSocket.CLOSED && this.pcState === WebSocket.CLOSED) return;

      this.disconnectTID = setTimeout(() => {
        if (this.reconnectTID) {
          clearTimeout(this.reconnectTID);
          this.reconnectTID = 0;
        }
        this.disconnectTID = 0;
        this.ondisconnect();
      }, this.DISCONNECT_TIMEOUT);
    }

    oninit() {
      this.video = document.createElement('video');
      this.video.controls = false;
      this.video.playsInline = true;
      this.video.autoplay = true;
      this.video.muted = true;
      this.video.defaultMuted = true;
      this.video.preload = 'auto';

      this.video.style.display = 'block';
      this.video.style.width = '100%';
      this.video.style.height = '100%';
      this.video.style.objectFit = 'contain';
      this.video.style.backgroundColor = 'transparent';

      this.appendChild(this.video);

      this.video.addEventListener('error', () => {
        if (this.ws) this.ws.close();
      });

      if (this.background) return;

      if ('hidden' in document && this.visibilityCheck) {
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) {
            this.disconnectedCallback();
          } else if (this.isConnected) {
            this.connectedCallback();
          }
        });
      }
    }

    onconnect() {
      if (!this.isConnected || !this.wsURL || this.ws || this.pc) return false;

      this.wsState = WebSocket.CONNECTING;
      this.connectTS = Date.now();

      this.ws = new WebSocket(this.wsURL);
      this.ws.binaryType = 'arraybuffer';
      this.ws.addEventListener('open', () => this.onopen());
      this.ws.addEventListener('close', () => this.onwsclose());
      this.ws.addEventListener('error', () => this.onwsclose());

      return true;
    }

    ondisconnect() {
      this.wsState = WebSocket.CLOSED;
      this.pcState = WebSocket.CLOSED;
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
      if (this.pc) {
        this.pc.close();
        this.pc = null;
      }

      if (this.video) {
        try {
          this.video.src = '';
          this.video.srcObject = null;
        } catch {}
      }
    }

    onopen() {
      if (!this.ws) return [];
      this.wsState = WebSocket.OPEN;

      this.ws.addEventListener('message', (ev) => {
        if (typeof ev.data === 'string') {
          try {
            const msg = JSON.parse(ev.data);
            for (const mode in this.onmessage) {
              if (this.onmessage[mode]) this.onmessage[mode](msg);
            }
          } catch {}
        } else if (this.ondata) {
          this.ondata(ev.data);
        }
      });

      this.ondata = null;
      this.onmessage = {};

      const modes: string[] = [];

      if (
        this.mode.includes('mse') &&
        ('MediaSource' in window || 'ManagedMediaSource' in window)
      ) {
        modes.push('mse');
        this.onmse();
      } else if (
        this.mode.includes('hls') &&
        this.video &&
        this.video.canPlayType('application/vnd.apple.mpegurl')
      ) {
        modes.push('hls');
        this.onhls();
      }

      if (
        this.mode.includes('webrtc') &&
        typeof window !== 'undefined' &&
        'RTCPeerConnection' in window
      ) {
        modes.push('webrtc');
        this.onwebrtc();
      }

      return modes;
    }

    onwebrtc() {
      const pc = new RTCPeerConnection(this.pcConfig);

      pc.addEventListener('icecandidate', (ev) => {
        if (ev.candidate && this.mode.includes('webrtc/tcp') && (ev.candidate as any).protocol === 'udp') return;
        const candidate = ev.candidate ? ev.candidate.toJSON().candidate : '';
        this.send({ type: 'webrtc/candidate', value: candidate });
      });

      pc.addEventListener('connectionstatechange', () => {
        if (pc.connectionState === 'connected') {
          const tracks = pc.getTransceivers()
            .filter((tr) => tr.currentDirection === 'recvonly')
            .map((tr) => tr.receiver.track);
          const video2 = document.createElement('video');
          video2.addEventListener('loadeddata', () => this.onpcvideo(video2), { once: true });
          video2.srcObject = new MediaStream(tracks);
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          pc.close();
          this.pcState = WebSocket.CLOSED;
          this.pc = null;
          if (this.onStreamDropped) this.onStreamDropped();
          this.onconnect();
        }
      });

      this.onmessage['webrtc'] = (msg: any) => {
        switch (msg.type) {
          case 'webrtc/candidate':
            if (this.mode.includes('webrtc/tcp') && msg.value.includes(' udp ')) return;
            pc.addIceCandidate({ candidate: msg.value, sdpMid: '0' }).catch(() => {});
            break;
          case 'webrtc/answer':
            pc.setRemoteDescription({ type: 'answer', sdp: msg.value }).catch(() => {});
            break;
          case 'error':
            if (typeof msg.value === 'string' && msg.value.includes('webrtc/offer')) {
              pc.close();
            }
            break;
        }
      };

      this.createOffer(pc).then((offer) => {
        this.send({ type: 'webrtc/offer', value: offer.sdp });
      });

      this.pcState = WebSocket.CONNECTING;
      this.pc = pc;
    }

    async createOffer(pc: RTCPeerConnection): Promise<RTCSessionDescriptionInit> {
      for (const kind of ['video', 'audio']) {
        if (this.media.includes(kind)) {
          pc.addTransceiver(kind, { direction: 'recvonly' });
        }
      }
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      return offer;
    }

    onpcvideo(video2: HTMLVideoElement) {
      if (this.pc && this.video) {
        let rtcPriority = 0,
          msePriority = 0;
        const stream = video2.srcObject as MediaStream;

        if (stream && stream.getVideoTracks().length > 0) {
          const isH265Supported = this.pc.remoteDescription?.sdp?.includes('H265/90000');
          rtcPriority += isH265Supported ? 0x240 : 0x220;
        }
        if (stream && stream.getAudioTracks().length > 0) rtcPriority += 0x102;

        if (this.mseCodecs.includes('hvc1.')) msePriority += 0x230;
        if (this.mseCodecs.includes('avc1.')) msePriority += 0x210;
        if (this.mseCodecs.includes('mp4a.')) msePriority += 0x101;

        if (rtcPriority >= msePriority) {
          if (this.video.src) {
            try {
              URL.revokeObjectURL(this.video.src);
            } catch {}
            this.video.src = '';
          }
          this.video.srcObject = stream;
          this.play();

          this.pcState = WebSocket.OPEN;
          this.wsState = WebSocket.CLOSED;
          if (this.ws) {
            this.ws.close();
            this.ws = null;
          }
        } else {
          this.pcState = WebSocket.CLOSED;
          if (this.pc) {
            this.pc.close();
            this.pc = null;
          }
        }
      }
      video2.srcObject = null;
    }

    onwsclose() {
      if (this.wsState === WebSocket.CLOSED) return false;
      // If WebRTC is already established and streaming peer-to-peer, WS close is normal and expected
      if (this.pcState === WebSocket.OPEN) {
        this.wsState = WebSocket.CLOSED;
        this.ws = null;
        return false;
      }

      if (this.reconnectTID) return false;

      this.wsState = WebSocket.CONNECTING;
      this.ws = null;

      if (this.onStreamDropped) {
        this.onStreamDropped();
      }

      const delay = Math.max(this.RECONNECT_TIMEOUT - (Date.now() - this.connectTS), 800);

      this.reconnectTID = setTimeout(() => {
        this.reconnectTID = 0;
        this.onconnect();
      }, Math.min(delay, 2000));

      return true;
    }

    onmse() {
      if (!this.video) return;

      const MediaSourceClass =
        (typeof window !== 'undefined' && (window as any).ManagedMediaSource) ||
        (typeof window !== 'undefined' && window.MediaSource);
      if (!MediaSourceClass) return;

      const ms = new MediaSourceClass();
      ms.addEventListener(
        'sourceopen',
        () => {
          if (this.video && this.video.src) {
            try {
              URL.revokeObjectURL(this.video.src);
            } catch {}
          }
          this.send({ type: 'mse', value: this.codecs(MediaSourceClass.isTypeSupported) });
        },
        { once: true }
      );

      this.video.src = URL.createObjectURL(ms);
      this.video.srcObject = null;
      this.play();

      this.mseCodecs = '';

      this.onmessage['mse'] = (msg: any) => {
        if (msg.type !== 'mse') return;

        this.mseCodecs = msg.value;
        let sb: SourceBuffer;
        try {
          sb = ms.addSourceBuffer(msg.value);
          sb.mode = 'segments';
        } catch {
          return;
        }

        const buf = new Uint8Array(2 * 1024 * 1024);
        let bufLen = 0;

        sb.addEventListener('updateend', () => {
          if (!sb.updating && bufLen > 0) {
            try {
              const data = buf.slice(0, bufLen);
              sb.appendBuffer(data);
              bufLen = 0;
            } catch {}
          }

          if (!sb.updating && sb.buffered && sb.buffered.length && this.video) {
            const end = sb.buffered.end(sb.buffered.length - 1);
            const start0 = sb.buffered.start(0);

            // Buffer eviction (>45s)
            if (end - start0 > 45) {
              const pruneStart = end - 20;
              try {
                sb.remove(start0, pruneStart);
                if (
                  (ms as unknown as { setLiveSeekableRange?: (s: number, e: number) => void })
                    .setLiveSeekableRange
                ) {
                  (
                    ms as unknown as { setLiveSeekableRange: (s: number, e: number) => void }
                  ).setLiveSeekableRange(pruneStart, end);
                }
              } catch {}
            }

            if (this.video.currentTime < start0) {
              this.video.currentTime = start0;
            }

            // Live Sync
            const gap = end - this.video.currentTime;
            if (gap > 2.5) {
              this.video.currentTime = end - 0.2;
            } else if (gap > 0.4) {
              this.video.playbackRate = 1.1;
            } else {
              this.video.playbackRate = 1.0;
            }

            if (this.video.paused) {
              this.play();
            }
          }
        });

        this.ondata = (data) => {
          if (sb.updating || bufLen > 0) {
            const b = new Uint8Array(data);
            if (bufLen + b.byteLength <= buf.length) {
              buf.set(b, bufLen);
              bufLen += b.byteLength;
            }
          } else {
            try {
              sb.appendBuffer(data);
            } catch {}
          }
        };
      };
    }

    onhls() {
      if (!this.video) return;
      this.onmessage['hls'] = (msg: any) => {
        if (msg.type !== 'hls' || !this.video) return;
        const url =
          'https' + this.wsURL.substring(2, this.wsURL.indexOf('/api/ws')) + '/api/hls/';
        const playlist = msg.value.replace('hls/', url);
        this.video.src = 'data:application/vnd.apple.mpegurl;base64,' + btoa(playlist);
        this.play();
      };
      this.send({
        type: 'hls',
        value: this.codecs((type) => (this.video ? this.video.canPlayType(type) !== '' : false)),
      });
    }
  }

  customElements.define('video-rtc', VideoRTC);
}

/**
 * Global In-Memory & LocalStorage Snapshot Cache (Persists across F5 Page Refreshes)
 */
export const globalSnapshotCache = new Map<string, string>();

// Calm snapshot polling: 6s interval protects go2rtc from consumer queue saturation
const SNAPSHOT_POLL_MS = 6000;
const SNAPSHOT_TIMEOUT_MS = 6000;

export const getCachedSnapshot = (serial: string): string | null => {
  if (!serial) return null;
  const inMem = globalSnapshotCache.get(serial);
  if (inMem && !inMem.startsWith('data:image')) return inMem;
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('cctv_snap_' + serial);
      if (stored) {
        // Discard any poison base64 canvas data from previous sessions
        if (stored.startsWith('data:image')) {
          localStorage.removeItem('cctv_snap_' + serial);
          return null;
        }
        globalSnapshotCache.set(serial, stored);
        return stored;
      }
    } catch {}
  }
  return null;
};

export const setCachedSnapshot = (serial: string, url: string) => {
  if (!serial || !url) return;
  globalSnapshotCache.set(serial, url);
  // Only persist real HTTP image URLs to localStorage, NEVER base64 data URLs!
  if (typeof window !== 'undefined' && url.startsWith('http')) {
    try {
      localStorage.setItem('cctv_snap_' + serial, url);
    } catch {}
  }
};

export function RtspPlayer({
  serial,
  fallbackImageUrl,
  staggerDelay = 0,
  apiFetch,
  apiBaseUrl,
  className,
  fillParent,
  hideControls,
  skipStreamWakeup,
  style,
  onVideoClick,
}: RtspPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerHostRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [isLive, setIsLive] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<string>('16/9');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const snapshotBaseUrl = useMemo(
    () => `https://cctv.mueangsmart.com/api/frame.jpeg?src=${encodeURIComponent(serial || '')}`,
    [serial]
  );
  const wsUrl = useMemo(
    () => `wss://cctv.mueangsmart.com/api/ws?src=${encodeURIComponent(serial || '')}`,
    [serial]
  );

  const posterApiUrl = useMemo(() => {
    if (!serial) return '';
    const base = apiBaseUrl ? apiBaseUrl.replace(/\/$/, '') : '';
    return `${base}/river/devices/${encodeURIComponent(serial)}/poster`;
  }, [apiBaseUrl, serial]);

  const persistentSnapshot = useMemo(() => getCachedSnapshot(serial), [serial]);
  const initialSnap = useMemo(() => fallbackImageUrl || persistentSnapshot || '', [fallbackImageUrl, persistentSnapshot]);
  const [activeSnapshotUrl, setActiveSnapshotUrl] = useState<string>(() => initialSnap);
  const [isSnapshotLoaded, setIsSnapshotLoaded] = useState<boolean>(() => !!(fallbackImageUrl || persistentSnapshot));

  useEffect(() => {
    if (!serial) return;

    let isCancelled = false;
    let createdBlobUrl = '';

    const fetchPoster = async () => {
      if (!posterApiUrl) return;
      try {
        const fetcher = apiFetch || fetch;
        const res = await fetcher(posterApiUrl);
        if (!res.ok) {
          throw new Error(`poster fetch failed: ${res.status}`);
        }
        const blob = await res.blob();
        if (blob.size < 1000 || isCancelled) return;

        createdBlobUrl = URL.createObjectURL(blob);
        setActiveSnapshotUrl(createdBlobUrl);
        setIsSnapshotLoaded(true);
      } catch {
        if (!isCancelled) {
          const cached = getCachedSnapshot(serial);
          const fallback = fallbackImageUrl || cached || '';
          if (fallback) {
            setActiveSnapshotUrl(fallback);
            setIsSnapshotLoaded(true);
          }
        }
      }
    };

    fetchPoster();

    return () => {
      isCancelled = true;
      if (createdBlobUrl) {
        URL.revokeObjectURL(createdBlobUrl);
      }
    };
  }, [serial, posterApiUrl, apiFetch, fallbackImageUrl]);

  // Fullscreen event listener
  useEffect(() => {
    const onFullscreenChange = () => {
      const fsElement =
        document.fullscreenElement || (document as WebkitDocument).webkitFullscreenElement;
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
    const c = containerRef.current;
    if (!c) return;

    const requestFs = c.requestFullscreen || (c as WebkitHTMLDivElement).webkitRequestFullscreen;
    const exitFs = document.exitFullscreen || (document as WebkitDocument).webkitExitFullscreen;
    const fsElement =
      document.fullscreenElement || (document as WebkitDocument).webkitFullscreenElement;

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

    setIsFullscreen((prev) => !prev);
  };

  const isCssFullscreen = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const fsElement =
      document.fullscreenElement || (document as WebkitDocument).webkitFullscreenElement;
    return isFullscreen && !fsElement;
  }, [isFullscreen]);

  // Main lifecycle: Setup VideoRTC player and snapshot polling (identical to Mobile)
  useEffect(() => {
    if (!serial || !playerHostRef.current) return;

    let isDisposed = false;
    let liveState = false;
    let snapshotPollTimer: any = null;
    let isFetchingSnapshot = false;
    let lastTimeUpdate = 0;
    let lastCurrentTime = 0;
    let stallTicks = 0;
    let captureCanvas: HTMLCanvasElement | null = null;

    // Streams remain persistently open while viewers are connected (zero redundant wake-up calls)

    // 2. Create VideoRTC instance
    const player = document.createElement('video-rtc') as any;
    player.style.width = '100%';
    player.style.height = '100%';
    player.style.position = 'absolute';
    player.style.inset = '0';
    player.style.opacity = '0';
    player.style.transition = 'opacity 0.6s ease-in-out';
    player.style.zIndex = '2';

    playerHostRef.current.innerHTML = '';
    playerHostRef.current.appendChild(player);

    // Freeze frame to canvas so user never sees black screen or time jump (Matches Mobile)
    function freezeLiveFrame() {
      try {
        if (
          player &&
          player.video &&
          player.video.videoWidth > 0 &&
          player.video.videoHeight > 0 &&
          player.video.currentTime > 0.3
        ) {
          if (!captureCanvas) {
            captureCanvas = document.createElement('canvas');
          }
          captureCanvas.width = player.video.videoWidth;
          captureCanvas.height = player.video.videoHeight;
          const ctx = captureCanvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(player.video, 0, 0, captureCanvas.width, captureCanvas.height);
            const frameData = captureCanvas.toDataURL('image/jpeg', 0.85);
            if (frameData && frameData.length > 500) {
              globalSnapshotCache.set(serial, frameData);
              setActiveSnapshotUrl(frameData);
              if (imgRef.current) {
                imgRef.current.src = frameData;
                imgRef.current.style.opacity = '1';
                imgRef.current.style.display = 'block';
              }
            }
          }
        }
      } catch {}
    }

    function fetchLatestSnapshot() {
      if (liveState || isFetchingSnapshot || isDisposed) return;
      isFetchingSnapshot = true;
      // Fresh unique timestamp ensures real continuous playback from Go2RTC
      const pollUrl = snapshotBaseUrl + '&_t=' + Date.now();
      const testImg = new Image();

      const safetyTimer = setTimeout(() => {
        // Abort the hanging request so go2rtc releases its keyframe consumer
        testImg.onload = null;
        testImg.onerror = null;
        testImg.src = '';
        isFetchingSnapshot = false;
      }, SNAPSHOT_TIMEOUT_MS);

      testImg.onload = async () => {
        clearTimeout(safetyTimer);
        isFetchingSnapshot = false;
        if (isDisposed || liveState) return;

        // Ensure valid frame dimensions (discard 0x0 or corrupted 1x1 headers)
        if (testImg.naturalWidth < 100 || testImg.naturalHeight < 100) {
          return;
        }

        // Verify image decode to prevent corrupted partial JPEG artifacts
        try {
          if (testImg.decode) {
            await testImg.decode();
          }
        } catch {
          // Decode failed -> corrupted frame from go2rtc, safely ignore!
          return;
        }

        if (!isDisposed && !liveState) {
          setCachedSnapshot(serial, pollUrl);
          setActiveSnapshotUrl(pollUrl);
          setIsSnapshotLoaded(true);
          if (imgRef.current) {
            imgRef.current.src = pollUrl;
            imgRef.current.style.opacity = '1';
            imgRef.current.style.display = 'block';
          }
        }
      };

      testImg.onerror = () => {
        clearTimeout(safetyTimer);
        isFetchingSnapshot = false;
        // Never force broken image URL into imgRef!
      };

      testImg.src = pollUrl;
    }

    function startSnapshotPolling() {
      if (snapshotPollTimer || isDisposed) return;
      fetchLatestSnapshot();
      snapshotPollTimer = setInterval(() => {
        if (liveState) {
          stopSnapshotPolling();
          return;
        }
        fetchLatestSnapshot();
      }, SNAPSHOT_POLL_MS);
    }

    function stopSnapshotPolling() {
      if (snapshotPollTimer) {
        clearInterval(snapshotPollTimer);
        snapshotPollTimer = null;
      }
    }

    function markLive() {
      if (liveState || isDisposed) return;
      if (!player?.video) return;

      // CRITICAL: Only transition to LIVE if the video has non-zero dimensions
      // and has progressed past time 0. If the camera stream is dead (0 bytes),
      // we NEVER hide the snapshot image!
      if (player.video.videoWidth === 0 || player.video.videoHeight === 0 || player.video.currentTime <= 0.05) {
        return;
      }

      liveState = true;
      setIsLive(true);
      stopSnapshotPolling();
      if (player) player.style.opacity = '1';
      if (imgRef.current) imgRef.current.style.opacity = '0';
    }

    // Seamless fallback handler when stream drops (Matches Mobile window.onStreamDropped 1:1)
    const onStreamDropped = () => {
      if (isDisposed) return;
      liveState = false;
      setIsLive(false);
      lastTimeUpdate = 0;
      // Freeze exact frame currently on screen so user never sees a jump backwards in time
      freezeLiveFrame();
      if (player) player.style.opacity = '0';
      if (imgRef.current) imgRef.current.style.opacity = '1';
      startSnapshotPolling();
    };

    player.onStreamDropped = onStreamDropped;
    player.onLive = markLive;

    // Listen to video element events once created
    function setupPlayerListeners() {
      if (isDisposed) return;
      if (!player.video) {
        setTimeout(setupPlayerListeners, 50);
        return;
      }

      player.video.addEventListener('loadedmetadata', () => {
        if (player.video && player.video.videoWidth && player.video.videoHeight) {
          setAspectRatio(`${player.video.videoWidth}/${player.video.videoHeight}`);
        }
      });

      player.video.addEventListener('playing', () => {
        lastTimeUpdate = player.video.currentTime;
        markLive();
      });

      player.video.addEventListener('timeupdate', () => {
        if (player.video && player.video.currentTime > 0.05) {
          lastTimeUpdate = player.video.currentTime;
          markLive();
        }
      });

      if ('requestVideoFrameCallback' in player.video) {
        const frameHandler = () => {
          if (isDisposed) return;
          markLive();
          if (!liveState && player?.video && 'requestVideoFrameCallback' in player.video) {
            player.video.requestVideoFrameCallback(frameHandler);
          }
        };
        player.video.requestVideoFrameCallback(frameHandler);
      }
    }
    setupPlayerListeners();

    // Check if initial image is already cached/complete at second 0
    if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      imgRef.current.style.opacity = '1';
    }

    // Robust stall watchdog (Tuned for multi-camera video walls over cellular/VPN)
    const watchdogInterval = setInterval(() => {
      if (isDisposed) return;
      if (player && player.video) {
        if (player.video.paused) {
          player.video.play().catch(() => {});
        }

        if (player.video.currentTime > 0 && player.video.currentTime === lastCurrentTime) {
          stallTicks++;
          if (stallTicks === 2) {
            player.video.play().catch(() => {});
          } else if (stallTicks >= 15) {
            // Truly stalled for 15s -> switch to snapshot, teardown socket and reconnect cleanly
            stallTicks = 0;
            lastTimeUpdate = 0;
            onStreamDropped();
            player.ondisconnect();
            setTimeout(() => {
              if (!isDisposed) player.onconnect();
            }, 1200);
          }
        } else {
          if (!liveState && player.video.currentTime > 0) {
            markLive();
          }
          stallTicks = 0;
          lastCurrentTime = player.video.currentTime;
        }
      }
    }, 1000);

    // 1. Start video stream with staggered connection delay to eliminate browser socket contention
    let streamConnectTimer: any = null;
    if (staggerDelay > 0) {
      streamConnectTimer = setTimeout(() => {
        if (!isDisposed && player) {
          player.src = wsUrl;
        }
      }, staggerDelay);
    } else {
      player.src = wsUrl;
    }

    // 2. Snapshot Polling (Graceful fallback only if live video does not connect after delay):
    const pollDelayTimer = setTimeout(() => {
      if (!isDisposed && !liveState) {
        startSnapshotPolling();
      }
    }, Math.max(3500, staggerDelay + 1500));

    return () => {
      isDisposed = true;
      if (streamConnectTimer) clearTimeout(streamConnectTimer);
      clearTimeout(pollDelayTimer);
      clearInterval(watchdogInterval);
      stopSnapshotPolling();
      if (player) {
        player.ondisconnect();
        if (player.parentNode) {
          player.parentNode.removeChild(player);
        }
      }
    };
  }, [serial, wsUrl, snapshotBaseUrl, staggerDelay]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full bg-black rounded-2xl overflow-hidden shadow-inner select-none ${
        isCssFullscreen ? 'fixed inset-0 w-screen h-screen z-[9999] rounded-none' : ''
      } ${className || ''}`}
      style={
        isCssFullscreen
          ? { height: '100vh', width: '100vw' }
          : fillParent
          ? { width: '100%', height: '100%', ...style }
          : { aspectRatio, ...style }
      }
    >
      {/* Layer 1: Instant Snap Layer (Only shown when valid image is verified) */}
      {activeSnapshotUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          ref={imgRef}
          src={activeSnapshotUrl}
          alt=""
          onLoad={(e) => {
            setIsSnapshotLoaded(true);
            if (!isLive) {
              (e.currentTarget as HTMLImageElement).style.opacity = '1';
              (e.currentTarget as HTMLImageElement).style.display = 'block';
            }
          }}
          onError={(e) => {
            // If posterApiUrl returns 404/offline, seamlessly fallback to fallbackImageUrl (DB telemetry snapshot)
            if (fallbackImageUrl && activeSnapshotUrl !== fallbackImageUrl) {
              setActiveSnapshotUrl(fallbackImageUrl);
              return;
            }
            // Immediately hide broken browser icon [?]
            (e.currentTarget as HTMLImageElement).style.opacity = '0';
            (e.currentTarget as HTMLImageElement).style.display = 'none';
            setIsSnapshotLoaded(false);
            setActiveSnapshotUrl('');
          }}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none z-[1]"
          style={{
            opacity: isLive || !isSnapshotLoaded ? 0 : 1,
            display: isSnapshotLoaded ? 'block' : 'none',
            transition: 'opacity 0.6s ease-in-out',
          }}
        />
      ) : null}

      {/* Layer 1.5: Professional Dark Matrix Placeholder when waiting for signal/snapshot */}
      {!isLive && !isSnapshotLoaded && (
        <div className="absolute inset-0 w-full h-full z-[1] flex flex-col items-center justify-center bg-slate-950/90 pointer-events-none select-none">
          <div className="w-8 h-8 rounded-full border border-slate-700/60 flex items-center justify-center bg-slate-900/60 mb-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400/80 animate-ping" />
          </div>
          <span className="text-[10px] font-mono font-medium tracking-widest text-slate-400/80 uppercase">
            Connecting...
          </span>
        </div>
      )}

      {/* Layer 2: High-Performance VideoRTC Streamer (z-index: 2, fades in smoothly over snapshot) */}
      <div
        ref={playerHostRef}
        className="absolute inset-0 w-full h-full z-10 cursor-pointer"
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

      {/* Layer 3: Clean Status Badge (CONNECTING -> SNAPSHOT -> LIVE) */}
      <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md border border-white/10 shadow-sm pointer-events-none">
        <span
          className={`w-2 h-2 rounded-full ${
            isLive
              ? 'bg-emerald-500 animate-pulse'
              : isSnapshotLoaded
              ? 'bg-amber-400'
              : 'bg-cyan-400 animate-pulse'
          }`}
        />
        <span className="text-[10px] font-mono font-bold tracking-wider text-white/90">
          {isLive ? 'LIVE' : isSnapshotLoaded ? 'SNAPSHOT' : 'CONNECTING'}
        </span>
      </div>

      {/* Layer 4: Controls */}
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
    </div>
  );
}
