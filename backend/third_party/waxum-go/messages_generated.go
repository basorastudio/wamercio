// Code generated from openapi/waxum.openapi.json; DO NOT EDIT.

package waxum

import (
	"context"
	"net/http"
)

// MessagesService provides access to Waxum messages endpoints.
type MessagesService struct{ client *Client }

// SendAudio calls the corresponding Waxum endpoint. OpenAPI operationId: send_audio.
func (s *MessagesService) SendAudio(ctx context.Context, sessionID string, body *SendAudioRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/audio"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SendButtons calls the corresponding Waxum endpoint. OpenAPI operationId: send_buttons.
func (s *MessagesService) SendButtons(ctx context.Context, sessionID string, body *SendButtonsRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/buttons"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SendButtonsResponse calls the corresponding Waxum endpoint. OpenAPI operationId: send_buttons_response.
func (s *MessagesService) SendButtonsResponse(ctx context.Context, sessionID string, body *SendButtonsResponseRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/buttons-response"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// CancelPaymentRequest calls the corresponding Waxum endpoint. OpenAPI operationId: cancel_payment_request.
func (s *MessagesService) CancelPaymentRequest(ctx context.Context, sessionID string, body *CancelPaymentRequestRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/cancel-payment"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SendComment calls the corresponding Waxum endpoint. OpenAPI operationId: send_comment.
func (s *MessagesService) SendComment(ctx context.Context, sessionID string, body *SendCommentRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/comment"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SendContact calls the corresponding Waxum endpoint. OpenAPI operationId: send_contact.
func (s *MessagesService) SendContact(ctx context.Context, sessionID string, body *SendContactRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/contact"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SendCtaURL calls the corresponding Waxum endpoint. OpenAPI operationId: send_cta_url.
func (s *MessagesService) SendCtaURL(ctx context.Context, sessionID string, body *SendCtaUrlRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/cta-url"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// DeclinePaymentRequest calls the corresponding Waxum endpoint. OpenAPI operationId: decline_payment_request.
func (s *MessagesService) DeclinePaymentRequest(ctx context.Context, sessionID string, body *DeclinePaymentRequestRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/decline-payment"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SendDocument calls the corresponding Waxum endpoint. OpenAPI operationId: send_document.
func (s *MessagesService) SendDocument(ctx context.Context, sessionID string, body *SendDocumentRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/document"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// EditMessage calls the corresponding Waxum endpoint. OpenAPI operationId: edit_message.
func (s *MessagesService) EditMessage(ctx context.Context, sessionID string, body *EditMessageRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/edit"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// ForwardMessage calls the corresponding Waxum endpoint. OpenAPI operationId: forward_message.
func (s *MessagesService) ForwardMessage(ctx context.Context, sessionID string, body *ForwardMessageRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/forward"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SendHighlyStructured calls the corresponding Waxum endpoint. OpenAPI operationId: send_highly_structured.
func (s *MessagesService) SendHighlyStructured(ctx context.Context, sessionID string, body *SendHighlyStructuredRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/highly-structured"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SendImage calls the corresponding Waxum endpoint. OpenAPI operationId: send_image.
func (s *MessagesService) SendImage(ctx context.Context, sessionID string, body *SendImageRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/image"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SendInteractive calls the corresponding Waxum endpoint. OpenAPI operationId: send_interactive.
func (s *MessagesService) SendInteractive(ctx context.Context, sessionID string, body *SendInteractiveRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/interactive"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SendInteractiveResponse calls the corresponding Waxum endpoint. OpenAPI operationId: send_interactive_response.
func (s *MessagesService) SendInteractiveResponse(ctx context.Context, sessionID string, body *SendInteractiveResponseRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/interactive-response"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SendInvoice calls the corresponding Waxum endpoint. OpenAPI operationId: send_invoice.
func (s *MessagesService) SendInvoice(ctx context.Context, sessionID string, body *SendInvoiceRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/invoice"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SendList calls the corresponding Waxum endpoint. OpenAPI operationId: send_list.
func (s *MessagesService) SendList(ctx context.Context, sessionID string, body *SendListRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/list"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SendListResponse calls the corresponding Waxum endpoint. OpenAPI operationId: send_list_response.
func (s *MessagesService) SendListResponse(ctx context.Context, sessionID string, body *SendListResponseRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/list-response"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SendLocation calls the corresponding Waxum endpoint. OpenAPI operationId: send_location.
func (s *MessagesService) SendLocation(ctx context.Context, sessionID string, body *SendLocationRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/location"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SendOrder calls the corresponding Waxum endpoint. OpenAPI operationId: send_order.
func (s *MessagesService) SendOrder(ctx context.Context, sessionID string, body *SendOrderRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/order"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SendPaymentInvite calls the corresponding Waxum endpoint. OpenAPI operationId: send_payment_invite.
func (s *MessagesService) SendPaymentInvite(ctx context.Context, sessionID string, body *SendPaymentInviteRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/payment-invite"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SendPinMessage calls the corresponding Waxum endpoint. OpenAPI operationId: send_pin_message.
func (s *MessagesService) SendPinMessage(ctx context.Context, sessionID string, body *SendPinMessageRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/pin"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SendPoll calls the corresponding Waxum endpoint. OpenAPI operationId: send_poll.
func (s *MessagesService) SendPoll(ctx context.Context, sessionID string, body *SendPollRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/poll"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SendPollUpdate calls the corresponding Waxum endpoint. OpenAPI operationId: send_poll_update.
func (s *MessagesService) SendPollUpdate(ctx context.Context, sessionID string, body *SendPollUpdateRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/poll-update"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SendQuickReply calls the corresponding Waxum endpoint. OpenAPI operationId: send_quick_reply.
func (s *MessagesService) SendQuickReply(ctx context.Context, sessionID string, body *SendQuickReplyRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/quick-reply"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SendReaction calls the corresponding Waxum endpoint. OpenAPI operationId: send_reaction.
func (s *MessagesService) SendReaction(ctx context.Context, sessionID string, body *SendReactionRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/react"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// MarkAsRead calls the corresponding Waxum endpoint. OpenAPI operationId: mark_as_read.
func (s *MessagesService) MarkAsRead(ctx context.Context, sessionID string, body *MarkAsReadRequest) (*SuccessResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/read"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result SuccessResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// RequestPayment calls the corresponding Waxum endpoint. OpenAPI operationId: request_payment.
func (s *MessagesService) RequestPayment(ctx context.Context, sessionID string, body *RequestPaymentRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/request-payment"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// RevokeMessage calls the corresponding Waxum endpoint. OpenAPI operationId: revoke_message.
func (s *MessagesService) RevokeMessage(ctx context.Context, sessionID string, body *RevokeMessageRequest) (*SuccessResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/revoke"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result SuccessResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SendScheduledCall calls the corresponding Waxum endpoint. OpenAPI operationId: send_scheduled_call.
func (s *MessagesService) SendScheduledCall(ctx context.Context, sessionID string, body *SendScheduledCallRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/scheduled-call"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SendScheduledCallEdit calls the corresponding Waxum endpoint. OpenAPI operationId: send_scheduled_call_edit.
func (s *MessagesService) SendScheduledCallEdit(ctx context.Context, sessionID string, body *SendScheduledCallEditRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/scheduled-call-edit"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SendPayment calls the corresponding Waxum endpoint. OpenAPI operationId: send_payment.
func (s *MessagesService) SendPayment(ctx context.Context, sessionID string, body *SendPaymentRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/send-payment"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SendSticker calls the corresponding Waxum endpoint. OpenAPI operationId: send_sticker.
func (s *MessagesService) SendSticker(ctx context.Context, sessionID string, body *SendStickerRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/sticker"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SendTemplateButtonReply calls the corresponding Waxum endpoint. OpenAPI operationId: send_template_button_reply.
func (s *MessagesService) SendTemplateButtonReply(ctx context.Context, sessionID string, body *SendTemplateButtonReplyRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/template-button-reply"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SendText calls the corresponding Waxum endpoint. OpenAPI operationId: send_text.
func (s *MessagesService) SendText(ctx context.Context, sessionID string, body *SendTextRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/text"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}

// SendVideo calls the corresponding Waxum endpoint. OpenAPI operationId: send_video.
func (s *MessagesService) SendVideo(ctx context.Context, sessionID string, body *SendVideoRequest) (*MessageResponse, *Response, error) {
	path := "/api/v1/sessions/{session_id}/messages/video"
	path = replacePathParam(path, "session_id", formatPathValue(sessionID))
	req, err := s.client.newRequest(ctx, http.MethodPost, path, body)
	if err != nil {
		return nil, nil, err
	}
	var result MessageResponse
	resp, err := s.client.do(req, &result)
	if err != nil {
		return nil, resp, err
	}
	return &result, resp, nil
}
