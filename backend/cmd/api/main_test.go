package main

import "testing"

func TestIsPrivateListenerAddress(t *testing.T) {
	tests := []struct {
		address string
		want    bool
	}{
		{address: "127.0.0.1:6060", want: true},
		{address: "[::1]:6060", want: true},
		{address: "localhost:6060", want: true},
		{address: ":6060", want: false},
		{address: "0.0.0.0:6060", want: false},
		{address: "10.0.0.5:6060", want: false},
	}
	for _, test := range tests {
		if got := isPrivateListenerAddress(test.address); got != test.want {
			t.Fatalf("isPrivateListenerAddress(%q) = %v, want %v", test.address, got, test.want)
		}
	}
}
