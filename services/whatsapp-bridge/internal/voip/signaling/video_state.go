package signaling

import (
	"strconv"

	waBinary "go.mau.fi/whatsmeow/binary"
	"go.mau.fi/whatsmeow/types"
	"wamercio/services/whatsapp-bridge/internal/voip/wanode"
)

// Estados observados por el protocolo de llamadas de WhatsApp para cambios de
// video durante una llamada ya establecida. WAMERCIO siempre inicia las llamadas
// como audio y utiliza UpgradeRequestV2 únicamente cuando el agente pulsa Video.
const (
	VideoStateDisabled         = 0
	VideoStateEnabled          = 1
	VideoStateUpgradeRequest   = 3
	VideoStateUpgradeAccept    = 4
	VideoStateUpgradeReject    = 5
	VideoStateStopped          = 6
	VideoStateUpgradeCancel    = 8
	VideoStateUpgradeRequestV2 = 11
)

const (
	VideoDecRequest = "H264"
	VideoDecAccept  = "H264,AV1"
)

// BuildVideoStateStanza construye el <call><video .../></call> utilizado por
// WhatsApp para upgrade/downgrade de video sin terminar la llamada de audio.
func BuildVideoStateStanza(callID string, to, callCreator types.JID, state int, dec string, orientation *int) waBinary.Node {
	attrs := waBinary.Attrs{
		"call-id":      callID,
		"call-creator": callCreator,
		"state":        strconv.Itoa(state),
	}
	if dec != "" {
		attrs["dec"] = dec
	}
	if state == VideoStateUpgradeRequestV2 {
		attrs["voip_settings"] = "video"
	}
	if orientation != nil {
		attrs["device_orientation"] = strconv.Itoa(*orientation)
	}
	return waBinary.Node{
		Tag:     "call",
		Attrs:   waBinary.Attrs{"to": to, "id": GenerateCallStanzaID()},
		Content: []waBinary.Node{{Tag: "video", Attrs: attrs}},
	}
}

// BuildVideoAck crea el ack tipado que WhatsApp espera para los estados de
// video. El ack genérico class=call no basta para algunos clientes.
func BuildVideoAck(original *waBinary.Node) (waBinary.Node, bool) {
	if original == nil {
		return waBinary.Node{}, false
	}
	id := wanode.AttrString(original.Attrs, "id")
	fromRaw := wanode.AttrString(original.Attrs, "from")
	from, err := types.ParseJID(fromRaw)
	if id == "" || err != nil || from.IsEmpty() {
		return waBinary.Node{}, false
	}
	attrs := waBinary.Attrs{"class": "call", "id": id, "to": from, "type": "video"}
	if participantRaw := wanode.AttrString(original.Attrs, "participant"); participantRaw != "" {
		if participant, err := types.ParseJID(participantRaw); err == nil && !participant.IsEmpty() && participant != from {
			attrs["participant"] = participant
		}
	}
	if recipientRaw := wanode.AttrString(original.Attrs, "recipient"); recipientRaw != "" {
		if recipient, err := types.ParseJID(recipientRaw); err == nil && !recipient.IsEmpty() {
			attrs["recipient"] = recipient
		}
	}
	return waBinary.Node{Tag: "ack", Attrs: attrs}, true
}
