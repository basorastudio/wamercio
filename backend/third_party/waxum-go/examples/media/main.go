package main

import (
	"context"
	"log"
	"os"

	waxum "github.com/basoradev/waxum-go"
)

func main() {
	if len(os.Args) != 2 {
		log.Fatalf("usage: %s <file>", os.Args[0])
	}
	file, err := os.Open(os.Args[1])
	if err != nil {
		log.Fatal(err)
	}
	defer file.Close()

	baseURL := os.Getenv("WAXUM_URL")
	if baseURL == "" {
		baseURL = waxum.DefaultBaseURL
	}
	client, err := waxum.NewClient(
		os.Getenv("WAXUM_TOKEN"),
		waxum.WithBaseURL(baseURL),
	)
	if err != nil {
		log.Fatal(err)
	}

	mediaType := waxum.MediaTypeDocument
	uploaded, _, err := client.Media.Upload(context.Background(), os.Getenv("WAXUM_SESSION_ID"), waxum.UploadMediaRequest{
		Filename:  file.Name(),
		Reader:    file,
		MediaType: &mediaType,
	})
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("uploaded direct_path=%s size=%d", uploaded.DirectPath, uploaded.FileLength)
}
