export type WamercioBrowserCall = {
  id: string
  pc: RTCPeerConnection
  micStream: MediaStream
  close: () => void
}

const SAMPLE_RATE = 16000
const PCM_CHANNEL_LABEL = 'pcm'
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

export async function openWamercioCallAudio(callId: string): Promise<WamercioBrowserCall> {
  if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Este navegador no permite usar el micrófono para llamadas.')
  }
  if (!window.isSecureContext && window.location.hostname !== 'localhost') {
    throw new Error('El micrófono requiere HTTPS. Abre WAMERCIO mediante su dominio seguro.')
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false,
  })
  const pc = new RTCPeerConnection({ iceServers: [] })
  const dc = pc.createDataChannel(PCM_CHANNEL_LABEL, { ordered: true })
  dc.binaryType = 'arraybuffer'

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

  dc.onmessage = async (event: MessageEvent) => {
    let buf: ArrayBuffer | null = null
    if (event.data instanceof ArrayBuffer) buf = event.data
    else if (event.data instanceof Blob) buf = await event.data.arrayBuffer()
    if (buf) playbackNode.port.postMessage(int16LEToFloat32(buf))
  }

  const close = () => {
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
    if (!res.ok || !payload?.sdp_answer) throw new Error(payload?.error || 'No se pudo conectar el audio de la llamada.')
    await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp_answer })
  } catch (error) {
    close()
    throw error
  }

  return { id: callId, pc, micStream: stream, close }
}
