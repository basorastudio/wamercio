package call

import (
	"context"
	"errors"
	"time"

	waBinary "go.mau.fi/whatsmeow/binary"
	"go.mau.fi/whatsmeow/types"
	"wamercio/services/whatsapp-bridge/internal/voip/core"
	"wamercio/services/whatsapp-bridge/internal/voip/media"
	"wamercio/services/whatsapp-bridge/internal/voip/signaling"
	"wamercio/services/whatsapp-bridge/internal/voip/wanode"
)

// RequestVideoUpgrade solicita convertir una llamada activa de audio a video.
// WAMERCIO es el único lado autorizado para iniciar este cambio: una solicitud
// equivalente originada por el contacto se rechaza en HandleVideoState.
func (m *CallManager) RequestVideoUpgrade(ctx context.Context) error {
	m.mu.Lock()
	call := m.currentCall
	if call == nil || call.IsEnded() {
		m.mu.Unlock()
		return errors.New("no hay una llamada activa")
	}
	if call.StateData.State != core.CallStateActive {
		m.mu.Unlock()
		return errors.New("el video solo puede activarse cuando la llamada está activa")
	}
	if call.LocalVideo && !call.StateData.VideoOff {
		m.mu.Unlock()
		return nil
	}
	if call.VideoUpgradePending {
		m.mu.Unlock()
		return nil
	}
	call.VideoUpgradePending = true
	peer := wanode.MustJID(call.PeerJid)
	creator := wanode.MustJID(call.CallCreator)
	callID := call.CallID
	m.emitState()
	m.mu.Unlock()

	orientation := 0
	node := signaling.BuildVideoStateStanza(callID, peer, creator, signaling.VideoStateUpgradeRequestV2, signaling.VideoDecRequest, &orientation)
	if err := m.sock.SendNode(ctx, node); err != nil {
		m.mu.Lock()
		if m.currentCall == call {
			call.VideoUpgradePending = false
			m.emitState()
		}
		m.mu.Unlock()
		return err
	}
	m.log.Info("video upgrade requested", "call_id", callID)
	return nil
}

// StopVideo vuelve la llamada a voz sin terminarla. Si el upgrade aún estaba
// pendiente, cancela la solicitud; si ya estaba activo, anuncia state=6.
func (m *CallManager) StopVideo(ctx context.Context) error {
	m.mu.Lock()
	call := m.currentCall
	if call == nil || call.IsEnded() {
		m.mu.Unlock()
		return nil
	}
	peer := wanode.MustJID(call.PeerJid)
	creator := wanode.MustJID(call.CallCreator)
	callID := call.CallID
	state := signaling.VideoStateStopped
	if call.VideoUpgradePending && !call.LocalVideo {
		state = signaling.VideoStateUpgradeCancel
	}
	call.VideoUpgradePending = false
	call.LocalVideo = false
	call.RemoteVideo = false
	call.MediaType = core.CallMediaTypeAudio
	call.StateData.VideoOff = true
	m.resetVideoMediaLocked()
	m.emitState()
	m.mu.Unlock()

	orientation := 0
	node := signaling.BuildVideoStateStanza(callID, peer, creator, state, "", &orientation)
	if err := m.sock.SendNode(ctx, node); err != nil {
		return err
	}
	m.log.Info("video stopped; audio call preserved", "call_id", callID, "state", state)
	return nil
}

// VideoState devuelve el estado de video que el Bridge expone al API/UI.
func (m *CallManager) VideoState() (active, pending, local, remote bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.currentCall == nil || m.currentCall.IsEnded() {
		return false, false, false, false
	}
	c := m.currentCall
	return !c.StateData.VideoOff && (c.LocalVideo || c.RemoteVideo), c.VideoUpgradePending, c.LocalVideo, c.RemoteVideo
}

// HandleVideoState procesa los <call><video .../></call> de WhatsApp. Las
// solicitudes iniciadas por el contacto se rechazan automáticamente; únicamente
// las respuestas al upgrade iniciado por WAMERCIO pueden activar el video.
func (m *CallManager) HandleVideoState(ctx context.Context, node *waBinary.Node, peerJid types.JID) error {
	if node == nil || node.Tag != "video" {
		return nil
	}
	callID := wanode.AttrString(node.Attrs, "call-id")
	state := wanode.AttrInt(node.Attrs, "state", -1)
	orientation := wanode.AttrInt(node.Attrs, "device_orientation", 0)

	m.mu.Lock()
	call := m.currentCall
	if call == nil || call.IsEnded() || call.CallID != callID {
		m.mu.Unlock()
		return nil
	}
	peer := wanode.MustJID(call.PeerJid)
	if !peerJid.IsEmpty() {
		peer = peerJid
	}
	creator := wanode.MustJID(call.CallCreator)

	switch state {
	case signaling.VideoStateUpgradeRequest, signaling.VideoStateUpgradeRequestV2:
		// Política WAMERCIO: el contacto no puede convertir la llamada a video.
		m.mu.Unlock()
		reject := signaling.BuildVideoStateStanza(callID, peer, creator, signaling.VideoStateUpgradeReject, "", nil)
		m.log.Info("peer video upgrade rejected by WAMERCIO policy", "call_id", callID)
		return m.sock.SendNode(ctx, reject)

	case signaling.VideoStateUpgradeAccept:
		if !call.VideoUpgradePending {
			m.mu.Unlock()
			return nil
		}
		call.VideoUpgradePending = false
		call.LocalVideo = true
		call.MediaType = core.CallMediaTypeVideo
		call.StateData.VideoOff = false
		m.initVideoKeysLocked()
		m.emitState()
		m.mu.Unlock()

		enabled := signaling.BuildVideoStateStanza(callID, peer, creator, signaling.VideoStateEnabled, signaling.VideoDecAccept, &orientation)
		if err := m.sock.SendNode(ctx, enabled); err != nil {
			return err
		}
		m.log.Info("video upgrade accepted by peer", "call_id", callID)
		return nil

	case signaling.VideoStateEnabled:
		// Un state=1 solo se acepta si corresponde al upgrade iniciado por la
		// plataforma o a una llamada que ya está en video. De lo contrario es
		// un intento unilateral del contacto y se fuerza de vuelta a voz.
		if !call.VideoUpgradePending && !call.LocalVideo {
			m.mu.Unlock()
			stop := signaling.BuildVideoStateStanza(callID, peer, creator, signaling.VideoStateStopped, "", &orientation)
			return m.sock.SendNode(ctx, stop)
		}
		call.VideoUpgradePending = false
		call.LocalVideo = true
		call.RemoteVideo = true
		call.MediaType = core.CallMediaTypeVideo
		call.StateData.VideoOff = false
		m.initVideoKeysLocked()
		m.emitState()
		m.mu.Unlock()
		m.log.Info("video active", "call_id", callID)
		return nil

	case signaling.VideoStateUpgradeReject, signaling.VideoStateUpgradeCancel:
		call.VideoUpgradePending = false
		call.LocalVideo = false
		call.RemoteVideo = false
		call.MediaType = core.CallMediaTypeAudio
		call.StateData.VideoOff = true
		m.resetVideoMediaLocked()
		m.emitState()
		m.mu.Unlock()
		m.log.Info("video upgrade declined/cancelled", "call_id", callID, "state", state)
		return nil

	case signaling.VideoStateDisabled, signaling.VideoStateStopped:
		call.VideoUpgradePending = false
		call.LocalVideo = false
		call.RemoteVideo = false
		call.MediaType = core.CallMediaTypeAudio
		call.StateData.VideoOff = true
		m.resetVideoMediaLocked()
		m.emitState()
		m.mu.Unlock()
		m.log.Info("video disabled by peer", "call_id", callID, "state", state)
		return nil
	}
	m.mu.Unlock()
	return nil
}

// initVideoKeysLocked deriva las mismas claves por-dispositivo usadas por audio,
// pero crea una sesión SRTP independiente para H.264.
func (m *CallManager) initVideoKeysLocked() {
	call := m.currentCall
	if call == nil || call.EncryptionKey == nil || call.StateData.VideoOff {
		return
	}
	ourBase := wanode.CleanJID(m.ownCredJid())
	var participants []string
	if call.RelayData != nil {
		participants = call.RelayData.ParticipantJids
	}
	ourDeviceJid := ensureDeviceJid(findOurDevice(participants, ourBase, m.ownCredJid()))
	rawPeer := m.acceptedByJid
	if rawPeer == "" {
		rawPeer = call.PeerJid
		if p := firstPeerDevice(participants, ourBase); p != "" {
			rawPeer = p
		}
	}
	peerDeviceJid := ensureDeviceJid(rawPeer)
	sendKM, err1 := media.DerivePerJidSrtpKey(call.EncryptionKey, ourDeviceJid)
	recvKM, err2 := media.DerivePerJidSrtpKey(call.EncryptionKey, peerDeviceJid)
	if err1 != nil || err2 != nil {
		m.log.Error("video srtp key derivation failed", "err1", err1, "err2", err2)
		return
	}
	m.setupVideoMediaLocked(sendKM, recvKM, ourDeviceJid, peerDeviceJid)
}

func (m *CallManager) resetVideoMediaLocked() {
	m.videoRtpSession = nil
	m.videoSrtpSession = nil
	m.videoSelfSsrc = 0
	m.videoDepacketizer = nil
	m.videoFrameBuf = nil
	m.lastVideoAUAt = time.Time{}
	m.videoKeyframeRequired = false
	m.videoRemoteFrameSeen = false
	if m.relay != nil {
		self := []uint32{}
		if m.selfSsrc != 0 {
			self = append(self, m.selfSsrc)
		}
		m.relay.SetStreamSsrcs(self, append([]uint32(nil), m.peerSsrcs...))
		go m.relay.ResendSubscriptions()
	}
}
