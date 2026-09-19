export type WamercioBrowserCall = {
  id: string
  pc: RTCPeerConnection
  micStream: MediaStream
  cameraStream: MediaStream | null
  videoSupported: boolean
  startVideo: (localVideo?: HTMLVideoElement | null, remoteCanvas?: HTMLCanvasElement | null) => Promise<void>
  stopVideo: () => Promise<void>
  attachVideoElements: (localVideo?: HTMLVideoElement | null, remoteCanvas?: HTMLCanvasElement | null) => void
  close: () => void
}

const SAMPLE_RATE = 16000
const PCM_CHANNEL_LABEL = 'pcm'
const H264_CHANNEL_LABEL = 'h264'
const CAPTURE_WORKLET_URL = '/worklets/capture-processor.js'
const PLAYBACK_WORKLET_URL = '/worklets/playback-processor.js'

const float32ToInt16LE = (pcm: Float32Array): ArrayBuffer => {
  const view = new DataView(new ArrayBuffer(pcm.length * 2))
  for (let i = 0; i < pcm.length; i += 1) {
    let s = pcm[i]
    if (Number.isNaN(s)) s = 0
    else if (s > 1) s = 1
    else if (s < -1) s = -1
    view.setInt16(i * 2, s < 0 ? Math.round(s * 32768) : Math.round(s * 32767), true)
  }
  return view.buffer
}

const int16LEToFloat32 = (buf: ArrayBuffer): Float32Array => {
  const view = new DataView(buf)
  const n = Math.floor(buf.byteLength / 2)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i += 1) out[i] = view.getInt16(i * 2, true) / 32768
  return out
}

const waitForIceGathering = (pc: RTCPeerConnection, timeoutMs = 1800) =>
  new Promise<void>((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve()
    let done = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = () => {
      if (done) return
      done = true
      if (timer) clearTimeout(timer)
      pc.removeEventListener('icegatheringstatechange', onChange)
      resolve()
    }
    const onChange = () => { if (pc.iceGatheringState === 'complete') finish() }
    pc.addEventListener('icegatheringstatechange', onChange)
    timer = setTimeout(finish, timeoutMs)
  })

const hasNALType = (data: Uint8Array, wanted: number) => {
  for (let i = 0; i + 4 < data.length; i += 1) {
    let p = -1
    if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1) p = i + 3
    else if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0 && data[i + 3] === 1) p = i + 4
    if (p >= 0 && (data[p] & 31) === wanted) return true
  }
  return false
}

const keyNAL = (data: Uint8Array) => hasNALType(data, 5) || hasNALType(data, 7)

const hasAnnexBStartCode = (data: Uint8Array) => {
  for (let i = 0; i + 3 < data.length; i += 1) {
    if (data[i] === 0 && data[i + 1] === 0 && (data[i + 2] === 1 || (data[i + 2] === 0 && data[i + 3] === 1))) return true
  }
  return false
}

const concatBytes = (parts: Uint8Array[]) => {
  const total = parts.reduce((n, p) => n + p.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) { out.set(part, offset); offset += part.byteLength }
  return out
}

// Chrome normally honours avc:{format:'annexb'}, but some Chromium builds and
// hardware encoders still return AVCC (4-byte NAL lengths). The WhatsApp bridge
// accepts Annex-B access units, so normalize both shapes before the DataChannel.
const avccToAnnexB = (data: Uint8Array): Uint8Array => {
  if (!data.byteLength || hasAnnexBStartCode(data)) return data
  const parts: Uint8Array[] = []
  let offset = 0
  while (offset + 4 <= data.byteLength) {
    const len = ((data[offset] << 24) >>> 0) + (data[offset + 1] << 16) + (data[offset + 2] << 8) + data[offset + 3]
    offset += 4
    if (!len || offset + len > data.byteLength) return data
    parts.push(new Uint8Array([0, 0, 0, 1]), data.subarray(offset, offset + len))
    offset += len
  }
  return offset === data.byteLength && parts.length ? concatBytes(parts) : data
}

const parameterSetsFromAvcC = (description: ArrayBuffer | ArrayBufferView | undefined | null): Uint8Array => {
  if (!description) return new Uint8Array()
  const raw = ArrayBuffer.isView(description)
    ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength)
    : new Uint8Array(description)
  if (raw.byteLength < 7 || raw[0] !== 1) return new Uint8Array()
  const parts: Uint8Array[] = []
  let offset = 5
  const spsCount = raw[offset++] & 0x1f
  for (let i = 0; i < spsCount; i += 1) {
    if (offset + 2 > raw.byteLength) return new Uint8Array()
    const len = (raw[offset] << 8) | raw[offset + 1]; offset += 2
    if (!len || offset + len > raw.byteLength) return new Uint8Array()
    parts.push(new Uint8Array([0, 0, 0, 1]), raw.subarray(offset, offset + len)); offset += len
  }
  if (offset >= raw.byteLength) return concatBytes(parts)
  const ppsCount = raw[offset++]
  for (let i = 0; i < ppsCount; i += 1) {
    if (offset + 2 > raw.byteLength) return new Uint8Array()
    const len = (raw[offset] << 8) | raw[offset + 1]; offset += 2
    if (!len || offset + len > raw.byteLength) return new Uint8Array()
    parts.push(new Uint8Array([0, 0, 0, 1]), raw.subarray(offset, offset + len)); offset += len
  }
  return concatBytes(parts)
}

const codecFromAnnexB = (data: Uint8Array) => {
  for (let i = 0; i + 7 < data.length; i += 1) {
    let p = -1
    if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1) p = i + 3
    else if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0 && data[i + 3] === 1) p = i + 4
    if (p >= 0 && p + 3 < data.length && (data[p] & 31) === 7) {
      return `avc1.${[data[p + 1], data[p + 2], data[p + 3]].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`
    }
  }
  return 'avc1.42E01F'
}

const waitForDataChannelOpen = (dc: RTCDataChannel, timeoutMs = 5000) => new Promise<void>((resolve, reject) => {
  if (dc.readyState === 'open') return resolve()
  if (dc.readyState === 'closed' || dc.readyState === 'closing') return reject(new Error('El canal de video WebRTC no está disponible.'))
  let timer: ReturnType<typeof setTimeout> | undefined
  const cleanup = () => { if (timer) clearTimeout(timer); dc.removeEventListener('open', onOpen); dc.removeEventListener('close', onClose) }
  const onOpen = () => { cleanup(); resolve() }
  const onClose = () => { cleanup(); reject(new Error('El canal de video WebRTC se cerró.')) }
  dc.addEventListener('open', onOpen, { once: true })
  dc.addEventListener('close', onClose, { once: true })
  timer = setTimeout(() => { cleanup(); reject(new Error('El canal de video WebRTC no abrió a tiempo.')) }, timeoutMs)
})

export async function openWamercioCallAudio(callId: string, onUnexpectedClose?: () => void, onRemoteAudio?: () => void): Promise<WamercioBrowserCall> {
  if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Este navegador no permite usar el micrófono para llamadas.')
  }
  if (!window.isSecureContext && window.location.hostname !== 'localhost') {
    throw new Error('El micrófono y la cámara requieren HTTPS. Abre WAMERCIO mediante su dominio seguro.')
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false,
  })
  const pc = new RTCPeerConnection({ iceServers: [] })
  const dc = pc.createDataChannel(PCM_CHANNEL_LABEL, { ordered: true })
  const videoDc = pc.createDataChannel(H264_CHANNEL_LABEL, { ordered: false, maxRetransmits: 0 })
  dc.binaryType = 'arraybuffer'
  videoDc.binaryType = 'arraybuffer'
  let manualClose = false
  let closeNotified = false
  let disconnectTimer: ReturnType<typeof setTimeout> | undefined
  const notifyUnexpectedClose = () => {
    if (manualClose || closeNotified) return
    closeNotified = true
    onUnexpectedClose?.()
  }
  pc.addEventListener('connectionstatechange', () => {
    const state = pc.connectionState
    if (state === 'failed' || state === 'closed') notifyUnexpectedClose()
    if (state === 'disconnected') {
      if (disconnectTimer) clearTimeout(disconnectTimer)
      disconnectTimer = setTimeout(() => {
        if (pc.connectionState === 'disconnected') notifyUnexpectedClose()
      }, 5000)
    } else if (disconnectTimer) {
      clearTimeout(disconnectTimer)
      disconnectTimer = undefined
    }
  })
  dc.addEventListener('close', notifyUnexpectedClose)

  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
  const ctx: AudioContext = new AudioCtx({ sampleRate: SAMPLE_RATE })
  await ctx.audioWorklet.addModule(CAPTURE_WORKLET_URL)
  await ctx.audioWorklet.addModule(PLAYBACK_WORKLET_URL)
  await ctx.resume()

  const micSource = ctx.createMediaStreamSource(stream)
  const captureNode = new AudioWorkletNode(ctx, 'capture-processor')
  const mutedSink = ctx.createGain()
  mutedSink.gain.value = 0
  captureNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
    if (dc.readyState === 'open') dc.send(float32ToInt16LE(event.data))
  }
  micSource.connect(captureNode)
  captureNode.connect(mutedSink).connect(ctx.destination)

  const playbackNode = new AudioWorkletNode(ctx, 'playback-processor')
  const playbackDest = ctx.createMediaStreamDestination()
  playbackNode.connect(playbackDest)
  const silentPull = ctx.createGain()
  silentPull.gain.value = 0
  playbackNode.connect(silentPull).connect(ctx.destination)

  const speaker = new Audio()
  speaker.autoplay = true
  speaker.srcObject = playbackDest.stream
  const fallbackSpeaker = ctx.createGain()
  fallbackSpeaker.gain.value = 0
  playbackNode.connect(fallbackSpeaker).connect(ctx.destination)
  await speaker.play().catch(() => { fallbackSpeaker.gain.value = 1 })

  let remoteAudioConfirmed = false
  dc.onmessage = async (event: MessageEvent) => {
    let buf: ArrayBuffer | null = null
    if (event.data instanceof ArrayBuffer) buf = event.data
    else if (event.data instanceof Blob) buf = await event.data.arrayBuffer()
    if (buf) {
      playbackNode.port.postMessage(int16LEToFloat32(buf))
      if (!remoteAudioConfirmed && buf.byteLength > 0) {
        remoteAudioConfirmed = true
        onRemoteAudio?.()
      }
    }
  }

  const VideoEncoderCtor = (window as any).VideoEncoder
  const VideoDecoderCtor = (window as any).VideoDecoder
  const EncodedVideoChunkCtor = (window as any).EncodedVideoChunk
  const TrackProcessorCtor = (window as any).MediaStreamTrackProcessor
  const videoSupported = Boolean(VideoEncoderCtor && VideoDecoderCtor && EncodedVideoChunkCtor && TrackProcessorCtor && navigator.mediaDevices?.getUserMedia)
  let cameraStream: MediaStream | null = null
  let encoder: any = null
  let decoder: any = null
  let frameReader: any = null
  let localVideoEl: HTMLVideoElement | null = null
  let remoteCanvasEl: HTMLCanvasElement | null = null
  let captureGeneration = 0
  let decodeStarted = false
  let decodeTimestamp = 0
  let decoderCodec = ''
  let lastEncoderDescription: ArrayBuffer | ArrayBufferView | null = null

  const attachVideoElements = (localVideo?: HTMLVideoElement | null, remoteCanvas?: HTMLCanvasElement | null) => {
    if (localVideo !== undefined) localVideoEl = localVideo
    if (remoteCanvas !== undefined) remoteCanvasEl = remoteCanvas
    if (localVideoEl) {
      try { localVideoEl.srcObject = cameraStream } catch {}
      if (cameraStream) void localVideoEl.play().catch(() => {})
    }
  }

  const getDecoder = (codec: string) => {
    if (!videoSupported) return null
    if (decoder && decoder.state !== 'closed' && decoderCodec === codec) return decoder
    try { if (decoder && decoder.state !== 'closed') decoder.close() } catch {}
    decoderCodec = codec
    decodeStarted = false
    decoder = new VideoDecoderCtor({
      output: (frame: any) => {
        const canvas = remoteCanvasEl
        if (canvas) {
          const width = Number(frame.displayWidth || frame.codedWidth || 640)
          const height = Number(frame.displayHeight || frame.codedHeight || 480)
          if (canvas.width !== width) canvas.width = width
          if (canvas.height !== height) canvas.height = height
          const paint = canvas.getContext('2d')
          if (paint) paint.drawImage(frame, 0, 0, width, height)
        }
        try { frame.close() } catch {}
      },
      error: () => { decodeStarted = false },
    })
    decoder.configure({ codec, optimizeForLatency: true, hardwareAcceleration: 'prefer-hardware' })
    return decoder
  }

  videoDc.onmessage = async (event: MessageEvent) => {
    if (!videoSupported) return
    let buf: ArrayBuffer | null = null
    if (event.data instanceof ArrayBuffer) buf = event.data
    else if (event.data instanceof Blob) buf = await event.data.arrayBuffer()
    if (!buf || !buf.byteLength) return
    const au = avccToAnnexB(new Uint8Array(buf))
    const key = keyNAL(au)
    if (!decodeStarted && !key) return
    const codec = codecFromAnnexB(au)
    try {
      decodeTimestamp += 66666
      const targetDecoder = getDecoder(codec)
      targetDecoder?.decode(new EncodedVideoChunkCtor({ type: key ? 'key' : 'delta', timestamp: decodeTimestamp, data: au }))
      decodeStarted = true
    } catch {
      decodeStarted = false
    }
  }

  const stopVideo = async () => {
    captureGeneration += 1
    const reader = frameReader
    frameReader = null
    try { if (reader) await reader.cancel() } catch {}
    try { if (encoder && encoder.state !== 'closed') encoder.close() } catch {}
    encoder = null
    if (cameraStream) {
      try { cameraStream.getTracks().forEach((track) => track.stop()) } catch {}
    }
    cameraStream = null
    if (localVideoEl) {
      try { localVideoEl.srcObject = null } catch {}
    }
    if (decoder && decoder.state !== 'closed') {
      try { decoder.close() } catch {}
    }
    decoder = null
    decoderCodec = ''
    lastEncoderDescription = null
    decodeStarted = false
    decodeTimestamp = 0
    if (remoteCanvasEl) {
      try { remoteCanvasEl.getContext('2d')?.clearRect(0, 0, remoteCanvasEl.width, remoteCanvasEl.height) } catch {}
    }
  }

  const startVideo = async (localVideo?: HTMLVideoElement | null, remoteCanvas?: HTMLCanvasElement | null) => {
    if (!videoSupported) throw new Error('Este navegador no tiene WebCodecs H.264 para llamadas de video.')
    if (localVideo !== undefined || remoteCanvas !== undefined) attachVideoElements(localVideo, remoteCanvas)
    if (cameraStream) return
    await waitForDataChannelOpen(videoDc)
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 15 }, facingMode: 'user' },
    })
    attachVideoElements(localVideoEl, remoteCanvasEl)
    const track = cameraStream.getVideoTracks()[0]
    if (!track) {
      await stopVideo()
      throw new Error('No se pudo abrir la cámara.')
    }
    const settings = track.getSettings()
    const width = Math.max(320, Number(settings.width || 640))
    const height = Math.max(240, Number(settings.height || 480))
    const generation = ++captureGeneration
    encoder = new VideoEncoderCtor({
      output: (chunk: any, metadata: any) => {
        if (generation !== captureGeneration || videoDc.readyState !== 'open' || videoDc.bufferedAmount > 1024 * 1024) return
        const raw = new Uint8Array(chunk.byteLength)
        chunk.copyTo(raw)
        if (metadata?.decoderConfig?.description) lastEncoderDescription = metadata.decoderConfig.description
        let bytes = avccToAnnexB(raw)
        if (chunk.type === 'key' && !hasNALType(bytes, 7) && lastEncoderDescription) {
          const params = parameterSetsFromAvcC(lastEncoderDescription)
          if (params.byteLength) bytes = concatBytes([params, bytes])
        }
        if (!hasAnnexBStartCode(bytes)) return
        try { videoDc.send(bytes) } catch {}
      },
      error: () => {},
    })
    const baseConfig = {
      codec: 'avc1.42E01F',
      avc: { format: 'annexb' as const },
      width,
      height,
      framerate: 15,
      bitrate: 650000,
      latencyMode: 'realtime' as const,
      hardwareAcceleration: 'prefer-hardware' as const,
    }
    let selectedConfig: any = baseConfig
    try {
      if (typeof VideoEncoderCtor.isConfigSupported === 'function') {
        const support = await VideoEncoderCtor.isConfigSupported(baseConfig)
        if (support?.supported && support.config) selectedConfig = support.config
      }
    } catch {}
    encoder.configure(selectedConfig)
    frameReader = new TrackProcessorCtor({ track }).readable.getReader()
    void (async () => {
      let n = 0
      while (generation === captureGeneration && frameReader) {
        let result: any
        try { result = await frameReader.read() } catch { break }
        if (!result || result.done) break
        const frame = result.value
        try {
          if (encoder && encoder.state === 'configured' && encoder.encodeQueueSize < 2) {
            encoder.encode(frame, { keyFrame: n === 0 || n % 15 === 0 })
            n += 1
          }
        } finally {
          try { frame.close() } catch {}
        }
      }
    })()
  }

  const close = () => {
    manualClose = true
    if (disconnectTimer) clearTimeout(disconnectTimer)
    void stopVideo()
    try { stream.getTracks().forEach((track) => track.stop()) } catch {}
    try { speaker.pause(); speaker.srcObject = null } catch {}
    try { void ctx.close() } catch {}
    try { pc.close() } catch {}
  }

  try {
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await waitForIceGathering(pc)
    const sdp = pc.localDescription?.sdp || ''
    if (!sdp.trim()) throw new Error('El navegador no generó una oferta WebRTC válida.')
    const res = await fetch(`/api/v1/calls/${encodeURIComponent(callId)}/webrtc`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-Wamercio-Host': window.location.hostname,
      },
      body: JSON.stringify({ sdp_offer: sdp }),
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok || !payload?.sdp_answer) throw new Error(payload?.error || 'No se pudo conectar el audio/video de la llamada.')
    await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp_answer })
  } catch (error) {
    close()
    throw error
  }

  const result: WamercioBrowserCall = {
    id: callId,
    pc,
    micStream: stream,
    cameraStream,
    videoSupported,
    startVideo: async (localVideo, remoteCanvas) => {
      await startVideo(localVideo, remoteCanvas)
      result.cameraStream = cameraStream
    },
    stopVideo: async () => {
      await stopVideo()
      result.cameraStream = null
    },
    attachVideoElements,
    close,
  }
  return result
}
