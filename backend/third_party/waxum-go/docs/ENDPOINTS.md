# Referencia de métodos del SDK

Generado desde `openapi/waxum.openapi.json`.

Operaciones: **103**.

## Blocking

| Método Go | HTTP | Endpoint | Operation ID |
|---|---:|---|---|
| `Block` | `POST` | `/api/v1/sessions/{session_id}/blocking/block` | `block_contact` |
| `IsBlocked` | `GET` | `/api/v1/sessions/{session_id}/blocking/check/{jid}` | `is_blocked` |
| `List` | `GET` | `/api/v1/sessions/{session_id}/blocking/list` | `get_blocklist` |
| `Unblock` | `POST` | `/api/v1/sessions/{session_id}/blocking/unblock` | `unblock_contact` |

## Calls

| Método Go | HTTP | Endpoint | Operation ID |
|---|---:|---|---|
| `Accept` | `POST` | `/api/v1/sessions/{session_id}/calls/accept` | `accept_call` |
| `Play` | `POST` | `/api/v1/sessions/{session_id}/calls/play` | `play_call` |
| `Reject` | `POST` | `/api/v1/sessions/{session_id}/calls/reject` | `reject_call` |
| `Ring` | `POST` | `/api/v1/sessions/{session_id}/calls/ring` | `ring_call` |
| `Terminate` | `POST` | `/api/v1/sessions/{session_id}/calls/terminate` | `terminate_call` |
| `TTS` | `POST` | `/api/v1/sessions/{session_id}/calls/tts` | `tts_call` |

## ChatState

| Método Go | HTTP | Endpoint | Operation ID |
|---|---:|---|---|
| `Send` | `POST` | `/api/v1/sessions/{session_id}/chatstate/send` | `send_chatstate` |
| `Typing` | `POST` | `/api/v1/sessions/{session_id}/chatstate/typing` | `send_typing` |

## Contacts

| Método Go | HTTP | Endpoint | Operation ID |
|---|---:|---|---|
| `List` | `GET` | `/api/v1/sessions/{session_id}/contacts` | `list_contacts` |
| `CheckOnWhatsApp` | `POST` | `/api/v1/sessions/{session_id}/contacts/check` | `check_on_whatsapp` |
| `GetContactInfo` | `POST` | `/api/v1/sessions/{session_id}/contacts/info` | `get_contact_info` |
| `GetUserInfo` | `POST` | `/api/v1/sessions/{session_id}/contacts/users` | `get_user_info` |
| `GetProfilePicture` | `GET` | `/api/v1/sessions/{session_id}/contacts/{jid}/picture` | `get_profile_picture` |

## Groups

| Método Go | HTTP | Endpoint | Operation ID |
|---|---:|---|---|
| `List` | `GET` | `/api/v1/sessions/{session_id}/groups` | `list_groups` |
| `Create` | `POST` | `/api/v1/sessions/{session_id}/groups` | `create_group` |
| `Get` | `GET` | `/api/v1/sessions/{session_id}/groups/{group_jid}` | `get_group` |
| `PromoteParticipants` | `POST` | `/api/v1/sessions/{session_id}/groups/{group_jid}/admins` | `promote_participants` |
| `DemoteParticipants` | `DELETE` | `/api/v1/sessions/{session_id}/groups/{group_jid}/admins` | `demote_participants` |
| `SetDescription` | `PUT` | `/api/v1/sessions/{session_id}/groups/{group_jid}/description` | `set_group_description` |
| `GetInfo` | `GET` | `/api/v1/sessions/{session_id}/groups/{group_jid}/info` | `get_group_info` |
| `GetInviteLink` | `GET` | `/api/v1/sessions/{session_id}/groups/{group_jid}/invite-link` | `get_invite_link` |
| `Leave` | `POST` | `/api/v1/sessions/{session_id}/groups/{group_jid}/leave` | `leave_group` |
| `AddParticipants` | `POST` | `/api/v1/sessions/{session_id}/groups/{group_jid}/participants` | `add_participants` |
| `RemoveParticipants` | `DELETE` | `/api/v1/sessions/{session_id}/groups/{group_jid}/participants` | `remove_participants` |
| `SetSettings` | `PUT` | `/api/v1/sessions/{session_id}/groups/{group_jid}/settings` | `set_group_settings` |
| `SetSubject` | `PUT` | `/api/v1/sessions/{session_id}/groups/{group_jid}/subject` | `set_group_subject` |

## Media

| Método Go | HTTP | Endpoint | Operation ID |
|---|---:|---|---|
| `Download` | `POST` | `/api/v1/sessions/{session_id}/media/download` | `download_media` |
| `Upload` | `POST` | `/api/v1/sessions/{session_id}/media/upload` | `upload_media` |

## Messages

| Método Go | HTTP | Endpoint | Operation ID |
|---|---:|---|---|
| `SendAudio` | `POST` | `/api/v1/sessions/{session_id}/messages/audio` | `send_audio` |
| `SendButtons` | `POST` | `/api/v1/sessions/{session_id}/messages/buttons` | `send_buttons` |
| `SendButtonsResponse` | `POST` | `/api/v1/sessions/{session_id}/messages/buttons-response` | `send_buttons_response` |
| `CancelPaymentRequest` | `POST` | `/api/v1/sessions/{session_id}/messages/cancel-payment` | `cancel_payment_request` |
| `SendComment` | `POST` | `/api/v1/sessions/{session_id}/messages/comment` | `send_comment` |
| `SendContact` | `POST` | `/api/v1/sessions/{session_id}/messages/contact` | `send_contact` |
| `SendCtaURL` | `POST` | `/api/v1/sessions/{session_id}/messages/cta-url` | `send_cta_url` |
| `DeclinePaymentRequest` | `POST` | `/api/v1/sessions/{session_id}/messages/decline-payment` | `decline_payment_request` |
| `SendDocument` | `POST` | `/api/v1/sessions/{session_id}/messages/document` | `send_document` |
| `EditMessage` | `POST` | `/api/v1/sessions/{session_id}/messages/edit` | `edit_message` |
| `ForwardMessage` | `POST` | `/api/v1/sessions/{session_id}/messages/forward` | `forward_message` |
| `SendHighlyStructured` | `POST` | `/api/v1/sessions/{session_id}/messages/highly-structured` | `send_highly_structured` |
| `SendImage` | `POST` | `/api/v1/sessions/{session_id}/messages/image` | `send_image` |
| `SendInteractive` | `POST` | `/api/v1/sessions/{session_id}/messages/interactive` | `send_interactive` |
| `SendInteractiveResponse` | `POST` | `/api/v1/sessions/{session_id}/messages/interactive-response` | `send_interactive_response` |
| `SendInvoice` | `POST` | `/api/v1/sessions/{session_id}/messages/invoice` | `send_invoice` |
| `SendList` | `POST` | `/api/v1/sessions/{session_id}/messages/list` | `send_list` |
| `SendListResponse` | `POST` | `/api/v1/sessions/{session_id}/messages/list-response` | `send_list_response` |
| `SendLocation` | `POST` | `/api/v1/sessions/{session_id}/messages/location` | `send_location` |
| `SendOrder` | `POST` | `/api/v1/sessions/{session_id}/messages/order` | `send_order` |
| `SendPaymentInvite` | `POST` | `/api/v1/sessions/{session_id}/messages/payment-invite` | `send_payment_invite` |
| `SendPinMessage` | `POST` | `/api/v1/sessions/{session_id}/messages/pin` | `send_pin_message` |
| `SendPoll` | `POST` | `/api/v1/sessions/{session_id}/messages/poll` | `send_poll` |
| `SendPollUpdate` | `POST` | `/api/v1/sessions/{session_id}/messages/poll-update` | `send_poll_update` |
| `SendQuickReply` | `POST` | `/api/v1/sessions/{session_id}/messages/quick-reply` | `send_quick_reply` |
| `SendReaction` | `POST` | `/api/v1/sessions/{session_id}/messages/react` | `send_reaction` |
| `MarkAsRead` | `POST` | `/api/v1/sessions/{session_id}/messages/read` | `mark_as_read` |
| `RequestPayment` | `POST` | `/api/v1/sessions/{session_id}/messages/request-payment` | `request_payment` |
| `RevokeMessage` | `POST` | `/api/v1/sessions/{session_id}/messages/revoke` | `revoke_message` |
| `SendScheduledCall` | `POST` | `/api/v1/sessions/{session_id}/messages/scheduled-call` | `send_scheduled_call` |
| `SendScheduledCallEdit` | `POST` | `/api/v1/sessions/{session_id}/messages/scheduled-call-edit` | `send_scheduled_call_edit` |
| `SendPayment` | `POST` | `/api/v1/sessions/{session_id}/messages/send-payment` | `send_payment` |
| `SendSticker` | `POST` | `/api/v1/sessions/{session_id}/messages/sticker` | `send_sticker` |
| `SendTemplateButtonReply` | `POST` | `/api/v1/sessions/{session_id}/messages/template-button-reply` | `send_template_button_reply` |
| `SendText` | `POST` | `/api/v1/sessions/{session_id}/messages/text` | `send_text` |
| `SendVideo` | `POST` | `/api/v1/sessions/{session_id}/messages/video` | `send_video` |

## MEX

| Método Go | HTTP | Endpoint | Operation ID |
|---|---:|---|---|
| `Mutate` | `POST` | `/api/v1/sessions/{session_id}/mex/mutate` | `mex_mutate` |
| `Query` | `POST` | `/api/v1/sessions/{session_id}/mex/query` | `mex_query` |

## NATS

| Método Go | HTTP | Endpoint | Operation ID |
|---|---:|---|---|
| `Status` | `GET` | `/api/v1/nats/status` | `nats_status` |
| `ListConsumers` | `GET` | `/api/v1/nats/streams/{stream_name}/consumers` | `nats_list_consumers` |
| `PurgeStream` | `POST` | `/api/v1/nats/streams/{stream_name}/purge` | `nats_purge_stream` |

## Newsletter

| Método Go | HTTP | Endpoint | Operation ID |
|---|---:|---|---|
| `SendNewsletterAdminInvite` | `POST` | `/api/v1/sessions/{session_id}/messages/newsletter-admin-invite` | `send_newsletter_admin_invite` |
| `SendNewsletterFollowerInvite` | `POST` | `/api/v1/sessions/{session_id}/messages/newsletter-follower-invite` | `send_newsletter_follower_invite` |
| `SendNewsletterForward` | `POST` | `/api/v1/sessions/{session_id}/messages/newsletter-forward` | `send_newsletter_forward` |

## Operations

| Método Go | HTTP | Endpoint | Operation ID |
|---|---:|---|---|
| `GetHistorySync` | `GET` | `/api/v1/sessions/{session_id}/history-sync` | `get_history_sync` |
| `SetHistorySync` | `PUT` | `/api/v1/sessions/{session_id}/history-sync` | `set_history_sync` |
| `GetAutoReconnect` | `GET` | `/api/v1/sessions/{session_id}/reconnect` | `get_auto_reconnect` |
| `SetAutoReconnect` | `PUT` | `/api/v1/sessions/{session_id}/reconnect` | `set_auto_reconnect` |
| `ReportSpam` | `POST` | `/api/v1/sessions/{session_id}/spam/report` | `spam_report` |
| `PruneExpiredTCTokens` | `DELETE` | `/api/v1/sessions/{session_id}/tctoken/expired` | `tctoken_prune` |
| `IssueTCTokens` | `POST` | `/api/v1/sessions/{session_id}/tctoken/issue` | `tctoken_issue` |
| `ListTCTokens` | `GET` | `/api/v1/sessions/{session_id}/tctoken/list` | `tctoken_list` |
| `GetTCToken` | `GET` | `/api/v1/sessions/{session_id}/tctoken/{jid}` | `tctoken_get` |

## Presence

| Método Go | HTTP | Endpoint | Operation ID |
|---|---:|---|---|
| `Set` | `POST` | `/api/v1/sessions/{session_id}/presence/set` | `set_presence` |
| `Subscribe` | `POST` | `/api/v1/sessions/{session_id}/presence/subscribe` | `subscribe_presence` |

## Privacy

| Método Go | HTTP | Endpoint | Operation ID |
|---|---:|---|---|
| `GetSettings` | `GET` | `/api/v1/sessions/{session_id}/privacy/settings` | `get_privacy_settings` |

## Sessions

| Método Go | HTTP | Endpoint | Operation ID |
|---|---:|---|---|
| `List` | `GET` | `/api/v1/sessions` | `list_sessions` |
| `Create` | `POST` | `/api/v1/sessions` | `create_session` |
| `Get` | `GET` | `/api/v1/sessions/{session_id}` | `get_session` |
| `Delete` | `DELETE` | `/api/v1/sessions/{session_id}` | `delete_session` |
| `Connect` | `POST` | `/api/v1/sessions/{session_id}/connect` | `connect_session` |
| `GetDeviceInfo` | `GET` | `/api/v1/sessions/{session_id}/device` | `get_device_info` |
| `Disconnect` | `POST` | `/api/v1/sessions/{session_id}/disconnect` | `disconnect_session` |
| `Pair` | `POST` | `/api/v1/sessions/{session_id}/pair` | `pair_session` |
| `GetQRCode` | `GET` | `/api/v1/sessions/{session_id}/qr` | `get_qr_code` |
| `GetStatus` | `GET` | `/api/v1/sessions/{session_id}/status` | `get_session_status` |

## Status

| Método Go | HTTP | Endpoint | Operation ID |
|---|---:|---|---|
| `React` | `POST` | `/api/v1/sessions/{session_id}/status/react` | `send_status_reaction` |

## Webhooks

| Método Go | HTTP | Endpoint | Operation ID |
|---|---:|---|---|
| `List` | `GET` | `/api/v1/sessions/{session_id}/webhooks` | `list_webhooks` |
| `Register` | `POST` | `/api/v1/sessions/{session_id}/webhooks` | `register_webhook` |
| `Unregister` | `DELETE` | `/api/v1/sessions/{session_id}/webhooks/{webhook_id}` | `unregister_webhook` |
| `Reenable` | `POST` | `/api/v1/sessions/{session_id}/webhooks/{webhook_id}/enable` | `reenable_webhook` |

