// Code generated from openapi/waxum.openapi.json; DO NOT EDIT.

package waxum

import "encoding/json"

// AcceptCallRequest Accept an incoming call via 'client.voip().accept(&incoming)'. If 'text' or 'audio_url' is supplied, the accepted call also plays that audio to the caller after 'answer_grace_ms' of silent padding, then hangs up. Both silent by default.
type AcceptCallRequest struct {
	// AnswerGraceMs Silent padding before playback starts. Defaults to 1500 ms.
	AnswerGraceMs *int64 `json:"answer_grace_ms,omitempty"`
	// AudioURL Optional audio URL to play to the caller once accepted (mp3/wav/ogg).
	AudioURL *string `json:"audio_url,omitempty"`
	// CallID Call id from 'IncomingCall.action.call_id()'.
	CallID string `json:"call_id"`
	// From Caller JID as reported in 'IncomingCall.from'.
	From string `json:"from"`
	// Text Optional TTS text to speak to the caller once accepted.
	Text *string `json:"text,omitempty"`
	// Voice edge-tts voice id when 'text' is set. Defaults to 'id-ID-ArdiNeural'.
	Voice *string `json:"voice,omitempty"`
}

// AutoReconnectRequest represents the Waxum API schema of the same name.
type AutoReconnectRequest struct {
	Enabled bool `json:"enabled"`
}

// AutoReconnectResponse represents the Waxum API schema of the same name.
type AutoReconnectResponse struct {
	Enabled    bool  `json:"enabled"`
	ErrorCount int32 `json:"error_count"`
}

// BlockRequest represents the Waxum API schema of the same name.
type BlockRequest struct {
	JID string `json:"jid"`
}

// BlockStatusResponse represents the Waxum API schema of the same name.
type BlockStatusResponse struct {
	IsBlocked bool   `json:"is_blocked"`
	JID       string `json:"jid"`
}

// BlocklistResponse represents the Waxum API schema of the same name.
type BlocklistResponse struct {
	Blocked []string `json:"blocked"`
	Count   int64    `json:"count"`
}

// ButtonItem represents the Waxum API schema of the same name.
type ButtonItem struct {
	ButtonID    string `json:"button_id"`
	DisplayText string `json:"display_text"`
}

// CancelPaymentRequestRequest represents the Waxum API schema of the same name.
type CancelPaymentRequestRequest struct {
	// RequestMessageID Message ID of the payment request to cancel
	RequestMessageID string `json:"request_message_id"`
	To               string `json:"to"`
}

// ChatStateType represents the Waxum API schema of the same name.
type ChatStateType string

const (
	ChatStateTypeComposing ChatStateType = "composing"
	ChatStateTypeRecording ChatStateType = "recording"
	ChatStateTypePaused    ChatStateType = "paused"
)

// CheckOnWhatsAppRequest represents the Waxum API schema of the same name.
type CheckOnWhatsAppRequest struct {
	Phones []string `json:"phones"`
}

// CheckOnWhatsAppResponse represents the Waxum API schema of the same name.
type CheckOnWhatsAppResponse struct {
	Results []WhatsAppCheckResult `json:"results"`
}

// ConnectRequest Request to start QR connect with optional device override
type ConnectRequest struct {
	Device *DevicePropsRequest `json:"device,omitempty"`
}

// ContactCard represents the Waxum API schema of the same name.
type ContactCard struct {
	DisplayName  string         `json:"display_name"`
	Organization *string        `json:"organization,omitempty"`
	Phones       []ContactPhone `json:"phones"`
}

// ContactInfo represents the Waxum API schema of the same name.
type ContactInfo struct {
	IsBusiness   bool    `json:"is_business"`
	IsRegistered bool    `json:"is_registered"`
	JID          string  `json:"jid"`
	LID          *string `json:"lid,omitempty"`
	PictureID    *string `json:"picture_id,omitempty"`
	Status       *string `json:"status,omitempty"`
}

// ContactInfoResponse represents the Waxum API schema of the same name.
type ContactInfoResponse struct {
	Contacts []ContactInfo `json:"contacts"`
}

// ContactPhone represents the Waxum API schema of the same name.
type ContactPhone struct {
	Number    string  `json:"number"`
	PhoneType *string `json:"phone_type,omitempty"`
}

// CreateGroupRequest represents the Waxum API schema of the same name.
type CreateGroupRequest struct {
	MemberAddMode          *MemberAddMode          `json:"member_add_mode,omitempty"`
	MemberLinkMode         *MemberLinkMode         `json:"member_link_mode,omitempty"`
	MembershipApprovalMode *MembershipApprovalMode `json:"membership_approval_mode,omitempty"`
	Name                   string                  `json:"name"`
	Participants           []string                `json:"participants"`
}

// CreateGroupResponse represents the Waxum API schema of the same name.
type CreateGroupResponse struct {
	GroupJID string `json:"group_jid"`
}

// CreateSessionRequest Request to create a new session
type CreateSessionRequest struct {
	Device *DevicePropsRequest `json:"device,omitempty"`
	// ID Optional custom session ID (auto-generated if not provided)
	ID *string `json:"id,omitempty"`
	// Name Optional friendly name for the session
	Name    *string         `json:"name,omitempty"`
	Webhook *WebhookRequest `json:"webhook,omitempty"`
}

// CreateSessionResponse Response after creating a session
type CreateSessionResponse struct {
	// Session Session information
	Session SessionInfo `json:"session"`
}

// DeclinePaymentRequestRequest represents the Waxum API schema of the same name.
type DeclinePaymentRequestRequest struct {
	// RequestMessageID Message ID of the payment request to decline
	RequestMessageID string `json:"request_message_id"`
	To               string `json:"to"`
}

// DeviceInfo Device information
type DeviceInfo struct {
	// DeviceID Device ID
	DeviceID *int32 `json:"device_id,omitempty"`
	// LID Linked ID
	LID *string `json:"lid,omitempty"`
	// PhoneNumber Phone number JID
	PhoneNumber *string `json:"phone_number,omitempty"`
	// PushName Push name
	PushName *string `json:"push_name,omitempty"`
}

// DevicePropsRequest Optional per-session device identity override. Only honored on the FIRST pair (connect/pair endpoints) — subsequent connects reuse the props stored by whatsapp-rust at pairing time.
type DevicePropsRequest struct {
	// OS OS string shown in WhatsApp Linked Devices (e.g. "Windows", "Mac OS X")
	OS *string `json:"os,omitempty"`
	// Platform Platform: desktop, uwp, chrome, firefox, edge, safari, opera, ie, ipad, android_phone, android_tablet, ios_phone
	Platform *string `json:"platform,omitempty"`
	// Version Dotted app version (e.g. "2.3000.1023902713"). Omit to use lib default.
	Version *string `json:"version,omitempty"`
}

// DownloadMediaRequest represents the Waxum API schema of the same name.
type DownloadMediaRequest struct {
	DirectPath    string    `json:"direct_path"`
	FileEncSHA256 string    `json:"file_enc_sha256"`
	FileLength    int64     `json:"file_length"`
	FileSHA256    string    `json:"file_sha256"`
	MediaKey      string    `json:"media_key"`
	MediaType     MediaType `json:"media_type"`
}

// DownloadMediaResponse represents the Waxum API schema of the same name.
type DownloadMediaResponse struct {
	Data string `json:"data"`
	Size int64  `json:"size"`
}

// EditMessageRequest represents the Waxum API schema of the same name.
type EditMessageRequest struct {
	MessageID string `json:"message_id"`
	Text      string `json:"text"`
	To        string `json:"to"`
}

// FakeReplyConfig Fake reply config — makes the outgoing message look like it's replying to a fictional previous message from a random JID. Used for blast to appear more natural / human-like.
type FakeReplyConfig struct {
	Body *string `json:"body,omitempty"`
	// Participant Override random participant JID (optional). Format: 628xxx@s.whatsapp.net
	Participant *string `json:"participant,omitempty"`
	// StanzaID Override random stanza id (optional).
	StanzaID *string `json:"stanza_id,omitempty"`
	Title    *string `json:"title,omitempty"`
	// TypeValue text | product | order | location | video | document | contact
	TypeValue string `json:"type"`
}

// ForwardMessageRequest represents the Waxum API schema of the same name.
type ForwardMessageRequest struct {
	ReplyTo *string `json:"reply_to,omitempty"`
	Text    string  `json:"text"`
	To      string  `json:"to"`
}

// GetContactInfoRequest represents the Waxum API schema of the same name.
type GetContactInfoRequest struct {
	Phones []string `json:"phones"`
}

// GetUserInfoRequest represents the Waxum API schema of the same name.
type GetUserInfoRequest struct {
	JIDs []string `json:"jids"`
}

// GroupInfo represents the Waxum API schema of the same name.
type GroupInfo struct {
	AddressingMode string             `json:"addressing_mode"`
	JID            string             `json:"jid"`
	Participants   []GroupParticipant `json:"participants"`
	Subject        string             `json:"subject"`
}

// GroupInfoCached represents the Waxum API schema of the same name.
type GroupInfoCached struct {
	AddressingMode string             `json:"addressing_mode"`
	Participants   []GroupParticipant `json:"participants"`
}

// GroupListResponse represents the Waxum API schema of the same name.
type GroupListResponse struct {
	Groups []GroupInfo `json:"groups"`
	Total  int64       `json:"total"`
}

// GroupParticipant represents the Waxum API schema of the same name.
type GroupParticipant struct {
	JID         string          `json:"jid"`
	PhoneNumber *string         `json:"phone_number,omitempty"`
	Role        ParticipantRole `json:"role"`
}

// HistorySyncRequest represents the Waxum API schema of the same name.
type HistorySyncRequest struct {
	// Skip Set to true to skip history sync
	Skip bool `json:"skip"`
}

// HistorySyncResponse represents the Waxum API schema of the same name.
type HistorySyncResponse struct {
	SkipHistorySync bool `json:"skip_history_sync"`
}

// InviteLinkResponse represents the Waxum API schema of the same name.
type InviteLinkResponse struct {
	InviteLink string `json:"invite_link"`
}

// ListRow represents the Waxum API schema of the same name.
type ListRow struct {
	Description *string `json:"description,omitempty"`
	RowID       string  `json:"row_id"`
	Title       string  `json:"title"`
}

// ListSection represents the Waxum API schema of the same name.
type ListSection struct {
	Rows  []ListRow `json:"rows"`
	Title string    `json:"title"`
}

// MarkAsReadRequest represents the Waxum API schema of the same name.
type MarkAsReadRequest struct {
	ChatJID    string   `json:"chat_jid"`
	MessageIDs []string `json:"message_ids"`
	Sender     *string  `json:"sender,omitempty"`
}

// MediaData represents the Waxum API schema of the same name.
type MediaData struct {
	URL           *string `json:"url,omitempty"`
	Data          *string `json:"data,omitempty"`
	MIMEType      *string `json:"mimetype,omitempty"`
	DirectPath    *string `json:"direct_path,omitempty"`
	MediaKey      *string `json:"media_key,omitempty"`
	FileSHA256    *string `json:"file_sha256,omitempty"`
	FileEncSHA256 *string `json:"file_enc_sha256,omitempty"`
	FileLength    *int64  `json:"file_length,omitempty"`
}

// MediaType represents the Waxum API schema of the same name.
type MediaType string

const (
	MediaTypeImage    MediaType = "image"
	MediaTypeVideo    MediaType = "video"
	MediaTypeAudio    MediaType = "audio"
	MediaTypeDocument MediaType = "document"
	MediaTypeSticker  MediaType = "sticker"
)

// MemberAddMode represents the Waxum API schema of the same name.
type MemberAddMode string

const (
	MemberAddModeAdminAdd     MemberAddMode = "admin_add"
	MemberAddModeAllMemberAdd MemberAddMode = "all_member_add"
)

// MemberLinkMode represents the Waxum API schema of the same name.
type MemberLinkMode string

const (
	MemberLinkModeAdminLink     MemberLinkMode = "admin_link"
	MemberLinkModeAllMemberLink MemberLinkMode = "all_member_link"
)

// MembershipApprovalMode represents the Waxum API schema of the same name.
type MembershipApprovalMode string

const (
	MembershipApprovalModeOff MembershipApprovalMode = "off"
	MembershipApprovalModeOn  MembershipApprovalMode = "on"
)

// MessageResponse represents the Waxum API schema of the same name.
type MessageResponse struct {
	MessageID string `json:"message_id"`
	Timestamp int64  `json:"timestamp"`
	To        string `json:"to"`
}

// MexApiResponse represents the Waxum API schema of the same name.
type MexApiResponse struct {
	Data   json.RawMessage       `json:"data,omitempty"`
	Errors []MexGraphQLErrorItem `json:"errors,omitempty"`
}

// MexGraphQLErrorItem represents the Waxum API schema of the same name.
type MexGraphQLErrorItem struct {
	ErrorCode   *int32  `json:"error_code,omitempty"`
	IsRetryable *bool   `json:"is_retryable,omitempty"`
	Message     string  `json:"message"`
	Severity    *string `json:"severity,omitempty"`
}

// MexMutateRequest represents the Waxum API schema of the same name.
type MexMutateRequest struct {
	// DocID GraphQL document ID
	DocID string `json:"doc_id"`
	// DocName GraphQL document name. Optional — defaults to "WAWebMexCustomMutation".
	DocName *string `json:"doc_name,omitempty"`
	// Variables Mutation variables as JSON
	Variables json.RawMessage `json:"variables"`
}

// MexQueryRequest represents the Waxum API schema of the same name.
type MexQueryRequest struct {
	// DocID GraphQL document ID
	DocID string `json:"doc_id"`
	// DocName GraphQL document name (e.g. "WAWebMexListSubscribedNewslettersJobQuery"). Optional — defaults to "WAWebMexCustomQuery" if omitted. WhatsApp's server matches on name + id, so set both to a known pair from 'wacore::iq::mex_ids' when in doubt.
	DocName *string `json:"doc_name,omitempty"`
	// Variables Query variables as JSON
	Variables json.RawMessage `json:"variables"`
}

// NativeFlowButtonItem represents the Waxum API schema of the same name.
type NativeFlowButtonItem struct {
	ButtonParamsJSON string `json:"button_params_json"`
	Name             string `json:"name"`
}

// NatsStatusResponse NATS status response for the REST endpoint.
type NatsStatusResponse struct {
	Connected    bool            `json:"connected"`
	Enabled      bool            `json:"enabled"`
	EventsStream *NatsStreamInfo `json:"events_stream,omitempty"`
	SendStream   *NatsStreamInfo `json:"send_stream,omitempty"`
	URL          *string         `json:"url,omitempty"`
}

// NatsStreamInfo Stream information for NATS status endpoint.
type NatsStreamInfo struct {
	Bytes         int64  `json:"bytes"`
	ConsumerCount int64  `json:"consumer_count"`
	FirstSeq      int64  `json:"first_seq"`
	LastSeq       int64  `json:"last_seq"`
	Messages      int64  `json:"messages"`
	Name          string `json:"name"`
}

// PairCodeRequest Request to connect with pair code
type PairCodeRequest struct {
	Device *DevicePropsRequest `json:"device,omitempty"`
	// PhoneNumber Phone number in international format
	PhoneNumber string `json:"phone_number"`
	// ShowPushNotification Whether to show push notification on phone
	ShowPushNotification *bool `json:"show_push_notification,omitempty"`
}

// PairCodeResponse Response with pair code
type PairCodeResponse struct {
	// Code 8-character pairing code
	Code string `json:"code"`
	// TimeoutSeconds Timeout in seconds
	TimeoutSeconds int64 `json:"timeout_seconds"`
}

// PairStatus Pair-flow telemetry — surfaced through /status so the backend can render meaningful progress instead of polling /qr blindly.
type PairStatus struct {
	Attempts          int32   `json:"attempts"`
	LastError         *string `json:"last_error,omitempty"`
	LastPairCodeAt    *int64  `json:"last_pair_code_at,omitempty"`
	LastQRAt          *int64  `json:"last_qr_at,omitempty"`
	PairCodeExpiresAt *int64  `json:"pair_code_expires_at,omitempty"`
}

// ParticipantChangeResult represents the Waxum API schema of the same name.
type ParticipantChangeResult struct {
	JID    string `json:"jid"`
	Status string `json:"status"`
}

// ParticipantRole represents the Waxum API schema of the same name.
type ParticipantRole string

const (
	ParticipantRoleMember     ParticipantRole = "member"
	ParticipantRoleAdmin      ParticipantRole = "admin"
	ParticipantRoleSuperAdmin ParticipantRole = "super_admin"
)

// ParticipantsRequest represents the Waxum API schema of the same name.
type ParticipantsRequest struct {
	Participants []string `json:"participants"`
}

// ParticipantsResponse represents the Waxum API schema of the same name.
type ParticipantsResponse struct {
	Results []ParticipantChangeResult `json:"results"`
}

// PlayCallRequest Ring a peer and play back an audio file (mp3, wav, ogg — anything ffmpeg can decode) once the media relay is up. Terminates the call after the last PCM chunk is flushed.
type PlayCallRequest struct {
	// AnswerGraceMs Grace period in ms before playback starts, giving the peer time to answer. Defaults to 4000 ms.
	AnswerGraceMs *int64 `json:"answer_grace_ms,omitempty"`
	// AudioURL URL of the audio file to fetch and play. Must be reachable from the waxum process. Any format ffmpeg can demux (mp3, wav, ogg, m4a, opus).
	AudioURL string `json:"audio_url"`
	// Record See 'TtsCallRequest::record'. Same behaviour.
	Record *bool  `json:"record,omitempty"`
	To     string `json:"to"`
}

// PlayCallResponse represents the Waxum API schema of the same name.
type PlayCallResponse struct {
	CallID       string  `json:"call_id"`
	RecordingURL *string `json:"recording_url,omitempty"`
	To           string  `json:"to"`
}

// PresenceStatus represents the Waxum API schema of the same name.
type PresenceStatus string

const (
	PresenceStatusAvailable   PresenceStatus = "available"
	PresenceStatusUnavailable PresenceStatus = "unavailable"
)

// PrivacySettingItem represents the Waxum API schema of the same name.
type PrivacySettingItem struct {
	Category string `json:"category"`
	Value    string `json:"value"`
}

// PrivacySettingsResponse represents the Waxum API schema of the same name.
type PrivacySettingsResponse struct {
	Settings []PrivacySettingItem `json:"settings"`
}

// ProfilePictureResponse represents the Waxum API schema of the same name.
type ProfilePictureResponse struct {
	DirectPath *string `json:"direct_path,omitempty"`
	PictureID  *string `json:"picture_id,omitempty"`
	URL        *string `json:"url,omitempty"`
}

// QrCodeResponse QR code response
type QrCodeResponse struct {
	// QRCodes QR code data (can be rendered as QR code image)
	QRCodes []string `json:"qr_codes"`
	// Status Current session status
	Status SessionStatus `json:"status"`
	// TimeoutSeconds Timeout in seconds before QR code expires
	TimeoutSeconds int64 `json:"timeout_seconds"`
}

// QuickReplyButtonItem represents the Waxum API schema of the same name.
type QuickReplyButtonItem struct {
	// DisplayText Visible label on the button.
	DisplayText string `json:"display_text"`
	// ID Internal ID returned to your webhook when the user taps the button.
	ID string `json:"id"`
}

// RegisterWebhookRequest Request to register a webhook
type RegisterWebhookRequest struct {
	// Events Events to subscribe to
	Events []WebhookEvent `json:"events"`
	// Secret Optional secret for signature verification
	Secret *string `json:"secret,omitempty"`
	// URL Webhook URL
	URL string `json:"url"`
}

// RejectCallRequest represents the Waxum API schema of the same name.
type RejectCallRequest struct {
	CallID string `json:"call_id"`
	From   string `json:"from"`
}

// RequestPaymentRequest represents the Waxum API schema of the same name.
type RequestPaymentRequest struct {
	// Amount1000 Amount in smallest unit * 1000 (e.g., 1000 = $0.001)
	Amount1000 int64 `json:"amount1000"`
	// CurrencyCode ISO 4217 currency code
	CurrencyCode string `json:"currency_code"`
	// ExpiryTimestamp Expiration timestamp
	ExpiryTimestamp *int64 `json:"expiry_timestamp,omitempty"`
	// Note Optional note message text
	Note *string `json:"note,omitempty"`
	To   string  `json:"to"`
}

// RevokeMessageRequest represents the Waxum API schema of the same name.
type RevokeMessageRequest struct {
	MessageID      string  `json:"message_id"`
	OriginalSender *string `json:"original_sender,omitempty"`
	To             string  `json:"to"`
}

// RingCallRequest Send a signalling-only ring to a recipient. The upstream 'whatsapp-rust' client has no media stack (opus/RTP), so this endpoint sends only the '<call><offer>' signalling stanza. The recipient's WhatsApp phone will ring for the usual timeout, then drop with "call not connected" once no audio flow follows. Useful for number verification, missed-call triggers, or attention pings.
type RingCallRequest struct {
	// CallID Optional custom 'call-id'. If omitted a UUIDv4 is generated. Return it back to the caller so they can later 'POST /calls/reject'.
	CallID *string `json:"call_id,omitempty"`
	// Kind Call kind: '"audio"' (default) or '"video"'. Video adds a '<video>' codec child so the peer's phone shows the video-call incoming UI.
	Kind *string `json:"kind,omitempty"`
	// To Recipient. Bare phone number ("6285117822731") or full JID ("6285117822731@s.whatsapp.net"). LID is not supported.
	To string `json:"to"`
}

// RingCallResponse represents the Waxum API schema of the same name.
type RingCallResponse struct {
	CallID string `json:"call_id"`
	To     string `json:"to"`
}

// SendAudioRequest represents the Waxum API schema of the same name.
type SendAudioRequest struct {
	Audio   MediaData `json:"audio"`
	Ptt     *bool     `json:"ptt,omitempty"`
	ReplyTo *string   `json:"reply_to,omitempty"`
	To      string    `json:"to"`
}

// SendButtonsRequest represents the Waxum API schema of the same name.
type SendButtonsRequest struct {
	Buttons     []ButtonItem `json:"buttons"`
	ContentText string       `json:"content_text"`
	Footer      *string      `json:"footer,omitempty"`
	HeaderText  *string      `json:"header_text,omitempty"`
	ReplyTo     *string      `json:"reply_to,omitempty"`
	To          string       `json:"to"`
}

// SendButtonsResponseRequest represents the Waxum API schema of the same name.
type SendButtonsResponseRequest struct {
	ReplyTo *string `json:"reply_to,omitempty"`
	// SelectedButtonID ID of the selected button
	SelectedButtonID string `json:"selected_button_id"`
	// SelectedDisplayText Display text of the selected button
	SelectedDisplayText string `json:"selected_display_text"`
	To                  string `json:"to"`
}

// SendChatStateRequest represents the Waxum API schema of the same name.
type SendChatStateRequest struct {
	State ChatStateType `json:"state"`
	To    string        `json:"to"`
}

// SendCommentRequest represents the Waxum API schema of the same name.
type SendCommentRequest struct {
	// TargetChatJID Optional override for the chat JID embedded in the target key. Defaults to 'to' when omitted.
	TargetChatJID *string `json:"target_chat_jid,omitempty"`
	// TargetMessageID Message ID of the post being commented on
	TargetMessageID string `json:"target_message_id"`
	// TargetParticipant Optional author JID of the parent post. For encrypted CAG comments the receivers key decryption off this field; if omitted the lib resolves it from the locally-stored message secret.
	TargetParticipant *string `json:"target_participant,omitempty"`
	// Text The text content of the comment
	Text string `json:"text"`
	// To JID of the channel / community-announce group the comment lives in (the same 'chat' JID where the parent post was published).
	To string `json:"to"`
}

// SendContactRequest represents the Waxum API schema of the same name.
type SendContactRequest struct {
	Contact ContactCard `json:"contact"`
	ReplyTo *string     `json:"reply_to,omitempty"`
	To      string      `json:"to"`
}

// SendCtaUrlRequest represents the Waxum API schema of the same name.
type SendCtaUrlRequest struct {
	// BodyText Body text shown between the header and the button. Optional — when omitted (or set to '""') the interactive block skips the body line and the message becomes header + button only.
	BodyText *string `json:"body_text,omitempty"`
	// DisplayText Visible label on the button (e.g. "Open website").
	DisplayText string `json:"display_text"`
	// FooterText Optional footer text shown beneath the body.
	FooterText *string `json:"footer_text,omitempty"`
	// HeaderText Optional header title rendered *above* the body — the bold line at the top of the interactive block. When omitted, the header falls back to 'display_text' (the button label) so the layout still has a header line. Set this explicitly when the button label and the eye-catcher should say different things (e.g. button = "Shop now", header = "Ramadan drop is live").
	HeaderText *string    `json:"header_text,omitempty"`
	Image      *MediaData `json:"image,omitempty"`
	// MerchantURL Optional merchant URL — falls back to 'url' when omitted. Some clients show this in the link preview UI.
	MerchantURL *string `json:"merchant_url,omitempty"`
	ReplyTo     *string `json:"reply_to,omitempty"`
	To          string  `json:"to"`
	// URL Public URL the button opens.
	URL string `json:"url"`
}

// SendDocumentRequest represents the Waxum API schema of the same name.
type SendDocumentRequest struct {
	Caption   *string          `json:"caption,omitempty"`
	Document  MediaData        `json:"document"`
	FakeReply *FakeReplyConfig `json:"fake_reply,omitempty"`
	Filename  string           `json:"filename"`
	ReplyTo   *string          `json:"reply_to,omitempty"`
	To        string           `json:"to"`
}

// SendHighlyStructuredRequest represents the Waxum API schema of the same name.
type SendHighlyStructuredRequest struct {
	ElementName string   `json:"element_name"`
	FallbackLc  *string  `json:"fallback_lc,omitempty"`
	FallbackLg  *string  `json:"fallback_lg,omitempty"`
	Namespace   string   `json:"namespace"`
	Params      []string `json:"params,omitempty"`
	ReplyTo     *string  `json:"reply_to,omitempty"`
	To          string   `json:"to"`
}

// SendImageRequest represents the Waxum API schema of the same name.
type SendImageRequest struct {
	Caption   *string          `json:"caption,omitempty"`
	FakeReply *FakeReplyConfig `json:"fake_reply,omitempty"`
	Image     MediaData        `json:"image"`
	ReplyTo   *string          `json:"reply_to,omitempty"`
	To        string           `json:"to"`
}

// SendInteractiveRequest represents the Waxum API schema of the same name.
type SendInteractiveRequest struct {
	BodyText   string                 `json:"body_text"`
	Buttons    []NativeFlowButtonItem `json:"buttons"`
	FakeReply  *FakeReplyConfig       `json:"fake_reply,omitempty"`
	FooterText *string                `json:"footer_text,omitempty"`
	ReplyTo    *string                `json:"reply_to,omitempty"`
	To         string                 `json:"to"`
	// ViewOnce Wrap the interactive payload in 'viewOnceMessageV2'. Empirically the only reliable way to get native_flow quick-reply buttons clickable on consumer WhatsApp accounts (unverified business). Defaults to true.
	ViewOnce *bool `json:"view_once,omitempty"`
}

// SendInteractiveResponseRequest represents the Waxum API schema of the same name.
type SendInteractiveResponseRequest struct {
	// BodyText Body text of the response
	BodyText *string `json:"body_text,omitempty"`
	// Name Native flow response name
	Name string `json:"name"`
	// ParamsJSON Native flow response params (JSON string)
	ParamsJSON string  `json:"params_json"`
	ReplyTo    *string `json:"reply_to,omitempty"`
	To         string  `json:"to"`
	// Version Version of the native flow response
	Version *int32 `json:"version,omitempty"`
}

// SendInvoiceRequest represents the Waxum API schema of the same name.
type SendInvoiceRequest struct {
	AttachmentMIMEType *string `json:"attachment_mimetype,omitempty"`
	// AttachmentType "image" or "pdf"
	AttachmentType *string `json:"attachment_type,omitempty"`
	Note           *string `json:"note,omitempty"`
	ReplyTo        *string `json:"reply_to,omitempty"`
	To             string  `json:"to"`
	Token          *string `json:"token,omitempty"`
}

// SendListRequest represents the Waxum API schema of the same name.
type SendListRequest struct {
	ButtonText  string        `json:"button_text"`
	Description string        `json:"description"`
	Footer      *string       `json:"footer,omitempty"`
	ReplyTo     *string       `json:"reply_to,omitempty"`
	Sections    []ListSection `json:"sections"`
	Title       string        `json:"title"`
	To          string        `json:"to"`
}

// SendListResponseRequest represents the Waxum API schema of the same name.
type SendListResponseRequest struct {
	Description *string `json:"description,omitempty"`
	ReplyTo     *string `json:"reply_to,omitempty"`
	// SelectedRowID ID of the selected row
	SelectedRowID string `json:"selected_row_id"`
	Title         string `json:"title"`
	To            string `json:"to"`
}

// SendLocationRequest represents the Waxum API schema of the same name.
type SendLocationRequest struct {
	Address   *string `json:"address,omitempty"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Name      *string `json:"name,omitempty"`
	ReplyTo   *string `json:"reply_to,omitempty"`
	To        string  `json:"to"`
}

// SendNewsletterAdminInviteRequest represents the Waxum API schema of the same name.
type SendNewsletterAdminInviteRequest struct {
	Caption          *string `json:"caption,omitempty"`
	InviteExpiration *int64  `json:"invite_expiration,omitempty"`
	NewsletterJID    string  `json:"newsletter_jid"`
	NewsletterName   string  `json:"newsletter_name"`
	ReplyTo          *string `json:"reply_to,omitempty"`
	To               string  `json:"to"`
}

// SendNewsletterFollowerInviteRequest represents the Waxum API schema of the same name.
type SendNewsletterFollowerInviteRequest struct {
	Caption        *string `json:"caption,omitempty"`
	NewsletterJID  string  `json:"newsletter_jid"`
	NewsletterName string  `json:"newsletter_name"`
	ReplyTo        *string `json:"reply_to,omitempty"`
	To             string  `json:"to"`
}

// SendNewsletterForwardRequest represents the Waxum API schema of the same name.
type SendNewsletterForwardRequest struct {
	// ContentType Content type: "update", "update_card", "link_card"
	ContentType *string `json:"content_type,omitempty"`
	// NewsletterJID Newsletter JID
	NewsletterJID string `json:"newsletter_jid"`
	// NewsletterName Newsletter name
	NewsletterName *string `json:"newsletter_name,omitempty"`
	// ServerMessageID Server message ID from the newsletter
	ServerMessageID int32 `json:"server_message_id"`
	// Text The text content to forward
	Text string `json:"text"`
	To   string `json:"to"`
}

// SendOrderRequest represents the Waxum API schema of the same name.
type SendOrderRequest struct {
	ItemCount  *int32  `json:"item_count,omitempty"`
	Message    *string `json:"message,omitempty"`
	OrderID    string  `json:"order_id"`
	OrderTitle *string `json:"order_title,omitempty"`
	ReplyTo    *string `json:"reply_to,omitempty"`
	SellerJID  *string `json:"seller_jid,omitempty"`
	// Status Order status: "inquiry", "accepted", "declined"
	Status            *string `json:"status,omitempty"`
	To                string  `json:"to"`
	Token             *string `json:"token,omitempty"`
	TotalAmount1000   *int64  `json:"total_amount_1000,omitempty"`
	TotalCurrencyCode *string `json:"total_currency_code,omitempty"`
}

// SendPaymentInviteRequest represents the Waxum API schema of the same name.
type SendPaymentInviteRequest struct {
	ReplyTo *string `json:"reply_to,omitempty"`
	// ServiceType Payment service type (integer)
	ServiceType *int32 `json:"service_type,omitempty"`
	To          string `json:"to"`
}

// SendPaymentRequest represents the Waxum API schema of the same name.
type SendPaymentRequest struct {
	// Note Optional note message text
	Note *string `json:"note,omitempty"`
	// RequestMessageID Message ID of the payment request being responded to
	RequestMessageID *string `json:"request_message_id,omitempty"`
	To               string  `json:"to"`
	// TransactionData Transaction data (JSON string)
	TransactionData *string `json:"transaction_data,omitempty"`
}

// SendPinMessageRequest represents the Waxum API schema of the same name.
type SendPinMessageRequest struct {
	Chat string `json:"chat"`
	// DurationSeconds Pin duration in seconds (0 to unpin, 86400 for 24h, 604800 for 7d, 2592000 for 30d)
	DurationSeconds *int64 `json:"duration_seconds,omitempty"`
	MessageID       string `json:"message_id"`
}

// SendPollRequest represents the Waxum API schema of the same name.
type SendPollRequest struct {
	Name    string   `json:"name"`
	Options []string `json:"options"`
	ReplyTo *string  `json:"reply_to,omitempty"`
	// SelectableCount Max number of selectable options (0 = unlimited)
	SelectableCount *int32 `json:"selectable_count,omitempty"`
	To              string `json:"to"`
}

// SendPollUpdateRequest represents the Waxum API schema of the same name.
type SendPollUpdateRequest struct {
	// EncIv Encryption IV for the vote (base64)
	EncIv *string `json:"enc_iv,omitempty"`
	// EncPayload Encryption key (base64)
	EncPayload *string `json:"enc_payload,omitempty"`
	// PollMessageID The message ID of the poll creation message
	PollMessageID string `json:"poll_message_id"`
	// SelectedOptions Selected option hashes (SHA-256 of option text)
	SelectedOptions []string `json:"selected_options"`
	To              string   `json:"to"`
}

// SendQuickReplyRequest represents the Waxum API schema of the same name.
type SendQuickReplyRequest struct {
	BodyText string `json:"body_text"`
	// Buttons 1-3 reply buttons. WhatsApp clients clip beyond 3.
	Buttons    []QuickReplyButtonItem `json:"buttons"`
	FooterText *string                `json:"footer_text,omitempty"`
	ReplyTo    *string                `json:"reply_to,omitempty"`
	To         string                 `json:"to"`
}

// SendReactionRequest represents the Waxum API schema of the same name.
type SendReactionRequest struct {
	Emoji     string `json:"emoji"`
	MessageID string `json:"message_id"`
	To        string `json:"to"`
}

// SendResult Result of processing an outbound command. Published to 'wa.events.{session_id}.send_result'.
type SendResult struct {
	Error     *string `json:"error,omitempty"`
	MessageID *string `json:"message_id,omitempty"`
	RequestID *string `json:"request_id,omitempty"`
	Success   bool    `json:"success"`
	Timestamp int64   `json:"timestamp"`
}

// SendScheduledCallEditRequest represents the Waxum API schema of the same name.
type SendScheduledCallEditRequest struct {
	// EditType "cancel"
	EditType *string `json:"edit_type,omitempty"`
	// ScheduledCallMessageID Message ID of the scheduled call creation message
	ScheduledCallMessageID string `json:"scheduled_call_message_id"`
	To                     string `json:"to"`
}

// SendScheduledCallRequest represents the Waxum API schema of the same name.
type SendScheduledCallRequest struct {
	// CallType "voice" or "video"
	CallType *string `json:"call_type,omitempty"`
	// ScheduledTimestampMs Scheduled call time as Unix timestamp in milliseconds
	ScheduledTimestampMs int64   `json:"scheduled_timestamp_ms"`
	Title                *string `json:"title,omitempty"`
	To                   string  `json:"to"`
}

// SendStickerRequest represents the Waxum API schema of the same name.
type SendStickerRequest struct {
	ReplyTo *string   `json:"reply_to,omitempty"`
	Sticker MediaData `json:"sticker"`
	To      string    `json:"to"`
}

// SendTemplateButtonReplyRequest represents the Waxum API schema of the same name.
type SendTemplateButtonReplyRequest struct {
	ReplyTo             *string `json:"reply_to,omitempty"`
	SelectedDisplayText string  `json:"selected_display_text"`
	SelectedID          string  `json:"selected_id"`
	SelectedIndex       *int32  `json:"selected_index,omitempty"`
	To                  string  `json:"to"`
}

// SendTextRequest represents the Waxum API schema of the same name.
type SendTextRequest struct {
	FakeReply *FakeReplyConfig `json:"fake_reply,omitempty"`
	ReplyTo   *string          `json:"reply_to,omitempty"`
	Text      string           `json:"text"`
	To        string           `json:"to"`
}

// SendVideoRequest represents the Waxum API schema of the same name.
type SendVideoRequest struct {
	Caption   *string          `json:"caption,omitempty"`
	FakeReply *FakeReplyConfig `json:"fake_reply,omitempty"`
	ReplyTo   *string          `json:"reply_to,omitempty"`
	To        string           `json:"to"`
	Video     MediaData        `json:"video"`
}

// SessionInfo Session information
type SessionInfo struct {
	// CreatedAt Creation timestamp
	CreatedAt int64 `json:"created_at"`
	// ID Unique session ID
	ID string `json:"id"`
	// IsLoggedIn Whether session is authenticated
	IsLoggedIn bool `json:"is_logged_in"`
	// LastConnectedAt Last successful connection timestamp
	LastConnectedAt *int64 `json:"last_connected_at,omitempty"`
	// Name Optional friendly name
	Name *string `json:"name,omitempty"`
	// PhoneNumber Phone number when logged in
	PhoneNumber *string `json:"phone_number,omitempty"`
	// PushName WhatsApp display name
	PushName *string `json:"push_name,omitempty"`
	// Status Current status
	Status SessionStatus `json:"status"`
	// UpdatedAt Last update timestamp
	UpdatedAt int64 `json:"updated_at"`
}

// SessionListResponse Response with list of sessions
type SessionListResponse struct {
	// Sessions List of sessions
	Sessions []SessionInfo `json:"sessions"`
	// Total Total count
	Total int64 `json:"total"`
}

// SessionStatus represents the Waxum API schema of the same name.
type SessionStatus string

const (
	SessionStatusDisconnected       SessionStatus = "disconnected"
	SessionStatusConnecting         SessionStatus = "connecting"
	SessionStatusWaitingForQR       SessionStatus = "waiting_for_qr"
	SessionStatusWaitingForPairCode SessionStatus = "waiting_for_pair_code"
	SessionStatusConnected          SessionStatus = "connected"
	SessionStatusLoggedIn           SessionStatus = "logged_in"
)

// SessionStatusResponse Session status response
type SessionStatusResponse struct {
	// IsLoggedIn Whether logged in
	IsLoggedIn bool `json:"is_logged_in"`
	// Pair Pair flow telemetry (always present, fields may be null)
	Pair PairStatus `json:"pair"`
	// PhoneNumber Phone number if available
	PhoneNumber *string `json:"phone_number,omitempty"`
	// PushName Display name if available
	PushName *string `json:"push_name,omitempty"`
	// Status Current status
	Status SessionStatus `json:"status"`
}

// SetDescriptionRequest represents the Waxum API schema of the same name.
type SetDescriptionRequest struct {
	Description *string `json:"description,omitempty"`
	PrevID      *string `json:"prev_id,omitempty"`
}

// SetGroupSettingsRequest represents the Waxum API schema of the same name.
type SetGroupSettingsRequest struct {
	MemberAddMode          *MemberAddMode          `json:"member_add_mode,omitempty"`
	MemberLinkMode         *MemberLinkMode         `json:"member_link_mode,omitempty"`
	MembershipApprovalMode *MembershipApprovalMode `json:"membership_approval_mode,omitempty"`
}

// SetPresenceRequest represents the Waxum API schema of the same name.
type SetPresenceRequest struct {
	Status PresenceStatus `json:"status"`
}

// SetSubjectRequest represents the Waxum API schema of the same name.
type SetSubjectRequest struct {
	Subject string `json:"subject"`
}

// SpamReportRequest represents the Waxum API schema of the same name.
type SpamReportRequest struct {
	// FromJID The JID of the message sender
	FromJID *string `json:"from_jid,omitempty"`
	// GroupJID For group reports, the group JID
	GroupJID *string `json:"group_jid,omitempty"`
	// GroupSubject For group reports, the group subject/name
	GroupSubject *string `json:"group_subject,omitempty"`
	// MediaType Media type of the message
	MediaType *string `json:"media_type,omitempty"`
	// MessageID The message ID being reported
	MessageID string `json:"message_id"`
	// MessageTimestamp The timestamp of the message
	MessageTimestamp int64 `json:"message_timestamp"`
	// ParticipantJID For group messages, the participant JID
	ParticipantJID *string `json:"participant_jid,omitempty"`
	// SpamFlow Spam flow: "message_menu", "group_spam_banner_report", "group_info_report", "contact_info", "status_report"
	SpamFlow *string `json:"spam_flow,omitempty"`
}

// SpamReportResponse represents the Waxum API schema of the same name.
type SpamReportResponse struct {
	ReportID *string `json:"report_id,omitempty"`
	Success  bool    `json:"success"`
}

// StatusReactionRequest represents the Waxum API schema of the same name.
type StatusReactionRequest struct {
	MessageID   string `json:"message_id"`
	Reaction    string `json:"reaction"`
	StatusOwner string `json:"status_owner"`
}

// StoredContact represents the Waxum API schema of the same name.
type StoredContact struct {
	BusinessName *string `json:"business_name,omitempty"`
	FirstName    *string `json:"first_name,omitempty"`
	FullName     *string `json:"full_name,omitempty"`
	JID          string  `json:"jid"`
	LIDJID       *string `json:"lid_jid,omitempty"`
	Phone        *string `json:"phone,omitempty"`
	PushName     *string `json:"push_name,omitempty"`
	Source       string  `json:"source"`
	UpdatedAt    *string `json:"updated_at,omitempty"`
}

// StoredContactListResponse represents the Waxum API schema of the same name.
type StoredContactListResponse struct {
	Contacts []StoredContact `json:"contacts"`
	Limit    int32           `json:"limit"`
	Offset   int32           `json:"offset"`
	Total    int64           `json:"total"`
}

// SubscribePresenceRequest represents the Waxum API schema of the same name.
type SubscribePresenceRequest struct {
	JID string `json:"jid"`
}

// SuccessResponse represents the Waxum API schema of the same name.
type SuccessResponse struct {
	Message *string `json:"message,omitempty"`
	Success bool    `json:"success"`
}

// TcTokenGetResponse represents the Waxum API schema of the same name.
type TcTokenGetResponse struct {
	Found           bool   `json:"found"`
	JID             string `json:"jid"`
	SenderTimestamp *int64 `json:"sender_timestamp,omitempty"`
	TokenTimestamp  *int64 `json:"token_timestamp,omitempty"`
}

// TcTokenIssueRequest represents the Waxum API schema of the same name.
type TcTokenIssueRequest struct {
	// JIDs List of JIDs to issue tokens for
	JIDs []string `json:"jids"`
}

// TcTokenIssueResponse represents the Waxum API schema of the same name.
type TcTokenIssueResponse struct {
	Tokens []TcTokenItem `json:"tokens"`
}

// TcTokenItem represents the Waxum API schema of the same name.
type TcTokenItem struct {
	JID       string `json:"jid"`
	Timestamp int64  `json:"timestamp"`
}

// TcTokenListResponse represents the Waxum API schema of the same name.
type TcTokenListResponse struct {
	JIDs []string `json:"jids"`
}

// TcTokenPruneResponse represents the Waxum API schema of the same name.
type TcTokenPruneResponse struct {
	PrunedCount int32 `json:"pruned_count"`
}

// TerminateCallRequest End a call the session is currently in.
type TerminateCallRequest struct {
	CallID string `json:"call_id"`
	// Peer Peer JID (caller for incoming, callee for outgoing).
	Peer string `json:"peer"`
	// Reason Optional termination reason string (e.g. "hangup", "busy"). Sent as the 'reason' attr on the '<terminate>' child. Defaults to '"hangup"' when omitted.
	Reason *string `json:"reason,omitempty"`
}

// TtsCallRequest Ring a peer and, once the media relay is up, speak 'text' at them via 'edge-tts' (Microsoft Neural voices, free). Terminates the call after the last PCM chunk is flushed.
type TtsCallRequest struct {
	// AnswerGraceMs Grace period in milliseconds to wait before the first PCM chunk is pushed, giving the peer a moment to answer. Defaults to 4000 ms.
	AnswerGraceMs *int64 `json:"answer_grace_ms,omitempty"`
	// Record If true, waxum decodes the peer's incoming MLOW frames back to 16 kHz mono PCM and writes them as a WAV file under '{WHATSAPP_STORAGE_PATH}/{session_id}/recordings/{call_id}.wav'. The file is served over 'GET /api/v1/sessions/{session_id}/calls/{call_id}/recording.wav' once the call ends. Defaults to 'false'.
	Record *bool  `json:"record,omitempty"`
	Text   string `json:"text"`
	To     string `json:"to"`
	// Voice edge-tts voice id. Defaults to 'id-ID-ArdiNeural' (male Indonesian). See 'edge-tts --list-voices' for the full list.
	Voice *string `json:"voice,omitempty"`
}

// TtsCallResponse represents the Waxum API schema of the same name.
type TtsCallResponse struct {
	CallID       string  `json:"call_id"`
	RecordingURL *string `json:"recording_url,omitempty"`
	To           string  `json:"to"`
}

// TypingRequest represents the Waxum API schema of the same name.
type TypingRequest struct {
	To string `json:"to"`
}

// UploadMediaResponse represents the Waxum API schema of the same name.
type UploadMediaResponse struct {
	DirectPath    string    `json:"direct_path"`
	FileEncSHA256 string    `json:"file_enc_sha256"`
	FileLength    int64     `json:"file_length"`
	FileSHA256    string    `json:"file_sha256"`
	MediaKey      string    `json:"media_key"`
	MediaType     MediaType `json:"media_type"`
	MIMEType      string    `json:"mimetype"`
	URL           string    `json:"url"`
}

// UserInfo represents the Waxum API schema of the same name.
type UserInfo struct {
	IsBusiness bool    `json:"is_business"`
	JID        string  `json:"jid"`
	LID        *string `json:"lid,omitempty"`
	PictureID  *string `json:"picture_id,omitempty"`
	Status     *string `json:"status,omitempty"`
}

// UserInfoResponse represents the Waxum API schema of the same name.
type UserInfoResponse struct {
	Users []UserInfo `json:"users"`
}

// WebhookConfig represents the Waxum API schema of the same name.
type WebhookConfig struct {
	Enabled bool           `json:"enabled"`
	Events  []WebhookEvent `json:"events"`
	Secret  *string        `json:"secret,omitempty"`
	URL     string         `json:"url"`
}

// WebhookConfigWithId A webhook config bundled with its runtime ID so clients can call the 'DELETE /webhooks/{webhook_id}' endpoint.
type WebhookConfigWithId struct {
	Enabled bool           `json:"enabled"`
	Events  []WebhookEvent `json:"events"`
	ID      string         `json:"id"`
	Secret  *string        `json:"secret,omitempty"`
	URL     string         `json:"url"`
}

// WebhookEvent represents the Waxum API schema of the same name.
type WebhookEvent string

const (
	WebhookEventAll                  WebhookEvent = "all"
	WebhookEventMessage              WebhookEvent = "message"
	WebhookEventReceipt              WebhookEvent = "receipt"
	WebhookEventPresence             WebhookEvent = "presence"
	WebhookEventChatPresence         WebhookEvent = "chat_presence"
	WebhookEventGroupUpdate          WebhookEvent = "group_update"
	WebhookEventJoinedGroup          WebhookEvent = "joined_group"
	WebhookEventQRCode               WebhookEvent = "qr_code"
	WebhookEventPairCode             WebhookEvent = "pair_code"
	WebhookEventConnected            WebhookEvent = "connected"
	WebhookEventDisconnected         WebhookEvent = "disconnected"
	WebhookEventLoggedOut            WebhookEvent = "logged_out"
	WebhookEventPictureUpdate        WebhookEvent = "picture_update"
	WebhookEventUserAboutUpdate      WebhookEvent = "user_about_update"
	WebhookEventPushNameUpdate       WebhookEvent = "push_name_update"
	WebhookEventContactUpdate        WebhookEvent = "contact_update"
	WebhookEventDeviceListUpdate     WebhookEvent = "device_list_update"
	WebhookEventPinUpdate            WebhookEvent = "pin_update"
	WebhookEventMuteUpdate           WebhookEvent = "mute_update"
	WebhookEventArchiveUpdate        WebhookEvent = "archive_update"
	WebhookEventMarkChatAsRead       WebhookEvent = "mark_chat_as_read"
	WebhookEventUndecryptableMessage WebhookEvent = "undecryptable_message"
	WebhookEventClientOutdated       WebhookEvent = "client_outdated"
	WebhookEventOfflineSyncPreview   WebhookEvent = "offline_sync_preview"
	WebhookEventOfflineSyncCompleted WebhookEvent = "offline_sync_completed"
)

// WebhookListResponse Response with list of webhooks
type WebhookListResponse struct {
	// Count Total count
	Count int64 `json:"count"`
	// Webhooks List of webhooks, each with its ID so clients can DELETE by ID.
	Webhooks []WebhookConfigWithId `json:"webhooks"`
}

// WebhookRequest Webhook configuration for session creation
type WebhookRequest struct {
	// Events Events to subscribe to (defaults to all if not provided)
	Events []WebhookEvent `json:"events,omitempty"`
	// Secret Optional secret for HMAC signature verification
	Secret *string `json:"secret,omitempty"`
	// URL Webhook URL
	URL string `json:"url"`
}

// WhatsAppCheckResult represents the Waxum API schema of the same name.
type WhatsAppCheckResult struct {
	IsRegistered bool    `json:"is_registered"`
	JID          *string `json:"jid,omitempty"`
	Phone        string  `json:"phone"`
}
