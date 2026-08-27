package main

import "testing"

func TestThemeCSSValueValidation(t *testing.T) {
	if got := safeCSSColor("#0ea5e9", "#000000"); got != "#0ea5e9" {
		t.Fatalf("safeCSSColor = %q", got)
	}
	if got := safeCSSColor("url(javascript:bad)", "#000000"); got != "#000000" {
		t.Fatalf("unsafe color = %q", got)
	}
	if got := safeCSSSize("1.5rem", "18px"); got != "1.5rem" {
		t.Fatalf("safeCSSSize = %q", got)
	}
	if got := safeCSSSize("calc(1px)", "18px"); got != "18px" {
		t.Fatalf("unsafe size = %q", got)
	}
	if got := safeCSSNumber("0.38", "1"); got != "0.38" {
		t.Fatalf("safeCSSNumber = %q", got)
	}
	if got := safeCSSNumber("1.1", "1"); got != "1" {
		t.Fatalf("unsafe number = %q", got)
	}
}
