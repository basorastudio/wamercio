package httpapi

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

const (
	defaultSocialProxyBaseURL     = "https://auth-apps.bitapps.pro/apps"
	defaultSocialProxyRedirectURI = "https://auth-apps.bitapps.pro/redirect/v2"
)

type socialProviderConfig struct {
	Provider         string `json:"provider"`
	Name             string `json:"name"`
	AuthorizationURL string `json:"-"`
	TokenURL         string `json:"-"`
	Scopes           string `json:"-"`
}

type socialCredentials struct {
	ClientID     string
	ClientSecret string
	RedirectURI  string
	Source       string
}

type discoveredSocialConnection struct {
	Provider       string
	ProviderUserID string
	DisplayName    string
	AccountType    string
	AvatarURL      string
	ProfileURL     string
	Metadata       map[string]any
	AccessToken    string
	RefreshToken   string
	GrantedScopes  string
	TokenExpiresAt *time.Time
}

func socialProviders() []socialProviderConfig {
	return []socialProviderConfig{
		{Provider: "facebook", Name: "Facebook", AuthorizationURL: "https://www.facebook.com/v26.0/dialog/oauth", TokenURL: "https://graph.facebook.com/oauth/access_token", Scopes: "pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_metadata,business_management"},
		{Provider: "instagram", Name: "Instagram", AuthorizationURL: "https://www.facebook.com/v26.0/dialog/oauth", TokenURL: "https://graph.facebook.com/oauth/access_token", Scopes: "pages_show_list,pages_read_engagement,business_management,instagram_basic,instagram_content_publish"},
		{Provider: "linkedin", Name: "LinkedIn", AuthorizationURL: "https://www.linkedin.com/oauth/v2/authorization", TokenURL: "https://www.linkedin.com/oauth/v2/accessToken", Scopes: "openid profile email w_member_social"},
		{Provider: "google_business", Name: "Perfil de Empresa en Google", AuthorizationURL: "https://accounts.google.com/o/oauth2/v2/auth", TokenURL: "https://oauth2.googleapis.com/token", Scopes: "openid profile email https://www.googleapis.com/auth/business.manage"},
	}
}

func normalizeSocialProvider(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "facebook", "instagram", "linkedin", "google_business":
		return strings.ToLower(strings.TrimSpace(v))
	case "google", "google_business_profile", "googlebusinessprofile":
		return "google_business"
	case "meta":
		return "facebook"
	default:
		return ""
	}
}

func socialProviderByID(provider string) (socialProviderConfig, bool) {
	provider = normalizeSocialProvider(provider)
	for _, item := range socialProviders() {
		if item.Provider == provider {
			return item, true
		}
	}
	return socialProviderConfig{}, false
}

func socialProxyPlatform(provider string) string {
	switch normalizeSocialProvider(provider) {
	case "facebook", "instagram":
		return "facebook"
	case "linkedin":
		return "linkedin"
	case "google_business":
		return "googleBusinessProfile"
	default:
		return ""
	}
}

func socialEnvPrefix(provider string) string {
	switch normalizeSocialProvider(provider) {
	case "facebook":
		return "WAMERCIO_SOCIAL_FACEBOOK"
	case "instagram":
		return "WAMERCIO_SOCIAL_INSTAGRAM"
	case "linkedin":
		return "WAMERCIO_SOCIAL_LINKEDIN"
	case "google_business":
		return "WAMERCIO_SOCIAL_GOOGLE_BUSINESS"
	default:
		return ""
	}
}

func socialProxyEnabled() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("WAMERCIO_SOCIAL_AUTH_PROXY_ENABLED")))
	return v == "" || v == "1" || v == "true" || v == "yes" || v == "on"
}

func socialProxyBaseURL() string {
	v := strings.TrimSpace(os.Getenv("WAMERCIO_SOCIAL_AUTH_PROXY_BASE_URL"))
	if v == "" {
		v = defaultSocialProxyBaseURL
	}
	return strings.TrimRight(v, "/")
}

func socialProxyRedirectURI() string {
	v := strings.TrimSpace(os.Getenv("WAMERCIO_SOCIAL_AUTH_PROXY_REDIRECT_URI"))
	if v == "" {
		return defaultSocialProxyRedirectURI
	}
	return v
}

func (s *Server) resolveSocialCredentials(ctx context.Context, provider string) (socialCredentials, error) {
	provider = normalizeSocialProvider(provider)
	if socialProxyEnabled() {
		platform := socialProxyPlatform(provider)
		if platform != "" {
			req, _ := http.NewRequestWithContext(ctx, http.MethodGet, socialProxyBaseURL()+"/"+platform, nil)
			resp, err := s.http.Do(req)
			if err == nil {
				defer resp.Body.Close()
				var payload struct {
					ClientID     string `json:"clientId"`
					ClientSecret string `json:"clientSecret"`
				}
				if resp.StatusCode >= 200 && resp.StatusCode < 300 && json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&payload) == nil && strings.TrimSpace(payload.ClientID) != "" && strings.TrimSpace(payload.ClientSecret) != "" {
					return socialCredentials{ClientID: strings.TrimSpace(payload.ClientID), ClientSecret: strings.TrimSpace(payload.ClientSecret), RedirectURI: socialProxyRedirectURI(), Source: "proxy"}, nil
				}
			}
		}
	}
	prefix := socialEnvPrefix(provider)
	if prefix != "" {
		id := strings.TrimSpace(os.Getenv(prefix + "_CLIENT_ID"))
		secret := strings.TrimSpace(os.Getenv(prefix + "_CLIENT_SECRET"))
		if id != "" && secret != "" {
			redirect := strings.TrimSpace(os.Getenv(prefix + "_REDIRECT_URI"))
			return socialCredentials{ClientID: id, ClientSecret: secret, RedirectURI: redirect, Source: "system"}, nil
		}
	}
	return socialCredentials{}, fmt.Errorf("el servicio de conexión rápida no está disponible")
}

func socialRandomToken(bytesCount int) string {
	buf := make([]byte, bytesCount)
	if _, err := rand.Read(buf); err != nil {
		return strings.ReplaceAll(fmt.Sprintf("%d", time.Now().UnixNano()), "-", "")
	}
	return hex.EncodeToString(buf)
}

func socialStateHash(state string) string {
	sum := sha256.Sum256([]byte(state))
	return hex.EncodeToString(sum[:])
}

func socialPKCEChallenge(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func socialProviderUsesPKCE(provider string) bool {
	return normalizeSocialProvider(provider) == "google_business"
}

func socialStateCookie(provider string) string {
	return "wamercio_social_state_" + normalizeSocialProvider(provider)
}

func requestHTTPS(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	return strings.EqualFold(strings.TrimSpace(strings.Split(r.Header.Get("X-Forwarded-Proto"), ",")[0]), "https")
}

func (s *Server) socialLocalCallbackURL(r *http.Request, provider string) string {
	base := strings.TrimRight(strings.TrimSpace(s.cfg.AppURL), "/")
	if base == "" {
		scheme := "http"
		if requestHTTPS(r) {
			scheme = "https"
		}
		base = scheme + "://" + r.Host
	}
	return base + "/api/v1/auth/social/" + normalizeSocialProvider(provider) + "/callback"
}

func (s *Server) socialOAuthStart(w http.ResponseWriter, r *http.Request) {
	storeID, ok := s.assertStore(w, r)
	if !ok {
		return
	}
	provider := normalizeSocialProvider(chi.URLParam(r, "provider"))
	cfg, found := socialProviderByID(provider)
	if !found {
		jsonErr(w, 404, "Proveedor social no compatible")
		return
	}
	credentials, err := s.resolveSocialCredentials(r.Context(), provider)
	if err != nil {
		jsonErr(w, 503, err.Error())
		return
	}
	state := socialRandomToken(32)
	verifier := ""
	encryptedVerifier := ""
	if socialProviderUsesPKCE(provider) {
		verifier = socialRandomToken(48)
		encryptedVerifier, err = s.encryptPlatformSecret(verifier)
		if err != nil {
			jsonErr(w, 500, "No se pudo preparar la autorización segura")
			return
		}
	}
	redirectURI := strings.TrimSpace(credentials.RedirectURI)
	if redirectURI == "" {
		redirectURI = s.socialLocalCallbackURL(r, provider)
	}
	actor := claims(r)
	_, err = s.db.Exec(r.Context(), `INSERT INTO social_oauth_transactions(store_id,actor_user_id,provider,state_hash,pkce_verifier_encrypted,redirect_uri,return_path,status,expires_at) VALUES($1,$2,$3,$4,$5,$6,'/settings/social','created',now()+interval '10 minutes')`, storeID, actor.UserID, provider, socialStateHash(state), encryptedVerifier, redirectURI)
	if err != nil {
		jsonErr(w, 500, "No se pudo iniciar la conexión")
		return
	}

	authURL, _ := url.Parse(cfg.AuthorizationURL)
	q := authURL.Query()
	q.Set("client_id", credentials.ClientID)
	q.Set("redirect_uri", redirectURI)
	q.Set("response_type", "code")
	stateValue := state
	if credentials.Source == "proxy" {
		stateValue = s.socialLocalCallbackURL(r, provider) + "?proxy_csrf=" + state
	}
	q.Set("state", stateValue)
	q.Set("scope", cfg.Scopes)
	if socialProviderUsesPKCE(provider) {
		q.Set("code_challenge", socialPKCEChallenge(verifier))
		q.Set("code_challenge_method", "S256")
	}
	switch provider {
	case "facebook", "instagram":
		q.Set("auth_type", "rerequest")
	case "google_business":
		q.Set("access_type", "offline")
		q.Set("include_granted_scopes", "true")
		q.Set("prompt", "consent")
	}
	authURL.RawQuery = q.Encode()
	http.SetCookie(w, &http.Cookie{Name: socialStateCookie(provider), Value: state, Path: "/api/v1/auth/social/", MaxAge: 600, HttpOnly: true, Secure: requestHTTPS(r), SameSite: http.SameSiteLaxMode})
	jsonOut(w, 200, map[string]any{"authorization_url": authURL.String(), "authorizationUrl": authURL.String(), "provider": provider, "mode": credentials.Source})
}

func socialExtractState(raw string) string {
	raw = strings.TrimSpace(raw)
	if i := strings.LastIndex(raw, "?proxy_csrf="); i >= 0 {
		return strings.TrimSpace(raw[i+len("?proxy_csrf="):])
	}
	return raw
}

type socialOAuthToken struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int64  `json:"expires_in"`
	Scope        string `json:"scope"`
	Error        string `json:"error"`
	Description  string `json:"error_description"`
}

func (s *Server) exchangeSocialCode(ctx context.Context, cfg socialProviderConfig, credentials socialCredentials, code, redirectURI, verifier string) (socialOAuthToken, error) {
	form := url.Values{"code": {code}, "grant_type": {"authorization_code"}, "redirect_uri": {redirectURI}, "client_id": {credentials.ClientID}, "client_secret": {credentials.ClientSecret}}
	if socialProviderUsesPKCE(cfg.Provider) && verifier != "" {
		form.Set("code_verifier", verifier)
	}
	method, endpoint := http.MethodPost, cfg.TokenURL
	var body io.Reader = strings.NewReader(form.Encode())
	if cfg.Provider == "facebook" || cfg.Provider == "instagram" {
		method = http.MethodGet
		endpoint += "?" + form.Encode()
		body = nil
	}
	req, _ := http.NewRequestWithContext(ctx, method, endpoint, body)
	if method == http.MethodPost {
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	}
	resp, err := s.http.Do(req)
	if err != nil {
		return socialOAuthToken{}, err
	}
	defer resp.Body.Close()
	payload, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	var token socialOAuthToken
	if json.Unmarshal(payload, &token) != nil || resp.StatusCode < 200 || resp.StatusCode >= 300 || strings.TrimSpace(token.AccessToken) == "" {
		message := strings.TrimSpace(token.Description)
		if message == "" {
			message = strings.TrimSpace(token.Error)
		}
		if message == "" {
			message = strings.TrimSpace(string(payload))
		}
		return token, fmt.Errorf("el proveedor rechazó la autorización: %s", message)
	}
	return token, nil
}

func (s *Server) socialJSON(ctx context.Context, method, endpoint, bearer string, form url.Values, target any) error {
	var body io.Reader
	if form != nil {
		body = strings.NewReader(form.Encode())
	}
	req, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return err
	}
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	if form != nil {
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	}
	resp, err := s.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	payload, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("el proveedor respondió %d: %s", resp.StatusCode, strings.TrimSpace(string(payload)))
	}
	if target != nil && len(payload) > 0 {
		if err := json.Unmarshal(payload, target); err != nil {
			return fmt.Errorf("respuesta inválida del proveedor: %w", err)
		}
	}
	return nil
}

func (s *Server) discoverSocialConnections(ctx context.Context, provider string, token socialOAuthToken, credentials socialCredentials) ([]discoveredSocialConnection, error) {
	provider = normalizeSocialProvider(provider)
	expires := (*time.Time)(nil)
	if token.ExpiresIn > 0 {
		t := time.Now().Add(time.Duration(token.ExpiresIn) * time.Second)
		expires = &t
	}
	scopes := token.Scope
	if provider == "facebook" || provider == "instagram" {
		q := url.Values{"access_token": {token.AccessToken}, "fields": {"id,name,access_token,picture{url},link,category"}}
		var pages struct {
			Data []struct {
				ID          string `json:"id"`
				Name        string `json:"name"`
				AccessToken string `json:"access_token"`
				Link        string `json:"link"`
				Category    string `json:"category"`
				Picture     struct {
					Data struct {
						URL string `json:"url"`
					} `json:"data"`
				} `json:"picture"`
			} `json:"data"`
		}
		if err := s.socialJSON(ctx, http.MethodGet, "https://graph.facebook.com/v26.0/me/accounts?"+q.Encode(), "", nil, &pages); err != nil {
			return nil, err
		}
		out := []discoveredSocialConnection{}
		for _, page := range pages.Data {
			pageToken := page.AccessToken
			if pageToken == "" {
				pageToken = token.AccessToken
			}
			if provider == "facebook" {
				out = append(out, discoveredSocialConnection{Provider: provider, ProviderUserID: page.ID, DisplayName: page.Name, AccountType: "page", AvatarURL: page.Picture.Data.URL, ProfileURL: page.Link, Metadata: map[string]any{"category": page.Category}, AccessToken: pageToken, RefreshToken: token.RefreshToken, GrantedScopes: scopes, TokenExpiresAt: expires})
				continue
			}
			var ig struct {
				Instagram struct {
					ID                string `json:"id"`
					Username          string `json:"username"`
					ProfilePictureURL string `json:"profile_picture_url"`
				} `json:"instagram_business_account"`
			}
			fields := url.Values{"fields": {"instagram_business_account{id,username,profile_picture_url}"}, "access_token": {pageToken}}
			if s.socialJSON(ctx, http.MethodGet, "https://graph.facebook.com/v26.0/"+url.PathEscape(page.ID)+"?"+fields.Encode(), "", nil, &ig) == nil && ig.Instagram.ID != "" {
				out = append(out, discoveredSocialConnection{Provider: provider, ProviderUserID: ig.Instagram.ID, DisplayName: firstNonBlank(ig.Instagram.Username, page.Name), AccountType: "professional", AvatarURL: ig.Instagram.ProfilePictureURL, ProfileURL: "https://instagram.com/" + ig.Instagram.Username, Metadata: map[string]any{"page_id": page.ID, "page_name": page.Name}, AccessToken: pageToken, RefreshToken: token.RefreshToken, GrantedScopes: scopes, TokenExpiresAt: expires})
			}
		}
		if len(out) == 0 {
			return nil, fmt.Errorf("no se encontraron destinos publicables")
		}
		return out, nil
	}
	if provider == "linkedin" {
		var me struct {
			Sub     string `json:"sub"`
			Name    string `json:"name"`
			Picture string `json:"picture"`
		}
		if err := s.socialJSON(ctx, http.MethodGet, "https://api.linkedin.com/v2/userinfo", token.AccessToken, nil, &me); err != nil {
			return nil, err
		}
		return []discoveredSocialConnection{{Provider: provider, ProviderUserID: me.Sub, DisplayName: me.Name, AccountType: "profile", AvatarURL: me.Picture, ProfileURL: "https://www.linkedin.com/in/" + me.Sub, Metadata: map[string]any{}, AccessToken: token.AccessToken, RefreshToken: token.RefreshToken, GrantedScopes: scopes, TokenExpiresAt: expires}}, nil
	}
	if provider == "google_business" {
		var accounts struct {
			Accounts []struct {
				Name        string `json:"name"`
				AccountName string `json:"accountName"`
				Type        string `json:"type"`
			} `json:"accounts"`
		}
		if err := s.socialJSON(ctx, http.MethodGet, "https://mybusinessaccountmanagement.googleapis.com/v1/accounts", token.AccessToken, nil, &accounts); err != nil {
			return nil, err
		}
		out := []discoveredSocialConnection{}
		for _, account := range accounts.Accounts {
			endpoint := "https://mybusinessbusinessinformation.googleapis.com/v1/" + account.Name + "/locations?readMask=name,title,storefrontAddress,phoneNumbers,websiteUri,metadata&pageSize=100"
			var locs struct {
				Locations []struct {
					Name     string                                 `json:"name"`
					Title    string                                 `json:"title"`
					Website  string                                 `json:"websiteUri"`
					Metadata struct{ MapsURI, NewReviewURI string } `json:"metadata"`
				} `json:"locations"`
			}
			if s.socialJSON(ctx, http.MethodGet, endpoint, token.AccessToken, nil, &locs) != nil {
				continue
			}
			for _, loc := range locs.Locations {
				if loc.Name == "" {
					continue
				}
				meta := map[string]any{"account_name": account.Name, "account_display_name": account.AccountName, "location_name": loc.Name, "review_parent": strings.TrimSuffix(account.Name, "/") + "/" + strings.TrimPrefix(loc.Name, "/"), "new_review_uri": loc.Metadata.NewReviewURI, "maps_uri": loc.Metadata.MapsURI}
				out = append(out, discoveredSocialConnection{Provider: provider, ProviderUserID: loc.Name, DisplayName: firstNonBlank(loc.Title, account.AccountName, "Perfil de Empresa en Google"), AccountType: "location", ProfileURL: firstNonBlank(loc.Metadata.MapsURI, loc.Website), Metadata: meta, AccessToken: token.AccessToken, RefreshToken: token.RefreshToken, GrantedScopes: scopes, TokenExpiresAt: expires})
			}
		}
		if len(out) == 0 {
			return nil, fmt.Errorf("no se encontraron ubicaciones administrables en Google")
		}
		return out, nil
	}
	return nil, fmt.Errorf("proveedor no compatible")
}

func socialProviderLabel(provider string) string {
	if cfg, ok := socialProviderByID(provider); ok {
		return cfg.Name
	}
	return provider
}

func (s *Server) socialOAuthResult(w http.ResponseWriter, r *http.Request, provider string, success bool, message string) {
	base := strings.TrimRight(strings.TrimSpace(s.cfg.AppURL), "/")
	if base == "" {
		base = "/"
	}
	payload, _ := json.Marshal(map[string]any{"type": "wamercio-social-auth-complete", "provider": provider, "success": success, "message": message})
	icon := "!"
	title := "No se pudo conectar"
	if success {
		icon = "✓"
		title = "Cuenta conectada"
	}
	page := `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conexión social</title><style>body{margin:0;font-family:system-ui;background:#f7f9fc;color:#222a45;display:grid;min-height:100vh;place-items:center}.card{width:min(420px,calc(100% - 32px));background:#fff;border-radius:26px;padding:30px;box-shadow:0 25px 80px rgba(46,49,84,.18);text-align:center}.icon{width:58px;height:58px;margin:auto;border-radius:18px;display:grid;place-items:center;background:#eaf9f4;color:#14a978;font-size:28px}.msg{color:#7d839b;line-height:1.5}.link{display:inline-block;margin-top:18px;padding:12px 18px;border-radius:14px;background:#20b486;color:#fff;text-decoration:none;font-weight:700}</style></head><body><main class="card"><div class="icon">` + icon + `</div><h1>` + html.EscapeString(title) + `</h1><p class="msg">` + html.EscapeString(message) + `</p><a class="link" href="` + html.EscapeString(base+"/settings/social") + `">Volver a WAMERCIO</a></main><script>(function(){const p=` + string(payload) + `;if(window.opener&&!window.opener.closed){window.opener.postMessage(p,location.origin);setTimeout(()=>window.close(),350)}})();</script></body></html>`
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write([]byte(page))
}

func (s *Server) socialOAuthCallback(w http.ResponseWriter, r *http.Request) {
	provider := normalizeSocialProvider(chi.URLParam(r, "provider"))
	state := socialExtractState(r.URL.Query().Get("state"))
	code := strings.TrimSpace(r.URL.Query().Get("code"))
	providerErr := firstNonBlank(strings.TrimSpace(r.URL.Query().Get("error_description")), strings.TrimSpace(r.URL.Query().Get("error")))
	if provider == "" || state == "" {
		s.socialOAuthResult(w, r, provider, false, "La respuesta del proveedor está incompleta.")
		return
	}
	var txID, storeID, actorID, txProvider, verifierEnc, redirectURI, status string
	var expires time.Time
	err := s.db.QueryRow(r.Context(), `SELECT id::text,store_id::text,coalesce(actor_user_id::text,''),provider,pkce_verifier_encrypted,redirect_uri,status,expires_at FROM social_oauth_transactions WHERE state_hash=$1`, socialStateHash(state)).Scan(&txID, &storeID, &actorID, &txProvider, &verifierEnc, &redirectURI, &status, &expires)
	if providerErr != "" {
		if err == nil {
			_, _ = s.db.Exec(r.Context(), `UPDATE social_oauth_transactions SET status='failed' WHERE id=$1`, txID)
		}
		s.socialOAuthResult(w, r, provider, false, providerErr)
		return
	}
	cookie, cookieErr := r.Cookie(socialStateCookie(provider))
	if err != nil || cookieErr != nil || cookie.Value != state || txProvider != provider || status != "created" || time.Now().After(expires) || code == "" {
		s.socialOAuthResult(w, r, provider, false, "La autorización expiró o no pudo validarse.")
		return
	}
	http.SetCookie(w, &http.Cookie{Name: socialStateCookie(provider), Value: "", Path: "/api/v1/auth/social/", MaxAge: -1, HttpOnly: true, Secure: requestHTTPS(r), SameSite: http.SameSiteLaxMode})
	cfg, _ := socialProviderByID(provider)
	credentials, err := s.resolveSocialCredentials(r.Context(), provider)
	if err != nil {
		s.socialOAuthResult(w, r, provider, false, err.Error())
		return
	}
	verifier := ""
	if verifierEnc != "" {
		verifier, err = s.decryptPlatformSecret(verifierEnc)
		if err != nil {
			s.socialOAuthResult(w, r, provider, false, "No se pudo validar PKCE.")
			return
		}
	}
	token, err := s.exchangeSocialCode(r.Context(), cfg, credentials, code, redirectURI, verifier)
	if err != nil {
		_, _ = s.db.Exec(r.Context(), `UPDATE social_oauth_transactions SET status='failed' WHERE id=$1`, txID)
		s.socialOAuthResult(w, r, provider, false, err.Error())
		return
	}
	discovered, err := s.discoverSocialConnections(r.Context(), provider, token, credentials)
	if err != nil {
		_, _ = s.db.Exec(r.Context(), `UPDATE social_oauth_transactions SET status='failed' WHERE id=$1`, txID)
		s.socialOAuthResult(w, r, provider, false, err.Error())
		return
	}
	stored := 0
	for _, row := range discovered {
		access, encErr := s.encryptPlatformSecret(row.AccessToken)
		if encErr != nil {
			continue
		}
		refresh := ""
		if row.RefreshToken != "" {
			refresh, _ = s.encryptPlatformSecret(row.RefreshToken)
		}
		meta, _ := json.Marshal(row.Metadata)
		_, saveErr := s.db.Exec(r.Context(), `INSERT INTO store_social_connections(store_id,provider,provider_user_id,display_name,account_type,avatar_url,profile_url,metadata,access_token_encrypted,refresh_token_encrypted,token_expires_at,granted_scopes,status,connected_by,connected_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,'active',nullif($13,'')::uuid,now(),now()) ON CONFLICT(store_id,provider,provider_user_id) WHERE provider_user_id<>'' AND status<>'revoked' DO UPDATE SET display_name=excluded.display_name,account_type=excluded.account_type,avatar_url=excluded.avatar_url,profile_url=excluded.profile_url,metadata=excluded.metadata,access_token_encrypted=excluded.access_token_encrypted,refresh_token_encrypted=CASE WHEN excluded.refresh_token_encrypted<>'' THEN excluded.refresh_token_encrypted ELSE store_social_connections.refresh_token_encrypted END,token_expires_at=excluded.token_expires_at,granted_scopes=excluded.granted_scopes,status='active',updated_at=now()`, storeID, row.Provider, row.ProviderUserID, row.DisplayName, row.AccountType, row.AvatarURL, row.ProfileURL, string(meta), access, refresh, row.TokenExpiresAt, row.GrantedScopes, actorID)
		if saveErr == nil {
			stored++
		}
	}
	if stored == 0 {
		_, _ = s.db.Exec(r.Context(), `UPDATE social_oauth_transactions SET status='failed' WHERE id=$1`, txID)
		s.socialOAuthResult(w, r, provider, false, "No se pudo guardar ningún destino publicable.")
		return
	}
	_, _ = s.db.Exec(r.Context(), `UPDATE social_oauth_transactions SET status='completed' WHERE id=$1`, txID)
	if provider == "google_business" {
		var firstID string
		_ = s.db.QueryRow(r.Context(), `SELECT id::text FROM store_social_connections WHERE store_id=$1 AND provider='google_business' AND status='active' ORDER BY connected_at DESC LIMIT 1`, storeID).Scan(&firstID)
		_, _ = s.db.Exec(r.Context(), `INSERT INTO store_google_business_settings(store_id,connection_id,updated_at) VALUES($1,nullif($2,'')::uuid,now()) ON CONFLICT(store_id) DO UPDATE SET connection_id=excluded.connection_id,updated_at=now()`, storeID, firstID)
	}
	s.socialOAuthResult(w, r, provider, true, fmt.Sprintf("Se conectaron %d destino(s) de %s.", stored, socialProviderLabel(provider)))
}
