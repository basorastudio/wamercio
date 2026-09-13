package httpapi

import (
	"errors"
	"io"
	"net/http"
	"strings"
)

const recoveryCTAImageObjectKey = "platform/access/recovery-cta-image"
const recoveryCTAImageMaxBytes int64 = 8 << 20

func (s *Server) uploadPlatformRecoveryCTAImage(w http.ResponseWriter, r *http.Request) {
	publicBase := strings.TrimRight(strings.TrimSpace(s.cfg.CloudflareR2PublicBaseURL), "/")
	if publicBase == "" {
		writeError(w, badRequest("Para subir la imagen del CTA configura CLOUDFLARE_R2_PUBLIC_BASE_URL con la URL pública del bucket R2."))
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, recoveryCTAImageMaxBytes+(1<<20))
	if err := r.ParseMultipartForm(512 << 10); err != nil {
		writeError(w, badRequest("No se pudo leer la imagen. Sube un archivo JPG, PNG o WEBP menor de 8 MB."))
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}

	file, header, err := r.FormFile("image")
	if err != nil {
		writeError(w, badRequest("Selecciona una imagen para el mensaje CTA."))
		return
	}
	defer file.Close()

	if header.Size <= 0 {
		writeError(w, badRequest("La imagen seleccionada está vacía."))
		return
	}
	if header.Size > recoveryCTAImageMaxBytes {
		writeError(w, badRequest("La imagen del CTA debe pesar menos de 8 MB."))
		return
	}

	sniff := make([]byte, 512)
	read, err := io.ReadFull(file, sniff)
	if err != nil && !errors.Is(err, io.EOF) && !errors.Is(err, io.ErrUnexpectedEOF) {
		writeError(w, badRequest("No se pudo procesar la imagen seleccionada."))
		return
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		writeError(w, badRequest("No se pudo preparar la imagen seleccionada."))
		return
	}

	contentType := strings.ToLower(strings.TrimSpace(header.Header.Get("Content-Type")))
	if contentType == "" || contentType == "application/octet-stream" {
		contentType = strings.ToLower(http.DetectContentType(sniff[:read]))
	}
	switch contentType {
	case "image/jpeg", "image/png", "image/webp":
	default:
		writeError(w, badRequest("La imagen del CTA debe estar en formato JPG, PNG o WEBP."))
		return
	}

	if err := s.putR2Object(r.Context(), recoveryCTAImageObjectKey, file, header.Size, contentType); err != nil {
		writeError(w, err)
		return
	}

	publicURL := publicBase + "/" + awsEncodePath(recoveryCTAImageObjectKey)
	s.auditPlatform(r.Context(), s.platformActor(r), "", "platform.access_policy.cta_image.upload", map[string]any{
		"object_key":   recoveryCTAImageObjectKey,
		"content_type": contentType,
		"size_bytes":   header.Size,
	})
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"url":     publicURL,
		"message": "Imagen del CTA cargada correctamente.",
	})
}
