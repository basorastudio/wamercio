package bridge

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"reflect"
	"time"
	"unsafe"

	waBinary "go.mau.fi/whatsmeow/binary"
	"go.mau.fi/whatsmeow/types"
	"wamercio/services/whatsapp-bridge/internal/voip/signaling"
	"wamercio/services/whatsapp-bridge/internal/voip/wacall"
	"wamercio/services/whatsapp-bridge/internal/voip/wanode"
)

// installVideoRawCallHook intercepts standalone <call><video/></call> stanzas
// before whatsmeow's generic call handler. Mid-call voice→video negotiation needs
// an ACK with type="video"; allowing the generic handler to run first produces a
// typeless ACK which recent WhatsApp clients treat as non-acceptance and they
// revert the upgrade before any PT-97 media starts flowing.
//
// This is deliberately installed before Client.Connect(). If upstream changes
// the internal nodeHandlers layout, the normal UnknownCallEvent path remains as
// a compatibility fallback and this function simply reports the mismatch.
func (m *Manager) installVideoRawCallHook(s *Session) error {
	if s == nil || s.Client == nil {
		return errors.New("video raw-call hook: cliente no disponible")
	}
	if s.Client.IsConnected() {
		return errors.New("video raw-call hook debe instalarse antes de Connect")
	}
	clientValue := reflect.ValueOf(s.Client)
	if clientValue.Kind() != reflect.Pointer || clientValue.IsNil() {
		return errors.New("video raw-call hook: cliente inválido")
	}
	clientValue = clientValue.Elem()
	field := clientValue.FieldByName("nodeHandlers")
	contextType := reflect.TypeOf((*context.Context)(nil)).Elem()
	nodeType := reflect.TypeOf((*waBinary.Node)(nil))
	if !field.IsValid() || !field.CanAddr() || field.Kind() != reflect.Map ||
		field.Type().Key().Kind() != reflect.String || field.Type().Elem().Kind() != reflect.Func ||
		field.Type().Elem().NumIn() != 2 || field.Type().Elem().In(0) != contextType ||
		field.Type().Elem().In(1) != nodeType || field.Type().Elem().NumOut() != 0 {
		return errors.New("video raw-call hook: cambió el layout interno de whatsmeow")
	}
	handlers := reflect.NewAt(field.Type(), unsafe.Pointer(field.UnsafeAddr())).Elem()
	if handlers.IsNil() {
		return errors.New("video raw-call hook: nodeHandlers no disponible")
	}
	origCall := handlers.MapIndex(reflect.ValueOf("call"))
	if !origCall.IsValid() || origCall.IsNil() {
		return errors.New("video raw-call hook: handler call original no disponible")
	}
	wrapper := reflect.MakeFunc(field.Type().Elem(), func(args []reflect.Value) []reflect.Value {
		node, _ := args[1].Interface().(*waBinary.Node)
		if node != nil && m.processVideoCallNode(s, node) {
			// Fully handled: typed ACK already sent. Do NOT call the original
			// handler, otherwise maybeDeferredAck emits a second typeless ACK.
			return nil
		}
		origCall.Call(args)
		return nil
	})
	handlers.SetMapIndex(reflect.ValueOf("call"), wrapper)
	return nil
}

// processVideoCallNode returns true only when the node belongs to a live WAMERCIO
// call and was fully handled. Callers may safely skip whatsmeow's generic handler
// when true.
func (m *Manager) processVideoCallNode(s *Session, node *waBinary.Node) bool {
	if s == nil || node == nil || s.callReg == nil {
		return false
	}
	children := node.GetChildren()
	if len(children) != 1 || children[0].Tag != "video" {
		return false
	}
	video := children[0]
	callID := wanode.AttrString(video.Attrs, "call-id")
	if callID == "" {
		return false
	}
	ac, ok := s.callReg.get(callID)
	if !ok || ac == nil || ac.cm == nil {
		return false
	}

	if ack, ok := signaling.BuildVideoAck(node); ok {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		if err := wacall.NewSocket(s.Client).SendNode(ctx, ack); err != nil {
			cancel()
			slog.Warn("wamercio calls: video typed ack failed", "store_id", s.StoreID, "call_id", callID, "err", err)
			return true
		}
		cancel()
		slog.Debug("wamercio calls: video typed ack sent", "store_id", s.StoreID, "call_id", callID)
	}

	var from types.JID
	if raw := wanode.AttrString(node.Attrs, "from"); raw != "" {
		from, _ = types.ParseJID(raw)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	err := ac.cm.HandleVideoState(ctx, &video, from)
	cancel()
	if err != nil {
		slog.Warn("wamercio calls: video state failed", "store_id", s.StoreID, "call_id", callID, "err", err)
	} else {
		slog.Debug("wamercio calls: video state applied", "store_id", s.StoreID, "call_id", callID, "state", fmt.Sprintf("%d", wanode.AttrInt(video.Attrs, "state", -1)))
	}
	if ci := ac.cm.CurrentCall(); ci != nil {
		go m.emitCallState(s, ci, ac.recordID, "video_state")
	}
	return true
}
