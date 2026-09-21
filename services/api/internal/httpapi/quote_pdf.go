package httpapi

import (
	"bytes"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

type quotePDFLine struct {
	Text string
	Bold bool
	Size int
}

func pdfASCII(v string) string {
	r := strings.NewReplacer(
		"á", "a", "é", "e", "í", "i", "ó", "o", "ú", "u", "ü", "u", "ñ", "n",
		"Á", "A", "É", "E", "Í", "I", "Ó", "O", "Ú", "U", "Ü", "U", "Ñ", "N",
		"—", "-", "–", "-", "“", `"`, "”", `"`, "‘", "'", "’", "'", "•", "-",
	)
	v = r.Replace(v)
	var b strings.Builder
	for _, x := range v {
		if x >= 32 && x <= 126 {
			b.WriteRune(x)
		} else if x == '\n' || x == '\t' {
			b.WriteRune(' ')
		}
	}
	return strings.TrimSpace(b.String())
}

func pdfEscape(v string) string {
	v = pdfASCII(v)
	v = strings.ReplaceAll(v, `\`, `\\`)
	v = strings.ReplaceAll(v, `(`, `\(`)
	v = strings.ReplaceAll(v, `)`, `\)`)
	return v
}

func pdfWrap(v string, width int) []string {
	v = pdfASCII(v)
	if width <= 0 || len(v) <= width {
		return []string{v}
	}
	words := strings.Fields(v)
	if len(words) == 0 {
		return []string{""}
	}
	out := []string{}
	line := words[0]
	for _, word := range words[1:] {
		if len(line)+1+len(word) <= width {
			line += " " + word
			continue
		}
		out = append(out, line)
		line = word
	}
	return append(out, line)
}

func pdfMoney(v any) string {
	f, _ := strconv.ParseFloat(fmt.Sprint(v), 64)
	return fmt.Sprintf("RD$ %.2f", f)
}

func buildQuotePDF(q map[string]any, storeName string) []byte {
	lines := []quotePDFLine{
		{Text: storeName, Bold: true, Size: 18},
		{Text: "COTIZACION " + fmt.Sprint(q["number"]), Bold: true, Size: 15},
		{Text: fmt.Sprintf("Revision %v | Estado: %s", q["revision"], strings.ToUpper(fmt.Sprint(q["status"]))), Size: 9},
		{Text: "", Size: 9},
		{Text: "Cliente: " + fmt.Sprint(q["customer_name"]), Bold: true, Size: 11},
		{Text: "WhatsApp: +" + strings.TrimPrefix(fmt.Sprint(q["customer_phone"]), "+"), Size: 10},
	}
	if v := strings.TrimSpace(fmt.Sprint(q["customer_address"])); v != "" {
		for _, x := range pdfWrap("Direccion: "+v, 82) {
			lines = append(lines, quotePDFLine{Text: x, Size: 10})
		}
	}
	if v, ok := q["valid_until"].(*time.Time); ok && v != nil {
		lines = append(lines, quotePDFLine{Text: "Valida hasta: " + v.Format("02/01/2006"), Size: 10})
	} else if v := fmt.Sprint(q["valid_until"]); v != "<nil>" && v != "" {
		lines = append(lines, quotePDFLine{Text: "Valida hasta: " + v, Size: 10})
	}
	lines = append(lines, quotePDFLine{Text: "", Size: 9}, quotePDFLine{Text: "DETALLE", Bold: true, Size: 11})
	items, _ := q["items"].([]map[string]any)
	for i, item := range items {
		name := fmt.Sprint(item["product_name"])
		if variant := strings.TrimSpace(fmt.Sprint(item["variant_name"])); variant != "" {
			name += " - " + variant
		}
		qty, _ := strconv.ParseFloat(fmt.Sprint(item["quantity"]), 64)
		unit, _ := strconv.ParseFloat(fmt.Sprint(item["unit_price"]), 64)
		line, _ := strconv.ParseFloat(fmt.Sprint(item["line_total"]), 64)
		prefix := fmt.Sprintf("%02d. ", i+1)
		wrapped := pdfWrap(prefix+name, 60)
		for j, text := range wrapped {
			if j == 0 {
				text = fmt.Sprintf("%-58s  %.2f x %.2f  =  RD$ %.2f", text, qty, unit, line)
			}
			lines = append(lines, quotePDFLine{Text: text, Size: 9})
		}
		if desc := strings.TrimSpace(fmt.Sprint(item["description"])); desc != "" {
			for _, x := range pdfWrap("    "+desc, 80) {
				lines = append(lines, quotePDFLine{Text: x, Size: 8})
			}
		}
	}
	lines = append(lines,
		quotePDFLine{Text: "", Size: 9},
		quotePDFLine{Text: "Subtotal: " + pdfMoney(q["subtotal"]), Size: 10},
		quotePDFLine{Text: "Descuento: " + pdfMoney(q["discount"]), Size: 10},
		quotePDFLine{Text: "Impuestos: " + pdfMoney(q["tax"]), Size: 10},
		quotePDFLine{Text: "Delivery: " + pdfMoney(q["shipping"]), Size: 10},
		quotePDFLine{Text: "TOTAL: " + pdfMoney(q["total"]), Bold: true, Size: 14},
	)
	if notes := strings.TrimSpace(fmt.Sprint(q["notes"])); notes != "" {
		lines = append(lines, quotePDFLine{Text: "", Size: 9}, quotePDFLine{Text: "Notas", Bold: true, Size: 10})
		for _, x := range pdfWrap(notes, 82) {
			lines = append(lines, quotePDFLine{Text: x, Size: 9})
		}
	}
	if terms := strings.TrimSpace(fmt.Sprint(q["terms"])); terms != "" {
		lines = append(lines, quotePDFLine{Text: "", Size: 9}, quotePDFLine{Text: "Terminos", Bold: true, Size: 10})
		for _, x := range pdfWrap(terms, 82) {
			lines = append(lines, quotePDFLine{Text: x, Size: 9})
		}
	}

	const linesPerPage = 48
	pages := [][]quotePDFLine{}
	for len(lines) > 0 {
		n := linesPerPage
		if len(lines) < n {
			n = len(lines)
		}
		pages = append(pages, append([]quotePDFLine(nil), lines[:n]...))
		lines = lines[n:]
	}
	if len(pages) == 0 {
		pages = [][]quotePDFLine{{{Text: "Cotizacion", Bold: true, Size: 16}}}
	}

	objects := map[int]string{
		1: `<< /Type /Catalog /Pages 2 0 R >>`,
		3: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
		4: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`,
	}
	kids := []string{}
	next := 5
	for pageIndex, pageLines := range pages {
		pageObj := next
		contentObj := next + 1
		next += 2
		kids = append(kids, fmt.Sprintf("%d 0 R", pageObj))
		var content strings.Builder
		content.WriteString("BT\n")
		y := 790
		for _, line := range pageLines {
			size := line.Size
			if size <= 0 {
				size = 10
			}
			font := "F1"
			if line.Bold {
				font = "F2"
			}
			content.WriteString(fmt.Sprintf("/%s %d Tf\n1 0 0 1 48 %d Tm\n(%s) Tj\n", font, size, y, pdfEscape(line.Text)))
			y -= 15
		}
		content.WriteString(fmt.Sprintf("/F1 8 Tf\n1 0 0 1 48 30 Tm\n(Pagina %d de %d - Generado por WAMERCIO) Tj\n", pageIndex+1, len(pages)))
		content.WriteString("ET\n")
		stream := content.String()
		objects[contentObj] = fmt.Sprintf("<< /Length %d >>\nstream\n%sendstream", len(stream), stream)
		objects[pageObj] = fmt.Sprintf(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents %d 0 R >>`, contentObj)
	}
	objects[2] = fmt.Sprintf("<< /Type /Pages /Kids [%s] /Count %d >>", strings.Join(kids, " "), len(pages))

	ids := make([]int, 0, len(objects))
	for id := range objects {
		ids = append(ids, id)
	}
	sort.Ints(ids)
	var buf bytes.Buffer
	buf.WriteString("%PDF-1.4\n%WAMERCIO\n")
	offsets := make(map[int]int)
	for _, id := range ids {
		offsets[id] = buf.Len()
		fmt.Fprintf(&buf, "%d 0 obj\n%s\nendobj\n", id, objects[id])
	}
	xref := buf.Len()
	fmt.Fprintf(&buf, "xref\n0 %d\n", ids[len(ids)-1]+1)
	buf.WriteString("0000000000 65535 f \n")
	for id := 1; id <= ids[len(ids)-1]; id++ {
		fmt.Fprintf(&buf, "%010d 00000 n \n", offsets[id])
	}
	fmt.Fprintf(&buf, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", ids[len(ids)-1]+1, xref)
	return buf.Bytes()
}

func (s *Server) quotePDF(w http.ResponseWriter, r *http.Request) {
	q, err := s.quoteDetail(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		jsonErr(w, 404, "Cotización no encontrada")
		return
	}
	c := claims(r)
	if !queryStoreOwned(r.Context(), s.db, c.UserID, c.Role, str(q["store_id"])) {
		jsonErr(w, 404, "Cotización no encontrada")
		return
	}
	var storeName string
	_ = s.db.QueryRow(r.Context(), `SELECT name FROM stores WHERE id=$1`, q["store_id"]).Scan(&storeName)
	data := buildQuotePDF(q, storeName)
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="cotizacion-%s.pdf"`, pdfASCII(fmt.Sprint(q["number"]))))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func (s *Server) publicQuotePDF(w http.ResponseWriter, r *http.Request) {
	q, _, err := s.publicQuoteByToken(r.Context(), chi.URLParam(r, "token"))
	if err != nil {
		jsonErr(w, 404, "El enlace de la cotización no es válido o venció")
		return
	}
	store := "WAMERCIO"
	if m, ok := q["store"].(map[string]any); ok && strings.TrimSpace(fmt.Sprint(m["name"])) != "" {
		store = fmt.Sprint(m["name"])
	}
	data := buildQuotePDF(q, store)
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename="cotizacion-%s.pdf"`, pdfASCII(fmt.Sprint(q["number"]))))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}
