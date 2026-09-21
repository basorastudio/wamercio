package call

// Hold and Resume are local media-state transitions. WhatsApp does not expose
// a dedicated public hold primitive for companion calls, so WAMERCIO keeps the
// remote call alive and gates browser PCM while the state is on_hold.
func (m *CallManager) Hold() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.currentCall == nil {
		return &CallError{"no active call"}
	}
	if err := m.currentCall.ApplyTransition(Transition{Type: TransitionHold}); err != nil {
		return err
	}
	m.emitState()
	return nil
}

func (m *CallManager) Resume() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.currentCall == nil {
		return &CallError{"no active call"}
	}
	if err := m.currentCall.ApplyTransition(Transition{Type: TransitionResume}); err != nil {
		return err
	}
	m.emitState()
	return nil
}
