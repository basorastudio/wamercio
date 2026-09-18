from pathlib import Path
root=Path(__file__).resolve().parents[1]
soft=(root/'apps/web/components/calls-softphone.tsx').read_text()
host=(root/'apps/web/components/calls-softphone-host.tsx').read_text()
conv=(root/'apps/web/app/conversations/page.tsx').read_text()
cust=(root/'apps/web/app/customers/page.tsx').read_text()
api=(root/'services/api/internal/httpapi/calls_premium.go').read_text()
bridge=(root/'services/whatsapp-bridge/internal/bridge/bridge.go').read_text()
assert 'incomingFallback' in soft and 'softphoneSurface()' in soft
assert 'answerIncoming' in soft and 'const pipPromise=openPictureInPicture()' in soft
assert "addEventListener('pointerdown',resumePending" not in host
assert "addEventListener('keydown',resumePending" not in host
assert "avatar_url:selected.profile_picture_url||''" in conv
assert "avatar_url:avatarUrl||''" in cust
assert "avatar_url:chosen.avatar_url||''" in soft
assert 'const callAvatar=' in soft and 'selectedTarget?.avatar_url' in soft
assert 'AvatarURL       string `json:"avatar_url"`' in api
assert 'refreshCallWhatsAppProfile' in api
assert 'metadata["avatar_url"] = avatarURL' in api
assert 'GetProfilePictureParams{Preview: false}' in bridge
print('PASS: WAMERCIO 4.1.10 incoming visibility + WhatsApp avatar regression')
