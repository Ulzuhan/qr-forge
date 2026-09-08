package store

import (
	"strings"
	"testing"
)

func TestSlugLongitudYAlfabeto(t *testing.T) {
	for _, length := range []int{4, 7, 12} {
		for range 100 {
			s, err := SlugAleatorio(length)
			if err != nil || len(s) != length {
				t.Fatalf("slug length %d: %q, %v", length, s, err)
			}
			for _, c := range s {
				if !strings.ContainsRune(alfabetoSlug, c) {
					t.Fatalf("unexpected character: %c", c)
				}
			}
		}
	}
}
